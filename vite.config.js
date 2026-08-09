import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "data", "tasks.json");
const PROGRESS = path.join(here, "data", "sync-progress.json"); // written by the sync skill, read by the dashboard

// CC-2: every mutating route must carry the app's own header (its presence forces
// a CORS preflight, so a random web page can't fire a "simple" cross-origin POST
// at the Claude bridge) and, when the browser sends an Origin, it must be ours.
const ALLOWED_ORIGINS = new Set(
  ["http://localhost:5173", "http://127.0.0.1:5173"].concat(
    process.env.PCC_TUNNEL_HOST ? [`https://${process.env.PCC_TUNNEL_HOST}`] : []
  )
);

function guard(req, res) {
  const origin = req.headers.origin;
  if (req.headers["x-pcc"] === "1" && (!origin || ALLOWED_ORIGINS.has(origin))) return true;
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json");
  res.end('{"error":"forbidden"}');
  return false;
}

// Serves data/tasks.json as GET/PUT /api/tasks. Claude Code and the dashboard
// share this file as the single source of truth; with the tunnel (CC-7) two
// devices can hold it open at once, so writes are guarded by a version echo
// (CC-4): PUT must carry the version it last read, a mismatch returns 409 with
// the current file so the loser can merge instead of clobbering.
function readTasksFile() {
  const parsed = JSON.parse(fs.readFileSync(DATA, "utf-8"));
  if (typeof parsed.version !== "number") parsed.version = 0; // pre-CC-4 file
  return parsed;
}

function tasksApi() {
  return {
    name: "tasks-api",
    configureServer(server) {
      // CC-32: push the file's version to every open dashboard whenever
      // tasks.json changes on disk — whoever wrote it (the PUT route, a sync
      // run, a hand edit, git). Watches the directory, not the file: editors
      // and git replace the inode, which silently kills a file watch on Linux.
      // Registered before /api/tasks — connect matches by prefix, so the
      // shorter route would otherwise swallow /api/tasks/stream.
      const sseClients = new Set();
      const broadcast = () => {
        let v;
        try { v = readTasksFile().version; } catch (e) { return; } // mid-write partial read — the next event carries it
        for (const c of sseClients) c.write(`data: {"version":${v}}\n\n`);
      };
      let watchTimer = null;
      const watcher = fs.watch(path.dirname(DATA), (event, filename) => {
        if (filename && filename !== path.basename(DATA)) return;
        clearTimeout(watchTimer); // Windows fires duplicate events — debounce
        watchTimer = setTimeout(broadcast, 200);
      });
      const heartbeat = setInterval(() => {
        for (const c of sseClients) c.write(":hb\n\n"); // keeps proxies from closing idle streams
      }, 25000);
      server.httpServer?.on("close", () => { clearInterval(heartbeat); watcher.close(); });

      server.middlewares.use("/api/tasks/stream", (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        try { res.write(`data: {"version":${readTasksFile().version}}\n\n`); } catch (e) {}
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
      });

      server.middlewares.use("/api/tasks", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(readTasksFile()));
        } else if (req.method === "PUT") {
          if (!guard(req, res)) return;
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            res.setHeader("Content-Type", "application/json");
            let parsed;
            try {
              parsed = JSON.parse(body);
            } catch (e) {
              res.statusCode = 400;
              res.end('{"error":"invalid json"}');
              return;
            }
            if (!Array.isArray(parsed.tasks)) {
              res.statusCode = 400;
              res.end('{"error":"tasks must be an array"}');
              return;
            }
            const current = readTasksFile();
            // The dashboard has no delete-all; an empty array over a populated
            // file is the CC-8 wipe signature, not an edit.
            if (parsed.tasks.length === 0 && current.tasks.length > 0) {
              res.statusCode = 400;
              res.end('{"error":"refusing to empty tasks.json"}');
              return;
            }
            if (parsed.version !== current.version) {
              res.statusCode = 409;
              res.end(JSON.stringify(current));
              return;
            }
            const next = { tasks: parsed.tasks, lastSync: parsed.lastSync ?? null, version: current.version + 1 };
            fs.writeFileSync(DATA, JSON.stringify(next, null, 2) + "\n", "utf-8");
            res.end(JSON.stringify({ ok: true, version: next.version }));
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    },
  };
}

// Serves the news feeds written by the sync skill's news scans. One feed per
// portco rail slot in the dashboard's mission dials.
// /api/news                -> data/industry-news.json (early education CO/UT — KEP)
// /api/news?feed=bravofit  -> data/bravofit-news.json (BravoFit / Planet Fitness AU)
// /api/news?feed=imo       -> data/imo-news.json      (IMO — UK/Germany)
// /api/news?feed=penske    -> data/penske-news.json   (Penske — automotive retail)
const NEWS_FEEDS = {
  earlyed: "industry-news.json",
  bravofit: "bravofit-news.json",
  imo: "imo-news.json",
  penske: "penske-news.json",
};

