---
name: command-center-sync
description: Triage new Outlook email into Project Command Center tasks. Searches the inbox via the Microsoft 365 MCP connection, applies the triage rules, merges deduped tasks into data/tasks.json, and commits. Optional argument = time window (e.g. "past 7 days"); default is since the last sync.
---

# Command Center Sync

You are triaging Outlook email for a private equity deal professional (the user).
The task file is `data/tasks.json` in the Project Command Center repo (repo root:
`C:\Users\AlexChang\project-command-center` — use relative paths if the cwd is
inside it).

## Procedure

1. **Determine the window.** If the user passed an argument (e.g. "past 7 days"),
   use it. Otherwise read `lastSync` from `data/tasks.json` and sync from then;
   if `lastSync` is null or older than 30 days, use the past 24 hours and tell
   the user they can pass a wider window.

2. **Search the inbox.** Use `mcp__claude_ai_Microsoft_365__outlook_email_search`
   with `afterDateTime` set to the window start. Paginate with `offset` /
   `nextOffset` until exhausted (cap at ~100 emails; if more, tell the user).
   The search returns metadata + a summary snippet per email. When the snippet
   is not enough to judge relevance or extract the ask/deadline, read the full
   message with `mcp__claude_ai_Microsoft_365__read_resource` on the email's URI.
   Skip emails the user sent (sender is the user) unless they contain a
   commitment the user made that should be tracked.

3. **Triage.** CREATE A TASK ONLY IF the email requires THE USER'S own action: a
   direct ask addressed to them, a decision they own, a document they must
   review/send, or a deadline they are responsible for.

   EXCLUDE entirely: newsletters and news digests, automated notifications and
   system alerts, calendar invites/acceptances, mass distributions, threads where
   the user is only CC'd with no direct ask, pure FYI updates, and anything
   clearly another team member's responsibility.

4. **Bucket** each task under a deal or project name inferred from the email.
   Reuse the project names already present in `data/tasks.json` when they fit;
   otherwise create a sensible new bucket name.

5. **Fields per task** (see schema below):
   - `priority`: high = urgent, senior counterparty waiting, or deadline within
     ~2 days; medium = normal; low = minor.
   - `deadline` + `deadlineType`: "explicit" when a date/time is stated in the
     email; "implicit" when you inferred one from urgency; null when neither.
   - `askType`: "external" (counterparty, owner, lender, advisor outside the
     firm) or "internal" (colleague at fep-us.com).
   - `needsCall`: true if resolving this requires scheduling or coordinating a
     call/meeting as an intermediate step.
   - `emailBlurb`: 2 sentences IN YOUR OWN WORDS — what is being asked, by whom,
     and why it matters. Do not copy sentences from the email.
   - `steps`: exactly 3 short suggested steps (under 15 words each).
   - Keep every field tight — brevity matters more than completeness.

6. **Dedup and merge.** Read the existing tasks. Skip a candidate if an existing
   task (any status) matches on lowercase `sender|subject` OR lowercase `title`.
   Normalize thread subjects (strip Re:/FW:) when comparing — one task per
   thread unless a later message contains a genuinely NEW distinct ask.
   Prepend new tasks to the `tasks` array. Never modify or delete existing
   tasks. Set top-level `lastSync` to the current UTC time in ISO 8601.

7. **Write and commit.** Write `data/tasks.json` pretty-printed (2-space indent,
   trailing newline). Then from the repo root:
   `git add data/tasks.json` and commit with message
   `sync: <N> new task(s) (<window>)`. If zero new tasks, still update
   `lastSync` and commit with `sync: nothing actionable (<window>)`.
   If an `origin` remote exists, also `git push`.

8. **Report.** Tell the user: how many emails scanned, how many tasks created
   (with one-line titles), and remind them to hit Refresh in the dashboard.
   Do not edit tasks the user may be editing in the dashboard — if the dev
   server is running and you are unsure, mention that a Refresh will pick up
   the changes.

## News scans (run once per sync, after the tasks are written)

