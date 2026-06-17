---
name: Master Operating Rules
description: The single source of truth for how Claude operates on ALL tasks — workflow stages, skill routing, project isolation, zero-hallucination rules
type: feedback
---

# MASTER OPERATING RULES
## Read this at the start of EVERY session. No exceptions.

---

## RULE 1 — DEFAULT STATE IS ASK/DISCUSS MODE

Claude is ALWAYS in Ask/Discuss mode unless the user explicitly says otherwise.

In Ask/Discuss mode:
- ✅ Read files, search code, investigate, answer questions
- ✅ Fetch URLs, check server, inspect memory
- ❌ NO code writing
- ❌ NO file edits
- ❌ NO planning mode activation
- ❌ NO tool calls that modify anything

**Stage transition signals from user:**
- "plan it" / "make a plan" → enter Plan mode
- "do it" / "go ahead" / "execute" / "start" / "build it" → enter Execute mode
- "discuss" / "what do you think" / "check" / "investigate" → stay in Ask mode

---

## RULE 2 — 3-STAGE WORKFLOW (NON-NEGOTIABLE)

Every task, every time, no shortcuts:

```
STAGE 1: ASK / DISCUSS
  → Read memory → Understand the ask → Investigate codebase → Align with user
  → DO NOT write code

STAGE 2: PLAN
  → Use writing-plans skill
  → List exact files to change, steps, risks
  → Get user confirmation before proceeding

STAGE 3: EXECUTE + DEPLOY + VERIFY
  → Write code using correct skills
  → Deploy
  → Screenshot before + after (webapp-testing)
  → Self-heal if broken (max 3x)
  → Show proof
```

---

## RULE 3 — PROJECT ISOLATION (ZERO CROSS-CONTAMINATION)

Two active projects. They share NOTHING.

| Project | Client | Path | Stack | Memory Location |
|---------|--------|------|-------|----------------|
| **Realty Pandit** | Sunny Sharma | `clients/sunny-sharma/projects/reality-pandit/` | Node.js + Next.js + PostgreSQL | `c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/` |
| **FitEdge** | Sharwan Rai | `clients/fitedge/projects/domains/` | PHP + MySQL + Hostinger FTP | `C--Users-Varchasv-Bhardwaj/memory/` |

**Rules:**
- When working on Realty Pandit → ONLY touch `clients/sunny-sharma/` paths
- When working on FitEdge → ONLY touch `clients/fitedge/` paths
- Never import patterns, code, or configs from one project into another
- Never use Realty Pandit's server/DB credentials for FitEdge (different hosting entirely)

---

## RULE 4 — SKILL AUTO-ROUTING

Pick skills AUTOMATICALLY based on task type. Never ask user which skill to use.

### Task → Skill Map

| What the task is | Skills to invoke |
|-----------------|-----------------|
| Any UI work (page, component, styling) | `ui-ux-pro-max` + `frontend-design` + `webapp-testing` (screenshot proof) |
| New feature from scratch | `brainstorming` → `writing-plans` → `test-driven-development` → `executing-plans` |
| Bug / unexpected behavior | `systematic-debugging` (4-phase: observe → hypothesize → test → fix) |
| Before claiming work is done | `verification-before-completion` + `webapp-testing` screenshot |
| E2E / browser tests | `playwright-pro` |
| API endpoint design | `api-design-reviewer` |
| API test suite | `api-test-suite-builder` |
| DB schema / Prisma model | `database-designer` |
| Code review / PR review | `pr-review-expert` + `code-review-graph` (blast radius) |
| Impact analysis before editing | `code-review-graph` (which files break?) |
| Parallel independent tasks | `dispatching-parallel-agents` |
| Multi-step implementation | `subagent-driven-development` or `executing-plans` |
| Performance / Lighthouse | `performance-profiler` |
| Security scan | `skill-security-auditor` + `dependency-auditor` |
| Memory curation | `self-improving-agent` |
| MCP server | `mcp-builder` + `mcp-server-builder` |
| CI/CD pipeline | `ci-cd-pipeline-builder` |
| Generate PDF/Excel/PPTX/DOCX | `pdf` / `xlsx` / `pptx` / `docx` |
| RAG / vector search | `rag-architect` |
| Agent architecture | `agent-designer` |
| Monitoring / logging | `observability-designer` |
| Changelog / release notes | `changelog-generator` + `release-manager` |

---

## RULE 5 — NO HALLUCINATION PROTOCOL

Before stating any fact about the codebase:
1. **Read the file** — don't assume from memory alone
2. **Check memory age** — if memory is >7 days old, verify against current code
3. **Never invent file paths, function names, or API routes** — grep/glob first
4. **If unsure** — say "let me check" and use the tools, don't guess

For Realty Pandit: always read `PROJECT_KNOWLEDGE.md` first in new sessions.

---

## RULE 6 — VISUAL VERIFICATION IS MANDATORY

For ANY UI change:
1. Screenshot the BEFORE state with `webapp-testing`
2. Make the change
3. Deploy
4. Screenshot the AFTER state
5. Show both screenshots to user as proof
6. If it looks AI-generated (generic gradients, purple/pink, cookie-cutter) → fix it

No exceptions. "Looks like it should work" is not acceptable. Show the screen.

---

## RULE 7 — SELF-HEALING LOOP

If deploy/verify fails:
1. Read the error carefully
2. Fix root cause (not symptoms)
3. Re-deploy
4. Re-verify
5. Max 3 attempts, then stop and explain to user

Never use `--no-verify`, `--force`, or skip hooks.

---

## RULE 8 — MEMORY DISCIPLINE & SELF-CORRECTION

- Save corrections immediately as feedback memories (never repeat same mistake)
- Save new project facts to the correct project's memory dir
- Never mix project memories
- Read `skills_master.md` before any task to route correctly
- Run `self-improving-agent` periodically to promote patterns

**Self-Correction (CRITICAL):**
- When user corrects an approach → save it IMMEDIATELY as the only correct way
- Before suggesting anything → check memory for past corrections on that topic
- If a correction exists → follow user's way, don't suggest the old way again
- Every correction from user is permanent — not a one-time fix, a forever lesson
- See `feedback_self_correction.md` for full protocol

---

## RULE 9 — MCP SERVERS (Verified 2026-04-06)

All configured in `C:/Users/Varchasv Bhardwaj/Project/.mcp.json`:

| MCP Server | Status | What it does |
|-----------|--------|-------------|
| `code-review-graph` | ✅ Connected | Codebase knowledge graph — blast radius, impact analysis, semantic search |
| `playwright-browser` | ✅ Connected | Browser automation — screenshots, clicks, form fills, devtools |
| `realty-pandit-qa` | ✅ Connected | Realty Pandit deploy + QA verify + server health |
| `stitch` | ❌ Failed (auth) | Google Stitch UI design — needs `gcloud auth login` |
| `claude.ai Figma` | ✅ Connected | Figma design context (built-in) |
| `claude.ai Gmail` | ✅ Connected | Gmail read/draft (built-in) |
| `claude.ai Google Calendar` | ✅ Connected | Calendar events (built-in) |

---

## RULE 10 — COMMUNICATION STYLE

- Concise — no trailing summaries, no "I have completed..." wrap-ups
- Show proof (screenshots, terminal output) not just words
- Reference which skill handled which part
- Voice input = may have typos — interpret intent
- Short high-level commands = Claude fills in the details from memory
