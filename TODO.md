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
| CC-1 | Undo action in the dashboard | done | high | Shipped: ↶ Undo button, 25-step in-memory stack (commit b088374). Refresh persistence → CC-20; sync-clobber caveat → CC-4 |
| CC-2 | Auth/origin check on the Claude bridge endpoints | done | high | Shipped: `X-PCC: 1` header (forces preflight) + origin allowlist on all three mutating routes |
| CC-3 | Make `npm run build` produce a working app | open | medium | Blocks every hosting option; API is dev-server-only |
| CC-4 | Stop the dashboard clobbering hand edits to `tasks.json` | open | medium | Silent data loss when editing the file while the server is up |
| CC-5 | Single home for the skills (stop the double copy) | open | medium | Two copies drift; edit one, the other silently wins |
| CC-6 | Get the dashboard onto Alex's phone | open | medium | Wants it away from the desk |
| CC-7 | Bind Vite beyond `::1` | done | low | Shipped: `host: true` + `allowedHosts` from `PCC_TUNNEL_HOST`; landed after CC-2 |
| CC-8 | Find what resets `tasks.json` to the empty default | open | high | All 30 tasks silently wiped on 2026-08-06; recovered only because git had them |
| CC-9 | Scheduled morning sync (Task Scheduler → `claude -p "/command-center-sync"`) | open | high | Desk is fresh before it's opened; removes the last manual step |
| CC-10 | Done-detection — sync scans Sent Items, flags tasks whose thread Alex replied to | open | high | Tasks only close by hand today; the mailbox already knows |
| CC-11 | Per-task 🔍 Research button (bridge endpoint → `/command-center-research`) | open | medium | Skill exists, button missing. Do CC-2 first — it's another bridge route |
| CC-12 | ✉️ Draft-reply button — Claude drafts the reply into Outlook Drafts via M365 MCP | open | medium | Turns triage into throughput; review beats writing from scratch |
| CC-13 | Delegation chasers — on follow-up date, sync drafts the nudge email to the delegate | open | medium | Delegated work is where things silently die |
| CC-14 | Search box over title/blurb/context/sender | open | medium | List already at 30+ tasks and growing weekly |
| CC-15 | Needs-a-call helper — button runs `find_meeting_availability`, proposes slots | open | low | Closes the loop on the CALL FIRST label |
| CC-16 | Weekly Friday digest per portco from tasks.json git history, emailed to self | open | low | Free retro from data already collected |
| CC-17 | Click a mission dial to filter the task list to that bucket | open | low | Dials become navigation, not just display |
| CC-18 | Overdue strip pinned above the list regardless of sort/filter | open | low | Overdue currently signaled by chip color only |
| CC-19 | Archive completed tasks >30 days old to `data/archive.json` | open | low | Keeps tasks.json and the dashboard lean; git keeps everything anyway |
| CC-20 | Persist undo stack to localStorage (survives refresh) | open | low | CC-1 follow-up |
| CC-21 | Verify Penske bucket regex when the first Penske task lands | open | low | Silent misbucketing risk; `/penske/i` is unproven against real naming |
| CC-22 | Pin per-deal Egnyte folders in `data/egnyte-roots.json` as deals spin up | open | low | Recurring upkeep; keeps path lookups fast as deal count grows |
| CC-23 | Keyboard shortcuts (j/k move, space advance, u undo) | open | low | Speed for a daily-driver tool |
| CC-24 | Responsive layout pass — dials wrap awkwardly below ~700px | open | low | Pairs with CC-6 (phone access) |
| CC-25 | Due pipeline on calendar weeks, not a rolling 7/14-day window | done | medium | Shipped: buckets now cut off at the coming Sunday; also fixed the off-by-one in `daysUntil` |
| CC-26 | `setDueIn` lands a day late when used after ~20:00 local | open | medium | The +1/+3/+7 buttons silently set the wrong date in the evening |
| CC-27 | Group every sort under headers; split Ingested into FIFO/LIFO | done | medium | Shipped: deadline/priority/FIFO/LIFO all group; due pipeline gained a "this month" bucket |
| CC-28 | Overdue tasks are labelled "due today" in both the bar and the list | open | medium | The red segment conflates "today" with "three weeks late" |
| CC-29 | Mission dials re-laid out: all-projects + 2x2 left, portco rail right | done | medium | Shipped: clocks/weather/news moved out of the masthead into each portco's row |
| CC-30 | IMO and Penske news feeds have no scan rules in the sync skill | open | high | Their boxes render but stay empty every sync until the rules exist |
| CC-31 | Live cross-device sync (iPhone ↔ laptop, both writable) | open | medium | Two-phase design agreed 2026-08-09 (see section); phase 1 = live tunnel, phase 2 = CC-34 |
| CC-32 | Change channel — dashboard never learns the file changed under it | open | medium | CC-31 phase 1 step; today only ↻ Refresh or a sync reloads |
| CC-33 | Per-task `updatedAt` for merge resolution | open | medium | CC-31 phase 2 (CC-34) prerequisite; whole-file last-write-wins is all we can do without it |
| CC-34 | Offline phone replica + reconnect merge (phase 2 of CC-31) | open | medium | Phone works with the laptop closed; merges when it's back. Needs CC-3 and CC-33 |

