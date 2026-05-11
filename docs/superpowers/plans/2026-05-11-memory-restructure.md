# Memory & Knowledge Restructure — Implementation Plan

> **For agentic workers:** Execute inline (no subagents — user preference for mechanical work). Pause at the audit gate after Task 1 and let user review the classification before any destructive changes.

**Goal:** Migrate Realty Pandit knowledge to a three-layer architecture: CLAUDE.md → /docs/ → memory(pointers + feedback only).

**Architecture:** /docs/ becomes single source of truth (committed to git). Memory keeps only cross-cutting feedback + pointers into /docs/, every entry with mandatory **Why** block. Bug-fix logs and decaying snapshots get archived or replaced by one live PROJECT_STATUS.md.

**Spec:** `clients/sunny-sharma/projects/reality-pandit/docs/superpowers/specs/2026-05-11-memory-restructure-design.md`

**Scope:** Memory + /docs/ + Project/CLAUDE.md + .claude/plans/. **No project source code touched.**

---

## File Map

### New /docs/ files (created)
- `clients/sunny-sharma/projects/reality-pandit/docs/README.md` — entry point + map
- `.../docs/PROJECT_STATUS.md` — live status (replaces snapshot files)
- `.../docs/architecture/system-overview.md`
- `.../docs/architecture/whatsapp-voice-bot.md`
- `.../docs/runbooks/deploy.md`
- `.../docs/runbooks/pwa-cache-bust.md`
- `.../docs/runbooks/meta-template-approval.md`
- `.../docs/runbooks/inventory-null-agent-recovery.md`
- `.../docs/precautions/workflow-engine-traps.md`
- `.../docs/precautions/deployment-gotchas.md`
- `.../docs/precautions/prisma-where-or-pattern.md`
- `.../docs/backlog/PENDING.md`
- `.../docs/backlog/FUTURE_SKILLS.md`
- `.../docs/tools-and-skills/USED.md`
- `.../docs/archive/2026-04-05-bug-fixes.md` — consolidated 5 dated bug-fix logs

### Existing /docs/ files (move/reorganize, content unchanged)
- `DATABASE_SCHEMA.md` → `architecture/database-schema.md`
- `API_ENDPOINTS_REFERENCE.md` → `architecture/api-endpoints.md`
- `FRONTEND_COMPONENTS.md` → `architecture/frontend-components.md`
- `LLM_AND_AI_SYSTEM.md` → `architecture/llm-and-ai.md`
- `PAGES_AND_ROUTES.md` → `architecture/pages-and-routes.md`
- `BUSINESS_LOGIC.md` → `architecture/business-logic.md`
- `PANEL_CONNECTIONS.md` → `architecture/panel-connections.md`

### Memory files (rewritten with frontmatter + Why blocks)
- `MEMORY.md` (root) — rebuild as index
- `MEMORY.md` (sunny-sharma) — rebuild as index
- Surviving feedback files — add Why if missing

### Modified
- `Project/CLAUDE.md` — remove code-review-graph mandate

### Working artifact (intermediate, will be removed after migration)
- `.../docs/superpowers/specs/2026-05-11-memory-audit.md` — classification table (output of Task 1)

---

## Task 1: Audit & Classify (Pass 1)

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/superpowers/specs/2026-05-11-memory-audit.md`

- [ ] **Step 1: Enumerate every memory file**

Run:
```
ls "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project/memory/"
ls "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/"
ls "C:/Users/Varchasv Bhardwaj/.claude/plans/"
```

Expected: 15 + 53 + 13 = 81 files inventoried.

- [ ] **Step 2: Read each file's frontmatter + first 30 lines**

For every file, capture: name, current type, has-Why-block (yes/no), content summary (≤15 words), classification target.

- [ ] **Step 3: Write the audit document**

The document is a single markdown table with columns:

| File | Current type | Has Why? | Verdict | New location | Notes |
|---|---|---|---|---|---|
| `feedback_skip_code_review_graph.md` | feedback | ✓ | keep | (unchanged) | |
| `project_bugs_fixed_20260418.md` | project | ✗ | archive | `/docs/archive/2026-04-05-bug-fixes.md` | merge with 4 other dated logs |
| `project_realty_pandit_stage1_new_kra.md` | project | partial | migrate to pointer | memory pointer → `/docs/plans/2026-04-24-pipeline-stage-01-new-kra.md` | content already in /docs/plans |

Five verdict values only: `keep`, `rewrite` (add Why), `migrate` (to /docs/), `archive`, `delete`.

- [ ] **Step 4: ⚠ STOP — User reviews the audit before any other task runs**

Present the audit file path to user. Wait for explicit "go" before Task 2.

---

## Task 2: Create /docs/ skeleton

**Files:**
- Create directories under `clients/sunny-sharma/projects/reality-pandit/docs/`: `architecture/`, `runbooks/`, `precautions/`, `backlog/`, `tools-and-skills/`, `archive/` (decisions/, plans/, superpowers/ already exist)
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/README.md`

