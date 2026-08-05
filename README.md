# Morning Deal Desk

Personal task triage dashboard for a PE deal professional. Originally built as a
Claude.ai artifact; rebuilt to run locally with **Claude Code as the sync engine** —
no backend, no API keys, no Entra app registration.

## How it works

```
Claude Code (terminal)                          Browser
  /deal-sync ──▶ searches Outlook via the        npm run dev ──▶ dashboard at
                 connected Microsoft 365 MCP,                    localhost:5173,
                 triages emails into tasks,                      reads/writes the
                 merges into data/tasks.json ◀──────────────────  same file via
                 and commits to git                              /api/tasks
```

- **`data/tasks.json`** is the single source of truth. The Vite dev server exposes
  it as `GET/PUT /api/tasks` (localhost only, no secrets).
- **Git history of that file is the task archive** — every sync and edit session is
  a commit, so "what was on my desk July 1" is `git show`.
- **Skills** (in `.claude/skills/`):
  - `/deal-sync` — triage new inbox mail into tasks (optionally pass a window, e.g. `/deal-sync past 7 days`)
  - `/deal-research` — deep-dive one task: pull the email thread + history, write a game plan

## Running

```powershell
cd deal-desk
npm install     # first time only
npm run dev     # dashboard at http://localhost:5173
```

Node is installed portably at `~\Tools\node` (no admin rights on this machine);
it's on the user PATH for new terminals.

## Syncing

Open Claude Code in this folder (or the parent) and run `/deal-sync`. When it
finishes, hit **↻ Refresh** in the dashboard. Avoid editing tasks in the dashboard
while a sync is running — last write wins.

## Provenance

`versions/` holds the original Claude.ai artifact source this app was ported from.