---

## CC-1 — Undo action in the dashboard — DONE

Shipped 2026-08-05 (commit b088374): ↶ Undo button in the action bar, 25-step
in-memory stack of full `{tasks, lastSync}` snapshots; loads/syncs reset the
baseline rather than entering the stack. Remaining gaps became their own rows:
refresh persistence (CC-20) and the sync-clobber race (CC-4).

**Original ask:** Alex needs to undo an action (2026-08-06). Nothing in the UI reverses an
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

## CC-2 — Auth/origin check on the Claude bridge endpoints — DONE

Shipped 2026-08-09 (CC-31 phase 1, step 1). `guard()` in
[vite.config.js](vite.config.js) protects `PUT /api/tasks`, `POST /api/sync` and
`POST /api/find-path`: requests must carry `X-PCC: 1` (a custom header forces a
CORS preflight, so a random web page can't fire a "simple" cross-origin POST at the
bridge), and any `Origin` present must be localhost:5173 / 127.0.0.1:5173 /
`https://$PCC_TUNNEL_HOST`. The dashboard's three mutating fetches send the header.
GETs stay open — same-origin reads with no side effects.

**Original problem:** both bridge POSTs spawn `claude -p … --permission-mode
bypassPermissions` with no auth, and as "simple" POSTs no preflight fired — any page
open in the browser could kick off a permission-bypassed Claude run, with
`/api/find-path`'s body reaching the prompt. Localhost binding was the only
containment, and CC-7 removes that.

## CC-3 — Make `npm run build` produce a working app

All four API routes live in Vite's `configureServer` hook, which only runs in dev. A
built bundle has no `/api/*` at all — it would load and fail to fetch tasks. So the
project can only ever run via `npm run dev`.

Extract the handlers into a module usable by both `configureServer` and a real host
(a small Node server, or serverless functions if the UI goes static). Prerequisite for
CC-6 option B — and a hard prerequisite for CC-34 (a service worker can't sensibly
cache the dev server).

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

## CC-7 — Bind Vite beyond `::1` — DONE

Shipped 2026-08-09 (CC-31 phase 1, step 2), after CC-2 landed. `server: { host:
true }` in [vite.config.js](vite.config.js), with `allowedHosts` fed by the
`PCC_TUNNEL_HOST` env var (e.g. `desk.example.com`) so the repo stays
domain-agnostic; unset keeps Vite's localhost-only host check.

## CC-9 … CC-24 — batch captured 2026-08-06 (improvement brainstorm)

Short notes; promote to a full section when one goes `next`.

- **CC-9 scheduled sync:** Windows Task Scheduler can run a user-level task without
  admin: `schtasks /Create /SC DAILY /ST 07:00 /TN CommandCenterSync /TR "claude -p
  \"/command-center-sync\" ..."` with cwd at the repo. Test M365 connector
  availability from a scheduled (non-interactive login) context before trusting it.
- **CC-10 done-detection:** extend the sync skill — after triaging inbound, search
  Sent Items for replies matching open tasks' `subject`/`sender`; list "likely
  complete" candidates in the sync report rather than auto-completing (false
  positives: a reply isn't always resolution).
