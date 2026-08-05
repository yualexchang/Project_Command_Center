---
name: deal-sync
description: Triage new Outlook email into Morning Deal Desk tasks. Searches the inbox via the Microsoft 365 MCP connection, applies the deal-desk triage rules, merges deduped tasks into data/tasks.json, and commits. Optional argument = time window (e.g. "past 7 days"); default is since the last sync.
---

# Deal Sync

You are triaging Outlook email for a private equity deal professional (the user).
The task file is `data/tasks.json` in the deal-desk repo (repo root:
`C:\Users\AlexChang\deal-desk` — use relative paths if the cwd is inside it).

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

8. **Report.** Tell the user: how many emails scanned, how many tasks created
   (with one-line titles), and remind them to hit Refresh in the dashboard.
   Do not edit tasks the user may be editing in the dashboard — if the dev
   server is running and you are unsure, mention that a Refresh will pick up
   the changes.

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
