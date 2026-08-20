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
| CC-6 | Get the dashboard onto Alex's phone | done | medium | Shipped: `npm run remote` — Cloudflare quick tunnel + token gate + QR. Proven end to end over the public internet |
| CC-7 | Bind Vite beyond `::1` | done | low | Shipped with CC-6: `host`/`allowedHosts` in remote mode only; tunnel mode deliberately stays on loopback |
| CC-8 | Find what resets `tasks.json` to the empty default | open | high | All 30 tasks silently wiped on 2026-08-06; recovered only because git had them |
| CC-9 | Scheduled sync every 10 min, Mon-Fri business hours | done | high | Registered and proven live: exit=0 in 407s, committed `d81fb5c`, and the M365 connector works from a scheduled session |
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
| CC-24 | Responsive layout pass — dials wrap awkwardly below ~700px | done | low | Shipped with CC-6: one 760px breakpoint; verified in a browser at 390x844 |
| CC-25 | Due pipeline on calendar weeks, not a rolling 7/14-day window | done | medium | Shipped: buckets now cut off at the coming Sunday; also fixed the off-by-one in `daysUntil` |
| CC-26 | `setDueIn` lands a day late when used after ~20:00 local | open | medium | The +1/+3/+7 buttons silently set the wrong date in the evening |
| CC-27 | Group every sort under headers; split Ingested into FIFO/LIFO | done | medium | Shipped: deadline/priority/FIFO/LIFO all group; due pipeline gained a "this month" bucket |
| CC-28 | Overdue tasks are labelled "due today" in both the bar and the list | open | medium | The red segment conflates "today" with "three weeks late" |
| CC-29 | Mission dials re-laid out: all-projects + 2x2 left, portco rail right | done | medium | Shipped: clocks/weather/news moved out of the masthead into each portco's row |
| CC-30 | IMO and Penske news feeds have no scan rules in the sync skill | done | high | Shipped: Feeds C and D written; both businesses confirmed from live mail, and the TODO's Penske assumption was wrong |
| CC-31 | Completed pipeline bar under the due pipeline | done | medium | Shipped: `completedAt` added to the model, 51 done tasks backfilled from git history |
| CC-32 | `ageOf` reads the UTC date, so FIFO/LIFO groups skew after ~20:00 | open | medium | Same class as CC-26; a task ingested late evening groups a day early |
| CC-33 | Only `sync-tick.ps1` takes the sync lock — the bridge routes don't | done | high | Shipped: `/api/sync` and `/api/research` now take the same lockfile, so a tick and a button press can no longer interleave |
| CC-34 | Named tunnel behind Cloudflare Access, instead of a quick tunnel + our own token | open | medium | Today's URL changes every run and our gate is homegrown auth on a box that can spawn Claude |
| CC-35 | Touch has no right-click — two actions are unreachable on the phone | open | medium | Recategorize and "back to to-do" are right-click only (CC-6) |
| CC-36 | The HMR websocket bypasses the remote token gate | done | low | Shipped with CC-6: an `upgrade` listener ahead of Vite's checks the same cookie, and HMR is off remotely |
| CC-37 | Read-only mirror for when the laptop is asleep | open | low | CC-6 option B, still unbuilt: the tunnel needs this machine awake |

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

## CC-6 — Get the dashboard onto Alex's phone — DONE

Shipped 2026-08-13, option A (tunnel). One command:

```powershell
npm run remote        # Cloudflare quick tunnel — works on any network
npm run remote:lan    # same thing over the wifi, no Cloudflare
```

`scripts/remote.mjs` mints a token, starts the dev server with `PCC_REMOTE` set,
downloads a portable `cloudflared` to `~\Tools\cloudflared` (same no-admin pattern
as `~\Tools\node`), opens the tunnel, and prints the link as a QR code. Ctrl-C
stops both halves.

