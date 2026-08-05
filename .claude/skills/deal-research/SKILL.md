---
name: deal-research
description: Deep-dive one Morning Deal Desk task - find the email thread and related project history in Outlook, then rewrite the task's blurb, context, and game plan in data/tasks.json. Argument = task title (or enough of it to identify the task).
---

# Deal Research

You are helping a private equity deal professional (the user) tackle ONE task
from `data/tasks.json` in the deal-desk repo (repo root:
`C:\Users\AlexChang\deal-desk`).

## Procedure

1. **Find the task.** Match the user's argument against task titles in
   `data/tasks.json` (case-insensitive, partial match OK). If ambiguous, list
   the candidates and ask which one.

2. **Research the thread.** Using the Microsoft 365 MCP tools:
   - Search the mailbox for the email chain with the task's `subject` (strip
     Re:/FW:) and/or `sender`, and read the latest messages in it
     (`read_resource` on the mail URIs for full content).
   - Also search for OLDER related threads about the task's `project` to
     understand history, prior commitments, and open items.

3. **Update the task in place** (do not change its `id` or `rank`):
   - `emailBlurb`: 2-4 sentences IN YOUR OWN WORDS — the ask, who wants it,
     current state of the thread.
   - `context`: 1-3 sentences of relevant history from older threads (prior
     commitments, what's already been sent, who owes what).
   - `steps`: a concrete, ordered 4-7 step game plan, referencing specific
     people/documents where the emails support it.
   - `needsCall`, `deadline`, `deadlineType`: update only if the thread
     supports a change (deadline must be YYYY-MM-DD; deadlineType
     "explicit" if stated, "implicit" if inferred).

4. **Write and commit.** Write `data/tasks.json` pretty-printed (2-space
   indent, trailing newline). Commit with message
   `research: <task title, abbreviated>`.

5. **Report.** Summarize what you learned and the game plan in chat, and
   remind the user to hit Refresh in the dashboard.
