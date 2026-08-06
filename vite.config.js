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

// Serves data/industry-news.json (written by the sync skill's news scan).
function newsApi() {
  return {
    name: "news-api",
    configureServer(server) {
      server.middlewares.use("/api/news", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          res.end(fs.readFileSync(path.join(here, "data", "industry-news.json"), "utf-8"));
        } catch (e) {
          res.end(JSON.stringify({ updatedAt: null, items: [] }));
        }
      });
    },
  };
}

// Bridges dashboard buttons to headless Claude Code runs (`claude -p`), which
// inherit this machine's Claude session + MCP connectors (M365, Egnyte).
const sync = { proc: null, running: false, exitCode: null, startedAt: null, log: "" };

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

function runClaude(args, onDone, timeoutMs) {
  let proc;
  try {
    proc = spawn("claude", args, { cwd: here, shell: true, windowsHide: true });
  } catch (err) {
    onDone(-1, String(err));
    return null;
  }
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
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
          if (sync.running) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: "sync already running" }));
            return;
          }
          sync.running = true;
          sync.exitCode = null;
          sync.startedAt = Date.now();
          sync.log = "";
          try {
            fs.writeFileSync(PROGRESS, JSON.stringify({ phase: "starting", totalEmails: 0, processed: 0, created: 0, skipped: 0 }) + "\n");
          } catch (e) {}
          sync.proc = runClaude(
            ["-p", '"/command-center-sync"', "--permission-mode", "bypassPermissions"],
            (code, out) => {
              sync.running = false;
              sync.exitCode = code;
              sync.log = (out || "").slice(-2000);
              sync.proc = null;
            },
            15 * 60 * 1000
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
  plugins: [react(), tasksApi(), newsApi(), claudeBridge()],
});
