# Project Command Center

Personal task triage dashboard for a PE deal professional. Originally built as a
Claude.ai artifact ("Morning Deal Desk"); rebuilt to run locally with **Claude Code
as the sync engine** — no backend, no API keys, no Entra app registration.

## How it works

```
Claude Code (terminal)                          Browser
  /command-center-sync ─▶ searches Outlook via   npm run dev ──▶ dashboard at
                 the connected Microsoft 365                     localhost:5173,
                 MCP, triages emails into                        reads/writes the
                 tasks, merges into          ◀──────────────────  same file via
                 data/tasks.json, commits                        /api/tasks
```

- **`data/tasks.json`** is the single source of truth. The Vite dev server exposes
  it as `GET/PUT /api/tasks` (localhost only, no secrets).
- **Git history of that file is the task archive** — every sync and edit session is
  a commit, so "what was on my desk July 1" is `git show`.
- **Skills** (in `.claude/skills/`, mirrored to `~\.claude\skills\`):
  - `/command-center-sync` — triage new inbox mail into tasks (optionally pass a window, e.g. `/command-center-sync past 7 days`)
  - `/command-center-research` — deep-dive one task: pull the email thread + history, write a game plan

## Running

```powershell
cd project-command-center
npm install     # first time only
npm run dev     # dashboard at http://localhost:5173
```

Node is installed portably at `~\Tools\node` (no admin rights on this machine);
it's on the user PATH for new terminals.

## Syncing

Open Claude Code and run `/command-center-sync` (or hit **Sync** in the
dashboard). Open dashboards pick the changes up live — the dev server watches
`data/tasks.json` and pushes updates over `/api/tasks/stream`, and concurrent
edits are version-guarded and merged per task instead of last-write-wins.

## Phone access (CC-31 phase 1)

The laptop stays the server — the phone is a live window into it, through a
Cloudflare tunnel gated by Cloudflare Access. One-time setup, all no-admin:

1. **Domain + Cloudflare.** A named tunnel needs a domain in a (free) Cloudflare
   account (~$10/yr if none spare). Quick `trycloudflare.com` tunnels won't do:
   random URL every start and no Access gating in front of the Claude bridge.
2. **cloudflared.** Portable `cloudflared.exe` into `~\Tools` (same pattern as
   node). `cloudflared tunnel login`, `cloudflared tunnel create pcc`, route DNS
   to e.g. `desk.<domain>`, point the tunnel at `http://localhost:5173`.
3. **Cloudflare Access.** Zero Trust → Access application for `desk.<domain>`,
   policy allowing **only Alex's email**, One-time PIN login, session ~1 month.
   Do not skip this — the tunnel without Access exposes the dashboard (and the
   deal names in it) to anyone with the URL.
4. **Env var.** Set `PCC_TUNNEL_HOST=desk.<domain>` (user env var). The dev
   server uses it for Vite's `allowedHosts` and the CC-2 origin allowlist.
5. **Auto-start (optional).** Two user-level Task Scheduler entries at logon,
   cwd this repo: `npm run dev` and `cloudflared tunnel run pcc`. Power
   settings: don't sleep when plugged in — a sleeping laptop is a dead app.
6. **iPhone.** Visit `https://desk.<domain>`, pass the email PIN, Share →
   **Add to Home Screen**. Launches full-screen under its own icon.

Both devices can edit at once: writes are version-guarded (`tasks.json` carries a
`version`; a stale write gets a 409 and the client merges per task), and open
dashboards follow changes live over `/api/tasks/stream`.

**Limits:** the laptop must be awake and online — lid closed means the phone
shows a Cloudflare error page (offline mode is CC-34, not built). Skills live in
both `.claude/skills/` and `~\.claude\skills\` (CC-5): after pulling changes to
the repo skills, re-mirror the home copies or the stale ones silently win.

## Ideas / not yet built

`TODO.md` is the single managed state for open ideas and known rough edges — one row
per idea, git history is the archive. Add to it rather than starting a side note.

## Provenance

`versions/` holds the original Claude.ai artifact source this app was ported from.
