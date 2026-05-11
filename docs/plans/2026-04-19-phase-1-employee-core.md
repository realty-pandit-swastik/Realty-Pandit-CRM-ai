# Phase 1: Panditji Voice — Employee Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable an Employee calling Panditji to retrieve their own leads, appointments, tasks, search a specific lead, schedule callbacks, log call notes, and trigger WhatsApp confirmations — entirely by voice, with gender-aware Hindi grammar and dynamic language preference tracking.

**Architecture:** Gemini Live tool calling from Pipecat → HTTP calls to new `/webhooks/internal/tools/*` endpoints on Node backend → Prisma queries against existing schema + 2 new Agent columns (`gender`, `preferred_language`). Permission enforcement lives in a single `toolPermission.ts` service. Language preference auto-updates at call end based on detected conversation language.

**Tech Stack:** Node.js + Express + Prisma (Postgres), TypeScript, Vitest for backend tests. Python + Pipecat 1.0.0 + Gemini Live for voice. No new dependencies required.

---

## File Structure

**Node backend (TypeScript):**
- Create: `agents/backend/src/routes/internal_tools.ts` — router for all Panditji tool endpoints
- Create: `agents/backend/src/services/tool_permission.ts` — role-based permission enforcement
- Create: `agents/backend/src/services/tool_language.ts` — language detection from transcript + update logic
- Create: `agents/backend/src/__tests__/tool_permission.test.ts`
- Create: `agents/backend/src/__tests__/internal_tools.test.ts`
- Create: `agents/backend/prisma/migrations/20260419_agent_gender_language/migration.sql`
- Modify: `agents/backend/prisma/schema.prisma` — add gender + preferred_language columns
- Modify: `agents/backend/src/app.ts` — mount internal_tools router
- Modify: `agents/backend/src/routes/webhooks.ts` — update caller-lookup to return gender + preferred_language; call language tracker at call-ended

**Pipecat (Python):**
- Create: `agents/pipecat/tools.py` — tool definitions + HTTP client + Gemini Live tool handler
- Create: `agents/pipecat/prompts/panditji_team_member.txt` — team-scoped prompt with tool usage instructions
- Modify: `agents/pipecat/pipeline.py` — wire tools into GeminiLiveLLMService, route prompt based on CALLER_TYPE, track language during call
- Modify: `agents/pipecat/prompts/panditji.txt` — add note about team-member routing

---

## Task 1: Add gender + preferred_language to Agent Schema

**Files:**
- Modify: `agents/backend/prisma/schema.prisma`
- Create: `agents/backend/prisma/migrations/20260419_agent_gender_language/migration.sql`

- [ ] **Step 1: Add the columns to Prisma schema**

Open `agents/backend/prisma/schema.prisma`, find the `Agent` model, and add two fields after `status`:

```prisma
model Agent {
  // ... existing fields ...
  status String @default("active")

  // Panditji voice bot — enable gender-aware Hindi grammar
  gender             String @default("unknown") // male, female, unknown
  preferred_language String @default("hi_en")   // hi, en, hi_en — auto-learned from voice calls

  // ... rest unchanged ...
}
```

- [ ] **Step 2: Create migration SQL**

Create the directory and file:

```bash
mkdir -p agents/backend/prisma/migrations/20260419_agent_gender_language
```

Create `agents/backend/prisma/migrations/20260419_agent_gender_language/migration.sql`:

```sql
ALTER TABLE "agents"
  ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "preferred_language" TEXT NOT NULL DEFAULT 'hi_en';
```

- [ ] **Step 3: Apply the migration**

Run from `agents/backend/`:

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: "1 migration applied" and Prisma Client regenerated.

- [ ] **Step 4: Verify in DB**

```bash
npx prisma studio
```

Confirm the `agents` table now has `gender` and `preferred_language` columns. Close studio.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/prisma/schema.prisma agents/backend/prisma/migrations/20260419_agent_gender_language/
git commit -m "feat(schema): add gender + preferred_language to Agent for voice grammar"
```

---

## Task 2: Create Tool Permission Service

**Files:**
- Create: `agents/backend/src/services/tool_permission.ts`
- Create: `agents/backend/src/__tests__/tool_permission.test.ts`

- [ ] **Step 1: Write failing tests**

Create `agents/backend/src/__tests__/tool_permission.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        agent: { findFirst: vi.fn() },
    },
}));

import { resolveCaller, canAccess } from '../services/tool_permission';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

describe('resolveCaller', () => {
    it('returns agent record with normalized phone variants', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({
            id: 'a1', name: 'Rohan', role: 'employee', status: 'active',
            phone: '+919958860411', gender: 'male', preferred_language: 'hi_en',
        });
        const caller = await resolveCaller('919958860411');
        expect(caller).toMatchObject({ id: 'a1', role: 'employee' });
    });

    it('returns null for unknown number', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        const caller = await resolveCaller('919000000000');
        expect(caller).toBeNull();
    });

    it('returns null for inactive agent', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null); // where clause includes status=active
        const caller = await resolveCaller('919958860411');
        expect(caller).toBeNull();
    });
});