**Option A was the right half of the fork** precisely because compute stays on the
laptop: ↻ Refresh and 🔍 Research still work from the phone, which is what option B
gives up. The cost is that the laptop must be awake — now its own row, CC-37.

**The gate is the interesting part, and it is not CC-2.** CC-2's constant header
stops a drive-by page in *this* browser; it is worthless once the port is on the
internet, exactly as that row said. So remote mode adds a real shared secret in
`data/.remote-token` (gitignored, 24 random bytes) in front of **everything** —
the app, `/api/*`, and Vite's own module graph — because these routes spawn
`claude -p --permission-mode bypassPermissions`. `?k=<token>` is traded for an
HttpOnly SameSite=Lax cookie and redirected away, so the secret leaves the URL bar
on the first load. `guarded()`'s origin check now also accepts the request's own
Host, since the tunnel hostname can't be a fixed list.

**It fails closed:** `PCC_REMOTE` set with no token is a startup error, not an
unguarded server. And `npm run dev` is untouched — no gate, loopback, exactly as
before — so the desk workflow can't regress from this.

Verified end to end over the public internet, not just locally: 401 without the
key, magic link → cookie → app and `/api/tasks`, the bridge routes still 403 for a
foreign `Origin`, and Vite's own host check rejecting a spoofed Host.

**Still true, and still not addressed:** `tasks.json` holds live FEP deal names,
portfolio companies and colleagues' addresses, and a tunnel puts all of it on the
public internet behind one secret for as long as the window is open. Worth a word
with whoever owns FEP data policy before this becomes a daily habit. Brandon
Emmerich's offer of FEP devops infra is the sanctioned path if it does.

Follow-ups: CC-34 (named tunnel + Cloudflare Access), CC-35 (touch has no
right-click), CC-36 (HMR websocket), CC-37 (laptop asleep).

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

Shipped 2026-08-13 with CC-6, but narrower than this row asked for, and
deliberately:

- **`npm run dev` still binds loopback.** Unconditional `host: true` would have
  put the bridge routes on the wifi for every future session, including the ones
  that never wanted remote access.
- **Tunnel mode also binds loopback.** `cloudflared` dials `127.0.0.1` from this
  machine, so nothing has to listen on the network for the phone to work. Only
  `npm run remote:lan` sets `host: true`.
- `allowedHosts` was needed, as this row guessed: Vite's DNS-rebinding check
  rejects the tunnel's hostname. It is set to `.trycloudflare.com` (wildcard —
  the quick tunnel's name is different every run) plus anything in
  `PCC_ALLOWED_HOSTS`, which is where a named tunnel's hostname goes (CC-34).

The row's last line was right and is worth keeping: binding wider is what makes
the endpoints reachable, so it only went in alongside a real secret. CC-2's header
was not enough for this — see CC-6.

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

## CC-33 — The bridge routes didn't take the sync lock — DONE

Found and fixed 2026-08-11, within minutes of CC-9 going live — this row was filed
by a sync run itself, then closed the same afternoon.

`scripts/sync-tick.ps1` took `data/.sync.lock`, but the dev server's bridge routes
did not. Three writers of `data/tasks.json` existed with three separate,
mutually-blind guards:

| Writer | Guarded by | Sees |
|---|---|---|
| scheduled tick | Task Scheduler `IgnoreNew` + lockfile | other ticks |
| ↻ Refresh button | in-process `sync.running` | other button presses |
| 🔍 Research button | in-process `research.running` | other research runs |

So a tick and a button press could run together, and did: the 16:52 scheduled run
logged *"a second sync was running concurrently — it rewrote sync-progress.json
mid-run and created its own task"*. Nothing was lost, but only because that run
happened to re-read `tasks.json` before merging. That is luck, not a guarantee.

Fix: `lockHeldFor()` / `takeLock()` / `releaseLock()` in
[vite.config.js](vite.config.js), on the same file and the same 15-minute staleness
window as the PowerShell side. Both `POST /api/sync` and `POST /api/research` now
refuse with 409 while the lock is held, and release it when the child exits.

