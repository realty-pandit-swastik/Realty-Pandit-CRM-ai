# Memory & Knowledge Restructure — Design Spec

**Date:** 2026-05-11
**Owner:** Puneet (user) + Claude
**Status:** Design approved, ready for implementation plan
**Scope:** Realty Pandit project memory + root project memory + `.claude/plans/`

---

## Goal

A clean, hallucination-proof knowledge architecture for the Realty Pandit project (and cross-project workspace at large). One source of truth per fact, every saved rule carries its reason, and project boundaries don't leak.

## Pain we are solving (primary)

**"Missing context — forgets the WHY behind a decision."**

Claude follows rules from memory but can't explain them, which means it can't judge edge cases. Cause: facts saved without reasons, snapshots that decay, contradictions between layers, duplication between memory and docs.

---

## Current state (audited 2026-05-11)

| Location | Files | Issue |
|---|---|---|
| `.claude/projects/c--…-Project/memory/` (root) | 15 | Mixes truly cross-project rules with FitEdge state + Realty Pandit Stage KRA references → cross-project pollution |
| `.claude/projects/c--…-sunny-sharma/memory/` | **53** | Bug-fix logs (5 dated files), status snapshots, KRA copies, ADR copies, plan copies — most violate "What NOT to save" |
| `.claude/projects/C--…-Bhardwaj/` (FitEdge) | — | OK in isolation, but FitEdge content also lives in root memory |
| `.claude/plans/` (global) | 13 | Mixes dated plans with cryptic auto-named files (`curious-wishing-scroll.md` etc.) — opaque without opening |
| `clients/sunny-sharma/projects/reality-pandit/docs/` | 115 | Already has decisions/, plans/, schema, etc. — partial structure, needs formalization |
| `Project/CLAUDE.md` | 1 | Mandates code-review-graph MCP; feedback memory says skip it → **direct contradiction**, loaded every session |

## Concrete problems identified

1. **Bug-fix log inflation** — 5 files of the form `project_bugs_fixed_<date>.md`. These are git-history-derivable event logs, explicitly forbidden by memory rules.
2. **Decaying snapshots** — `project_realty_pandit_session_progress.md`, `_workstream4_progress.md`, `_phase_a_bot_fixes_20260429.md`, `_phase_c_audit_20260429.md` — authoritative on day 1, misleading two weeks later.
3. **Duplication** — 6 stage KRAs documented in memory mirror the same KRAs in `/docs/plans/`. Edits drift.
4. **Cryptic plan names** — auto-generated codename files in `.claude/plans/` (e.g. the Deal Pipeline UI/UX plan executed today is named `curious-wishing-scroll.md`).
5. **Root↔feedback contradiction** — `CLAUDE.md` says "always use code-review-graph MCP tools before Grep/Read"; `feedback_skip_code_review_graph.md` says "skip them, they stall." Both load every conversation.
6. **Cross-project pollution** — `fitedge-state.md`, `fitedge-project.md`, `realty-pandit-state.md` all sit in the root memory dir, polluting unrelated project sessions.

---

## Design

### 1. Three-layer architecture

```
┌─ Layer 1 — CLAUDE.md (in-repo, project root) ──────────┐
│ • Standing rules that govern Claude                    │
│ • Pointers to /docs/ entry points                      │
│ • Loaded every session — keep tight                    │
└────────────────────────────────────────────────────────┘
                    ↓ points to
┌─ Layer 2 — /docs/ (in-repo, committed to git) ─────────┐
│ • SOURCE OF TRUTH for project knowledge                │
│ • What's built, why (ADRs), plans, runbooks, schemas   │
│ • Survives session resets, code-reviewable, versioned  │
└────────────────────────────────────────────────────────┘
                    ↑ memory only points to ↑
┌─ Layer 3 — auto-memory (.claude/projects/<...>/memory) ┐
│ • Index + pointers into /docs/                         │
│ • Durable feedback/preferences (Why-rich)              │
│ • NEVER duplicates /docs/ content                      │
└────────────────────────────────────────────────────────┘
```