function newsApi() {
  return {
    name: "news-api",
    configureServer(server) {
      server.middlewares.use("/api/news", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        const feed = new URL(req.url, "http://localhost").searchParams.get("feed") || "earlyed";
        // An unknown feed must NOT fall back to early-ed: with a feed per portco
        // that would quietly show KEP's childcare news under another portco's dial.
        if (!NEWS_FEEDS[feed]) {
          res.end(JSON.stringify({ updatedAt: null, items: [], error: `unknown feed "${feed}"` }));
          return;
        }
        try {
          res.end(fs.readFileSync(path.join(here, "data", NEWS_FEEDS[feed]), "utf-8"));
        } catch (e) {
          res.end(JSON.stringify({ updatedAt: null, items: [] }));
        }
      });
    },
  };
}

// Proxies a daily stock quote (browsers are CORS-blocked from the upstream).
// Cached in memory for the calendar day; /api/stock?symbol=PLNT
const quoteCache = {};
function stockApi() {
  return {
    name: "stock-api",
    configureServer(server) {
      server.middlewares.use("/api/stock", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        const symbol = (new URL(req.url, "http://localhost").searchParams.get("symbol") || "PLNT")
          .toUpperCase()
          .replace(/[^A-Z.\-]/g, "")
          .slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        if (quoteCache[symbol] && quoteCache[symbol].date === today) {
          res.end(JSON.stringify(quoteCache[symbol].data));
          return;
        }
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          const j = await r.json();
          const m = j.chart.result[0].meta;
          const price = m.regularMarketPrice;
          const prev = m.chartPreviousClose ?? m.previousClose;
          const data = {
            symbol,
            price: Math.round(price * 100) / 100,
            change: Math.round((price - prev) * 100) / 100,
            pct: Math.round(((price - prev) / prev) * 1000) / 10,
            currency: m.currency || "USD",
            asOf: new Date((m.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
          };
          quoteCache[symbol] = { date: today, data };
          res.end(JSON.stringify(data));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "quote unavailable" }));
        }
      });
    },
  };
}

// Bridges dashboard buttons to headless Claude Code runs (`claude -p`), which
// inherit this machine's Claude session + MCP connectors (M365, Egnyte).
const sync = { proc: null, running: false, exitCode: null, startedAt: null, log: "", activity: null };

// Friendly label for each tool Claude invokes during a sync.
function toolLabel(name, input) {
  const n = String(name || "");
  if (/email_search/i.test(n)) return "Searching the inbox";
  if (/read_resource/i.test(n)) return "Reading an email";
  if (/WebSearch/i.test(n)) return "Scanning industry news";
  if (/WebFetch/i.test(n)) return "Reading an article";
  if (/^(Write|Edit|MultiEdit)$/i.test(n)) {
    const f = String((input && input.file_path) || "");
    if (/sync-progress/i.test(f)) return "Updating progress";
    if (/tasks\.json/i.test(f)) return "Writing tasks";
    if (/news/i.test(f)) return "Writing news";
    return "Writing files";
  }
  if (/^Bash$/i.test(n)) {
    const c = String((input && input.command) || "");
    if (/git commit/i.test(c)) return "Committing";
    if (/git push/i.test(c)) return "Pushing to GitHub";
    return "Running a command";
  }
  if (/^(Read|Glob|Grep)$/i.test(n)) return "Reading files";
  return n ? `Using ${n}` : "Working";
}