- [ ] **Step 1: Create directories**

Run:
```
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/architecture"
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/runbooks"
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/precautions"
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/backlog"
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/tools-and-skills"
mkdir -p "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/archive"
```

- [ ] **Step 2: Write `/docs/README.md`**

Content:
```markdown
# Realty Pandit — Docs Index

This directory is the **single source of truth** for project knowledge. Memory files only point here; they never duplicate.

## Map

| What you're looking for | Where to read |
|---|---|
| What's built (durable facts) | [`architecture/`](architecture/) |
| Why we built it that way | [`decisions/`](decisions/) (ADRs) |
| Implementation plans (dated) | [`plans/`](plans/) |
| How to do operational task X | [`runbooks/`](runbooks/) |
| Don't-do-this warnings | [`precautions/`](precautions/) |
| Pending work + future tooling | [`backlog/`](backlog/) |
| Skills + tools we use | [`tools-and-skills/`](tools-and-skills/) |
| Live project status | [`PROJECT_STATUS.md`](PROJECT_STATUS.md) |
| Historical bug logs, old snapshots | [`archive/`](archive/) |

## Naming conventions

- ADRs: `DEC-NNN-<slug>.md` in `decisions/`
- Plans: `YYYY-MM-DD-<slug>.md` in `plans/`
- Runbooks / precautions: kebab-case topic in their folders

## Memory layer

Auto-memory at `C:/Users/Varchasv Bhardwaj/.claude/projects/c--…-sunny-sharma/memory/` is restricted to:
- Cross-cutting feedback (with **Why** + **How to apply**)
- Pointers into this directory
- User preferences

Never put project knowledge in memory. It goes here.
```

