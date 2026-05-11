# Automated GlitchTip Error Intelligence System — Realty Pandit

## Context

GlitchTip is now live at `https://errors.realtypandit.in` with 4 projects (Main Website, Agents Website, Admin CRM, Backend). The problem: errors accumulate in GlitchTip but Claude only knows about them when told. The goal is a zero-effort system where:

1. A nightly script fetches all unresolved production errors from GlitchTip
2. Maps each error to its exact source file + line number in the codebase
3. Reads surrounding code context automatically
4. Generates a fix hint based on error type
5. Writes a structured memory file Claude reads at session start
6. Result: user opens Claude, says "fix last night's errors", Claude already knows exactly what and where — no investigation needed

---

## Architecture Overview

```
[GlitchTip API] → [glitchtip-digest.js] → [glitchtip_errors.md in Claude memory]
                         ↓
               [reports/latest-glitchtip.json]  ← MCP QA tool can serve on demand
```

The digest script runs locally (like the existing `agents/monitor/run.js`) on a Windows Task Scheduler nightly job. It writes to two places:
- Claude's memory directory → loaded automatically at every session start
- Monitor reports directory → MCP QA tool can surface it on demand

---

## Phase 1 — GlitchTip API Token

**Why:** The GlitchTip REST API requires an auth token. CSRF blocks basic auth via curl. Must create via Django shell on the server.

**One-time setup (no local file changes):**
```bash
docker compose exec web python manage.py shell -c "
from users.models import AuthToken
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.get(email='realtypandit2026@gmail.com')
token = AuthToken.objects.create(user=user, label='monitor-digest')
print(token.token if hasattr(token,'token') else token.key)
"
```

Store token in: `agents/monitor/.env.monitor` (gitignored):
```
GLITCHTIP_TOKEN=<token-from-above>
GLITCHTIP_URL=https://errors.realtypandit.in
GLITCHTIP_ORG=realty-pandit
```

---

## Phase 2 — The Digest Script

**File to create:** `agents/monitor/glitchtip-digest.js` (~250 lines, no dependencies beyond Node.js built-ins)

### Step 1 — Fetch issues from all 4 projects

```
GET /api/0/projects/realty-pandit/{slug}/issues/
    ?query=is:unresolved&sort=-lastSeen&limit=25
    Authorization: Bearer <token>
```

Projects:
| Slug | Display Name |
|------|-------------|
| `realty-pandit-website` | Main Website |
| `realty-pandit-agents-website` | Agents Website |
| `realty-pandit-admin` | Admin CRM |
| `realty-pandit-backend` | Backend |

Fields extracted per issue:
- `id`, `title`, `culprit`, `level`, `status`
- `count`, `userCount`, `firstSeen`, `lastSeen`, `permalink`
- `metadata.filename`, `metadata.function`, `metadata.value`, `metadata.type`

### Step 2 — Map culprit to local source file

Each error's `metadata.filename` is a partial path (e.g. `routes/agent.ts`). Map using app roots:

```javascript
const APP_ROOTS = {
  'realty-pandit-website':
    'C:/Users/Varchasv Bhardwaj/Project/realty-pandit/website/src',
  'realty-pandit-agents-website':
    'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/website/src',
  'realty-pandit-admin':
    'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend/src',
  'realty-pandit-backend':
    'C:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/src',
};
```

Algorithm:
1. Try `path.join(APP_ROOTS[project], metadata.filename)` — if file exists, use it
2. If not found → glob search for filename across the app root
3. If still not found → mark as `[file not located]` and continue

### Step 3 — Read source code context (8 lines)

If file + line number resolved:
```javascript
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const errorLine = parseInt(lineNumber) - 1;
const start = Math.max(0, errorLine - 3);
const end = Math.min(lines.length, errorLine + 4);
const context = lines.slice(start, end).map((l, i) => {
  const num = start + i + 1;
  const marker = (start + i) === errorLine ? '→' : ' ';
  return `${String(num).padStart(4)} ${marker} ${l}`;
}).join('\n');
```

This gives 3 lines before + error line (marked with →) + 3 lines after. Claude reads this without opening any file.

### Step 4 — Generate fix hint

Pattern-match on `title` + `metadata.type`:

```javascript
const HINTS = [
  [/cannot read prop|of null|of undefined/i,
    'Null/undefined object — add guard before property access'],
  [/is not a function/i,
    'Missing or wrong import — verify function is exported and imported correctly'],
  [/failed to fetch|network error|econnrefused/i,
    'API/service unreachable — check CORS config and whether the target process is running'],
  [/chunkloaderror/i,
    'Stale JS chunk after deploy — user needs hard refresh; ensure old chunks are purged'],
  [/unexpected token|json\.parse/i,
    'JSON parse error — API returned HTML/error page instead of JSON; check API error handler'],
  [/maximum update depth/i,
    'Infinite render loop — audit useEffect dependency array for missing or wrong deps'],
  [/hydration/i,
    'SSR/CSR mismatch — isolate browser-only code behind typeof window check'],
  [/prisma|p\d{4}|database|pg error/i,
    'Database error — check query params, connection pool size, and Postgres logs'],
  [/jwt|jsonwebtoken|invalid token/i,
    'Auth token issue — check expiry, signing secret match, and Authorization header format'],
  [/timeout|etimedout/i,
    'Operation timed out — check DB query cost, add index, or increase timeout threshold'],
];
```

### Step 5 — Score and prioritize

