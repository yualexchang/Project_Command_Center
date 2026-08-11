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
| CC-2 | Auth/origin check on the Claude bridge endpoints | done | high | Shipped with CC-11: `guarded()` requires `x-pcc-bridge` + an allowed Origin on all three bridge routes |
| CC-3 | Make `npm run build` produce a working app | open | medium | Blocks every hosting option; API is dev-server-only |
| CC-4 | Stop the dashboard clobbering hand edits to `tasks.json` | open | medium | Silent data loss when editing the file while the server is up |
| CC-5 | Single home for the skills (stop the double copy) | open | medium | Two copies drift; edit one, the other silently wins |
| CC-6 | Get the dashboard onto Alex's phone | open | medium | Wants it away from the desk |
| CC-7 | Bind Vite beyond `::1` | open | low | One-line prerequisite for CC-6 |
| CC-8 | Find what resets `tasks.json` to the empty default | open | high | All 30 tasks silently wiped on 2026-08-06; recovered only because git had them |
| CC-9 | Scheduled sync every 10 min, Mon-Fri business hours | wip | high | Scripts written and verified; Task Scheduler registration still needs to be run by Alex |
| CC-10 | Done-detection — sync scans Sent Items, flags tasks whose thread Alex replied to | open | high | Tasks only close by hand today; the mailbox already knows |
| CC-11 | Per-task 🔍 Research button (bridge endpoint → `/command-center-research`) | done | medium | Shipped: `POST/GET /api/research` + a button on every card, behind the CC-2 guard |
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
| CC-30 | IMO and Penske news feeds have no scan rules in the sync skill | done | high | Shipped: Feeds C and D written; both businesses confirmed from live mail, and the TODO's Penske assumption was wrong |
| CC-31 | Completed pipeline bar under the due pipeline | done | medium | Shipped: `completedAt` added to the model, 51 done tasks backfilled from git history |
| CC-32 | `ageOf` reads the UTC date, so FIFO/LIFO groups skew after ~20:00 | open | medium | Same class as CC-26; a task ingested late evening groups a day early |

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

Shipped 2026-08-11 alongside CC-11, which was blocked on it — a third
`bypassPermissions` route was not going in unguarded.

`guarded(req, res)` in [vite.config.js](vite.config.js) now fronts all three bridge
routes (`/api/sync`, `/api/research`, `/api/find-path`). Two checks:

- the request must carry `x-pcc-bridge: 1`;
- if it carries an `Origin`, it must be `localhost:5173` or `127.0.0.1:5173`.

**The header is the lock; the origin check is the second one.** A cross-origin page
cannot set a custom header without a CORS preflight, and this server answers no
preflight, so the request never leaves the browser. Origin alone would not do:
it is absent on some same-origin requests and trivially forged outside a browser.
`PUT /api/tasks` stays unguarded — it writes data but spawns nothing, and PUT
already forces a preflight.

Verified by probe: every bridge route returns 403 with no header, 200 with it, and
403 for `Origin: http://evil.example` even when the header is present.

**Still not enough for hosting.** This stops a drive-by page on your own browser; it
is not authentication. Anything reachable from another machine (CC-6/CC-7) needs a
real secret, because the header is a constant sitting in client-side source.

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

## CC-9 … CC-24 — batch captured 2026-08-06 (improvement brainstorm)

Short notes; promote to a full section when one goes `next`.

- **CC-10 done-detection:** extend the sync skill — after triaging inbound, search
  Sent Items for replies matching open tasks' `subject`/`sender`; list "likely
  complete" candidates in the sync report rather than auto-completing (false
  positives: a reply isn't always resolution).
- **CC-12/CC-13/CC-15:** all are new headless-bridge routes or skill steps that act
  on the mailbox. CC-2 is now done, so the guard exists to put them behind. Drafts
  only — never auto-send. **All three are blocked on IT**: the M365 connection is
  read-only, so `outlook_create_draft` returns 403 and no Teams send tool is even
  exposed. Needs `Mail.ReadWrite`, `Mail.Send`, `Chat.ReadWrite`, `ChatMessage.Send`
  granted before any of this is worth building.
- **CC-14 search:** client-side filter over title+blurb+context+sender; add to the
  filter bar with its own ✕.
- **CC-16 digest:** `git log --follow -p data/tasks.json` diffing week-over-week gives
  completed/added/slipped per bucket; render as text email via `outlook_create_draft`.