- **CC-11/CC-12/CC-13/CC-15:** all are new headless-bridge routes or skill steps that
  act on the mailbox. CC-2 (bridge auth) is a prerequisite for any new bridge route.
  Drafts only — never auto-send.
- **CC-14 search:** client-side filter over title+blurb+context+sender; add to the
  filter bar with its own ✕.
- **CC-16 digest:** `git log --follow -p data/tasks.json` diffing week-over-week gives
  completed/added/slipped per bucket; render as text email via `outlook_create_draft`.
- **CC-19 archive:** on sync, move `status==="done" && createdAt < now-30d` to
  `data/archive.json`; dashboard shows a count link. Restore = move back.
- **CC-21/CC-22 are recurring upkeep,** not builds — revisit when the trigger event
  happens (first Penske task; each new live deal folder).

## CC-25 — Due pipeline on calendar weeks — DONE

Shipped 2026-08-06. `DUE_SEGMENTS` was a static const testing rolling offsets
(`1..7` = this week, `8..14` = next week), so a task's bucket drifted every day
and "this week" could mean *into* the following week. Replaced with
`dueSegments()`, rebuilt per render off `daysToWeekEnd()`: weeks run Mon-Sun,
"this week" ends at the coming Sunday, "next week" is the Mon-Sun block after.
On Sunday `daysToWeekEnd()` is 0 — "this week" is empty (filtered out of the bar
by the existing `n > 0` check) and everything ahead is next week.

**Also fixed, because the buckets sit on it:** `daysUntil` built its date as
`dstr + "T23:59:59"` and `Math.ceil`'d the delta, so it returned **1 for today
and 0 for yesterday** — a whole-day skew. "Due today" tasks were rendering in the
orange "this week" segment, and `chipFor`'s `n === 0` TODAY branch was
unreachable except in the last second of a day. Now both sides pin to local
midnight with `Math.round` (DST-safe): 0 = today, 1 = tomorrow, -1 = yesterday.
This also repairs the OVERDUE/TODAY chips and the `n <= 3` weekday chip, which
were all a day off.

Verified with a sweep over all 7 weekdays × 08:00/22:00, asserting: both week
blocks end on a Sunday, next-week is exactly 7 days, today reads as "today", and
tomorrow never does.

## CC-27 — Group every sort under headers; FIFO/LIFO — DONE

Shipped 2026-08-06. Previously only the project sort grouped; the other three
rendered as one flat list. Now all of them lay out under headers, each group
carrying its own colour (`groups` entries gained a `color`, so the header no
longer looks colours up via `bucketByKey`):

- **Deadline** — the `dueSegments()` horizons, same order as the pipeline bar, so
  the list reads as the bar expanded.
- **Priority** — high / medium / low, coloured from `PRI_COLOR`.
- **FIFO / LIFO** — `ingestSegments()`, the due horizons pointed backwards
  (ingested today / this week / this month / earlier), bucketed on `createdAt`.

**Due pipeline gained a "this month" bucket** (CC-25 shipped today / this week /
next week / longer). Late in the month "next week" can already run past month
end, so the month bucket is anchored at `> wk + 7` and simply empties in that
case, and "longer" opens at `max(wk + 7, monthEnd)` so no day falls through the
gap. Verified: 340,425 date/horizon pairs across 425 days each land in exactly
one bucket.

**Ingested became two sorts, FIFO and LIFO**, replacing the single `rank` sort.
`SORT_CYCLE` is now priority → project → deadline → FIFO → LIFO. Both are
hand-reorderable (`REORDERABLE`); LIFO renders rank descending, so `move()` is
called with the direction inverted or the arrows would read backwards. Group
order flips with the sort so the list stays monotonic top to bottom.

Bucketing uses `createdAt`, **not** `rank` — rank is the sort key that manual
reordering deliberately scrambles, `createdAt` is the real arrival time. A
hand-moved task therefore sits in its true age group but in its manual position
within it, which is the intended behaviour.

## CC-28 — Overdue tasks are labelled "due today"

The first due segment tests `n <= 0`, so a task three weeks late sits in the red
"due today" bucket in the pipeline bar and under the "DUE TODAY" header in the
deadline sort. The per-card chip still says `OVERDUE 21d`, so the information
isn't lost — but the bucket label is actively wrong, and overdue is the single
thing this desk exists to surface.

