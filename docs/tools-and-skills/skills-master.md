---
name: Installed Skills — Master Routing Guide
description: All 31 installed Claude skills with exact use-case triggers, location, and how they map to Realty Pandit tasks. ALWAYS consult this before any task.
type: reference
---

# Installed Skills — Master Routing Guide

**Location:** `~/.claude/skills/` (48 skills installed)
**Sources:** anthropics/skills (official), alirezarezvani/claude-skills (community), nextlevelbuilder/ui-ux-pro-max-skill, obra/superpowers

---

## SKILL ROUTING TABLE — When User Says X, Use Skill Y

### Testing & QA

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "test", "playwright", "e2e", "flaky test", "coverage", "migrate from cypress" | **playwright-pro** | 9 commands: `/pw:init`, `/pw:generate`, `/pw:review`, `/pw:fix`, `/pw:coverage`, `/pw:migrate`, `/pw:testrail`, `/pw:browserstack`, `/pw:report`. Has 55 templates for auth, CRUD, checkout, search, forms, dashboards. Use for property listing tests, lead form tests, admin panel tests, booking flow tests. |
| "test webapp", "test local server", "test with server running" | **webapp-testing** | Playwright + server lifecycle management via `scripts/with_server.py`. Can spin up website (port 3000) + backend (port 7071) simultaneously for testing. |
| "test api", "api test suite", "endpoint tests" | **api-test-suite-builder** | Generates comprehensive API test suites. Use for testing all 35+ backend routes. |
| "qa scan", "verify deploy", "browser check" | Use MCP tools directly | `mcp__realty-pandit-qa__qa_verify_task` for quick checks, playwright-pro for deep testing. |

### Security

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "security audit", "vulnerability", "scan code", "check for injection", "credential exposure" | **skill-security-auditor** | Static analysis: command injection (our `execSync` calls), credential exposure (Razorpay keys, SSH keys in env), prompt injection (Panditji bot inputs), supply chain risks (package.json). Run BEFORE deploys. |
| "dependency vulnerability", "outdated packages", "npm audit" | **dependency-auditor** | Scans package.json across website/backend/admin for vulnerable deps, typosquatting, unpinned versions. |

### Self-Improvement & Learning

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "review memory", "promote pattern", "extract skill", "memory health", "what have I learned" | **self-improving-agent** | `/si:review` — scan MEMORY.md for promotion candidates. `/si:promote` — graduate patterns to CLAUDE.md rules. `/si:extract` — turn proven patterns into reusable skills. `/si:status` — memory health metrics. `/si:remember` — save knowledge. |
| "create skill", "build a skill", "custom skill" | **skill-creator** | Full lifecycle: intent capture → draft SKILL.md → test → evaluate → improve → package. Use to create Realty Pandit-specific skills. |

### Frontend & Design (CRITICAL — see feedback_ui_quality.md)

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "design", "UI", "beautiful page", "landing page", "component", "styling", "make it look good", ANY page/component work | **ui-ux-pro-max** + **frontend-design** (BOTH) | **ui-ux-pro-max**: 161 reasoning rules, 67 UI styles, 161 color palettes, 57 font pairings, anti-AI-aesthetic checks, real-estate-specific patterns, Next.js guidelines. **frontend-design**: Production-grade UI composition. USE BOTH for every UI task. |
| "theme", "design tokens", "color system", "brand consistency" | **theme-factory** + **brand-guidelines** | theme-factory: 10 preset themes + custom generation. brand-guidelines: enforce visual consistency across all pages. |
| "poster", "visual art", "static design" | **canvas-design** | Beautiful visual art in PNG/PDF using design philosophy. |
| "generative art", "algorithmic art", "p5.js" | **algorithmic-art** | Generative art using p5.js with seeded randomness. |
| "web artifact", "interactive component", "shadcn" | **web-artifacts-builder** | Multi-component web artifacts with React + Tailwind + shadcn/ui. |
| "pdf report", "generate pdf", "property brochure" | **pdf** | Generate PDF documents — property reports, investor decks, lead summaries. |
| "excel", "spreadsheet", "export data", "lead export" | **xlsx** | Generate Excel files — lead exports, analytics reports, property comparisons. |
| "presentation", "deck", "pptx", "slides" | **pptx** | Generate PowerPoint — investor presentations, project showcases. |
| "word doc", "document", "proposal" | **docx** | Generate Word documents — contracts, proposals, agreements. |

