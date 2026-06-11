# Runbook — Multi-window worktree fan-out

Run 3 Claude Code windows in parallel on RealtyPandit without stomping each other.
Set up 2026-06-11. Integration branch: `feature/contact-system-refactor`.

## Layout

| Window | Open this folder | Branch | App | Dev port |
|---|---|---|---|---|
| **backend** | `../rp-worktrees/backend`  | `wt/backend`  | `agents/backend`  | 7071 (Express) |
| **frontend** | `../rp-worktrees/frontend` | `wt/frontend` | `agents/frontend` | 5173 (Vite) |
| **website** | `../rp-worktrees/website`  | `wt/website`  | `agents/website`  | 7575 (Next) |
| _(integration)_ | `reality-pandit` (this repo) | `feature/contact-system-refactor` | — merge target | — |

All three branches were cut from commit `9ad310e` (the WIP snapshot of the dirty tree, committed 2026-06-11). Ports don't overlap, so all three dev servers can run at once.

## To open a window

Point a fresh Claude Code window / terminal at the worktree folder, e.g.
`clients/sunny-sharma/projects/rp-worktrees/backend`. It's a normal full checkout — `git status`, dev server, tests all work there independently.

## Lane ownership — stay in your lane

Each window edits **only** its app dir. Do not edit another window's app.

| Window | May edit | Must NOT touch |
|---|---|---|
| backend  | `agents/backend/**` | `agents/frontend`, `agents/website` |
| frontend | `agents/frontend/**` | `agents/backend`, `agents/website` |
| website  | `agents/website/**`  | `agents/backend`, `agents/frontend` |

Shared/root files (`docs/`, `deploy/`, root scripts, `docker-compose.yml`): edit from the **integration window only** to avoid merge conflicts.

## ⚠️ The two hard rules

1. **Only the backend window touches Prisma / migrations / the dev database.**
   All worktrees point at the *same* Postgres (same `DATABASE_URL`). Two windows
   running `prisma migrate` against it will corrupt the dev DB. Schema changes,
   `prisma migrate`, `prisma generate`, seed scripts → **backend window, exclusively.**

2. **`node_modules` is shared via a junction, not a copy.**
   Each worktree's `agents/<app>/node_modules` is a Windows junction to the main
   repo's installed deps. Running the app / tests / `prisma generate` is safe.
   **But do not run `npm install` / `npm ci` in a worktree** — it writes through the
   junction and mutates the shared deps for every window. If a window genuinely needs
   a new dependency: delete the junction first
   (`Remove-Item agents/<app>/node_modules`), then `npm install` to get a private copy.

## Env files

- backend & frontend: `.env` was copied into each worktree (gitignored, won't commit).
- **website: no `.env` exists yet** — that window must create its own before running
  `next dev` (start from `agents/website/.env.example` if present).

## Merge / integration flow

When a window's work is ready, merge its branch back into the integration branch
from the **integration window** (or any window, but do it one at a time):

```
cd reality-pandit            # integration worktree
git merge wt/backend         # then wt/frontend, then wt/website
```

Because each branch only changed files in its own app dir, these merges are
conflict-free. Resolve `docs/`/root collisions in the integration window only.

## Teardown (when done with parallel work)

```
cd reality-pandit
git worktree remove ../rp-worktrees/backend
git worktree remove ../rp-worktrees/frontend
git worktree remove ../rp-worktrees/website
# delete branches once merged:
git branch -d wt/backend wt/frontend wt/website
```

If a worktree refuses to remove because of the node_modules junction, delete the
junction first (`Remove-Item <worktree>/agents/<app>/node_modules`) then retry.
