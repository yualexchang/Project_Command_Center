# Working in this repo

## Ideas and TODOs go in `TODO.md`

`TODO.md` is the single managed state for everything not yet built. Keep it current:

- **Spot something out of scope?** Add a row to the state table (next free `CC-n`) plus
  a short detail section. Don't build it, and don't leave it only in chat — the
  conversation is gone next session.
- **Finish something?** Flip its status in `TODO.md` in the same commit as the code.
- **Dropping an idea?** Keep the row, set `dropped`, add a one-line why.

## Gotchas

- `npm run dev` is the only working way to run this — all `/api/*` routes live in
 Vite's `configureServer`, so `npm run build` output has no API (see `TODO.md` CC-3).
 `npm run remote` is the same dev server with `PCC_REMOTE` set: a token gate in
 front of every route plus a Cloudflare tunnel, for phone access (CC-6).
- Anything reachable off this laptop must stay behind that token. `PCC_REMOTE`
 with no `data/.remote-token` is a deliberate startup error — don't "fix" it by
 relaxing the check, and never commit the token file.
- The dev server rewrites all of `data/tasks.json` on every dashboard change. Don't
  hand-edit that file while it's running (CC-4).
- Skills exist in both `.claude/skills/` and `~\.claude\skills\` — edit both or they
  drift (CC-5).
- Node is portable at `~\Tools\node`; this machine has no admin rights, so never
  suggest installers or `winget`.
- Any new `/api/*` route that spawns `claude -p` must go behind `guarded()` in
  `vite.config.js` — these routes run with `bypassPermissions` (CC-2).
- A sync may fire on a schedule every 10 minutes during business hours (CC-9), so
  never assume you are the only writer of `data/tasks.json`.
- Push to `main` on `origin` (https://github.com/yualexchang/Project_Command_Center).
