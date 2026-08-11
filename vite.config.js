import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "data", "tasks.json");
const PROGRESS = path.join(here, "data", "sync-progress.json"); // written by the sync skill, read by the dashboard

// Serves data/tasks.json as GET/PUT /api/tasks. Local-only: the dev server
// binds to localhost and holds no secrets — Claude Code and the dashboard
// share this file as the single source of truth.
function tasksApi() {
  return {
    name: "tasks-api",
    configureServer(server) {
      server.middlewares.use("/api/tasks", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(fs.readFileSync(DATA, "utf-8"));
        } else if (req.method === "PUT") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              fs.writeFileSync(DATA, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
              res.setHeader("Content-Type", "application/json");
              res.end('{"ok":true}');
            } catch (e) {
              res.statusCode = 400;
              res.end('{"error":"invalid json"}');
            }
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
const research = { proc: null, running: false, taskId: null, title: null, exitCode: null, startedAt: null, log: "", activity: null };

// CC-2. Every route below spawns `claude -p … --permission-mode bypassPermissions`,
// so an unauthenticated POST here is remote code execution on this machine. They
// are "simple" cross-origin POSTs, which fire NO CORS preflight — without this,
// any page open in the browser can start a permission-bypassed Claude run.
// The custom header is what actually closes it: a cross-origin caller cannot set
// one without a preflight, and this server answers no preflight. The Origin check
// is the second lock rather than the only one, since Origin is absent on some
// same-origin requests and forgeable outside a browser.
// CC-33. data/.sync.lock is the cross-PROCESS interlock between the three things
// that rewrite data/tasks.json: the scheduled tick (scripts/sync-tick.ps1), the
// Refresh button and the Research button. Task Scheduler's IgnoreNew only stops a
// tick colliding with another tick; the in-process `sync.running` flag only stops
// two button presses. Neither sees the other — proven live on 2026-08-11, when a
// scheduled tick and a dashboard sync ran together and re-scanned the same inbox.
// Stale locks are reclaimed after 15 minutes so a crashed run cannot wedge the
// dashboard permanently; sync-tick.ps1 uses the same file and the same window.
const LOCK = path.join(here, "data", ".sync.lock");
const LOCK_STALE_MS = 15 * 60 * 1000;
function lockHeldFor() {
  try {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < LOCK_STALE_MS) return Math.round(age / 1000);
  } catch (e) {}
  return null; // absent, unreadable, or stale — free to take
}
function takeLock() {
  try { fs.writeFileSync(LOCK, String(process.pid)); } catch (e) {}
}
function releaseLock() {
  try { fs.unlinkSync(LOCK); } catch (e) {}
}

const BRIDGE_HEADER = "x-pcc-bridge";
const ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
function guarded(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: `origin ${origin} not allowed` }));
    return false;
  }
  if (req.headers[BRIDGE_HEADER] !== "1") {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: "missing bridge header" }));
    return false;
  }
  return true;
}

// Friendly label for each tool Claude invokes during a sync.
function toolLabel(name, input) {
  const n = String(name || "");
  if (/email_search/i.test(n)) return "Searching the inbox";
  if (/read_resource/i.test(n)) return "Reading an email";
  if (/calendar_search|meeting_availability|available_time/i.test(n)) return "Checking the calendar";
  if (/chat_message_search|teams_list_chats/i.test(n)) return "Searching Teams";
  if (/^ToolSearch$/i.test(n)) return "Loading tools";
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

// Parse one NDJSON line from `claude --output-format stream-json` into `state`.
// Shared by the sync and research runs — both surface the same live tool labels.
function noteEvent(state, line) {
  let ev;
  try { ev = JSON.parse(line); } catch (e) { return; }
  const a = state.activity || (state.activity = { tools: 0, tool: null, text: null, at: null });
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
        if (!guarded(req, res)) return;
        if (req.method === "POST") {
          // `mine` tells the dashboard whether this is a run it can poll: a sync
          // this server started, or one owned by the scheduled task, which it
          // cannot see the progress of.
          if (sync.running) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: "sync already running", mine: true }));
            return;
          }
          const held = lockHeldFor();
          if (held !== null) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: `the scheduled sync is running (started ${held}s ago) — it will finish on its own`, mine: false }));
            return;
          }
          takeLock();
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
              releaseLock();
            },
            15 * 60 * 1000,
            (line) => noteEvent(sync, line)
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

      // CC-11. POST {id, title} = run /command-center-research for one task;
      // GET = poll. The skill rewrites that task's blurb/context/steps in
      // data/tasks.json in place and commits, so the dashboard just reloads the
      // file when the run finishes. One at a time: two concurrent runs would each
      // write the whole file and the loser's edits would vanish (CC-4).
      server.middlewares.use("/api/research", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (!guarded(req, res)) return;
        if (req.method === "GET") {
          res.end(JSON.stringify({
            running: research.running,
            taskId: research.taskId,
            title: research.title,
            exitCode: research.exitCode,
            startedAt: research.startedAt,
            tail: research.log.slice(-600),
            activity: research.activity,
          }));
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (research.running) {
          res.statusCode = 409;
          res.end(JSON.stringify({ error: `already researching "${research.title}"` }));
          return;
        }
        // research rewrites the whole of tasks.json too, so it queues behind a
        // running sync rather than merging into one (CC-33)
        const busyFor = lockHeldFor();
        if (busyFor !== null) {
          res.statusCode = 409;
          res.end(JSON.stringify({ error: `a sync is running (started ${busyFor}s ago) — try again when it finishes` }));
          return;
        }
        takeLock();
        let info = {};
        try {
          info = JSON.parse(await readBody(req));
        } catch (e) {}
        // The title is interpolated into a prompt, so strip the quote characters
        // that would let it break out of the argument and append instructions.
        const title = String(info.title || "").replace(/["`\r\n]/g, " ").trim().slice(0, 160);
        if (!title) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "no task title" }));
          return;
        }
        research.running = true;
        research.taskId = info.id || null;
        research.title = title;
        research.exitCode = null;
        research.startedAt = Date.now();
        research.log = "";
        research.activity = { tools: 0, tool: null, text: null, at: Date.now() };
        research.proc = runClaude(
          ["-p", JSON.stringify(`/command-center-research ${title}`),
           "--permission-mode", "bypassPermissions",
           "--output-format", "stream-json", "--verbose"],
          (code, out) => {
            research.running = false;
            research.exitCode = code;
            research.log = (out || "").slice(-2000);
            research.proc = null;
            releaseLock();
          },
          10 * 60 * 1000,
          (line) => noteEvent(research, line)
        );
        res.end(JSON.stringify({ started: true, title }));
      });

      // POST {title, project, blurb} -> ask Claude to find the likeliest Egnyte path
      server.middlewares.use("/api/find-path", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (!guarded(req, res)) return;
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
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
});