// Parse one NDJSON line from `claude --output-format stream-json`.
function noteSyncEvent(line) {
  let ev;
  try { ev = JSON.parse(line); } catch (e) { return; }
  const a = sync.activity || (sync.activity = { tools: 0, tool: null, text: null, at: null });
  if (ev.type === "assistant" && ev.message && Array.isArray(ev.message.content)) {
    for (const b of ev.message.content) {
      if (b.type === "tool_use") {
        a.tools += 1;
        a.tool = toolLabel(b.name, b.input);
        a.at = Date.now();
      } else if (b.type === "text" && b.text && b.text.trim()) {
        a.text = b.text.trim().replace(/\s+/g, " ").slice(0, 160);
        a.at = Date.now();
      }
    }
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

function runClaude(args, onDone, timeoutMs, onLine) {
  let proc;
  try {
    proc = spawn("claude", args, { cwd: here, shell: true, windowsHide: true });
  } catch (err) {
    onDone(-1, String(err));
    return null;
  }
  let out = "";
  let buf = "";
  proc.stdout.on("data", (d) => {
    out += d;
    if (!onLine) return;
    buf += d;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop(); // keep the partial line
    lines.filter(Boolean).forEach(onLine);
  });
  proc.stderr.on("data", (d) => (out += d));
  const timer = timeoutMs ? setTimeout(() => proc.kill(), timeoutMs) : null;
  proc.on("close", (code) => {
    if (timer) clearTimeout(timer);
    onDone(code, out);
  });
  proc.on("error", (err) => {
    if (timer) clearTimeout(timer);
    onDone(-1, String(err));
  });
  return proc;
}

function claudeBridge() {
  return {
    name: "claude-bridge",
    configureServer(server) {
      // POST = kick off /command-center-sync headless; GET = poll status
      server.middlewares.use("/api/sync", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "POST") {
          if (!guard(req, res)) return;
          if (sync.running) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: "sync already running" }));
            return;
          }
          sync.running = true;
          sync.exitCode = null;
          sync.startedAt = Date.now();
          sync.log = "";
          sync.activity = { tools: 0, tool: null, text: null, at: Date.now() };
          try {
            fs.writeFileSync(PROGRESS, JSON.stringify({ phase: "starting", totalEmails: 0, processed: 0, created: 0, skipped: 0 }) + "\n");
          } catch (e) {}
          sync.proc = runClaude(
            ["-p", '"/command-center-sync"', "--permission-mode", "bypassPermissions",
             "--output-format", "stream-json", "--verbose"],
            (code, out) => {
              sync.running = false;
              sync.exitCode = code;
              sync.log = (out || "").slice(-2000);
              sync.proc = null;
            },
            15 * 60 * 1000,
            noteSyncEvent
          );
          res.end(JSON.stringify({ started: true }));
        } else if (req.method === "GET") {
          let progress = null;
          try {
            progress = JSON.parse(fs.readFileSync(PROGRESS, "utf-8"));
          } catch (e) {}
          res.end(
            JSON.stringify({
              running: sync.running,
              exitCode: sync.exitCode,
              startedAt: sync.startedAt,
              tail: sync.log.slice(-600),
              progress,
              activity: sync.activity,
            })
          );
        } else {
          res.statusCode = 405;
          res.end();
        }
      });

      // POST {title, project, blurb} -> ask Claude to find the likeliest Egnyte path
      server.middlewares.use("/api/find-path", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!guard(req, res)) return;
        let info = {};
        try {
          info = JSON.parse(await readBody(req));
        } catch (e) {}
        // scope the search to the portco's known root folder (data/egnyte-roots.json)
        let roots = {};
        try {
          roots = JSON.parse(fs.readFileSync(path.join(here, "data", "egnyte-roots.json"), "utf-8"));
        } catch (e) {}
        const root = roots[info.bucket] || roots.default || "/Shared/FEP";
        const clean = (s) => String(s || "").replace(/["`]/g, "'").slice(0, 400);
        const prompt =
          `Using the Egnyte MCP tools, find the single most likely existing Egnyte file or folder for this task. ` +
          `IMPORTANT: scope the search to the folder '${root}' — start with list_filesystem_by_path on that folder (and its likely subfolder), ` +
          `and if you use search/advanced_search, constrain it to that folder path. Do NOT search the whole domain unless nothing plausible exists under '${root}'. ` +
          `Task title: '${clean(info.title)}'. Deal/project: '${clean(info.project)}'. Details: '${clean(info.blurb)}'. ` +
          `Respond with ONLY the best Egnyte path or URL on one line, no commentary. If nothing plausible is found respond with exactly: NONE`;
        runClaude(
          ["-p", JSON.stringify(prompt), "--permission-mode", "bypassPermissions"],
          (code, out) => {
            const line = (out || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
            if (code !== 0 || !line || line.toUpperCase().includes("NONE")) {
              res.end(JSON.stringify({ path: null, error: code !== 0 ? `claude exited ${code}` : "no plausible path found" }));
            } else {
              res.end(JSON.stringify({ path: line }));
            }
          },
          4 * 60 * 1000
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tasksApi(), newsApi(), stockApi(), claudeBridge()],
  // CC-7: listen on all interfaces so the Cloudflare tunnel (and only it — the
  // mutating routes are guarded, CC-2) can reach the app. PCC_TUNNEL_HOST is the
  // tunnel's hostname, e.g. desk.example.com; unset keeps Vite's localhost-only
  // host allowlist.
  server: {
    host: true,
    allowedHosts: process.env.PCC_TUNNEL_HOST ? [process.env.PCC_TUNNEL_HOST] : [],
  },
});