Two boxes on the dashboard are fed by two files. Refresh **both** every sync,
using the same rules (recency since last sync, publication-date discipline,
`short` summaries, merge-don't-replace, max 5 items).

### Feed B — BravoFit (`data/bravofit-news.json`)

Same JSON shape as feed A below, but `scope` is `BRAVO` or `PLNT`. Include an
article **only** if it satisfies one of:

- it mentions **Bravo Fit** (the Australian Planet Fitness franchisee, FEP-owned), or
- it mentions **Planet Fitness AND Australia in the same article**.

Planet Fitness news with no Australian angle (US club openings, US marketing) is
out of scope — with one exception: **PLNT corporate results, guidance, franchise
economics, or leadership changes** count, since they set the terms Bravo Fit
operates under. Tag those `PLNT`; tag Bravo-Fit-specific items `BRAVO`.
The PLNT share price is fetched live by the dashboard — do not put it in this file.

### Feed A — Early education (`data/industry-news.json`)

1. Use `WebSearch` (2–4 queries) for developments in the **early education /
   childcare industry**: sector news, M&A and franchise-market moves,
   **legislation or funding-policy changes**, regulatory shifts (staff ratios,
   licensing), and credible **rumors of upcoming changes**.
   **Search only for news published since the last sync** (the `lastSync` you
   read in step 1) — include the month/year in the query so results are current.

   **Jurisdiction filter — only two scopes count. Drop everything else:**
   - `CO` — Colorado (KEP / Ken Caryl / Denver)
   - `UT` — Utah (KEP / SLC)

   Federal news and news about any *other* state (Iowa, Oregon, Texas…) is out
   of scope no matter how interesting — do not include it. Tag every item you
   keep with its `scope`. Federal action belongs here **only** when the story is
   specifically about its effect in Colorado or Utah (tag it `CO` or `UT`).
   Scope both search queries to those states, e.g. "Colorado child care
   legislation <month year>", "Utah early education funding <month year>".
2. **Date discipline — this is the easy thing to get wrong.** `date` must be the
   date the *article was published*, not the date a policy takes effect and not
   today. Take it from the URL slug (e.g. `/2026/08/03/`) or the page itself. If
   you cannot establish a publication date, **drop the item**. Never carry an
   item whose publication date is older than 30 days.
3. Judge each item's impact on an early-education operator/investor:
   `positive` (tailwind — e.g. new subsidies, favorable ratios, strong demand),
   `negative` (headwind — funding cuts, cost mandates, enrollment declines),
   or `neutral` (genuinely mixed — say so rather than forcing a direction).
4. **Merge, don't replace:** load the existing file, prepend the new items,
   drop anything published more than 30 days ago, dedupe by URL, keep **up to 5**
   with the newest/most significant first.

```json
{
  "updatedAt": "<current ISO timestamp>",
  "items": [
    {
      "sentiment": "positive|negative|neutral",
      "scope": "CO|UT — required; drop the item if it is neither",
      "short": "2-4 words, e.g. 'Head Start deregulation' — this is what the box displays",
      "headline": "<= 90 chars, plain language (shown on hover)",
      "summary": "1 sentence on why it matters to an early-ed operator",
      "source": "publication",
      "date": "YYYY-MM-DD — the article's PUBLICATION date",
      "url": "https://..."
    }
  ]
}
```

4. `git add data/industry-news.json` with the same commit as the sync.

If the searches fail or return nothing usable, leave the existing file untouched
(a stale box beats an empty one) and mention it in the report.

## Live progress file (required — the dashboard renders this as a progress bar)

Maintain `data/sync-progress.json` throughout the sync (do NOT commit it):

The bar only moves when this file changes, so WRITE FREQUENTLY — never batch the
updates to the end of the run:

1. Immediately after determining the window, write:
   `{"phase": "searching", "totalEmails": 0, "processed": 0, "created": 0, "skipped": 0}`
2. **After EVERY `outlook_email_search` page returns** (before doing anything
   else), rewrite the file: set `totalEmails` from `totalResultCount`, set
   `processed` = number of emails fetched so far, `"phase": "triaging"`.
3. **After every ~5 triage judgments** (and after each `read_resource` full
   read), rewrite the file with updated `processed` (emails judged so far),
   `created` (tasks created so far), and `skipped` (disregarded so far).
4. Just before writing tasks.json, write `"phase": "writing"` with final counts.
5. After the git commit, write `"phase": "done"` with final counts.

A sync of ~100 emails should produce 10+ progress writes. Keep each write a
single small JSON object. If the file can't be written, continue the sync
anyway — the progress bar is best-effort.

## New-task schema

```json
{
  "id": "<random 8+ chars>",
  "title": "action-oriented, <=10 words",
  "project": "deal/project bucket",
  "priority": "high|medium|low",
  "deadline": "YYYY-MM-DD or null",
  "deadlineType": "explicit|implicit|null",
  "status": "todo",
  "assignedBy": "person who is asking",
  "addressedTo": "You | You + <name> | Deal team",
  "askType": "external|internal",
  "needsCall": false,
  "emailBlurb": "2 sentences in your own words",
  "steps": ["step 1", "step 2", "step 3"],
  "context": "",
  "reassignedTo": null,
  "followUpDate": null,
  "notes": [],
  "links": [],
  "sender": "email sender address",
  "subject": "email subject",
  "src": "email",
  "rank": <Date.now()-style ms timestamp, unique per task>,
  "createdAt": "<current ISO timestamp>"
}
```