The 409 body carries `mine: true|false`. `true` is this server's own run, which the
dashboard can attach to and poll as before; `false` is the scheduled tick, whose
progress this server cannot see — the dashboard says so and stops, instead of
polling its own idle state and reporting a phantom failure.

Verified live: with a scheduled tick holding the lock, `POST /api/sync` returned
`409 the scheduled sync is running (started 185s ago)`.

## CC-9 — Scheduled sync every 10 minutes, Mon-Fri business hours — DONE

Scope changed 2026-08-11 from "morning sync" to **every 10 minutes, Mon-Fri,
08:00-18:00**, at Alex's request. Two files, both written and verified:

- `scripts/sync-tick.ps1` — one tick. Takes a lock, runs
  `claude -p "/command-center-sync" --permission-mode bypassPermissions`, appends
  one line to `logs/sync-<month>.log`, releases the lock.
- `scripts/install-sync-task.ps1` — registers the Task Scheduler entry from XML.

**Registered and proven 2026-08-11.** Alex ran the installer himself (the
`schtasks /Create` call was blocked by the permission classifier, correctly — it is
a persistent machine-level change):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-sync-task.ps1
```

**The open risk is closed: the M365 connector works from a scheduled session.** The
first run exited 0 in 407s and committed `d81fb5c sync: 3 new task(s)`, having
searched the mailbox and refreshed the news feeds. This was the thing worth testing
before trusting the desk, and it passed.

The same run also exposed CC-33 — the bridge routes were not taking the lock — which
is now fixed. Watch `logs/sync-<month>.log`: one line per run, and the "skip: a sync
has been running for Nm" lines are the lock doing its job, not an error.

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

**The lock only covers scheduled-vs-scheduled.** IgnoreNew stops one tick joining
another, and the lockfile is a second guard on the same case that reclaims itself
after 15 minutes so a crashed run cannot wedge the schedule permanently. But
`sync-tick.ps1` is the only thing that takes it — neither `/api/sync` nor the skill
does — so nothing stops a manual sync running straight through a tick. That
collision stopped being hypothetical on 2026-08-11; it is now **CC-33**.

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

## CC-33 — the sync lock is held by the wrapper, not by the sync

`scripts/sync-tick.ps1` takes `data/.sync.lock` around its `claude -p` call, and
CC-9 claims "the lockfile also covers the dashboard's own Sync button". It does
not. `.sync.lock` appears in `sync-tick.ps1` and nowhere else — not in
`vite.config.js`, so `/api/sync` never checks it, and not in the skill, so a
`/command-center-sync` typed into a Claude Code session takes no lock either.
Task Scheduler's `IgnoreNew` only ever covered scheduled-vs-scheduled.

Observed 2026-08-11 ~20:53-21:05Z: an interactive sync and a scheduled tick ran
concurrently. Both scanned the inbox, both triaged the same mail, and both wrote
`data/tasks.json`. Nothing was lost, but only by luck and by re-reading the file
immediately before each write — the interactive run's task landed in the *tick's*
commit, and the tick's `lastSync` (20:58Z) would have been rolled back to 20:56Z
had the write not taken a `max()`. The duplicated work was the real cost: two full
inbox scans and two rounds of web searches minutes apart, and the tick's news
refresh reset every feed's `updatedAt`, which silently re-armed the 8-hour throttle
against the interactive run's already-completed searches.

The fix is to move the lock down to where the writing happens rather than adding a
third copy of it:

- Have the skill itself acquire `data/.sync.lock` (same 15-minute stale reclaim)
  as its first step and release it at the end, so every entry point is covered —
  scheduled, dashboard button, and hand-typed alike.
- Then `sync-tick.ps1`'s own lock becomes redundant and should be dropped, so
  there is exactly one owner of the file.
- Decide the losing behaviour deliberately: a scheduled tick should skip (it runs
  again in 10 minutes), but a hand-typed sync should probably say "a sync is
  already running, started 2m ago" rather than exit silently.

Related: CC-4 (whole-file `writeFileSync`), CC-9 (the schedule), and the CC-9
prose above, which needs its lock claim corrected in the same commit.

## CC-34 — Named tunnel behind Cloudflare Access

CC-6 ships a *quick* tunnel: no Cloudflare account, no config, and a random
`*.trycloudflare.com` hostname that is different on every run. Two consequences
worth fixing once this is a daily habit rather than a trial:

- **No bookmark, no home-screen icon that survives a restart.** The QR is the only
  way in, which means the laptop must be in front of you to get onto the phone.
- **The front door is homegrown.** One shared secret, written by us, in front of
  routes that spawn `claude -p --permission-mode bypassPermissions`. Cloudflare
  Access (free tier) puts a real identity check in front of the tunnel instead —
  which is what the original CC-6 row asked for and this shipped without.

Shape of the work: `cloudflared tunnel login` once, create a named tunnel with a
stable hostname, add an Access application with a one-person policy, then point
`scripts/remote.mjs` at the named tunnel and set `PCC_ALLOWED_HOSTS` to that
hostname (the plumbing for that env var already exists). Keep the token gate as a
second lock — Access in front, secret behind.

## CC-35 — Touch has no right-click

Two actions on the task list are right-click only, so neither exists on the phone:

- **"Back to to-do"** — `onContextMenu` on the status circle. Left-click only
  advances, so a task ticked done by mistake on the phone can only be cycled
  forward through the whole loop.
- **Recategorize** — `onContextMenu` on the project chip opens the dial-category
  menu. On touch there is no way to reach it at all.

Both want a long-press (`pointerdown` + ~500ms timer, cancelled on move/up) firing
the same handler, which also stays out of the way of the desk's right-click.

## CC-36 — The HMR websocket bypasses the remote token gate — DONE

Filed and closed 2026-08-13, in the same sitting as CC-6 — an unauthenticated
socket into a process that spawns permission-bypassed Claude runs was not going
onto the internet as a follow-up row.

`remoteAuth()` is connect middleware, and an HTTP *upgrade* never passes through
connect: Vite's websocket server handles it directly. So the gate that fronts
every route did not front this one, and with a tunnel open anyone who knew the
hostname could connect.

Two things went in, and the order matters:

- **`server.hmr: false` in remote mode.** Carrying the desk on a phone doesn't
  need hot reload. Cost: while `npm run remote` is up, code edits need a page
  refresh.
- **An `upgrade` listener that checks the same session cookie**, added with
  `prependListener` so it runs *before* Vite's own handler, writing 401 and
  destroying the socket when the cookie is missing. `hmr: false` alone was not
  enough — measured, not assumed: the websocket server still answered a
  `vite-hmr` upgrade with `101 Switching Protocols`.

Destroying the socket underneath Vite is safe because `ws` bails out on a socket
that is no longer writable. Verified: 401 without the cookie, 101 with it, and the
dev server still serving normally afterwards.

## CC-37 — Read-only mirror for when the laptop is asleep

CC-6 shipped option A, so the desk is only on the phone while this machine is
awake with `npm run remote` running. Option B from that row is still unbuilt and is
the answer to "check the desk from the train with the laptop in a bag":

Static UI hosted somewhere, reading `data/tasks.json` from GitHub — the scheduled
sync (CC-9) already commits and pushes every 10 minutes, so the file in git is
never more than that stale. Read-only is the honest scope: no ↻ Refresh, no
🔍 Research, no Egnyte path-finder, since all three are `claude -p` on this laptop.
Needs CC-3 first (the build has no `/api/*` at all). Writing back through the
GitHub API with a fine-grained PAT is a second step, and would collide with the
sync's own writes (CC-4) — worth its own row when it comes to that.
