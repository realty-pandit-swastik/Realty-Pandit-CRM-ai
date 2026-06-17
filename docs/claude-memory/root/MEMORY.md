# Root Project Memory — Cross-Project Index

Cross-project rules only. Project-specific knowledge lives in each project's `/docs/`.

## Project memory locations

| Project | Memory dir | Project /docs/ |
|---|---|---|
| Realty Pandit | `c--…-sunny-sharma/memory/` | `clients/sunny-sharma/projects/reality-pandit/docs/` |
| FitEdge | `C--Users-Varchasv-Bhardwaj/memory/` | (in-repo docs TBD at FitEdge restructure) |
| Passion Sports | `clients/passion-sports/memory/` (isolated) | (in-repo docs TBD) |
| **Sanro IT (sanroit.in)** | `clients/sanro-it/memory/` (isolated) | `clients/sanro-it/projects/website/docs/` |

## Cross-project working rules

- [user-preferences.md](user-preferences.md) — Discuss → Plan → Execute workflow; visual proof for UI changes; investigate before coding
- [feedback_subagent_overhead.md](feedback_subagent_overhead.md) — skip subagent-driven for mechanical work; inline execution with phase-boundary checkpoints
- [feedback_skip_code_review_graph.md](feedback_skip_code_review_graph.md) — skip code-review-graph MCP; stalls sessions; use Grep/Glob/Read directly

## Realty Pandit quick map

| What you want | Where |
|---|---|
| Live project status (authoritative) | `clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md` |
| Architecture / what's built | `…/docs/architecture/` |
| Architectural decisions (ADRs) | `…/docs/decisions/` — DEC-001, DEC-002, DEC-003 |
| Implementation plans (dated) | `…/docs/plans/` |
| Operational runbooks | `…/docs/runbooks/` — deploy.md, pwa-cache-bust.md, meta-template-approval.md, whatsapp-token-rotation.md, glitchtip.md, meta-product-catalog.md, inventory-null-agent-recovery.md, meta-ctw-ads.md, meta-fb-ig-webhook-subscribe.md, new-lead-google-reminder.md |
| Don't-do-this precautions | `…/docs/precautions/` — workflow-engine-traps.md, prisma-where-or-pattern.md, csrf-cookie-pattern.md, deployment-gotchas.md, phone-normalization-pattern.md, demand-fold-clobber.md |
| Pending work + future skills | `…/docs/backlog/` — PENDING.md, FUTURE_SKILLS.md |
| Tools + skills in use | `…/docs/tools-and-skills/` — USED.md, skills-master.md |
| Historical bug logs + snapshots | `…/docs/archive/` |

When PROJECT_STATUS.md disagrees with anything else, PROJECT_STATUS.md wins.

The Realty Pandit project-specific memory dir is for Claude-side feedback (axios client rule, mobile component parity, browser QA discipline, etc.) — not project knowledge.

## Sanro IT quick map

| What you want | Where |
|---|---|
| Live URL | https://sanroit.in/ (deployed 2026-05-30, Hostinger shared, key-auth deploy) |
| Project memory index | `clients/sanro-it/memory/MEMORY.md` |
| Project facts + deferred work | `clients/sanro-it/memory/project_overview.md` |
| Deploy details (SSH, key, web root) | `clients/sanro-it/memory/deploy_workflow.md` |
| Observed user execution-style patterns | `clients/sanro-it/memory/feedback_execution_style.md` |
| Server-side / workflow precautions | `clients/sanro-it/memory/precautions.md` |
| Design system + wireframes (source of truth) | `clients/sanro-it/projects/website/docs/` |
| Deployable site (mirror of live) | `clients/sanro-it/projects/website/src/` |
| Playwright QA harness + report | `clients/sanro-it/projects/website/qa/` |
| Deploy script (one command) | `python clients/sanro-it/projects/website/deploy/deploy.py` |
