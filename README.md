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

## Ideas / not yet built

`TODO.md` is the single managed state for open ideas and known rough edges — one row
per idea, git history is the archive. Add to it rather than starting a side note.

## Provenance

`versions/` holds the original Claude.ai artifact source this app was ported from.