- **CC-19 archive:** on sync, move `status==="done" && createdAt < now-30d` to
  `data/archive.json`; dashboard shows a count link. Restore = move back.
- **CC-21/CC-22 are recurring upkeep,** not builds — revisit when the trigger event
  happens (first Penske task; each new live deal folder).

## CC-9 — Scheduled sync every 10 minutes, Mon-Fri business hours — WIP

Scope changed 2026-08-11 from "morning sync" to **every 10 minutes, Mon-Fri,
08:00-18:00**, at Alex's request. Two files, both written and verified:

- `scripts/sync-tick.ps1` — one tick. Takes a lock, runs
  `claude -p "/command-center-sync" --permission-mode bypassPermissions`, appends
  one line to `logs/sync-<month>.log`, releases the lock.
- `scripts/install-sync-task.ps1` — registers the Task Scheduler entry from XML.

**Not yet registered.** The `schtasks /Create` call was blocked by the permission
classifier, correctly — it is a persistent machine-level change. Alex runs it
himself:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-sync-task.ps1
```

**Why XML instead of a `schtasks` one-liner.** Four settings that matter here are
not reachable from the CLI flags:

- `MultipleInstancesPolicy = IgnoreNew` — a sync takes minutes and the tick is 10,
  so overlapping runs are a live risk, and both would write the whole of
  `tasks.json` with the loser's edits lost (CC-4).
- `DisallowStartIfOnBatteries = false` — the CLI default is **true**, which would
  silently skip every run on battery. Fatal for a laptop tool, and it fails quietly.
- `StopIfGoingOnBatteries = false` — same trap, mid-run.
- `ExecutionTimeLimit = PT9M` — a wedged run is killed before the next tick rather
  than blocking the schedule for hours.

`LogonType` is `InteractiveToken`, not S4U, because the sync reaches Outlook through
this session's Claude MCP connectors, which need the logged-on user context.
`StartWhenAvailable` is false — catch-up runs after a wake are pointless at this
cadence.

**The lock is belt and braces.** IgnoreNew covers scheduled-vs-scheduled; the
lockfile also covers the dashboard's own Sync button, which Task Scheduler knows
nothing about. It reclaims itself after 15 minutes so a crashed run cannot wedge the
schedule permanently. The dashboard's Sync button does **not** take the lock — that
gap is real and worth closing if manual syncs ever collide with ticks.

**Two changes to the sync skill were forced by this cadence** (both shipped under
CC-30): an 8-hour throttle on news scans, and no commit when nothing changed.
Without them, 48 runs a day means 192 web scans and 48 empty commits.

**Still unproven: the M365 connector from a scheduled context.** The original row
flagged this and it remains the real risk — a scheduled run gets a different session
than an interactive one, and if the connector is unavailable the sync will fail
quietly every 10 minutes. `logs/sync-<month>.log` is where that shows up. Check it
after the first business day before trusting the desk to be current.

## CC-11 — Per-task Research button — DONE

Shipped 2026-08-11. A 🔍 Research button on every expanded task card runs
`/command-center-research` for that task: Claude pulls the email thread plus older
threads on the same deal and rewrites the task's `emailBlurb`, `context` and `steps`
in place, then commits. The dashboard reloads the file when the run finishes and
keeps the card open, since the rewritten plan is the point.

`POST/GET /api/research` in [vite.config.js](vite.config.js) mirrors `/api/sync`:
POST starts, GET polls, and the same `--output-format stream-json` parse drives live
tool labels ("Searching the inbox", "Reading an email") inside the card. `noteSyncEvent`
was generalised to `noteEvent(state, line)` so both runs share it.

**One at a time**, enforced with a 409: two concurrent runs would each write the
whole of `tasks.json` and the loser's rewrite would vanish. Every other card's
button greys out while one is running.

The task title is interpolated into the prompt, so quotes, backticks and newlines
are stripped and the length capped — otherwise a title could break out of the
argument and append its own instructions.

**CC-2 was done first**, as this row instructed: the guard went in before this route
existed, not after.

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

## CC-30 — IMO and Penske news scan rules — DONE

Shipped 2026-08-11. Feeds C and D are written into
`.claude/skills/command-center-sync/SKILL.md` and mirrored to `~\.claude\skills\`.

**Both businesses were confirmed from live mail first, and the working assumption
for Penske was wrong** — which is exactly why this row said not to guess:

- **IMO** — confirmed. Counterparties write from `@icwg.com`: IMO is the retail
  brand of **International Car Wash Group**. Tasks reference "Weather Model 2.0"
  and weather-adjusted EBITDA, and the team agenda lists "IMO FR/BLUX sale". Core
  markets UK and Germany; France and Belux are being divested under Sea Lion.
  Scopes `UK` / `DE` / `EU`.
- **Penske** — **not** what this row assumed. It is the **SoCal Penske Dealer
  Group**, a private franchised dealership group in City of Industry, CA (CFO Paul
  Bialy, `socalpenske.com`). It is *not* Penske Automotive Group, Penske Truck
  Leasing, or Team Penske. PAG appears in FEP's weekly comps packets as a **public
  comp**, which is a different role entirely. Scopes `SOCAL` / `US` / `OEM`.

Two search traps are written into the skill because each would have quietly
poisoned every future scan:

- **"IMO" returns the International Maritime Organization** — shipping emissions,
  sulphur caps — and would have swamped the feed. The skill now requires searching
  `"IMO Car Wash"` / `"International Car Wash Group"` or market-plus-sector, never
  the bare acronym.
- **"Penske" returns PAG, trucking and motorsport.** The group is private and will
  rarely be in the news itself, so Feed D is mostly a *sector* feed, and public
  comps must be tagged and described as comps rather than written up as the portco.

Also added while in there, both forced by the 10-minute cadence in CC-9:

- **An 8-hour throttle per feed.** Scanning the web four times an hour for sectors
  that turn over weekly is pure waste; a feed scanned under 8 hours ago is skipped
  and named in the report.
- **No more empty commits.** Step 7 now writes `tasks.json` every run but commits
  only when a task was created or a news file refreshed. At 48 runs a day the old
  "commit `nothing actionable` every time" would have buried the archive — and the
  git history of that file *is* the archive.

Not yet proven against live search results: the feeds populate on the first
unthrottled sync. Watch the first IMO scan specifically for maritime bleed-through.

## CC-31 — Completed pipeline — DONE

Shipped 2026-08-11. A `CompletedBar` sits directly under `DueBar` in the same
stacked-bar grammar, so the pair reads as "what's coming" over "what's landed".
Buckets are `completedSegments()` — the due horizons pointed backwards, on the
same Mon-Sun week and calendar-month boundaries as `ingestSegments()`.

**The model had no completion date.** `status` was only `todo|progress|done`, so
nothing recorded *when* work finished. Added `completedAt`, stamped by a new
`setStatus(t, next)` that both circle-button handlers now call — centralised
precisely so a future call site can't forget it. Reopening a task clears the
stamp, so a task finished twice is dated by its latest completion.

**The 51 already-done tasks were backfilled from git history** — for each, the
first commit in which it appeared as `done` (34 commits, Aug 5 onward). Four had
been ticked in the dashboard since the last commit and were dated today, which is
sound rather than a guess: every sync commits and the last one was that
afternoon. Caveat worth remembering: a backfilled date is *commit* time, not
click time, so a task ticked Monday evening and committed Tuesday reads as
Tuesday. Everything from here on is stamped at the click.

`daysAgo()` deliberately does **not** slice the UTC string the way `ageOf` does —
that would file anything completed after ~20:00 EDT under tomorrow. It pins both
sides to local midnight, same fix as CC-25. `ageOf` still has the old skew: CC-32.

Colour is a single green ramp sequenced dark = most recent (`#14532D` → `#7FB79A`),
because recency is an ordered quantity, not a set of categories. The faintest step
falls under 3:1 on white, so every non-empty segment is also named in the legend
above the bar rather than relying on the fill alone.

Verified: 87,668 (weekday × day-of-month × age) combinations each land in exactly
one bucket, and the week cuts at the Monday just gone. **Not** verified visually —
no browser tooling in this repo.

## CC-26 — `setDueIn` lands a day late in the evening

`setDueIn` ([App.jsx](src/App.jsx)) does `new Date()` → `setDate(+n)` →
`.toISOString().slice(0,10)`. `toISOString` is **UTC**, so from ~20:00 local
(EDT, UTC-4) the ISO date has already rolled over and the `+1` button writes a
date two days out. Same class of bug as the `daysUntil` skew fixed in CC-25, in
the write path rather than the read path.

`snooze` is *not* affected — it anchors at `T12:00:00` local, and noon survives
the UTC conversion. Fix `setDueIn` the same way: build the date at local noon
before serializing, or format from the local components directly.
