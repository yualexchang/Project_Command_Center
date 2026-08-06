# TODO / Ideas

Single source of truth for everything we've thought about building but haven't.
Same philosophy as `data/tasks.json`: one file, git history is the archive.

**Conventions**

- Every idea gets a stable ID (`CC-1`, `CC-2`, …). Never reuse a number, even after `done`.
- The table below is the managed state — **if it isn't in the table, it isn't tracked.**
  Add the row first, then the detail section.
- Status: `open` (captured, not scheduled) · `next` (do it this sitting) ·
  `wip` · `done` · `dropped` (keep the row, add a one-line why)
- Claude Code: when you finish an item, flip its status here in the same commit as
  the code. When you spot something out of scope, add a row instead of building it.

## State

| ID | Idea | Status | Priority | Why it matters |
|---|---|---|---|---|
| CC-1 | Undo action in the dashboard | open | high | Alex wants it; no recovery path today short of `git checkout` |
| CC-2 | Auth/origin check on the Claude bridge endpoints | open | high | Any web page you visit can trigger a `bypassPermissions` Claude run |
| CC-3 | Make `npm run build` produce a working app | open | medium | Blocks every hosting option; API is dev-server-only |
| CC-4 | Stop the dashboard clobbering hand edits to `tasks.json` | open | medium | Silent data loss when editing the file while the server is up |
| CC-5 | Single home for the skills (stop the double copy) | open | medium | Two copies drift; edit one, the other silently wins |
| CC-6 | Get the dashboard onto Alex's phone | open | medium | Wants it away from the desk |
| CC-7 | Bind Vite beyond `::1` | open | low | One-line prerequisite for CC-6 |
| CC-8 | Find what resets `tasks.json` to the empty default | open | high | All 30 tasks silently wiped on 2026-08-06; recovered only because git had them |

---

## CC-1 — Undo action in the dashboard

**Ask:** Alex needs to undo an action (2026-08-06). Nothing in the UI reverses an
edit, a status flip, or a delete today — the only recovery is
`git checkout data/tasks.json`, which throws away *everything* since the last commit.

**Why it's cheap here:** the dashboard already sends the *entire* task list on every
change (`PUT /api/tasks` in [vite.config.js](vite.config.js), and `App.jsx` holds all
tasks in one state object). So an undo stack is just keeping the last N versions of
that array in memory and re-PUTting an older one. No per-action inverse logic needed.

**Open design questions** — decide before building:

- Scope: does undo cover a sync merge, or only manual edits? A sync can add 5+ tasks
  at once; undoing that is a different (bigger) button than undoing a typo.
- Depth: last action only, or a stack? Does it survive a page refresh?
- Surface: `Ctrl+Z`, a toast with "Undo" right after each action, or a history panel?
  A toast is the least code and covers the common "oops" case.
- Deeper history is already free via git — a "restore from earlier commit" view is a
  separate, larger idea. Don't conflate it with CC-1.

**Watch out:** an undo stack of full task arrays will fight with a running sync — if
Claude writes to `tasks.json` while a stale array sits in the undo buffer, restoring
it silently discards the synced tasks. Related to CC-4. At minimum, re-GET before
restoring and warn if the file changed underneath.

## CC-2 — Auth/origin check on the Claude bridge endpoints

`POST /api/sync` and `POST /api/find-path` ([vite.config.js](vite.config.js)) spawn
`claude -p … --permission-mode bypassPermissions` with no auth, no CSRF token, and no
origin check. Both are "simple" cross-origin POSTs, so **no CORS preflight fires** —
any page open in your browser can kick off a permission-bypassed Claude Code run on
the machine, and `/api/find-path`'s body reaches the prompt. `PUT /api/tasks` is
incidentally safe (PUT forces a preflight).

Localhost binding is the only thing containing this today, and CC-6/CC-7 remove that.
**Do this before any tunnel or hosting.**