### Backend & Architecture

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "database schema", "new table", "prisma model", "data model" | **database-designer** | Schema design with best practices. Use for Phase 7 Partner Marketplace tables (partners, commissions, referrals). Works with Prisma. |
| "api review", "api design", "endpoint consistency", "rest best practices" | **api-design-reviewer** | Review Express.js API design — naming, error handling, consistency across our 35+ route files. |
| "build mcp server", "new mcp tool", "mcp protocol" | **mcp-builder** (official) + **mcp-server-builder** (community) | Build new MCP servers. 4-phase: research → implement → test → evaluate. Use for building dedicated deploy MCP, lead management MCP, property search MCP. |
| "slow page", "performance", "optimize", "profiling", "lighthouse" | **performance-profiler** | Profile slow pages — property search with filters, map views, admin dashboard. |
| "design agent", "agent architecture", "multi-agent" | **agent-designer** | Design new agent architectures. Use when expanding our 15-agent system or building Phase 7 agents. |
| "rag", "retrieval", "knowledge base", "vector search" | **rag-architect** | RAG architecture design. Use for Panditji bot knowledge base or property search enhancement. |

### DevOps & Infrastructure

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "ci/cd", "pipeline", "github actions", "automated deploy" | **ci-cd-pipeline-builder** | Build proper CI/CD — GitHub Actions → test → deploy → verify. Replace our manual deploy agent with automated pipeline. |
| "release", "version", "tag", "deploy to production" | **release-manager** | Manage releases with proper versioning, tagging, rollback plans. |
| "changelog", "what changed", "release notes" | **changelog-generator** | Auto-generate changelogs from commit history / deploy history. |
| "runbook", "incident response", "on-call guide" | **runbook-generator** | Generate operational runbooks for server maintenance, incident response. |
| "monitoring", "observability", "logging", "alerting" | **observability-designer** | Design monitoring/alerting for our Express.js backend, PM2 processes, Redis, BullMQ queues. |

### Code Review & Quality

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "review pr", "code review", "review changes" | **pr-review-expert** | Thorough PR review — logic, security, performance, style. |
| "browser automate", "scrape", "web automation" | **browser-automation** | Playwright-based browser automation beyond testing — scraping, data extraction. |
| "what will break", "impact of change", "blast radius", "affected files", "dependency graph", "codebase map" | **code-review-graph** (pip install) | Builds knowledge graph of entire codebase. Blast-radius analysis — change one file, see all affected routes/services/agents. 8.2x token reduction. MCP-integrated. Critical for Realty Pandit (80+ routes, 26 models, 14 agents). Install: `pip install code-review-graph && code-review-graph install && code-review-graph build` |

### Development Workflow (from superpowers)

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "brainstorm", "think through", "explore options", "before building" | **brainstorming** | Socratic design refinement BEFORE coding. Use before any creative/feature work. |
| "plan", "break down task", "implementation plan" | **writing-plans** | Break work into 2-5 min tasks with exact file paths. Use before multi-step work. |
| "execute plan", "run the plan" | **executing-plans** | Batch execution with human checkpoints. |
| "parallel tasks", "independent work" | **dispatching-parallel-agents** + **subagent-driven-development** | Dispatch subagents per task with two-stage review. |
| "debug", "bug", "unexpected behavior" | **systematic-debugging** | 4-phase root cause process — use BEFORE proposing fixes. |
| "tdd", "test first", "red green refactor" | **test-driven-development** | RED-GREEN-REFACTOR enforcement. |
| "verify", "is it done", "confirm working" | **verification-before-completion** | Run verification commands and confirm output BEFORE claiming success. |