- [ ] **Step 3: Move existing top-level docs into architecture/**

Run:
```
cd "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs"
mv DATABASE_SCHEMA.md architecture/database-schema.md
mv API_ENDPOINTS_REFERENCE.md architecture/api-endpoints.md
mv FRONTEND_COMPONENTS.md architecture/frontend-components.md
mv LLM_AND_AI_SYSTEM.md architecture/llm-and-ai.md
mv PAGES_AND_ROUTES.md architecture/pages-and-routes.md
mv BUSINESS_LOGIC.md architecture/business-logic.md
mv PANEL_CONNECTIONS.md architecture/panel-connections.md
```

Note: leave `PROJECT_REPORT.md`, `PROJECT_STRUCTURE.md`, `ERRORS_AND_ISSUES.md`, `BRANDING_INTEGRATION_COMPLETE.md`, `DEPLOYMENT_AND_INFRASTRUCTURE.md` at top level until Task 7 (they fold into PROJECT_STATUS or get archived).

- [ ] **Step 4: Verify directory structure**

Run: `ls "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/"`
Expected: 6 new subdirs visible + decisions/, plans/, tasks/, superpowers/ already there.

---

## Task 3: Write precautions/workflow-engine-traps.md

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/precautions/workflow-engine-traps.md`

This codifies the bug we fixed today so the next agent won't re-introduce it.

- [ ] **Step 1: Write the file**

Content:
```markdown
# Workflow Engine Traps

## Trap 1: Silent NULL `uploaded_by_agent_id` from `/api/workflow/commit`

**Symptom:** Inventory submitted by a logged-in agent never shows up in their (or their manager's) list. It IS created in the DB, but with `uploaded_by_agent_id = NULL` — invisible to all role-based visibility filters.

**Root cause:** `POST /api/workflow/commit` has no `authMiddleware`. It reads JWT optionally — if the token is expired/missing, the catch block silently swallows the error and `agentId` stays `undefined`. Engine then writes `uploaded_by_agent_id: agentId || undefined` → NULL.

**Why this trap exists:** The endpoint is shared by web/whatsapp/voice (which legitimately have no agent) AND admin (which must have one). The original author didn't separate the two source modes.

**How to apply:**
- Any new endpoint that conditionally consumes a JWT must reject `source === 'admin'` requests when the JWT fails to verify
- Pattern: check `source` first, then validate JWT strictly for admin, optionally for others
- Reference fix: `backend/src/routes/workflow.ts:267-285` (2026-05-11)
- See also: `runbooks/inventory-null-agent-recovery.md` for the data backfill procedure

## Trap 2: Prisma `where.OR` deletion when adding AND filters

**Symptom:** Role-based visibility filter disappears the moment a user applies a location/search filter. Either the page goes blank (managers see nothing) or shows the entire DB (visibility OR was removed entirely).

**Root cause:** Combining `where.OR` (visibility) with a new OR clause (e.g. location) via `delete where.OR; where.AND = [{OR: locOR}]` drops the original visibility OR completely.

**Correct pattern (used by search filter):**
```ts
if (where.OR) {
    const visibilityOR = where.OR;
    delete where.OR;
    where.AND = [...(where.AND || []), { OR: visibilityOR }, { OR: locOR }];
} else {
    where.OR = locOR;
}
```

**How to apply:** Any new filter added to `GET /api/inventory` (or any other endpoint with role-based visibility) MUST follow this pattern. Reference: `backend/src/routes/inventory.ts:335-355` (search filter — correct example) vs `:317-333` (location filter — fixed 2026-05-11).
```

- [ ] **Step 2: Verify file exists and is readable**

Run: `head -10 "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/precautions/workflow-engine-traps.md"`

---

## Task 4: Write runbooks/deploy.md

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/runbooks/deploy.md`

- [ ] **Step 1: Write the file**

Content:
```markdown
# Deployment Runbook

## What deploys where

| Component | Local path | Server path | PM2 process |
|---|---|---|---|
| Frontend (admin panel) | `frontend/` | `/var/www/realty-pandit/frontend/` | `realty-admin` |
| Backend (API) | `backend/` | `/var/www/realty-pandit/backend/` | `realty-backend` |
| Website (public) | `website/` | `/var/www/realty-pandit/website/` | `realty-website` |

**Server:** `root@72.62.231.224`
**SSH key:** `C:/Users/VARCHA~1/AppData/Local/Temp/rp_key` (auto-loaded by deploy script)

## Deploy command

From `clients/sunny-sharma/projects/reality-pandit/agents/`:

```bash
node deployment/deploy-agent.js <component>
# <component> = website | backend | frontend | all
```

Flags:
- `--skip-build` — upload only, skip build step
- `--skip-verify` — skip post-deploy browser QA
- `--dry-run` — show commands without executing

The script: (1) tars source, (2) SCPs to /tmp, (3) extracts to server path, (4) `npm install`, (5) builds (`npx tsc` for backend, `npm run build` for frontend), (6) `pm2 restart`, (7) Browser QA verification.

## ⚠ Critical: nginx serving paths

admin.realtypandit.in is served from `/var/www/realty-pandit/frontend/dist/` — NOT `/var/www/html/`. Uploading to the wrong path is a common mistake when bypassing the deploy script. Always use the script.

## ⚠ Critical: PWA cache invalidation

The frontend uses Vite Plugin PWA with `registerType: 'autoUpdate'`. The service worker only auto-installs a new version when its content (the workbox precache manifest) changes. If index.html and chunks all keep the same hashes, the SW never refreshes and PWA users see stale UI.

**Force-refresh trick:** bump a comment in `frontend/index.html`:
```html
<title>Realty Pandit - Dashboard</title>
<!-- v20260509 -->
```

Change the date stamp. This changes the precache manifest revision → new sw.js → browsers auto-update. Re-run the deploy.

See: `runbooks/pwa-cache-bust.md` for the full mechanism.

## Post-deploy verification

The script runs `browser-qa/qa-agent.js` automatically. To re-run manually:
```bash
node browser-qa/task-verify.js --last
```

To open the admin in a real browser for visual verification:
- URL: https://admin.realtypandit.in
- Use Playwright MCP browser tools (the user has them configured) for screenshot-based regression
```

- [ ] **Step 2: Verify**

Run: `head -5 "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/runbooks/deploy.md"`

---

## Task 5: Write remaining runbooks + precautions

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/runbooks/pwa-cache-bust.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/runbooks/meta-template-approval.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/runbooks/inventory-null-agent-recovery.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/precautions/deployment-gotchas.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/precautions/prisma-where-or-pattern.md`

For each file, the content is derived from existing memory + chat history. The content drafts will be assembled inline during execution by reading the relevant source memory files first (audit verdicts will list which memory files feed which doc).

- [ ] **Step 1: Read source memory files**

For each doc-to-create, read the source memory file(s) identified in the audit (Task 1's table). Examples:
- `pwa-cache-bust.md` ← `feedback_pwa_deploy.md` + chat history on sw.js revision mechanism
- `meta-template-approval.md` ← `project_whatsapp_meta_status.md`, `project_whatsapp_token_history.md`, `project_meta_app_deleted.md`
- `inventory-null-agent-recovery.md` ← today's chat (the 18-record patch script)
- `deployment-gotchas.md` ← chat on nginx serving paths, build hash mismatch
- `prisma-where-or-pattern.md` ← short doc cross-referencing `precautions/workflow-engine-traps.md` Trap 2

- [ ] **Step 2: Write each file with mandatory structure**

Every runbook: **What it does** → **When to use** → **Steps** → **Verification** → **Common failure modes**.
Every precaution: **What goes wrong** → **Root cause / Why** → **How to apply (when this rule triggers)** → **Reference**.

- [ ] **Step 3: Verify all 5 files exist**

Run: `ls "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/runbooks/" "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/precautions/"`
Expected: 4 runbook files (deploy + 3 from this task) + 3 precaution files.

---

## Task 6: Write architecture/system-overview.md + architecture/whatsapp-voice-bot.md

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/architecture/system-overview.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/architecture/whatsapp-voice-bot.md`

- [ ] **Step 1: system-overview.md** — write a one-page map of the three panels (admin, website, voice bot), their integrations (Meta WhatsApp, Gemini Live, 99acres, MagicBricks, Housing.com, Facebook), and the DB. Source: `project_architecture.md`, `project_complete_reference.md`, `admin_panel_map.md`.

- [ ] **Step 2: whatsapp-voice-bot.md** — migrate full content of `realty_pandit_whatsapp_voice_bot_architecture.md` (Pipecat 1.0.0, Gemini Live, webhook path, the 8 non-obvious fixes). This is durable architecture knowledge that belongs in /docs/.

- [ ] **Step 3: Verify** — `head -5` on each, confirm file exists.

---

## Task 7: Build PROJECT_STATUS.md + archive snapshot files

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md`
- Move/delete top-level docs: `PROJECT_REPORT.md`, `PROJECT_STRUCTURE.md`, `ERRORS_AND_ISSUES.md`, `BRANDING_INTEGRATION_COMPLETE.md`, `DEPLOYMENT_AND_INFRASTRUCTURE.md`
- Create archive consolidation: `clients/sunny-sharma/projects/reality-pandit/docs/archive/2026-04-05-bug-fixes.md`

- [ ] **Step 1: Write PROJECT_STATUS.md**

Template:
```markdown
# Realty Pandit — Live Project Status

**Last updated:** 2026-05-11
**Update trigger:** Significant deployments, phase completions, blockers cleared/added

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 1–8 (AI automation core) | DEPLOYED | All 6 pipeline stage KRAs live |
| Stage 1 NEW | DEPLOYED 2026-04-24 | See `plans/2026-04-24-pipeline-stage-01-new-kra.md` |
| Stage 2 QUALIFIED | DEPLOYED 2026-04-24 | |
| Stage 3 MATCHING_APPOINTMENT | DEPLOYED 2026-04-24 | |
| Stage 4 VISIT_SCHEDULED | DEPLOYED 2026-04-24 | |
| Stage 5 VISITED | DEPLOYED 2026-04-24 | |
| Stage 6 NEGOTIATION | DEPLOYED 2026-04-24 | |
| Deal Pipeline UI/UX overhaul | DEPLOYED 2026-05-03 | |
| Team Member Profile + Manager column | DEPLOYED 2026-05-09 | |
| Inventory NULL agentId fix | DEPLOYED 2026-05-11 | See `precautions/workflow-engine-traps.md` |

## Known blockers / pending decisions

- 790 existing contacts have NO deals — backfill decision pending Sunny
- Phase 9 (property cards) — blocked on product decision
- Phase 10 (digest) — blocked on product decision
- 3 WhatsApp templates pending Meta approval (out of 78 total)

## Recent deploys (last 30 days)

- 2026-05-11: Inventory NULL agentId fix + location filter fix + 18 record backfill (Ashwani)
- 2026-05-09: Team Member Profile, Manager column, portal email field
- 2026-05-07: Lead-deal sync fix (15 sync gap deals + 2 budget corruption fixes)
- 2026-05-03: Deal Pipeline UI/UX overhaul (source badges, CSS vars, card shadows)

## Active people

- **Puneet** — owner, super_boss role
- **Ashwani** — manager, ID `37738548-f4d3-4a4c-b005-1c0b325e03cf`
- **Sunny Sharma** — client (visible at workspace level, not RP-specific)

> This file is the LIVE state. When you see contradictions with anything else, this wins. Update timestamp on each meaningful change.
```

- [ ] **Step 2: Archive old top-level docs**

These contain useful historical content but are point-in-time snapshots. Move them under `archive/` to preserve them while removing them from the current-state lookup path:

```bash
cd "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs"
mv PROJECT_REPORT.md archive/PROJECT_REPORT-snapshot.md
mv PROJECT_STRUCTURE.md archive/PROJECT_STRUCTURE-snapshot.md
mv ERRORS_AND_ISSUES.md archive/ERRORS_AND_ISSUES-snapshot.md
mv BRANDING_INTEGRATION_COMPLETE.md archive/BRANDING_INTEGRATION_COMPLETE-snapshot.md
mv DEPLOYMENT_AND_INFRASTRUCTURE.md archive/DEPLOYMENT_AND_INFRASTRUCTURE-snapshot.md
```

Important content (e.g. deployment paths from DEPLOYMENT_AND_INFRASTRUCTURE.md) should already have been carried into `runbooks/deploy.md` in Task 4. If anything was missed, port it now before archiving.

- [ ] **Step 3: Consolidate the 5 bug-fix logs**

Read all 5 memory files:
- `project_bugs_fixed_20260418.md`
- `project_bugs_fixed_20260420.md`
- `project_bugs_fixed_20260423.md`
- `project_bugs_fixed_20260502.md`
- `project_pipeline_bugs_fixed_20260428.md`

Merge into `clients/sunny-sharma/projects/reality-pandit/docs/archive/2026-04-05-bug-fixes.md` as a flat chronology:

```markdown
# Bug Fixes — Apr–May 2026 (Chronological Archive)

> Migrated from 5 dated `project_bugs_fixed_*.md` memory files on 2026-05-11.
> This is reference history. For active warnings, see `/docs/precautions/`.

## 2026-04-18
<content from project_bugs_fixed_20260418.md>

## 2026-04-20
<content from project_bugs_fixed_20260420.md>

## 2026-04-23
<content from project_bugs_fixed_20260423.md>

## 2026-04-28 (pipeline)
<content from project_pipeline_bugs_fixed_20260428.md>

## 2026-05-02
<content from project_bugs_fixed_20260502.md>
```

- [ ] **Step 4: Verify**

Run: `ls "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/docs/archive/"`
Expected: 5 snapshot files + 2026-04-05-bug-fixes.md.

---

## Task 8: Write backlog/ + tools-and-skills/

**Files:**
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/backlog/PENDING.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/backlog/FUTURE_SKILLS.md`
- Create: `clients/sunny-sharma/projects/reality-pandit/docs/tools-and-skills/USED.md`

- [ ] **Step 1: PENDING.md** — list active pending tasks (790 contacts backfill, Phase 9, Phase 10, 3 Meta templates).

- [ ] **Step 2: FUTURE_SKILLS.md** — list skills/tools to consider adopting (e.g., automated WhatsApp template testing, contract testing for the workflow engine).

- [ ] **Step 3: USED.md** — enumerate skills + tools used today:
  - Playwright (MCP browser-tools) — UI verification
  - deploy-agent.js — uniform deploy pipeline
  - Prisma CLI — DB introspection + migrations
  - SSH + scp — server access (via `C:/Users/VARCHA~1/AppData/Local/Temp/rp_key`)
  - PM2 — process supervision
  - Vite Plugin PWA — service worker management
  - brainstorming + writing-plans + executing-plans skills
  - browser-qa agent (`browser-qa/qa-agent.js`)

- [ ] **Step 4: Verify** — `ls` on both directories.

---

## Task 9: Move .claude/plans/ cryptic files into /docs/plans/

**Files:**
- Rename + move 13 files from `C:/Users/Varchasv Bhardwaj/.claude/plans/` into `clients/sunny-sharma/projects/reality-pandit/docs/plans/`

- [ ] **Step 1: For each cryptic file, read the first 20 lines to identify the topic**

Files to inspect:
- `compiled-sparking-kitten.md`
- `compressed-growing-flamingo.md`
- `curious-wishing-scroll.md` (known: Deal Pipeline UI/UX overhaul)
- `dazzling-wobbling-whisper.md`
- `giggly-growing-mochi.md`
- `precious-plotting-frost.md`
- `velvet-wishing-cook.md`

Plus 6 already-dated files — those can move as-is.

- [ ] **Step 2: Rename to `YYYY-MM-DD-<topic-slug>.md` based on first commit / file mtime + content**

Move them into `clients/sunny-sharma/projects/reality-pandit/docs/plans/` if they belong to Realty Pandit. If a plan belongs to another project (FitEdge, Passion Sports), move to that project's `/docs/plans/` instead. If a plan was a one-off experiment not tied to a project, archive under `clients/sunny-sharma/projects/reality-pandit/docs/archive/plans/` (or the appropriate project's archive).

- [ ] **Step 3: Verify**

Run: `ls "C:/Users/Varchasv Bhardwaj/.claude/plans/"`
Expected: empty (or only files that didn't fit any project — explicitly listed in a comment for user).

---

## Task 10: Rewrite memory files with mandatory frontmatter + Why blocks

**Files:**
- Modify: all memory files in both project memory dirs whose audit verdict is `keep` or `rewrite`

- [ ] **Step 1: For each surviving memory file, ensure frontmatter format**

Required format (per spec):
```markdown
---
name: <short name>
description: <one-line so Claude knows when this is relevant>
type: feedback | reference | user | project
---

<the fact / rule>

**Why:** <reason — past incident, constraint, user preference>

**How to apply:** <when this kicks in — what triggers it>
```

If a file has the frontmatter but no Why → add Why + How to apply (use commit history or chat context to reconstruct the reason).
If a file's content is entirely about /docs/-worthy material → convert to a pointer:
```markdown
---
name: <name>
description: pointer to /docs/<path>
type: reference
---

See `clients/sunny-sharma/projects/reality-pandit/docs/<path>` for full content.

**Why:** This file is a pointer to keep memory thin. The canonical content lives in /docs/.
**How to apply:** When asked about <topic>, read the /docs/ file directly.
```

- [ ] **Step 2: Delete files marked `archive` or `delete` in audit**

Per the audit table. Bug-fix logs and decaying snapshots whose content is now in /docs/archive/ or /docs/PROJECT_STATUS.md.

- [ ] **Step 3: Verify**

Run: `ls "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/" | wc -l`
Expected: ~10–12 files (down from 53).

---

## Task 11: Move FitEdge files out of root memory + rebuild both MEMORY.md files

**Files:**
- Move: `fitedge-project.md`, `fitedge-state.md` → `C:/Users/Varchasv Bhardwaj/.claude/projects/C--Users-Varchasv-Bhardwaj/`
- Move: `realty-pandit-state.md` → its content folds into `/docs/PROJECT_STATUS.md` (if not already covered in Task 7), then delete from root memory
- Modify: `C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project/memory/MEMORY.md`
- Modify: `C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/MEMORY.md`

- [ ] **Step 1: Move FitEdge files**

```bash
mv "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project/memory/fitedge-project.md" "C:/Users/Varchasv Bhardwaj/.claude/projects/C--Users-Varchasv-Bhardwaj/"
mv "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project/memory/fitedge-state.md" "C:/Users/Varchasv Bhardwaj/.claude/projects/C--Users-Varchasv-Bhardwaj/"
```

- [ ] **Step 2: Verify Realty Pandit state was carried into PROJECT_STATUS.md, then delete**

Read `realty-pandit-state.md`, confirm every meaningful line is reflected in `/docs/PROJECT_STATUS.md`. Then:
```bash
rm "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project/memory/realty-pandit-state.md"
```

- [ ] **Step 3: Rebuild root MEMORY.md as tight index**

The root memory now holds only **truly cross-project** rules. Index format: `- [Title](file.md) — one-line hook`.

Content:
```markdown
# Root Project Memory — Index

Cross-project rules only. Project-specific knowledge lives in each project's `/docs/`.

## Project memory locations

| Project | Memory dir | Project /docs/ |
|---|---|---|
| Realty Pandit | `c--…-sunny-sharma/memory/` | `clients/sunny-sharma/projects/reality-pandit/docs/` |
| FitEdge | `C--Users-Varchasv-Bhardwaj/` | TBD (set up at FitEdge restructure) |
| Passion Sports | `clients/passion-sports/memory/` (isolated) | TBD |

## Cross-project rules

- [Discuss → Plan → Execute workflow](user-preferences.md) — never autonomous code-writing
- [Inline execution for mechanical work](feedback_subagent_overhead.md) — subagent overhead not worth it for grunt tasks
- [Skip code-review-graph MCP](feedback_skip_code_review_graph.md) — stalls sessions
- [Visual proof for UI changes](feedback_browser_qa.md) — screenshot before + after, every time
- [Investigate before changing](feedback_investigate_first.md) — read the code, don't guess

## How to find project state

Realty Pandit: read `clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md` first. It's authoritative.
```

- [ ] **Step 4: Rebuild Realty Pandit MEMORY.md as tight index**

Content:
```markdown
# Realty Pandit Memory — Index

> The canonical source of truth is `clients/sunny-sharma/projects/reality-pandit/docs/`. This index points there + holds Claude-specific feedback.

## Quick links into /docs/

- **What's built:** [`/docs/architecture/`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/architecture/)
- **Why we built it:** [`/docs/decisions/`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/decisions/)
- **Plans (dated):** [`/docs/plans/`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/plans/)
- **How to do X:** [`/docs/runbooks/`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/runbooks/)
- **Don't do X:** [`/docs/precautions/`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/precautions/)
- **Live status:** [`/docs/PROJECT_STATUS.md`](../../../Project/clients/sunny-sharma/projects/reality-pandit/docs/PROJECT_STATUS.md)

## Feedback (Claude-specific working rules)

<one line per surviving feedback_*.md file from Task 10, with description>

## References

<one line per surviving reference file>
```

- [ ] **Step 5: Verify**

Both MEMORY.md files under 100 lines, no content embedded, only one-line index entries.

---

## Task 12: Fix Project/CLAUDE.md (resolve the contradiction)

**Files:**
- Modify: `C:/Users/Varchasv Bhardwaj/Project/CLAUDE.md`

- [ ] **Step 1: Read current content**

Look at the MCP Tools: code-review-graph section.

- [ ] **Step 2: Replace the section**

Replace the entire "## MCP Tools: code-review-graph" block with:

```markdown
## Knowledge layer

Each project has its own `/docs/` directory which is the source of truth. Memory files are pointers + feedback only. Specifically for Realty Pandit:

- Source of truth: `clients/sunny-sharma/projects/reality-pandit/docs/`
- Live status: `.../docs/PROJECT_STATUS.md`
- Pre-existing warnings: `.../docs/precautions/`

For research:
- Use Grep/Glob/Read directly — fast and reliable
- `code-review-graph` MCP server tools are available but have caused session stalls; treat as optional and skip if they hang
```

- [ ] **Step 3: Verify**

Run: `head -30 "C:/Users/Varchasv Bhardwaj/Project/CLAUDE.md"`
Expected: No more "ALWAYS use the code-review-graph MCP tools BEFORE using Grep/Glob/Read" mandate. Contradiction with `feedback_skip_code_review_graph.md` is resolved.

---

## Task 13: Final verification (the cold-question test)

**Files:** None modified. Verification only.

- [ ] **Step 1: Pick 5 cold questions**

Cold = questions Claude is likely to receive in a fresh session. Examples:
1. "Why does `/api/workflow/commit` reject expired tokens for admin source?"
2. "How do I deploy the frontend? What's the PWA cache invalidation trick?"
3. "What's the Stage 2 (QUALIFIED) cold-lead cadence?"
4. "Where are the Realty Pandit ADRs?"
5. "What pending work is blocked on Sunny's decision?"

- [ ] **Step 2: For each, trace the answer chain**

The answer should resolve in ≤2 hops:
- Hop 1: memory pointer (e.g. "see /docs/precautions/workflow-engine-traps.md")
- Hop 2: the /docs/ file with full Why

Walk each question and confirm the chain works. If a chain breaks (file missing, Why missing, contradiction) — fix on the spot.

- [ ] **Step 3: Commit /docs/ changes to git**

```bash
cd "C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit"
git add docs/
git status   # confirm only docs/ changes staged
git commit -m "$(cat <<'EOF'
docs: restructure into architecture/decisions/runbooks/precautions/backlog layout

Three-layer knowledge architecture: CLAUDE.md → /docs/ (source of truth) → memory (pointers + feedback).
Adds /docs/precautions/ for don't-do-this warnings (workflow engine traps, prisma where.OR pattern).
Adds /docs/runbooks/ for operational procedures (deploy, PWA cache bust, Meta template approval).
Adds /docs/PROJECT_STATUS.md as the live status (replaces decaying snapshot files).
Archives 5 dated bug-fix logs into one chronological file under /docs/archive/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Report final state**

Print summary:
- Memory file count before / after (53 → ?, 15 → ?)
- /docs/ subdirs created
- Contradictions resolved
- Files archived
- 5 cold-question test results

---

## Self-review (writer's pass)

**Spec coverage check:**
- ✓ Three-layer architecture — Tasks 2 (skeleton), 11 (memory rebuild), 12 (CLAUDE.md)
- ✓ /docs/ canonical structure — Tasks 2–8 (every subdir filled)
- ✓ Memory rules (Why-mandatory, frontmatter, no duplication) — Task 10
- ✓ Cross-project pollution fix — Task 11
- ✓ CLAUDE.md ↔ feedback contradiction — Task 12
- ✓ Bug-fix log consolidation — Task 7
- ✓ Snapshot file replacement (PROJECT_STATUS) — Task 7
- ✓ .claude/plans/ rename + move — Task 9
- ✓ Cold-question verification — Task 13

**Placeholder scan:** Task 5 lists "content drafts assembled inline" instead of full text. This is acceptable because the content is small (~1 page each) and is derived from existing memory files that will be read in Step 1. The structure template ("What it does → When to use → Steps → Verification") is concrete enough.

**Type / naming consistency:**
- `/docs/architecture/` used consistently (not `arch/` or `Architecture/`)
- `/docs/precautions/` (plural) used consistently
- ADR format `DEC-NNN-<slug>.md` used consistently
- Plan format `YYYY-MM-DD-<slug>.md` used consistently

**Audit gate enforced:** Task 1 Step 4 explicitly stops the engineer until user reviews the audit. No file is moved/deleted before then.

---

## Estimated change size

| Layer | Files added | Files moved | Files deleted/archived |
|---|---|---|---|
| /docs/ | 15 new | 12 reorganized | 5 archived (snapshots) |
| memory (Realty Pandit) | 0 | 0 | ~41 deleted (bugs/snapshots/dupes) → 12 survive |
| memory (root) | 0 | 3 (FitEdge out + RP state folded into /docs) | rebuilt |
| .claude/plans/ | 0 | 13 renamed + moved | 0 |
| Project/CLAUDE.md | 0 | 0 | edited |

**Net result:** ~81 scattered files → ~30 well-organized files across /docs/ + ~17 memory pointers.