Add a sixth segment ahead of today: `{ key: "overdue", test: (n) => n < 0 }` in a
harder red, and tighten today to `n === 0`. Both the bar and the deadline sort
pick it up automatically. Held back from CC-27 only because the bucket list was
specified explicitly; no other code depends on the current grouping.

## CC-29 — Mission dial layout — DONE

Shipped 2026-08-06. Was three centred rows (hero / 4 portcos / 4 others) with the
clocks, weather and both news boxes crammed into the masthead's right corner.
Now two columns inside the dials card:

- **Left** — the All Projects hero over a 2x2 grid of Live Deals, AI Projects,
  Admin, Miscellaneous.
- **Right** — a rail with one row per portco: the dial, then that portco's live
  context. Driven by `PORTCO_RAIL`, so adding a portco is a one-line change.

| portco | clock | extra | news feed |
|---|---|---|---|
| BravoFit | Sydney | — | `bravofit` (+ live PLNT quote) |
| IMO | London | UK + Germany weather | `imo` |
| KEP | Denver | — | `earlyed` |
| Penske | LA | — | `penske` |

`ClockStrip` became `ClockCard({ portco })` (one clock, no repeated portco name —
the dial next to it already labels the row). `NewsBox` gained `compact` for the
rail (narrower, 3 headlines) and **no longer returns null when empty** — in a rail
an absent box leaves a ragged row, and it now distinguishes loading / feed
unavailable / no matching news.

Two feeds added, `imo` and `penske`, with empty seed files. **`/api/news` no
longer falls back to early-ed for an unknown feed** — harmless with two feeds,
but with one per portco it would have quietly shown KEP's childcare news under
Penske's dial. Unknown feeds now return empty plus an `error` field.

Verified by rendering `DialRow` against live `tasks.json` via
`renderToStaticMarkup`: 1 hero + 8 small dials, 4 clocks, 4 news boxes, and all
four `/api/news` feeds serving correctly. **Not** verified visually — there is no
browser tooling in this repo, so the proportions are reasoned, not seen. The IMO
row is the tallest: clock + two weather cards + news exceeds the rail width at
920px, so its news box wraps to a second line by design.

## CC-30 — IMO and Penske news feeds have no scan rules

`data/imo-news.json` and `data/penske-news.json` exist and are wired to the
dashboard, but the sync skill's news section only defines Feed A (early ed) and
Feed B (BravoFit). Until Feeds C and D are written, both boxes render "No
matching news this scan" forever.

Blocked on confirming what each business actually is, because a wrong sector
definition sends every weekly sync down the wrong search path. Working
assumptions from the repo, to confirm before writing:

- **IMO** — European car wash operator. UK and Germany are the two markets the
  dashboard already tracks weather for (wash volumes track dry days, which is
  why weather sits on this row), and `IMO Belux and France PF Sale Impact` and
  `IMO Q2 covenant compliance` appear in live tasks. Likely scopes `UK`/`DE`/`EU`.
- **Penske** — automotive retail / dealership group; `Penske July Reporting` is
  the only live task. Likely scopes `US`/`OEM`.