### Documentation & Communication

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "write doc", "proposal", "spec", "decision doc" | **doc-coauthoring** | Structured co-authoring workflow for docs, proposals, specs. |
| "internal update", "status report", "leadership update" | **internal-comms** | Internal communications — status reports, leadership updates. |

### Marketing & SEO

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "seo", "content strategy", "social media", "email campaign", "conversion", "marketing" | **marketing-skill** | 42 skills in 7 pods: Content (8), SEO (5), CRO (6), Channels (5), Growth (4), Intelligence (4), Sales (2). Includes 27 Python CLI tools. **SEO Pod** for technical SEO, AI search optimization (AEO/GEO), schema markup for property listings. **CRO Pod** for lead form optimization, booking flow conversion. **Content Pod** for blog strategy, social media content. |

### Product & Project Management

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "product roadmap", "prioritize", "prd", "user story", "sprint", "okr", "persona" | **product-team** | RICE prioritization, PRD generation, user stories, OKR cascading, persona development. Use for Phase 7 planning. |
| "project plan", "scrum", "jira", "confluence", "sprint planning" | **project-management** | Senior PM, Scrum Master, Jira, Confluence expertise. 6 production-ready skills. |

### Business & Growth

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "customer success", "revenue", "sales", "growth strategy" | **business-growth** | Customer success, sales engineering, revenue ops, contracts/proposals. |

### API & SDK

| Trigger Keywords | Skill | What It Does |
|-----------------|-------|-------------|
| "claude api", "anthropic sdk", "build with claude" | **claude-api** | Build applications with Claude API / Anthropic SDK. Use if adding Claude-powered features to Realty Pandit. |

---

## COMBINED WORKFLOW: How Skills + Agents Work Together

### Example: "Build the Partner Marketplace page"
1. **product-team** → Create PRD, user stories, prioritize features (RICE)
2. **database-designer** → Design Partner, Commission, Referral models (Prisma)
3. **frontend-design** → Design premium marketplace UI (avoid AI slop)
4. **api-design-reviewer** → Review new API endpoints
5. **skill-security-auditor** → Audit new code before deploy
6. **Deploy Agent** → `mcp__realty-pandit-qa__deploy("website")`
7. **playwright-pro** → `/pw:generate` tests for new pages
8. **Browser QA** → `mcp__realty-pandit-qa__qa_verify_task`

### Example: "Fix the slow property search page"
1. **performance-profiler** → Identify bottlenecks
2. **Backend Agent** → Fix query/API issues
3. **Frontend Agent** → Fix rendering issues
4. **Deploy Agent** → Deploy both
5. **webapp-testing** → Test with both servers
6. **Browser QA** → Verify

### Example: "Improve our SEO"
1. **marketing-skill** (SEO Pod) → Technical audit, AI search optimization
2. **SEO Agent** → Generate meta tags, JSON-LD, sitemap
3. **marketing-skill** (Content Pod) → Blog content strategy
4. **Deploy Agent** → Deploy changes
5. **Browser QA** → Verify

### Example: "Security check before launch"
1. **skill-security-auditor** → Full codebase audit
2. **dependency-auditor** → Package vulnerability scan
3. **Security Agent** → Rate limiters, JWT, CORS check
4. **api-test-suite-builder** → Test all auth endpoints
5. Generate report

---

## SKILL MAINTENANCE

- **Source repos cloned to:** `/tmp/` (temporary, re-clone as needed)
- **To update skills:** Re-clone repos and re-copy to `~/.claude/skills/`
- **To add new skills:** Copy folder to `~/.claude/skills/` and update this memory file
- **Repos:**
  - https://github.com/anthropics/skills (17 official skills)
  - https://github.com/alirezarezvani/claude-skills (205 community skills)
  - https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (UI/UX design intelligence)
  - https://github.com/obra/superpowers (dev workflow — planning, TDD, debugging)
