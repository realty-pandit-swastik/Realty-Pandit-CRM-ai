---
name: Multi-window worktree fan-out (parallel Claude windows on RealtyPandit)
description: 2026-06-11 set up — 3 git worktrees (rp-worktrees/{backend,frontend,website}) off feature/contact-system-refactor so separate Claude windows work backend/frontend/website without clashing. node_modules junctioned; never npm install inside a worktree.
metadata:
  type: reference
---

To run parallel Claude windows on RealtyPandit without stomping each other, set up 2026-06-11: 3 git worktrees at `clients/sunny-sharma/projects/rp-worktrees/{backend,frontend,website}` on branches `wt/backend` / `wt/frontend` / `wt/website`, each cut from `feature/contact-system-refactor`. **Full runbook:** `docs/runbooks/multi-window-worktree-fanout.md`.

Rules (the traps):
- Each window edits ONLY its app dir (`agents/<app>`); root/docs edits from the integration window (the main `reality-pandit` checkout) only.
- **node_modules is a Windows junction to the main repo's** — do NOT `npm install` inside a worktree (it writes through the junction and mutates shared deps for every window). If a worktree genuinely needs a new dep, delete the junction first, then install.
- **Only the backend window touches Prisma / migrations / the dev DB** — all worktrees point at the same Postgres.
- Merge each `wt/*` → `feature/contact-system-refactor` from the integration window (conflict-free — disjoint dirs), then deploy via `deploy-agent.js`.
- `.env` was copied into the backend + frontend worktrees; the **website worktree has no `.env`** (create before running it).
- Ephemeral — may be torn down once the parallel work lands (`git worktree remove ../rp-worktrees/<app>` + `git branch -d wt/<app>`; remove the node_modules junction first if it blocks).

Context at setup: the working tree had a **510-file uncommitted pile** (220 modified + 288 untracked); committed as WIP on `feature/contact-system-refactor` (grouped backend/frontend/website/docs+infra) before fan-out, after confirming no secrets/`.env`/dumps were in it. Build tarballs (`*.tar.gz` — `frontend.tar.gz`/`website.tar.gz`) were added to `.gitignore` (don't commit build artifacts). Two features then shipped through these lanes 2026-06-11: mobile inventory multi-select/batch-share (frontend) and the deal-AI v5 card fix ([[reference_deal_ai_conversational_card]], backend).
