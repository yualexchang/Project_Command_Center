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
npm run remote  # same dashboard, reachable from the phone (see below)
```

Node is installed portably at `~\Tools\node` (no admin rights on this machine);
it's on the user PATH for new terminals.

## On the go (phone)

```powershell
npm install       # once, for the QR-code dependency
npm run remote    # opens a Cloudflare tunnel and prints a link + QR code
```

Scan the QR with the phone. The link carries a one-time access key which the
first page load swaps for a cookie good for 30 days, so the key never sits in
the address bar afterwards. `npm run remote:lan` does the same over the local
wifi instead of a tunnel — no Cloudflare, but the phone has to be on the same
network.

- **The laptop has to be awake and this window open.** Compute stays here, which
  is exactly why ↻ Refresh and 🔍 Research still work from the phone.
- **The quick tunnel's hostname is random and changes every run**, so the QR is
  the way in; a bookmark won't survive a restart. A named tunnel behind
  Cloudflare Access fixes that — `TODO.md` CC-34.
- **Everything is behind the token**, including the app itself, `/api/*` and
  Vite's own module graph. The token lives in `data/.remote-token` (gitignored).
  Delete that file and restart to revoke every phone at once.
- `npm run dev` is unchanged: localhost only, no gate. The gate only exists when
  `PCC_REMOTE` is set, which only `npm run remote` does.
- **Hot reload is off in remote mode** (`TODO.md` CC-36), so a code edit while the
  tunnel is up needs a page refresh to show up.
- **This puts live deal names and colleagues' addresses on the public internet**
  for as long as the tunnel is up. Worth a word with whoever owns FEP data policy
  before it becomes a daily habit.

## Syncing

Three ways in, all running the same skill:

- **Automatic** — a Task Scheduler entry runs a sync every 10 minutes, Mon-Fri
  08:00-18:00. Register it once with
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-sync-task.ps1`;
  it logs one line per run to `logs/`. See `TODO.md` CC-9.
- **On demand** — the **↻ Refresh** button in the dashboard.
- **By hand** — `/command-center-sync` in Claude Code, optionally with a window.

Per-task, the **🔍 Research** button on an expanded card runs
`/command-center-research` for that task and rewrites its brief and game plan in
place.

Avoid editing tasks in the dashboard while a sync is running — last write wins.
The scheduled runs take a lockfile so they can't overlap each other, but the
dashboard's own Sync button doesn't (CC-4, CC-9).

## Ideas / not yet built

`TODO.md` is the single managed state for open ideas and known rough edges — one row
per idea, git history is the archive. Add to it rather than starting a side note.

## Provenance

`versions/` holds the original Claude.ai artifact source this app was ported from.