describe('canAccess', () => {
    const employee = { role: 'employee' } as any;
    const manager = { role: 'manager' } as any;
    const superBoss = { role: 'super_boss' } as any;

    it('employee can use own-data tools', () => {
        expect(canAccess(employee, 'get_my_leads')).toBe(true);
        expect(canAccess(employee, 'schedule_callback')).toBe(true);
    });

    it('employee cannot use manager tools', () => {
        expect(canAccess(employee, 'reassign_lead')).toBe(false);
        expect(canAccess(employee, 'get_unassigned_leads')).toBe(false);
        expect(canAccess(employee, 'get_team_performance')).toBe(false);
    });

    it('employee cannot use super_boss tools', () => {
        expect(canAccess(employee, 'get_company_metrics')).toBe(false);
    });

    it('manager can use manager + own tools', () => {
        expect(canAccess(manager, 'reassign_lead')).toBe(true);
        expect(canAccess(manager, 'get_team_performance')).toBe(true);
        expect(canAccess(manager, 'get_my_leads')).toBe(true);
    });

    it('manager cannot use super_boss tools', () => {
        expect(canAccess(manager, 'get_company_metrics')).toBe(false);
    });

    it('super_boss can use everything', () => {
        expect(canAccess(superBoss, 'get_company_metrics')).toBe(true);
        expect(canAccess(superBoss, 'reassign_lead')).toBe(true);
        expect(canAccess(superBoss, 'get_my_leads')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd agents/backend && npx vitest run src/__tests__/tool_permission.test.ts
```

Expected: FAIL with "Cannot find module '../services/tool_permission'".

- [ ] **Step 3: Implement the service**

Create `agents/backend/src/services/tool_permission.ts`:

```typescript
import prisma from '../db';
import { phoneVariants } from '../utils/phone';

export interface ResolvedCaller {
    id: string;
    name: string;
    phone: string;
    email: string;
    role: 'employee' | 'manager' | 'super_boss';
    department: string | null;
    gender: 'male' | 'female' | 'unknown';
    preferred_language: 'hi' | 'en' | 'hi_en';
    tenant_id: string;
}

const EMPLOYEE_TOOLS = new Set([
    'get_my_leads',
    'get_my_appointments',
    'get_my_tasks',
    'search_lead',
    'schedule_callback',
    'log_call_note',
    'send_on_whatsapp',
]);

const MANAGER_TOOLS = new Set([
    'get_team_performance',
    'get_unassigned_leads',
    'reassign_lead',
    'get_pipeline_overview',
]);

const SUPER_BOSS_TOOLS = new Set(['get_company_metrics']);

export async function resolveCaller(phone: string): Promise<ResolvedCaller | null> {
    const variants = phoneVariants(phone);
    const agent = await prisma.agent.findFirst({
        where: { phone: { in: variants }, status: 'active' },
        select: {
            id: true, name: true, phone: true, email: true, role: true,
            department: true, gender: true, preferred_language: true, tenant_id: true,
        },
    });
    if (!agent || !agent.phone) return null;
    return agent as ResolvedCaller;
}

export function canAccess(caller: ResolvedCaller, toolName: string): boolean {
    if (caller.role === 'super_boss') return true;
    if (caller.role === 'manager') {
        return EMPLOYEE_TOOLS.has(toolName) || MANAGER_TOOLS.has(toolName);
    }
    if (caller.role === 'employee') {
        return EMPLOYEE_TOOLS.has(toolName);
    }
    return false;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/tool_permission.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/services/tool_permission.ts agents/backend/src/__tests__/tool_permission.test.ts
git commit -m "feat(tools): add caller resolution + role-based permission service"
```

---

## Task 3: Create internal_tools Router (Skeleton + Mount)

**Files:**
- Create: `agents/backend/src/routes/internal_tools.ts`
- Modify: `agents/backend/src/app.ts`

- [ ] **Step 1: Create the router skeleton**

Create `agents/backend/src/routes/internal_tools.ts`:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { resolveCaller, canAccess, ResolvedCaller } from '../services/tool_permission';

const router = Router();

// Middleware: resolve caller from ?caller=+91xxx and attach to req
async function resolveCallerMiddleware(req: Request, res: Response, next: NextFunction) {
    const phone = (req.query.caller || req.body?.caller) as string | undefined;
    if (!phone) {
        res.status(400).json({ ok: false, error: 'caller phone required' });
        return;
    }
    const caller = await resolveCaller(phone);
    if (!caller) {
        res.status(403).json({ ok: false, error: 'caller not recognized' });
        return;
    }
    (req as any).caller = caller;
    next();
}

// Middleware factory: enforces permission for the named tool
function requireTool(toolName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const caller: ResolvedCaller = (req as any).caller;
        if (!canAccess(caller, toolName)) {
            logger.warn(`[Tools] ${caller.phone} (${caller.role}) denied access to ${toolName}`);
            res.status(403).json({ ok: false, error: 'permission denied' });
            return;
        }
        next();
    };
}

router.use(resolveCallerMiddleware);

// Tool endpoints will be registered in subsequent tasks

export { router, requireTool };
export default router;
```

- [ ] **Step 2: Mount in app.ts**

Find in `agents/backend/src/app.ts` the section where routes are mounted (around line 245). Add after `app.use('/webhooks', webhookLimiter, webhookRoutes);`:

```typescript
import internalToolsRouter from './routes/internal_tools';
// ...
app.use('/webhooks/internal/tools', webhookLimiter, internalToolsRouter);
```

- [ ] **Step 3: Write integration test for skeleton**

Create `agents/backend/src/__tests__/internal_tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../db', () => ({
    default: {
        agent: { findFirst: vi.fn() },
    },
}));

import app from '../app';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

describe('internal_tools router skeleton', () => {
    it('returns 400 when caller phone missing', async () => {
        const res = await request(app).get('/webhooks/internal/tools/my-leads');
        expect(res.status).toBe(400);
    });

    it('returns 403 when caller not in agents table', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        const res = await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919000000000');
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 4: Run test — expect 404 (endpoint not yet defined)**

```bash
npx vitest run src/__tests__/internal_tools.test.ts
```

Expected: tests fail because the `/my-leads` endpoint does not exist yet. That is fine — proceed to Task 4 where we build it. Keep the test file and let it guide Task 4 in TDD.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/internal_tools.ts agents/backend/src/app.ts agents/backend/src/__tests__/internal_tools.test.ts
git commit -m "feat(tools): add internal_tools router skeleton with caller resolution"
```

---

## Task 4: Build `get_my_leads` Tool

**Files:**
- Modify: `agents/backend/src/routes/internal_tools.ts`
- Modify: `agents/backend/src/__tests__/internal_tools.test.ts`

- [ ] **Step 1: Add test cases**

Append to `agents/backend/src/__tests__/internal_tools.test.ts`:

```typescript
vi.mock('../db', async () => {
    const actual: any = await vi.importActual('../db');
    return {
        default: {
            ...actual.default,
            agent: { findFirst: vi.fn() },
            lead: { findMany: vi.fn() },
        },
    };
});

describe('GET /webhooks/internal/tools/my-leads', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => {
        (prisma.agent.findFirst as any).mockResolvedValue(rohan);
    });

    it('returns leads assigned to caller', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([
            {
                id: 'l1', contact_phone: '+919111111111', intent: 'buy',
                budget_min: 5000000, budget_max: 8000000, demand_main_category: 'residential',
                lifecycle_stage: 'new', created_at: new Date(),
                contact: { name: 'Ramesh Gupta' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.leads).toHaveLength(1);
        expect(res.body.leads[0].name).toBe('Ramesh Gupta');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ assigned_agent_id: 'a1' }),
        }));
    });

    it('applies stage filter when provided', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&stage=site_visit_scheduled');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ lifecycle_stage: 'site_visit_scheduled' }),
        }));
    });

    it('applies limit (default 10, max 50)', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&limit=5');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));

        await request(app).get('/webhooks/internal/tools/my-leads?caller=%2B919958860411&limit=9999');
        expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/__tests__/internal_tools.test.ts
```

Expected: 404 / undefined behavior.

- [ ] **Step 3: Implement the endpoint**

In `agents/backend/src/routes/internal_tools.ts`, add after the `requireTool` factory:

```typescript
import prisma from '../db';

router.get('/my-leads', requireTool('get_my_leads'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const stage = (req.query.stage as string) || undefined;
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '10', 10) || 10, 1), 50);

    try {
        const leads = await prisma.lead.findMany({
            where: {
                assigned_agent_id: caller.id,
                ...(stage ? { lifecycle_stage: stage } : {}),
            },
            include: { contact: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        res.json({
            ok: true,
            leads: leads.map((l: any) => ({
                id: l.id,
                phone: l.contact_phone,
                name: l.contact?.name ?? null,
                intent: l.intent,
                budget_min: l.budget_min,
                budget_max: l.budget_max,
                category: l.demand_main_category,
                stage: l.lifecycle_stage,
                created_at: l.created_at,
            })),
        });
    } catch (err) {
        logger.error('[Tools] get_my_leads error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/internal_tools.test.ts
```

Expected: all 4 `my-leads` tests pass.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/internal_tools.ts agents/backend/src/__tests__/internal_tools.test.ts
git commit -m "feat(tools): implement get_my_leads endpoint"
```

---

## Task 5: Build `get_my_appointments` Tool

**Files:** same as Task 4.

- [ ] **Step 1: Add test cases**

Append to `internal_tools.test.ts` (update the `vi.mock` block to include `appointment`):

```typescript
// Update the mock block near top:
vi.mock('../db', async () => ({
    default: {
        agent: { findFirst: vi.fn() },
        lead: { findMany: vi.fn() },
        appointment: { findMany: vi.fn() },
    },
}));

describe('GET /webhooks/internal/tools/my-appointments', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => {
        (prisma.agent.findFirst as any).mockResolvedValue(rohan);
    });

    it('returns appointments for today by default', async () => {
        (prisma.appointment.findMany as any).mockResolvedValue([
            {
                id: 'ap1', scheduled_at: new Date(), phone_number: '+919111111111',
                type: 'site_visit', status: 'confirmed', location: 'Vaishali',
                contact: { name: 'Ramesh Gupta' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/my-appointments?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.appointments).toHaveLength(1);
        expect(res.body.appointments[0].client_name).toBe('Ramesh Gupta');
    });

    it('accepts date_range=week', async () => {
        (prisma.appointment.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/my-appointments?caller=%2B919958860411&date_range=week');
        const call = (prisma.appointment.findMany as any).mock.calls[0][0];
        expect(call.where.scheduled_at.gte).toBeDefined();
        expect(call.where.scheduled_at.lte).toBeDefined();
    });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/__tests__/internal_tools.test.ts
```

- [ ] **Step 3: Implement the endpoint**

Add to `internal_tools.ts`:

```typescript
router.get('/my-appointments', requireTool('get_my_appointments'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const range = ((req.query.date_range as string) || 'today').toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    let gte = startOfToday;
    let lte = endOfToday;

    if (range === 'week') {
        lte = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (range === 'upcoming') {
        gte = now;
        lte = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    try {
        const appts = await prisma.appointment.findMany({
            where: {
                assigned_agent_id: caller.id,
                scheduled_at: { gte, lte },
            },
            include: { contact: { select: { name: true } } },
            orderBy: { scheduled_at: 'asc' },
        });
        res.json({
            ok: true,
            appointments: appts.map((a: any) => ({
                id: a.id,
                scheduled_at: a.scheduled_at,
                client_name: a.contact?.name ?? null,
                client_phone: a.phone_number,
                type: a.type,
                status: a.status,
                location: a.location,
            })),
        });
    } catch (err) {
        logger.error('[Tools] get_my_appointments error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

Note: adjust field names (`assigned_agent_id`, `type`, `location`) to match the actual Appointment model in `schema.prisma`. If the field is named differently, use the real name.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/internal_tools.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/internal_tools.ts agents/backend/src/__tests__/internal_tools.test.ts
git commit -m "feat(tools): implement get_my_appointments endpoint"
```

---

## Task 6: Build `get_my_tasks` Tool

**Files:** same.

- [ ] **Step 1: Add test**

```typescript
// Update mock block to include taskFollowup
vi.mock('../db', async () => ({
    default: {
        agent: { findFirst: vi.fn() },
        lead: { findMany: vi.fn() },
        appointment: { findMany: vi.fn() },
        taskFollowup: { findMany: vi.fn() },
    },
}));

describe('GET /webhooks/internal/tools/my-tasks', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('returns pending tasks by default', async () => {
        (prisma.taskFollowup.findMany as any).mockResolvedValue([
            {
                id: 't1', task_type: 'call', status: 'pending',
                scheduled_at: new Date(), phone_number: '+919111111111',
                contact: { name: 'Ramesh Gupta' },
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/my-tasks?caller=%2B919958860411');
        expect(res.status).toBe(200);
        expect(res.body.tasks).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add to `internal_tools.ts`:

```typescript
router.get('/my-tasks', requireTool('get_my_tasks'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const status = (req.query.status as string) || 'pending';

    try {
        const tasks = await prisma.taskFollowup.findMany({
            where: {
                status,
                // TaskFollowup is linked by phone_number → Contact → assigned_agent_id
                // We need to filter tasks whose contact is assigned to this agent
                contact: { assigned_agent_id: caller.id },
            },
            include: { contact: { select: { name: true } } },
            orderBy: { scheduled_at: 'asc' },
            take: 20,
        });
        res.json({
            ok: true,
            tasks: tasks.map((t: any) => ({
                id: t.id,
                type: t.task_type,
                status: t.status,
                scheduled_at: t.scheduled_at,
                client_name: t.contact?.name ?? null,
                client_phone: t.phone_number,
            })),
        });
    } catch (err) {
        logger.error('[Tools] get_my_tasks error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): implement get_my_tasks endpoint"
```

---

## Task 7: Build `search_lead` Tool

- [ ] **Step 1: Add test**

```typescript
describe('GET /webhooks/internal/tools/search-lead', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('searches by phone variants', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&phone=9111111111');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.contact_phone.in).toContain('+919111111111');
    });

    it('searches by name (case-insensitive contains)', async () => {
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.contact.name.contains).toBe('priya');
    });

    it('employee only sees own leads; manager sees team; super_boss sees all', async () => {
        // Will be covered by permission filters — covered per-role in Phase 3.
        // For now employee scope enforced:
        (prisma.lead.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-lead?caller=%2B919958860411&name=priya');
        const call = (prisma.lead.findMany as any).mock.calls[0][0];
        expect(call.where.assigned_agent_id).toBe('a1');
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add to `internal_tools.ts`:

```typescript
import { phoneVariants } from '../utils/phone';

router.get('/search-lead', requireTool('search_lead'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const phone = req.query.phone as string | undefined;
    const name = req.query.name as string | undefined;
    const leadId = req.query.lead_id as string | undefined;

    if (!phone && !name && !leadId) {
        res.status(400).json({ ok: false, error: 'phone, name, or lead_id required' });
        return;
    }

    const where: any = {};
    if (leadId) where.id = leadId;
    if (phone) where.contact_phone = { in: phoneVariants(phone) };
    if (name) where.contact = { name: { contains: name, mode: 'insensitive' } };

    // Phase 1 — employee scope only (manager/super_boss scoping added in later phases)
    if (caller.role === 'employee') {
        where.assigned_agent_id = caller.id;
    }

    try {
        const leads = await prisma.lead.findMany({
            where,
            include: { contact: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: 5,
        });
        res.json({
            ok: true,
            leads: leads.map((l: any) => ({
                id: l.id,
                phone: l.contact_phone,
                name: l.contact?.name ?? null,
                intent: l.intent,
                budget_min: l.budget_min,
                budget_max: l.budget_max,
                category: l.demand_main_category,
                stage: l.lifecycle_stage,
                assigned_agent_id: l.assigned_agent_id,
            })),
        });
    } catch (err) {
        logger.error('[Tools] search_lead error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): implement search_lead endpoint with employee-scope filter"
```

---

## Task 8: Build `schedule_callback` Tool

- [ ] **Step 1: Add test**

```typescript
// Update mock to include taskFollowup.create
vi.mock('../db', async () => ({
    default: {
        agent: { findFirst: vi.fn() },
        lead: { findMany: vi.fn(), findUnique: vi.fn() },
        appointment: { findMany: vi.fn() },
        taskFollowup: { findMany: vi.fn(), create: vi.fn() },
    },
}));

describe('POST /webhooks/internal/tools/schedule-callback', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('creates a TaskFollowup of type=call', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.taskFollowup.create as any).mockResolvedValue({ id: 't1' });

        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                datetime: '2026-04-20T10:00:00.000Z',
                note: 'Follow up on Dwarka property',
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.taskFollowup.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                task_type: 'call',
                status: 'pending',
                phone_number: '+919111111111',
                tenant_id: 't1',
            }),
        }));
    });

    it('rejects when employee tries to schedule callback for lead they do not own', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other-agent', tenant_id: 't1',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-callback')
            .send({ caller: '+919958860411', lead_id: 'l1', datetime: '2026-04-20T10:00:00.000Z' });
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add to `internal_tools.ts`:

```typescript
router.post('/schedule-callback', requireTool('schedule_callback'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, datetime, note } = req.body || {};

    if (!lead_id || !datetime) {
        res.status(400).json({ ok: false, error: 'lead_id and datetime required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) {
            res.status(404).json({ ok: false, error: 'lead not found' });
            return;
        }

        // Employee scope check — only schedule callbacks for own leads
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const task = await prisma.taskFollowup.create({
            data: {
                tenant_id: lead.tenant_id,
                phone_number: lead.contact_phone,
                task_type: 'call',
                status: 'pending',
                scheduled_at: new Date(datetime),
                ...(note ? { metadata: { note } } : {}),
            } as any,
        });

        res.json({ ok: true, task_id: task.id, scheduled_at: datetime });
    } catch (err) {
        logger.error('[Tools] schedule_callback error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

Note: if `TaskFollowup` model does not have a `metadata` JSON field, check the schema and either add it (new migration) or store the note separately — e.g., via an `Interaction` record. Follow the existing pattern.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): implement schedule_callback with employee ownership check"
```

---

## Task 9: Build `log_call_note` Tool

- [ ] **Step 1: Add test**

```typescript
// Update mock to include interaction.create
vi.mock('../db', async () => ({
    default: {
        agent: { findFirst: vi.fn() },
        lead: { findMany: vi.fn(), findUnique: vi.fn() },
        appointment: { findMany: vi.fn() },
        taskFollowup: { findMany: vi.fn(), create: vi.fn() },
        interaction: { create: vi.fn() },
    },
}));

describe('POST /webhooks/internal/tools/log-call-note', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('writes an Interaction record with channel=voice', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });

        const res = await request(app)
            .post('/webhooks/internal/tools/log-call-note')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                note: 'Client wants to see Sector 12 properties next week',
            });
        expect(res.status).toBe(200);
        expect(prisma.interaction.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                channel: 'voice',
                direction: 'internal',
                phone_number: '+919111111111',
            }),
        }));
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
router.post('/log-call-note', requireTool('log_call_note'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, note } = req.body || {};

    if (!lead_id || !note) {
        res.status(400).json({ ok: false, error: 'lead_id and note required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) {
            res.status(404).json({ ok: false, error: 'lead not found' });
            return;
        }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const interaction = await prisma.interaction.create({
            data: {
                tenant_id: lead.tenant_id,
                phone_number: lead.contact_phone,
                channel: 'voice',
                direction: 'internal',
                content: `[Panditji note by ${caller.name}]: ${note}`,
            } as any,
        });

        res.json({ ok: true, interaction_id: interaction.id });
    } catch (err) {
        logger.error('[Tools] log_call_note error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

Check the `Interaction` model in `schema.prisma` — adjust field names if needed (e.g., `created_by_agent_id`, etc.).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): implement log_call_note via Interaction record"
```

---

## Task 10: Build `send_on_whatsapp` Tool

**Files:** same + may add a helper in `services/whatsapp.ts` wiring.

- [ ] **Step 1: Inspect existing WhatsApp send helper**

```bash
grep -rn "sendMessage\|sendText\|sendTemplate" agents/backend/src/services/whatsapp.ts | head -20
```

Identify the function that sends a WhatsApp text message to a phone number. Most likely `WhatsAppService.sendMessage(to, text)` or similar.

- [ ] **Step 2: Add test**

```typescript
vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        sendTextMessage = vi.fn().mockResolvedValue({ messages: [{ id: 'wa123' }] });
    },
}));

describe('POST /webhooks/internal/tools/send-whatsapp', () => {
    const rohan = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'rohan@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1',
    };

    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('sends text message to recipient', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({
                caller: '+919958860411',
                recipient_phone: '+919111111111',
                content_type: 'text',
                payload: { body: 'Your appointment is at 3pm tomorrow.' },
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.wa_message_id).toBe('wa123');
    });

    it('rejects unknown content_type', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-whatsapp')
            .send({
                caller: '+919958860411',
                recipient_phone: '+919111111111',
                content_type: 'hologram',
                payload: {},
            });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement**

```typescript
import { WhatsAppService } from '../services/whatsapp';

const whatsappService = new WhatsAppService();

router.post('/send-whatsapp', requireTool('send_on_whatsapp'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { recipient_phone, content_type, payload } = req.body || {};

    if (!recipient_phone || !content_type || !payload) {
        res.status(400).json({ ok: false, error: 'recipient_phone, content_type, payload required' });
        return;
    }

    if (content_type !== 'text') {
        // Phase 1: only text. Templates, media, interactive coming later.
        res.status(400).json({ ok: false, error: `content_type ${content_type} not supported in phase 1` });
        return;
    }

    const body = (payload && payload.body) as string | undefined;
    if (!body || body.length === 0) {
        res.status(400).json({ ok: false, error: 'payload.body required for text content' });
        return;
    }

    try {
        const result = await whatsappService.sendTextMessage(recipient_phone, body);
        const waId = result?.messages?.[0]?.id ?? null;
        logger.info(`[Tools] ${caller.name} → WA to ${recipient_phone} id=${waId}`);
        res.json({ ok: true, wa_message_id: waId });
    } catch (err) {
        logger.error('[Tools] send_on_whatsapp error:', err);
        res.status(500).json({ ok: false, error: 'whatsapp send failed' });
    }
});
```

Adjust `sendTextMessage` name to whatever the actual `WhatsAppService` method is (grep confirmed in Step 1).

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(tools): implement send_on_whatsapp (text-only, phase 1)"
```

---

## Task 11: Update caller-lookup to Return Gender + Preferred Language

**Files:**
- Modify: `agents/backend/src/routes/webhooks.ts`

- [ ] **Step 1: Update identifyContact or the caller-lookup query**

In `webhooks.ts`, find the `/internal/caller-lookup` endpoint (around line 220). Update the `identifyContact` call result and/or add a separate agent fetch to include gender + preferred_language.

The simplest path: update `contact_identifier.ts` `IdentifiedContact` interface to include gender + preferred_language, and pull them from the Agent select:

Open `agents/backend/src/services/contact_identifier.ts`, update the interface:

```typescript
export interface IdentifiedContact {
    contact_type: 'MANAGEMENT' | 'PARTNER_AGENT' | 'REAL_ESTATE_BUILDER';
    name: string | null;
    email: string | null;
    source_table: string;
    source_id: string;
    department?: string | null;
    role?: string | null;
    gender?: string | null;
    preferred_language?: string | null;
}
```

Update the Agent `findFirst` select:

```typescript
const agent = await prisma.agent.findFirst({
    where: { phone: { in: variants }, status: 'active' },
    select: {
        id: true, name: true, email: true, department: true, role: true,
        gender: true, preferred_language: true,
    },
});

if (agent) {
    return {
        contact_type: 'MANAGEMENT',
        name: agent.name,
        email: agent.email,
        source_table: 'Agent',
        source_id: agent.id,
        department: agent.department,
        role: agent.role,
        gender: agent.gender,
        preferred_language: agent.preferred_language,
    };
}
```

- [ ] **Step 2: Verify endpoint manually on server**

```bash
ssh realty "curl -s 'http://127.0.0.1:7071/webhooks/internal/caller-lookup?phone=%2B919958860411'"
```

Expected: response now includes `"gender":"male","preferred_language":"hi_en"` (or whatever is set).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tools): expose agent gender + preferred_language in caller-lookup"
```

---

## Task 12: Auto-update Preferred Language at Call End

**Files:**
- Create: `agents/backend/src/services/tool_language.ts`
- Modify: `agents/backend/src/routes/webhooks.ts`

- [ ] **Step 1: Write test for language detector**

Create `agents/backend/src/__tests__/tool_language.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectLanguageFromTranscript } from '../services/tool_language';

describe('detectLanguageFromTranscript', () => {
    it('detects pure English', () => {
        const t = 'Good morning. Please show me my leads. Thanks.';
        expect(detectLanguageFromTranscript(t)).toBe('en');
    });

    it('detects pure Hindi (romanized)', () => {
        const t = 'Namaste Panditji, mujhe aaj ke appointments batao.';
        expect(detectLanguageFromTranscript(t)).toBe('hi');
    });

    it('detects Hinglish when mix is >30% English in Hindi-dominant text', () => {
        const t = 'Good morning Panditji, mere leads dikhao, priority wale first please.';
        expect(detectLanguageFromTranscript(t)).toBe('hi_en');
    });

    it('defaults to hi_en when transcript is empty', () => {
        expect(detectLanguageFromTranscript('')).toBe('hi_en');
    });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/__tests__/tool_language.test.ts
```

- [ ] **Step 3: Implement detector + updater**

Create `agents/backend/src/services/tool_language.ts`:

```typescript
import prisma from '../db';
import { phoneVariants } from '../utils/phone';
import logger from '../utils/logger';

// Simple word-level classifier. Not perfect — good enough as a dynamic learner
// that overwrites every call. Over many calls it converges to the caller's
// dominant mode.
const ENGLISH_HINT_WORDS = new Set([
    'the','is','you','your','please','thanks','thank','good','morning','evening','afternoon',
    'night','hello','hi','yes','no','ok','okay','sure','done','call','show','send','tell','me','my',
    'leads','task','appointments','schedule','callback','property','client','check','update',
]);

const HINDI_HINT_WORDS = new Set([
    'main','aap','ka','ki','ke','hai','hain','hoon','tha','thi','kya','kaun','kab','kaise','kahan',
    'namaste','shukriya','dhanyawad','bhai','ji','haan','nahi','bilkul','abhi','kal','aaj',
    'mujhe','tumhe','unhe','batao','dikhao','bhejo','lagao','karna','kar','raha','rahi',
    'lead','leads','appointment','meeting','callback','update','status','priority','property',
]);

export function detectLanguageFromTranscript(transcript: string): 'hi' | 'en' | 'hi_en' {
    if (!transcript || transcript.trim().length === 0) return 'hi_en';

    const words = transcript.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    let en = 0, hi = 0;
    for (const w of words) {
        if (ENGLISH_HINT_WORDS.has(w)) en++;
        else if (HINDI_HINT_WORDS.has(w)) hi++;
    }

    const total = en + hi;
    if (total === 0) return 'hi_en';

    const enShare = en / total;
    const hiShare = hi / total;

    if (enShare > 0.8) return 'en';
    if (hiShare > 0.8) return 'hi';
    return 'hi_en';
}

export async function updateAgentLanguagePreference(phone: string, transcript: string): Promise<void> {
    const lang = detectLanguageFromTranscript(transcript);
    const variants = phoneVariants(phone);
    try {
        const updated = await prisma.agent.updateMany({
            where: { phone: { in: variants }, status: 'active' },
            data: { preferred_language: lang },
        });
        if (updated.count > 0) {
            logger.info(`[LangLearn] updated ${phone} → preferred_language=${lang}`);
        }
    } catch (err) {
        logger.error(`[LangLearn] failed to update ${phone}:`, err);
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/tool_language.test.ts
```

- [ ] **Step 5: Wire into call-ended handler**

Open `agents/backend/src/routes/webhooks.ts`, find the `/internal/call-ended` handler. Add language update after the existing save:

```typescript
import { updateAgentLanguagePreference } from '../services/tool_language';

router.post('/internal/call-ended', async (req, res) => {
    res.sendStatus(200);

    try {
        const { call_id, caller_number, transcript, source } = req.body;
        if (source !== 'pipecat' || !caller_number) return;

        logger.info(`[Internal] Saving Pipecat call record for ${caller_number}`);
        await voiceService.savePipecatCallRecord({ call_id, caller_number, transcript });

        // Dynamic language learning for internal team members
        await updateAgentLanguagePreference(caller_number, transcript ?? '');
    } catch (err) {
        logger.error('[Internal] Error saving Pipecat call record:', err);
    }
});
```

- [ ] **Step 6: Commit**

```bash
git add agents/backend/src/services/tool_language.ts agents/backend/src/__tests__/tool_language.test.ts agents/backend/src/routes/webhooks.ts
git commit -m "feat(tools): auto-learn preferred_language from voice transcript at call end"
```

---

## Task 13: Create Pipecat tools.py

**Files:**
- Create: `agents/pipecat/tools.py`

- [ ] **Step 1: Write the module**

Create `agents/pipecat/tools.py`:

```python
"""Panditji voice tools — Gemini Live function definitions + HTTP bridge to Node.

Each tool is a function Gemini Live can call mid-conversation. We intercept the
call, HTTP-post the params to the Node backend, and return the JSON result back
to Gemini Live so it can continue the conversation with fresh data.
"""

import os
from typing import Any

import httpx
from loguru import logger

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:7071")
TOOLS_BASE = f"{NODE_BACKEND_URL}/webhooks/internal/tools"


# Gemini Live tool definitions — OpenAI-style schema, Gemini Live converts internally.
TEAM_MEMBER_TOOLS = [
    {
        "name": "get_my_leads",
        "description": "Fetch leads assigned to the calling team member. Use this when they ask about 'mere leads', 'my leads', or specific stage filters.",
        "parameters": {
            "type": "object",
            "properties": {
                "stage": {"type": "string", "description": "Optional lifecycle stage filter (e.g. 'new', 'site_visit_scheduled', 'negotiation')."},
                "limit": {"type": "integer", "description": "How many leads to return. Default 10, max 50."},
            },
        },
    },
    {
        "name": "get_my_appointments",
        "description": "Fetch the calling team member's upcoming appointments. Use when they ask 'aaj ke appointments', 'today's meetings', etc.",
        "parameters": {
            "type": "object",
            "properties": {
                "date_range": {"type": "string", "enum": ["today", "week", "upcoming"], "description": "Default: today."},
            },
        },
    },
    {
        "name": "get_my_tasks",
        "description": "Fetch pending tasks (callbacks, follow-ups) for the caller.",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["pending", "completed"], "description": "Default: pending."},
            },
        },
    },
    {
        "name": "search_lead",
        "description": "Look up a specific lead by name or phone number. Use when they ask about a client by name.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "phone": {"type": "string"},
                "lead_id": {"type": "string"},
            },
        },
    },
    {
        "name": "schedule_callback",
        "description": "Schedule a callback task for a lead. Requires confirming lead_id (use search_lead first if needed) and datetime.",
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "datetime": {"type": "string", "description": "ISO8601 datetime of the callback."},
                "note": {"type": "string", "description": "Optional note about the callback."},
            },
            "required": ["lead_id", "datetime"],
        },
    },
    {
        "name": "log_call_note",
        "description": "Save a note against a lead, as said during the conversation.",
        "parameters": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": ["lead_id", "note"],
        },
    },
    {
        "name": "send_on_whatsapp",
        "description": "Send a WhatsApp text message to a recipient (e.g., the caller themselves for confirmation, or a client).",
        "parameters": {
            "type": "object",
            "properties": {
                "recipient_phone": {"type": "string"},
                "content_type": {"type": "string", "enum": ["text"]},
                "payload": {
                    "type": "object",
                    "properties": {"body": {"type": "string"}},
                    "required": ["body"],
                },
            },
            "required": ["recipient_phone", "content_type", "payload"],
        },
    },
]


async def call_tool(tool_name: str, caller_phone: str, args: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a Gemini Live tool call to the Node backend. Returns JSON dict."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if tool_name in {"get_my_leads", "get_my_appointments", "get_my_tasks", "search_lead"}:
                url = f"{TOOLS_BASE}/{tool_name.replace('_', '-').replace('get-my-', 'my-').replace('search-lead', 'search-lead')}"
                params = {"caller": caller_phone, **{k: v for k, v in args.items() if v is not None}}
                resp = await client.get(url, params=params)
            elif tool_name in {"schedule_callback", "log_call_note", "send_on_whatsapp"}:
                url = f"{TOOLS_BASE}/{tool_name.replace('_', '-')}"
                body = {"caller": caller_phone, **args}
                resp = await client.post(url, json=body)
            else:
                return {"ok": False, "error": f"unknown tool {tool_name}"}

            if resp.status_code >= 400:
                logger.warning(f"[Tool] {tool_name} {resp.status_code}: {resp.text[:200]}")
                return {"ok": False, "error": f"http {resp.status_code}", "detail": resp.text[:300]}

            return resp.json()
    except Exception as e:
        logger.error(f"[Tool] {tool_name} failed: {e}")
        return {"ok": False, "error": str(e)}
```

Note: the URL routing in `call_tool` is slightly ugly — clean this up by mapping tool_name → path explicitly:

```python
_TOOL_PATHS = {
    "get_my_leads": ("GET", "/my-leads"),
    "get_my_appointments": ("GET", "/my-appointments"),
    "get_my_tasks": ("GET", "/my-tasks"),
    "search_lead": ("GET", "/search-lead"),
    "schedule_callback": ("POST", "/schedule-callback"),
    "log_call_note": ("POST", "/log-call-note"),
    "send_on_whatsapp": ("POST", "/send-whatsapp"),
}

async def call_tool(tool_name: str, caller_phone: str, args: dict[str, Any]) -> dict[str, Any]:
    if tool_name not in _TOOL_PATHS:
        return {"ok": False, "error": f"unknown tool {tool_name}"}
    method, path = _TOOL_PATHS[tool_name]
    url = f"{TOOLS_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if method == "GET":
                params = {"caller": caller_phone, **{k: v for k, v in args.items() if v is not None}}
                resp = await client.get(url, params=params)
            else:
                resp = await client.post(url, json={"caller": caller_phone, **args})

            if resp.status_code >= 400:
                logger.warning(f"[Tool] {tool_name} {resp.status_code}: {resp.text[:200]}")
                return {"ok": False, "error": f"http {resp.status_code}", "detail": resp.text[:300]}
            return resp.json()
    except Exception as e:
        logger.error(f"[Tool] {tool_name} failed: {e}")
        return {"ok": False, "error": str(e)}
```

Use this cleaner version. Delete the first iteration.

- [ ] **Step 2: Commit**

```bash
git add agents/pipecat/tools.py
git commit -m "feat(pipecat): add Gemini Live tool definitions + HTTP bridge to Node"
```

---

## Task 14: Create Team-Member Prompt

**Files:**
- Create: `agents/pipecat/prompts/panditji_team_member.txt`

- [ ] **Step 1: Write the prompt**

Create `agents/pipecat/prompts/panditji_team_member.txt`:

```text
# PANDITJI — Internal Team Member Voice Prompt (Phase 1)
# You are Panditji, a warm, smart assistant for the Realty Pandit team.

## Identity
You are Panditji — Realty Pandit's AI voice assistant. You speak with team members (employees, managers, the founder). You are a colleague, not a customer-service bot. Be warm, respectful, concise.

## Language
- Match the caller's language exactly — English in English, Hindi in Hindi, Hinglish in Hinglish.
- Use simple everyday words. No heavy Sanskrit Hindi. No corporate English jargon.
- Forbidden phrases: "Kripya avagat karayein", "Let me retrieve that information", "How may I be of assistance".
- Preferred phrases (Hindi): "Bilkul", "Ho gaya", "Ek second", "Samajh gaya", "Main dekh leta hoon".
- Preferred phrases (English): "Sure", "Done", "One second", "Got it", "Let me check".

## Grammar
- Panditji (you) is male. Always use masculine self-reference: "main kar raha hoon", "main bhej raha hoon", "maine check kar liya".
- Match the caller's gender for their verbs:
  - Male caller: "aap gaye the", "aap khush honge", "aap ne kiya tha"
  - Female caller: "aap gayi thi", "aap khush hongi", "aap ne kiya tha"
- For third persons, use their gender: "Ramesh ji ne kaha", "Priya ji ne kahi".
- When gender is unknown, use safe neutral polite forms.

## Greeting
The system injects caller context at call start in this format:
```
[call_started]
CALLER_PHONE: +91XXXXXXXXXX
CALLER_TYPE: MANAGEMENT
CALLER_NAME: Rohan
CALLER_ROLE: employee | manager | super_boss
CALLER_GENDER: male | female | unknown
CALLER_DEPARTMENT: property_sales
CALLER_PREFERRED_LANGUAGE: hi | en | hi_en
```

Use the caller's name immediately. Pick the English time-greeting by IST: Good Morning (5-11:59), Good Afternoon (12-16:59), Good Evening (17-20:59), Good Night (21-04:59).

Greeting templates:
- Employee: "Good Morning, Rohan ji! Batayein, kya madad karun?"
- Manager: "Good Afternoon, Sanjay ji! Kaise hain? Kya dekhna hai?"
- Super Boss: "Good Evening, [Name] ji! Batayein."

Always "[Name] ji" — never "Sir".

## Your Tools
You have 7 tools. Call them silently when needed. Do NOT describe them to the caller. Do NOT say "I am calling the tool" — just speak the result naturally.

1. get_my_leads(stage?, limit?) — fetch caller's assigned leads
2. get_my_appointments(date_range?) — fetch caller's appointments
3. get_my_tasks(status?) — fetch pending tasks/callbacks
4. search_lead(name?, phone?, lead_id?) — find a specific lead
5. schedule_callback(lead_id, datetime, note?) — create a callback task
6. log_call_note(lead_id, note) — save a note against a lead
7. send_on_whatsapp(recipient_phone, content_type='text', payload={body:...}) — send a WhatsApp text

## When to Use Tools
- "Mere aaj ke appointments?" / "My appointments today?" → get_my_appointments
- "Mere leads batao" / "Show my leads" → get_my_leads
- "Kya tasks pending hain?" / "What tasks are pending?" → get_my_tasks
- "[Name] ki file dikhao" / "Pull up [Name]'s file" → search_lead
- "Callback schedule karo kal 10 baje" → search_lead (if needed) + schedule_callback
- "Ye note add karo" → log_call_note
- After retrieving a list of >2 items, ALWAYS call send_on_whatsapp to send the list to the caller's own phone for a paper trail.

## WhatsApp Paper Trail Rule
Every time you:
- return a list of >2 leads, appointments, or tasks
- schedule a callback
- log a note
- reassign anything (later phases)
... immediately call send_on_whatsapp to send a summary to the caller's own phone number. Say "Main ye WhatsApp par bhi bhej deta hoon" before calling the tool.

## Conversation Rules
- Max 2–3 sentences per response. This is voice. Let them talk.
- Confirm before writing: "Priya Sharma, Dwarka 2BHK buyer — sahi?"
- Never read long lists aloud. Say how many there are and send the full list on WhatsApp.
- If a tool returns {ok:false, error:"permission denied"}: "Ye information aap ke role ke liye available nahi hai."
- If a tool fails technically: "Ek second ruko, system abhi response nahi de raha. Main dobara try karta hoon." Then retry once.
- Never expose error codes, stack traces, or field names to the caller.
- Never say "I am processing" or "retrieving" — just speak the answer.

## Permission-Denied Handling
If you try to call a manager-only or super-boss-only tool as an employee, the backend will return {ok: false, error: "permission denied"}. Do NOT apologize or explain the technical reason. Simply say: "Ye information aap ke role ke liye available nahi hai. Aap apne manager se poochh sakte hain."

## Ambiguity Handling
If search_lead returns >1 match: "Mere paas 3 Sharma ji hain — Priya, Rakesh, aur Meena. Kaun si chahiye?"
If you cannot hear clearly: "Sorry, dobara boliye?"

## Closing
Always close warmly with a farewell. Do not just stop talking.
- "Shukriya Rohan ji! Aap ka din shubh rahe."
- "Thanks Rohan, have a great day!"

## TRIGGER: [call_started]
When the system sends `[call_started]` with caller context, greet immediately and proactively ask how you can help. Do not wait for the caller to speak first.
```

- [ ] **Step 2: Commit**

```bash
git add agents/pipecat/prompts/panditji_team_member.txt
git commit -m "feat(pipecat): add team-member prompt with tool usage + grammar rules"
```

---

## Task 15: Wire Tools into pipeline.py

**Files:**
- Modify: `agents/pipecat/pipeline.py`

- [ ] **Step 1: Import tools + define prompt routing**

At the top of `pipeline.py`, add:

```python
from tools import TEAM_MEMBER_TOOLS, call_tool
```

Load the team-member prompt alongside the customer prompt:

```python
_CUSTOMER_PROMPT = (Path(__file__).parent / "prompts" / "panditji.txt").read_text(encoding="utf-8")
_TEAM_PROMPT = (Path(__file__).parent / "prompts" / "panditji_team_member.txt").read_text(encoding="utf-8")
```

- [ ] **Step 2: Determine prompt + tools based on caller type**

Inside `run_pipeline_for_connection`, before creating the LLM, do:

```python
# Fetch caller context first so we can route prompt + tools
caller_context_str = await _lookup_caller(caller_number)
is_team_member = "CALLER_TYPE: MANAGEMENT" in caller_context_str

if is_team_member:
    system_prompt = _TEAM_PROMPT
    tools = TEAM_MEMBER_TOOLS
else:
    system_prompt = _CUSTOMER_PROMPT
    tools = []  # customer calls have no tools yet — phase 2+
```

- [ ] **Step 3: Pass tools into GeminiLiveLLMService**

Update the LLM construction. Check Pipecat's GeminiLiveLLMService API for the exact `tools` parameter name — it may be `tools=` or passed via `settings=`. Consult:

```bash
python -c "from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService; help(GeminiLiveLLMService.__init__)"
```

Then update:

```python
llm = GeminiLiveLLMService(
    api_key=GEMINI_API_KEY,
    model="models/gemini-3.1-flash-live-preview",
    system_instruction=system_prompt,
    voice_id="Charon",
    params=InputParams(language=Language.HI_IN),
    tools=tools,  # adjust keyword to match actual API
)
```

- [ ] **Step 4: Wire tool-call handler**

Gemini Live emits tool-call events. Register a handler:

```python
@llm.event_handler("on_function_call")
async def _handle_tool_call(service, function_call):
    """Dispatch Gemini Live tool calls to Node backend."""
    result = await call_tool(
        tool_name=function_call.name,
        caller_phone=caller_number,
        args=function_call.arguments or {},
    )
    await service.send_function_response(function_call.id, result)
    logger.info(f"[Tool] {function_call.name} called, result.ok={result.get('ok')}")
```

Exact event name and signature depend on the Pipecat version — verify against the installed package before finalizing. If the API differs, adapt (but the intent is unchanged: receive call → dispatch → return JSON).

- [ ] **Step 5: Remove the old seeded context injection if redundant**

The current code injects `[call_started]\n{caller_context}` as a user message. Keep it — Gemini Live needs that context to personalize the greeting.

- [ ] **Step 6: Restart Pipecat on server and verify tools appear in Gemini Live init**

```bash
scp -i ~/.ssh/realty_pandit_key agents/pipecat/tools.py root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/tools.py
scp -i ~/.ssh/realty_pandit_key agents/pipecat/pipeline.py root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/pipeline.py
scp -i ~/.ssh/realty_pandit_key agents/pipecat/prompts/panditji_team_member.txt root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/prompts/panditji_team_member.txt
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'pm2 restart panditji-voice && pm2 logs panditji-voice --lines 20 --nostream'
```

Look for a log line confirming tools were registered with Gemini Live.

- [ ] **Step 7: Commit**

```bash
git add agents/pipecat/pipeline.py
git commit -m "feat(pipecat): wire team-member tools + prompt routing into Gemini Live"
```

---

## Task 16: End-to-End Manual Test

**Files:** none — pure verification.

- [ ] **Step 1: Ensure Rohan test agent exists**

On server:
```bash
ssh realty "cd /var/www/realty-pandit/backend && node -e \"const p=require('@prisma/client').PrismaClient;(async()=>{const pr=new p();const r=await pr.agent.findFirst({where:{email:'rohan.test@realtypandit.in'}});console.log(r);await pr.\\$disconnect();})()\""
```

If Rohan does not exist, create him in the admin panel or directly:
```bash
ssh realty "cd /var/www/realty-pandit/backend && node -e \"const p=require('@prisma/client').PrismaClient;(async()=>{const pr=new p();await pr.agent.create({data:{name:'Rohan Test',email:'rohan.test@realtypandit.in',phone:'+91XXXXXXXXXX',role:'employee',gender:'male',preferred_language:'hi_en',status:'active',tenant_id:'t1'}});await pr.\\$disconnect();})()\""
```

Replace `+91XXXXXXXXXX` with an actual test WhatsApp number available to you.

- [ ] **Step 2: Assign 3 test leads to Rohan**

Seed some leads with `assigned_agent_id = Rohan's id`.

- [ ] **Step 3: Call from Rohan's test number**

Dial the Realty Pandit WhatsApp Business number from Rohan's test phone.

Verify:
- [ ] Panditji greets "Good [time], Rohan ji! Batayein, kya madad karun?"
- [ ] Say: "Mere leads batao" → Panditji responds with count + names of Rohan's leads
- [ ] Panditji says "Main WhatsApp par bhi bhej deta hoon" and the list arrives on WhatsApp
- [ ] Say: "Priya Sharma ki file dikhao" (use a real lead name) → Panditji reads details
- [ ] Say: "Callback schedule karo kal 10 baje" → Panditji confirms and sends WhatsApp reminder
- [ ] Say: "Ye note add karo — follow up after documents" → Panditji confirms
- [ ] Say: "Thanks, bye" → Panditji closes warmly

- [ ] **Step 4: Verify DB writes**

```bash
ssh realty "cd /var/www/realty-pandit/backend && node -e \"const p=require('@prisma/client').PrismaClient;(async()=>{const pr=new p();const t=await pr.taskFollowup.findFirst({orderBy:{created_at:'desc'}});console.log(t);const i=await pr.interaction.findFirst({where:{channel:'voice'},orderBy:{created_at:'desc'}});console.log(i);await pr.\\$disconnect();})()\""
```

Expected: the scheduled callback and logged note are both present in DB with recent timestamps.

- [ ] **Step 5: Verify language learning**

After the call, check that `Agent.preferred_language` was updated based on the conversation language:

```bash
ssh realty "cd /var/www/realty-pandit/backend && node -e \"const p=require('@prisma/client').PrismaClient;(async()=>{const pr=new p();const r=await pr.agent.findFirst({where:{email:'rohan.test@realtypandit.in'},select:{preferred_language:true}});console.log(r);await pr.\\$disconnect();})()\""
```

If the call was in Hinglish, expect `preferred_language: "hi_en"`.

- [ ] **Step 6: Test permission denial**

Still as Rohan (employee), say: "Is hafte ka revenue batao" (a super_boss-only query).
- [ ] Panditji responds: "Ye information aap ke role ke liye available nahi hai. Aap apne manager se poochh sakte hain."

- [ ] **Step 7: Document observed behavior**

Write a short test report at `docs/plans/2026-04-19-phase-1-employee-core-TESTREPORT.md` capturing:
- What worked
- Any bugs / rough edges
- Latency observations (how long between speech and response)
- Hindi grammar quality (did it say "gaye the" or "gayi thi" correctly)
- WhatsApp delivery timing

---

## Task 17: Final Commit + Deploy

- [ ] **Step 1: Verify the full test suite passes**

```bash
cd agents/backend && npx vitest run
```

Expected: all pre-existing tests + new ones pass.

- [ ] **Step 2: Deploy (if not done piecemeal)**

```bash
scp -i ~/.ssh/realty_pandit_key agents/backend/src/routes/webhooks.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/routes/webhooks.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/src/routes/internal_tools.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/routes/internal_tools.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/src/services/tool_permission.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/services/tool_permission.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/src/services/tool_language.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/services/tool_language.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/src/services/contact_identifier.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/services/contact_identifier.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/src/app.ts root@72.62.231.224:/var/www/realty-pandit/backend/src/app.ts
scp -i ~/.ssh/realty_pandit_key agents/backend/prisma/schema.prisma root@72.62.231.224:/var/www/realty-pandit/backend/prisma/schema.prisma
scp -i ~/.ssh/realty_pandit_key -r agents/backend/prisma/migrations/20260419_agent_gender_language root@72.62.231.224:/var/www/realty-pandit/backend/prisma/migrations/

ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && npx prisma migrate deploy && npx prisma generate && pm2 restart realty-backend && pm2 restart panditji-voice'
```

- [ ] **Step 3: Smoke-test on production**

Call from your registered number. Panditji should greet you by name, and "mere leads" / "my leads" should work.

- [ ] **Step 4: Tag release**

```bash
git tag -a phase-1-employee-core -m "Panditji Phase 1: Employee Core shipped"
```

---

## Success Criteria (Verification Checklist)

- [ ] All 7 tools have endpoints, permission checks, and passing tests
- [ ] `gender` and `preferred_language` columns added to `agents` table via migration
- [ ] `caller-lookup` endpoint returns gender + preferred_language
- [ ] Language preference auto-updates at call end based on transcript
- [ ] Pipecat `tools.py` bridges Gemini Live tool calls to Node backend
- [ ] Team-member prompt is loaded when `CALLER_TYPE=MANAGEMENT`
- [ ] Employee can complete an end-to-end call: greet → ask leads → schedule callback → get WhatsApp confirmation
- [ ] Permission denial returns friendly Hindi message
- [ ] No regressions in customer-call flow (existing fresh-lead path still works)

---

## Out of Scope for Phase 1 (Coming in Phase 2, 3, 4)

- Search inventory, schedule site visits, update lead status (**Phase 2**)
- Manager tools: team performance, unassigned leads, reassign (**Phase 3**)
- Super Boss tools: company metrics, stuck deal detection, 9 AM daily briefing cron call (**Phase 4**)
- Rich WhatsApp content — photos, location pins, interactive buttons (**Phase 2+**)
- Proactive callbacks to team members (**deferred — "talk later"**)

---

## Estimated Effort

- **Tasks 1–12 (backend):** 1.5 days
- **Tasks 13–15 (pipecat):** 1 day
- **Task 16 (E2E test):** 0.5 day
- **Buffer for Pipecat-Gemini-Live API quirks:** 1 day
- **Total:** ~4 working days