Fix: reject requests whose `Origin` isn't `http://localhost:5173`, and require a
custom header on both routes (a custom header alone forces a preflight).

## CC-3 — Make `npm run build` produce a working app

All four API routes live in Vite's `configureServer` hook, which only runs in dev. A
built bundle has no `/api/*` at all — it would load and fail to fetch tasks. So the
project can only ever run via `npm run dev`.

Extract the handlers into a module usable by both `configureServer` and a real host
(a small Node server, or serverless functions if the UI goes static). Prerequisite for
CC-6 option B.

## CC-4 — Stop the dashboard clobbering hand edits to `tasks.json`

The dev server `writeFileSync`s the whole file on every dashboard change. Edit
`tasks.json` in Cursor while the server is up and the next UI action overwrites you,
silently. (The server has been up continuously since 2026-08-05.) README says "avoid
editing during a sync" — but the same race applies to hand edits.

Cheap fix: send the file's mtime with the `PUT` and reject with 409 if it changed
since the client's last `GET`. Also unblocks safe undo (CC-1).

## CC-5 — Single home for the skills (stop the double copy)

`command-center-sync` and `command-center-research` exist in both `.claude/skills/`
and `~\.claude\skills\`. Editing one leaves the other stale, and which one runs
depends on how Claude Code was invoked. Pick the repo copy as canonical and replace
the home-directory copy with a symlink (`New-Item -ItemType SymbolicLink` — may need
Developer Mode, no admin), or delete the home copy and always run from the repo.

## CC-6 — Get the dashboard onto Alex's phone

Two viable paths (full comparison in the 2026-08-06 session):

- **Tunnel (~30 min, laptop must be awake):** `cloudflared tunnel --url
  http://localhost:5173` — portable exe, no admin, same pattern as `~\Tools\node`.
  Gives the *whole* app including the Sync button, because compute stays local.
  **Must** be gated by Cloudflare Access (free) and needs CC-2 and CC-7 first.
- **Static UI + GitHub as the store (~half day, laptop can be closed):** UI to
  Cloudflare Pages/Vercel; read and write `tasks.json` through the GitHub API with a
  fine-grained PAT — keeps git-history-as-archive. Sync stays local on a schedule and
  pushes; the phone reads the last push. Needs CC-3. Loses the on-demand Sync button
  and the Egnyte path-finder.

A full cloud rebuild (Anthropic API key + Entra app for Graph mail + Egnyte API) is
the plan already abandoned for this project — don't revisit without a reason.

## CC-8 — Find what resets `tasks.json` to the empty default

During the 2026-08-06 ~19:21Z sync, the working copy of `data/tasks.json` was found
reduced to exactly `{"tasks": [], "lastSync": null}` — the app's initial default —
while HEAD had 30 tasks and `lastSync` 18:40Z. The dev server was up (it has been
since 2026-08-05). `lastSync: null` rules out 30 manual deletes in the UI; something
wrote the *default state* over the file. Prime suspect: an initialization/fallback
path in [vite.config.js](vite.config.js) (e.g. failed read/parse → write defaults).
The sync restored the file with `git restore` before merging, so nothing was lost
this time — but only because every sync commits. Find the code path and make it
never write defaults over an existing file (back up + 500 instead). Related: CC-1
(undo), CC-4 (same whole-file `writeFileSync` habit).

**Before either:** `tasks.json` holds live FEP deal names, portfolio companies, and
colleagues' addresses. Hosting it moves that data off the laptop — worth a word with
whoever owns FEP data policy. Brandon Emmerich offered FEP devops infra if hosting is
ever needed; that's the sanctioned path.

## CC-7 — Bind Vite beyond `::1`

The dev server currently listens on `::1:5173` (IPv6 localhost only), so nothing else
can reach it. Add `server: { host: true }` to `vite.config.js`. If Vite then rejects
the tunnel's hostname, also set `server.allowedHosts`. Only do this alongside CC-2 —
it is what makes the unauthenticated endpoints reachable.