```javascript
const score = (level === 'fatal'  ? 1000 : 0)
            + (level === 'error'  ?  100 : 0)
            + (level === 'warning'?   10 : 0)
            + (count * 2)
            + (userCount * 5)
            + (hoursAgo < 24 ? 50 : 0);   // recency bonus

// Classify:
// score >= 200  → CRITICAL
// score  50-199 → HIGH
// score  < 50   → LOW
```

### Step 6 — Write two output files

**Output A — Claude memory:**
`C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/glitchtip_errors.md`

**Output B — MCP reports:**
`agents/monitor/reports/latest-glitchtip.json`

---

## Phase 3 — Memory File Format

**File:** `memory/glitchtip_errors.md`

```markdown
---
name: GlitchTip Error Digest
description: Auto-updated nightly — unresolved production errors ranked by severity + impact
type: project
updated: 2026-04-16T00:00:00+05:30
---

> Last run: 2026-04-16 00:00 IST | 4 apps | 2 CRITICAL · 4 HIGH · 6 LOW · 0 new since last digest

---

## CRITICAL — Fix This Session

### [Backend] TypeError: Cannot read properties of undefined (reading 'name')
- **App**: `agents/backend`
- **File**: `agents/backend/src/routes/agent.ts:417`
- **Function**: `getAgentDetails`
- **Impact**: 89 occurrences · 34 users · last seen 2h ago
- **Fix hint**: Null/undefined object — add guard before property access
- **Code context**:
```
 415   const agent = await prisma.agent.findUnique({ where: { id } });
 416   // agent can be null if ID doesn't exist in DB
 417 → const name = agent.name;   // CRASH: agent is null
 418   res.json({ name, email: agent.email });
```
- **GlitchTip**: https://errors.realtypandit.in/realty-pandit/issues/7/

---

## HIGH — Fix This Week

...

## LOW — Monitor Only

...

## Resolved Since Last Digest

- ~~[Backend] ECONNREFUSED Redis~~ — closed 2026-04-15
```

**Design decisions:**
- `updated` frontmatter → Claude checks staleness at session start
- One-line header → session summary before reading details
- Code context embedded → Claude never needs to open the file
- Fix hint → Claude knows the pattern to apply, not just where to look
- Resolved section → Claude knows what's already been handled
- Full GlitchTip URL → can mark resolved after fixing

---

## Phase 4 — MEMORY.md Update

Add this section to `memory/MEMORY.md`:

```markdown
## Live Error Digest (auto-updated nightly at midnight)
→ See [glitchtip_errors.md](glitchtip_errors.md) — production errors with file, line, code context, and fix hint
**SESSION RULE**: Read the `updated` timestamp. If within 48h — mention error count to user at session start.
If stale (>3 days) — suggest running the digest manually.
```

---

## Phase 5 — Windows Task Scheduler

Register nightly job at midnight IST via PowerShell (run once):

```powershell
$action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "glitchtip-digest.js" `
  -WorkingDirectory "C:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\agents\monitor"

$trigger = New-ScheduledTaskTrigger -Daily -At "00:00"

Register-ScheduledTask `
  -TaskName "RealtypanditGlitchtipDigest" `
  -Action $action -Trigger $trigger `
  -RunLevel Highest -Force
```

If machine is off at midnight → runs on next startup automatically.

---

## Phase 6 — On-Demand MCP Tool

**File to edit:** `agents/browser-qa/mcp-server.js` (existing MCP server)

Add one new tool so Claude can trigger a fresh fetch mid-session:

```javascript
server.tool(
  'glitchtip_digest',
  'Fetch a fresh GlitchTip error digest right now and update Claude memory',
  {},
  async () => {
    const { execSync } = require('child_process');
    execSync('node glitchtip-digest.js', {
      cwd: path.join(__dirname, '../monitor'),
      stdio: 'pipe'
    });
    const report = fs.readFileSync(
      path.join(MEMORY_DIR, 'glitchtip_errors.md'), 'utf8'
    );
    return { content: [{ type: 'text', text: report }] };
  }
);
```

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `agents/monitor/glitchtip-digest.js` | CREATE | Main digest script |
| `agents/monitor/.env.monitor` | CREATE | GlitchTip token (gitignored) |
| `agents/monitor/.gitignore` | EDIT | Add `.env.monitor` |
| `memory/glitchtip_errors.md` | CREATE (by script) | Nightly error digest for Claude |
| `memory/MEMORY.md` | EDIT | Add pointer + session rule |
| `agents/browser-qa/mcp-server.js` | EDIT | Add on-demand `glitchtip_digest` tool |

---

## Verification Steps

1. Run `node agents/monitor/glitchtip-digest.js` manually
2. Confirm `memory/glitchtip_errors.md` is created with correct structure
3. Confirm test errors sent during setup appear in the digest
4. Open a new Claude session → verify digest is visible in context
5. Say "what are the current production errors?" → Claude answers from memory, no file searching
6. Call `glitchtip_digest` MCP tool → returns fresh data
7. Verify Task Scheduler: `Get-ScheduledTask -TaskName "RealtypanditGlitchtipDigest"`
8. Manually resolve an issue in GlitchTip UI → next digest run shows it in Resolved section

---

## End State — What This Feels Like

```
You: "What broke last night?"

Claude (reads glitchtip_errors.md — already in memory):
"2 critical errors since yesterday:

1. agents/backend/src/routes/agent.ts:417
   TypeError on agent.name — null check missing after DB query
   89 hits, 34 users. Fix: add `if (!agent) return res.status(404)...`

2. realty-pandit/website/src/components/PropertyCard.tsx:82
   ChunkLoadError — stale JS bundle after last deploy
   12 hits. Fix: purge old chunks or bump cache headers.

Fix both now?"
```

Zero file searching. Zero investigation. Straight to fixing.
