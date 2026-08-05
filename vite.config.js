import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "data", "tasks.json");

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

export default defineConfig({
  plugins: [react(), tasksApi()],
});