**Core rule:** Memory is allowed to *reference* a /docs/ file, never *copy* its contents. When a stage KRA changes, exactly one file changes.

### 2. /docs/ canonical structure (Realty Pandit)

```
clients/sunny-sharma/projects/reality-pandit/docs/
├── README.md                     ← entry point + map of everything

├── architecture/                 ← "what's built" (durable facts)
│   ├── system-overview.md
│   ├── database-schema.md        (existing — move from /docs/DATABASE_SCHEMA.md)
│   ├── api-endpoints.md          (existing)
│   ├── frontend-components.md    (existing)
│   ├── llm-and-ai.md             (existing)
│   ├── whatsapp-voice-bot.md     (migrate from memory)
│   └── pages-and-routes.md       (existing)

├── decisions/                    ← ADRs — the "why"
│   ├── DEC-001-buyer-tenant-terminology.md   (existing)
│   ├── DEC-002-inventory-api-contract.md     (existing)
│   ├── DEC-003-deal-pipeline-unification.md  (existing)
│   └── DEC-NNN-…                 ← all new decisions live here; never in memory

├── plans/                        ← implementation plans (dated)
│   ├── YYYY-MM-DD-<feature>.md
│   └── (absorbs renamed ~/.claude/plans/* files into descriptive names)

├── runbooks/                     ← "how to do X" operational procedures
│   ├── deploy.md                 ← deploy-agent.js usage, paths, gotchas
│   ├── meta-template-approval.md ← WhatsApp template lifecycle
│   ├── pwa-cache-bust.md         ← service worker invalidation steps
│   └── inventory-null-agent-recovery.md

├── precautions/                  ← "do NOT do this" + why
│   ├── deployment-gotchas.md     ← nginx serving paths, build hash mismatch
│   ├── workflow-engine-traps.md  ← silent NULL agentId from /api/workflow/commit
│   └── prisma-where-or-pattern.md ← preserving visibility OR with new filter ANDs

├── backlog/
│   ├── PENDING.md                ← active pending tasks (cross-phase)
│   └── FUTURE_SKILLS.md          ← skills/tooling to adopt

├── tools-and-skills/
│   └── USED.md                   ← Playwright, deploy-agent, SSH, Prisma CLI, etc.

├── PROJECT_STATUS.md             ← LIVE status (replaces all decaying snapshot files)

└── archive/                      ← old bug logs + session snapshots
    └── 2026-04-bug-fixes-consolidated.md   ← merge of 5 dated bug-fix logs
```

**Naming:** ADRs use `DEC-NNN-<slug>.md`. Plans use `YYYY-MM-DD-<slug>.md`. Runbooks and precautions use kebab-case topic names.

### 3. Memory rules (the discipline)

#### Allowed memory types

| Type | Example | Why in memory (not /docs/) |
|---|---|---|
| **feedback** | "skip code-review-graph MCP — it stalls" | Cross-cutting rule about how Claude works |
| **reference** | "Realty Pandit ADRs live at `.../docs/decisions/`" | Pointer into /docs/ |
| **user** | "user prefers Discuss → Plan → Execute" | About the user, not the project |
| **project pointer** | "RP live status → see `/docs/PROJECT_STATUS.md`" | Tells Claude where to read state, not the state itself |

#### Forbidden in memory (these go to /docs/ or get deleted)

- Bug-fix logs → `/docs/archive/`
- Status snapshots → `/docs/PROJECT_STATUS.md` (single live file)
- KRA/ADR/plan copies → `/docs/plans/`, `/docs/decisions/`
- Architecture details → `/docs/architecture/`

#### Mandatory file format

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

**No Why = no save.** Hard rule. Resolves the primary pain point.

#### MEMORY.md index

- One line per entry, < 150 chars
- Format: `- [Title](file.md) — one-line hook explaining when to use`
- Total file < 100 lines
- No content lives in MEMORY.md itself

#### Cross-project pollution fix