Once confirmed, add Feed C and Feed D to
`.claude/skills/command-center-sync/SKILL.md` in the same shape as Feed B, and
mirror to `~\.claude\skills\` (CC-5).

## CC-31 — Live cross-device sync (iPhone ↔ laptop, both writable)

Asked 2026-08-09: can the dashboard live-sync between the iPhone and the laptop?
CC-6 is the narrower "get it onto the phone" (reachability). This row is the harder
half: **both devices open at once, both able to edit, neither silently overwriting
the other.** Two-phase design agreed in the 2026-08-09 session; **build nothing
yet** was the explicit call — this section is the design of record.

**Why it's more than hosting.** Three separate problems today:

1. *Reachability* — no `server` block in [vite.config.js](vite.config.js), so Vite
   binds localhost only (CC-7), and all four API routes are dev-server-only (CC-3).
2. *No change channel (CC-32)* — `App.jsx` GETs `/api/tasks` once on mount
   (`loadFromFile`, ~line 827) and again only on ↻ Refresh or after a sync. Nothing
   polls; even tunneled, two devices sit on stale snapshots.
3. *Whole-file last-write-wins becomes real data loss (CC-4)* — saves are a 400 ms
   debounced `PUT` of the *entire* array, `writeFileSync`'d wholesale. With two live
   devices, every phone edit erases every laptop edit since the phone last loaded,
   and vice versa. Undo (CC-1) compounds it: restoring a stale snapshot on one
   device discards the other's work. **CC-4 is a hard prerequisite, not polish.**

### Phase 1 — live tunnel (laptop must be awake; ~a day)

Tunnel, not rebuild: compute stays on the PC, so the Sync button, Egnyte
path-finder and the whole Claude bridge keep working — they spawn `claude -p`
locally and cannot move to a static host. Order matters; one commit per step:

1. **CC-2 bridge auth** — require a custom header (`X-PCC: 1`) *and* an own-origin
   check on `POST /api/sync`, `POST /api/find-path`, and `PUT /api/tasks`; add the
   header to the client fetches. The custom header forces a CORS preflight, killing
   drive-by cross-origin POSTs. **Non-negotiable before any exposure** — these
   routes spawn `bypassPermissions` Claude runs.
2. **CC-7 bind** — `server: { host: true, allowedHosts: ["desk.<domain>"] }`.
   Never lands before step 1.
3. **CC-4 version guard** — `version` integer in `tasks.json`; GET returns it, PUT
   must echo it, mismatch → `409` with the current body; success bumps it. Never
   write defaults over an existing file (closes the CC-8 suspect path). Client
   tracks the version; on 409 it re-GETs, reapplies the pending edit, retries once
   (all edits already funnel through the one debounced-save effect). The sync
   skill must bump `version` too — update its SKILL.md + mirror (CC-5).
4. **CC-32 SSE change channel** — see that row.
5. **CC-24 responsive + iOS app feel** — below ~700px stack the portco rail
   (laid out for ~920px, CC-29), wrap the filter bar, enlarge touch targets;
   `apple-mobile-web-app-capable` + status-bar metas + `apple-touch-icon` in
   `index.html` so Add to Home Screen launches full-screen under its own icon.
6. **Ops (README only)** — portable `cloudflared.exe` in `~\Tools` (no admin, same
   pattern as node); a *named* tunnel needs a domain in a free Cloudflare account
   (~$10/yr — quick `trycloudflare.com` tunnels are unacceptable: random URL, no
   Access gating); Cloudflare Access allowing only Alex's email (PIN login,
   ~1-month session); two user-level Task Scheduler entries (`npm run dev`,
   `cloudflared tunnel run`); power settings: never sleep when plugged in.

*Phase-1 limitations, accepted:* laptop asleep/off ⇒ phone shows an error page, no
offline; same-field-same-second edits resolve last-write-wins; undo stays
per-device; the Vite dev server remains the "production" server; traffic transits
Cloudflare's edge.

*Phase-1 verification:* cross-origin POST rejected while in-app Sync works; two
browser windows converge within ~1s and a same-task dual edit loses nothing (409
path); hand-editing `tasks.json` propagates to open windows; real-iPhone test
through the tunnel (PIN flow, Home Screen, background 10+ min then reopen, kill the
dev server ⇒ error page).

### Phase 2 — offline replica + merge → CC-34

**Merge policy.** Phase 1 stays simple and correct: on a remote version bump, adopt
it unless this device has a pending local edit — that's the 409 path (re-GET,
reapply, retry). True offline divergence needs per-task `updatedAt` (CC-33) plus
delete tombstones, which is CC-34's job.

**Why not the static-host option** (CC-6 option B, UI on Pages + GitHub API as the
store): survives a closed laptop but is read-mostly, loses the Sync and path-finder
buttons, needs CC-3 first, and commit-per-edit means seconds of latency with
git-level conflicts. Good as a phone *viewer*; not a live two-way desk.

**Data policy caveat, unchanged from CC-6:** `tasks.json` holds live FEP deal names,
portfolio companies and colleagues' addresses. A tunnel keeps the data *at rest* on
the laptop (it only transits Cloudflare); CC-34 puts a replica on the phone, and
cloud hosting moves it off-machine entirely — the latter two are the versions that
need a word with whoever owns FEP data policy. Brandon Emmerich's offer of FEP
devops infra is the sanctioned path if it ever needs real hosting.

## CC-32 — Change channel so the dashboard notices external writes

CC-31 phase 1, step 4 — but useful on its own even single-device: the sync skill, a
`git checkout`, or hand-editing `tasks.json` all leave the open dashboard stale
until ↻ Refresh. `fs.watch(DATA)` in `configureServer` (debounced ~200ms) → SSE on
`GET /api/tasks/stream` emitting `{version}` → client re-GETs on a newer version,
reusing the `skipNextSave` ref so pushed loads don't enter the undo stack.
Reconnect + refetch on `visibilitychange`/`focus` — iOS Safari suspends background
tabs, so the wake path matters more than the steady state. Also removes the "hit
Refresh when the sync finishes" step in the README.

## CC-33 — Per-task `updatedAt` for merge resolution

Tasks carry `createdAt` but nothing recording last modification, so two divergent
copies of the array can't be merged per task — the only available policy is
whole-file last-write-wins. A `touch()` helper stamped in every mutating handler in
`App.jsx`; the sync skill stamps tasks it creates or merges. Prerequisite for CC-34;
also makes CC-16 (weekly digest) and CC-10 (done-detection) cheaper.

## CC-34 — Offline phone replica + reconnect merge (phase 2 of CC-31)

Answers "why can't the phone run on last available data when the laptop is closed,
and merge when it's back?" It can — at roughly double phase 1's build, with the risk
concentrated in the merge (merge bugs are silent data loss, the disease being
cured). ~2–3 days, strictly on top of phase 1's version guard and SSE channel.

1. **CC-3 becomes a hard prerequisite.** A service worker can't sensibly cache the
   Vite dev server (HMR, unbundled modules). Extract the four API handlers from
   `configureServer` into a module mounted both by `configureServer` (dev) and a
   small Node server (prod); the tunnel then fronts `npm run build` + that server.
2. **CC-33 per-task `updatedAt`** — see that row.
3. **Delete tombstones** — deletions append `{id, deletedAt}` to a `deleted` array
   in `tasks.json` (pruned >30 days, aligning with CC-19), so "missing from the
   array" ≠ "deleted" during merge.
4. **Local replica** — full `{tasks, version, lastSyncedAt}` mirrored to
   localStorage (~50KB today, no IndexedDB needed); the app boots from the replica
   instantly and reconciles when the server answers.
5. **Service worker** — cache the built app shell so the Home Screen icon opens
   with the laptop dead. Offline banner: tasks view/edit only — Sync, path-finder,
   news, weather and the stock quote all grey out (they run on the laptop).
6. **Reconnect merge** — GET server state; per task, newer `updatedAt` wins; apply
   tombstones both ways; PUT the merged result under the phase-1 version guard
   (409 → re-merge → retry). Clear the undo stack on merge — stale snapshots are
   unsafe across one.
7. **Access-expiry handling** — a Cloudflare session that expired while offline
   makes fetches return login HTML; detect non-JSON responses and show "tap to
   sign in" instead of a parse error.

*Limitations, accepted:* same task edited on both sides during a gap → newer edit
wins, the other is dropped (git history still has it); deal data now also rests on
the phone in browser storage — the stronger FEP data-policy case (see CC-31); iOS
may purge web storage under pressure (the laptop stays authoritative; the phone
re-downloads).

*Verification:* airplane-mode edit → reconnect → merge matrix (edit/edit,
edit/delete, sync-run-in-the-middle); storage-purge recovery; Access-expired
reconnect shows the sign-in prompt.

## CC-26 — `setDueIn` lands a day late in the evening

`setDueIn` ([App.jsx](src/App.jsx)) does `new Date()` → `setDate(+n)` →
`.toISOString().slice(0,10)`. `toISOString` is **UTC**, so from ~20:00 local
(EDT, UTC-4) the ISO date has already rolled over and the `+1` button writes a
date two days out. Same class of bug as the `daysUntil` skew fixed in CC-25, in
the write path rather than the read path.

`snooze` is *not* affected — it anchors at `T12:00:00` local, and noon survives
the UTC conversion. Fix `setDueIn` the same way: build the date at local noon
before serializing, or format from the local components directly.