- Move `fitedge-project.md`, `fitedge-state.md` → FitEdge memory dir
- Move `realty-pandit-state.md` content → `/docs/PROJECT_STATUS.md` + a pointer in Realty Pandit memory
- Root memory keeps only truly cross-project rules

#### Resolving the CLAUDE.md ↔ feedback contradiction

Edit `Project/CLAUDE.md` to remove the code-review-graph mandate (the MCP tool is unreliable; feedback memory has been telling Claude to skip it). Single source of truth restored.

### 4. Cleanup migration (three passes)

#### Pass 1 — Audit & classify (read-only)

For every file in the three memory locations + `.claude/plans/`, assign a verdict:

| Verdict | Action |
|---|---|
| Keep as-is | already feedback/reference with Why |
| Rewrite | good content, missing Why — add Why + How to apply |
| Migrate to /docs/ | move content, leave 1-line pointer in memory |
| Archive | merge into `/docs/archive/...-consolidated.md` |
| Delete | duplicate of /docs/ or stale snapshot |

**Output:** `migration-plan.md` listing every file + verdict. **User reviews before any changes.**

#### Pass 2 — Build /docs/ structure

- Create new subdirs: `architecture/`, `runbooks/`, `precautions/`, `backlog/`, `tools-and-skills/`, `archive/`
- Migrate file contents per Pass 1 verdicts
- Write two new docs from scratch:
  - `/docs/precautions/workflow-engine-traps.md` — silent NULL agentId trap (fixed 2026-05-11), Why + pattern to follow
  - `/docs/runbooks/deploy.md` — codify deploy-agent.js usage, server paths, PWA cache invalidation
- Consolidate 5 `project_bugs_fixed_*` files → `/docs/archive/2026-04-05-bug-fixes.md`

#### Pass 3 — Rewrite memory + indexes

- Rewrite every kept memory file in standard format with mandatory **Why**
- Rebuild MEMORY.md as one-line index
- Edit `Project/CLAUDE.md` to remove code-review-graph mandate
- Move cross-project pollution out of root memory

#### Verification

After all three passes complete, run a "cold question" test: pick 5 likely questions Claude might receive ("why does workflow commit reject expired tokens?", "how do I deploy frontend?", "what's the stage 2 cold-lead cadence?", etc.) and trace the answer chain. Each should resolve in ≤2 hops: memory pointer → /docs/ file → full Why. If any question takes >2 hops or hits a contradiction, fix the gap before declaring done.

---

## Expected impact

| Metric | Before | After |
|---|---|---|
| Realty Pandit memory files | 53 | 10–12 |
| Root project memory files | 15 | ~5 (cross-project only) |
| `.claude/plans/` cryptic names | 13 | 0 (renamed + moved to /docs/plans/) |
| `CLAUDE.md` ↔ memory contradictions | 1 known | 0 |
| Avg lookup hops for a "why" question | often >3 / contradictory | 1–2 |
| Memory files missing **Why** block | most | 0 |

---

## What this design explicitly does NOT do

- **Does not change project code.** No source files touched. Only memory, /docs/, CLAUDE.md.
- **Does not delete original content.** Bug-fix logs and snapshots are *archived*, not destroyed — preserved as a consolidated chronology in `/docs/archive/`.
- **Does not touch FitEdge code or memory beyond reclaiming the FitEdge files mis-located in root memory.**
- **Does not restructure Passion Sports memory** (separate, isolated, out of scope).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Migration drops a useful note that wasn't classified well | Pass 1 produces `migration-plan.md` for user review *before* changes |
| /docs/ structure churn breaks existing references | Use `git mv` for migrations; keep old paths until pointers updated |
| Memory becomes too sparse → Claude loses cross-cutting rules | Pass 3 verification step explicitly tests cold questions |
| FitEdge or Passion Sports work next session, memory restructure half-done | Migration done in one focused session per layer; checkpoint after each pass |

---

## Next step

After user approves this spec, invoke `writing-plans` to generate a step-by-step implementation plan with concrete file lists, commands, and verification checkpoints for each pass.
