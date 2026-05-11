# Phase 2: Panditji Voice — Employee End-to-End Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable an Employee to complete a full workflow via voice — search the Inventory database live, schedule a site visit, update a lead's stage in the pipeline, pull a lead's interaction history, and mark a pending task as done. This closes the gap between "Panditji knows things" (Phase 1) and "Panditji acts on things" (Phase 2).

**Architecture:** Same pattern as Phase 1 — 5 new Node endpoints under `/webhooks/internal/tools/*`, 5 new Gemini Live function definitions in Pipecat's `tools.py`, `tool_permission.ts` updated to allow these for employees, and the team-member prompt enriched with Phase 2 tool usage rules. Use existing `MatchingEngine` service where possible for inventory search.

**Tech Stack:** Same as Phase 1 — no new dependencies.

---

## File Structure

**Node backend (TypeScript):**
- Modify: `agents/backend/src/services/tool_permission.ts` — add 5 new tools to `EMPLOYEE_TOOLS` set
- Modify: `agents/backend/src/__tests__/tool_permission.test.ts` — update test assertions for new tools
- Modify: `agents/backend/src/routes/internal_tools.ts` — add 5 new endpoints
- Modify: `agents/backend/src/__tests__/internal_tools.test.ts` — append 5 test suites

**Pipecat (Python):**
- Modify: `agents/pipecat/tools.py` — add 5 tool specs + URL path mappings
- Modify: `agents/pipecat/prompts/panditji_team_member.txt` — add Phase 2 tool usage + rules

---

## Task 1: Update tool_permission to Allow 5 New Tools for Employees

**Files:**
- Modify: `agents/backend/src/services/tool_permission.ts`
- Modify: `agents/backend/src/__tests__/tool_permission.test.ts`

- [ ] **Step 1: Add 5 tools to EMPLOYEE_TOOLS**

In `src/services/tool_permission.ts`, expand the `EMPLOYEE_TOOLS` Set:

```typescript
const EMPLOYEE_TOOLS = new Set([
    // Phase 1
    'get_my_leads',
    'get_my_appointments',
    'get_my_tasks',
    'search_lead',
    'schedule_callback',
    'log_call_note',
    'send_on_whatsapp',
    // Phase 2
    'search_inventory',
    'schedule_site_visit',
    'update_lead_status',
    'get_lead_history',
    'mark_task_done',
]);
```

- [ ] **Step 2: Update tests**

In `src/__tests__/tool_permission.test.ts`, update the "employee can use own-data tools" and "manager can use manager + employee tools" tests to include the new tool names. Add a new test:

```typescript
it('employee can use Phase 2 workflow tools', () => {
    expect(canAccess(employee, 'search_inventory')).toBe(true);
    expect(canAccess(employee, 'schedule_site_visit')).toBe(true);
    expect(canAccess(employee, 'update_lead_status')).toBe(true);
    expect(canAccess(employee, 'get_lead_history')).toBe(true);
    expect(canAccess(employee, 'mark_task_done')).toBe(true);
});
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd agents/backend && npx vitest run src/__tests__/tool_permission.test.ts
```

---

## Task 2: Build `search_inventory` Endpoint

**Goal:** Voice-friendly property search. Accept `location`, `intent` (buy/rent), `bhk?`, `budget_min?`, `budget_max?`, `property_type?`, `furnishing?`. Return top 5 matches with enough info for Panditji to speak about them.

**Files:**
- Modify: `agents/backend/src/routes/internal_tools.ts`
- Modify: `agents/backend/src/__tests__/internal_tools.test.ts`
- Modify: `agents/backend/src/__tests__/setup.ts` (add `inventory: { findMany: vi.fn() }` to Prisma mock)

- [ ] **Step 1: Append tests** following the pattern from Phase 1:

```typescript
describe('GET /webhooks/internal/tools/search-inventory', () => {
    const rohan = { /* ...employee as before... */ };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when location or intent missing', async () => {
        const res = await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411');
        expect(res.status).toBe(400);
    });

    it('filters by location, intent, bhk, and budget range', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent&bhk=2&budget_min=15000&budget_max=30000');
        const call = (prisma.inventory.findMany as any).mock.calls[0][0];
        expect(call.where.intent).toBe('rent');
        expect(call.where.status).toBe('active');
        // location match is OR across city, locality, sub_locality
        expect(Array.isArray(call.where.OR)).toBe(true);
        expect(call.where.price.gte).toBe(15000);
        expect(call.where.price.lte).toBe(30000);
    });

    it('returns mapped inventory objects', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([
            {
                id: 'inv1', type: 'flat', intent: 'rent', price: 25000, status: 'active',
                city: 'Ghaziabad', locality: 'Vaishali', sub_locality: 'Sector 4',
                furnishing: 'semi_furnished', specs: { bedrooms: 2, area: 1100 },
                media_urls: ['https://cdn.example.com/1.jpg'],
            },
        ]);
        const res = await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.inventory).toHaveLength(1);
        expect(res.body.inventory[0].locality).toBe('Vaishali');
        expect(res.body.inventory[0].bedrooms).toBe(2);
    });

    it('caps results at 5 by default', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app).get('/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Vaishali&intent=rent');
        const call = (prisma.inventory.findMany as any).mock.calls[0][0];
        expect(call.take).toBe(5);
    });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement endpoint** — in `src/routes/internal_tools.ts`:

```typescript
router.get('/search-inventory', requireTool('search_inventory'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const location = (req.query.location as string)?.trim();
    const intent = (req.query.intent as string)?.trim();
    const bhk = req.query.bhk ? parseInt(req.query.bhk as string, 10) : undefined;
    const budgetMin = req.query.budget_min ? Number(req.query.budget_min) : undefined;
    const budgetMax = req.query.budget_max ? Number(req.query.budget_max) : undefined;
    const propertyType = (req.query.property_type as string)?.trim();
    const furnishing = (req.query.furnishing as string)?.trim();
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '5', 10) || 5, 1), 20);

    if (!location || !intent) {
        res.status(400).json({ ok: false, error: 'location and intent required' });
        return;
    }

    // Map voice intent synonyms → DB intent values
    const intentMap: Record<string, string[]> = {
        buy: ['sell'],
        sell: ['sell'],
        rent: ['rent', 'rent_lease', 'lease'],
    };
    const dbIntents = intentMap[intent.toLowerCase()] ?? [intent.toLowerCase()];

    const where: any = {
        status: 'active',
        intent: dbIntents.length === 1 ? dbIntents[0] : { in: dbIntents },
        tenant_id: caller.tenant_id,
        OR: [
            { city: { contains: location, mode: 'insensitive' } },
            { locality: { contains: location, mode: 'insensitive' } },
            { sub_locality: { contains: location, mode: 'insensitive' } },
            { location: { contains: location, mode: 'insensitive' } },
        ],
    };

    if (propertyType) where.type = propertyType;
    if (furnishing) where.furnishing = furnishing;

    if (budgetMin !== undefined || budgetMax !== undefined) {
        where.price = {};
        if (budgetMin !== undefined) where.price.gte = budgetMin;
        if (budgetMax !== undefined) where.price.lte = budgetMax;
    }

    try {
        const items = await prisma.inventory.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        // Post-filter by BHK (stored in specs.bedrooms JSON)
        const filtered = bhk !== undefined
            ? items.filter((i: any) => i.specs?.bedrooms === bhk)
            : items;

        res.json({
            ok: true,
            count: filtered.length,
            inventory: filtered.map((i: any) => ({
                id: i.id,
                type: i.type,
                intent: i.intent,
                price: i.price,
                city: i.city,
                locality: i.locality,
                sub_locality: i.sub_locality,
                furnishing: i.furnishing,
                bedrooms: i.specs?.bedrooms ?? null,
                area: i.specs?.area ?? null,
                area_unit: i.specs?.unit ?? 'sqft',
                media_urls: i.media_urls,
            })),
        });
    } catch (err) {
        logger.error('[Tools] search_inventory error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect 4 new PASS.**

---

## Task 3: Build `schedule_site_visit` Endpoint

**Goal:** Create an Appointment record for a specific lead + inventory property + datetime.

**Files:** same pattern.

- [ ] **Step 1: Append tests:**

```typescript
describe('POST /webhooks/internal/tools/schedule-site-visit', () => {
    const rohan = { /* as before */ };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects when lead_id or datetime missing', async () => {
        const res = await request(app).post('/webhooks/internal/tools/schedule-site-visit').send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('creates Appointment tied to lead and optional property', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.appointment.create as any).mockResolvedValue({ id: 'ap99' });

        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({
                caller: '+919958860411',
                lead_id: 'l1',
                datetime: '2026-04-20T15:00:00.000Z',
                property_id: 'inv1',
                location: 'Vaishali, Sector 4',
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.appointment_id).toBe('ap99');
        expect(prisma.appointment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: 'site_visit',
                    status: 'scheduled',
                    contact_id: '+919111111111',
                    assigned_to_agent_id: 'a1',
                }),
            }),
        );
    });

    it('rejects when lead not assigned to employee caller', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/schedule-site-visit')
            .send({ caller: '+919958860411', lead_id: 'l1', datetime: '2026-04-20T15:00:00.000Z' });
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Update setup.ts** — add `appointment: { findMany: vi.fn(), create: vi.fn() }` (create may need adding).

- [ ] **Step 4: Implement:**

```typescript
router.post('/schedule-site-visit', requireTool('schedule_site_visit'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, datetime, property_id, location } = req.body || {};

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

        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const appt = await prisma.appointment.create({
            data: {
                tenant_id: lead.tenant_id,
                contact_id: lead.contact_phone,
                assigned_to_agent_id: lead.assigned_agent_id,
                type: 'site_visit',
                status: 'scheduled',
                scheduled_at: new Date(datetime),
                ...(property_id ? { inventory_id: property_id } : {}),
                ...(location ? { location } : {}),
            } as any,
        });

        res.json({ ok: true, appointment_id: appt.id, scheduled_at: datetime });
    } catch (err) {
        logger.error('[Tools] schedule_site_visit error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

**Note:** check the real Appointment model for `type`/`status` enum values and `inventory_id` field name. Adjust if needed.

- [ ] **Step 5: Run — expect 3 new PASS.**

---

## Task 4: Build `update_lead_status` Endpoint

**Goal:** Move a lead through the pipeline by updating `Lead.lifecycle_stage` (and optionally log a note).

- [ ] **Step 1: Append tests:**

```typescript
describe('POST /webhooks/internal/tools/update-lead-status', () => {
    const rohan = { /* as before */ };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects missing params', async () => {
        const res = await request(app).post('/webhooks/internal/tools/update-lead-status').send({ caller: '+919958860411', lead_id: 'l1' });
        expect(res.status).toBe(400);
    });

    it('updates lifecycle_stage on owned lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', assigned_agent_id: 'a1', tenant_id: 't1', contact_phone: '+919111111111',
        });
        (prisma.lead.update as any).mockResolvedValue({ id: 'l1', lifecycle_stage: 'negotiation' });

        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1', stage: 'negotiation', note: 'price discussed' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.lead.update).toHaveBeenCalledWith({
            where: { id: 'l1' },
            data: { lifecycle_stage: 'negotiation' },
        });
    });

    it('rejects when employee does not own the lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', assigned_agent_id: 'other', tenant_id: 't1', contact_phone: '+919111111111',
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/update-lead-status')
            .send({ caller: '+919958860411', lead_id: 'l1', stage: 'negotiation' });
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Update setup.ts** — add `update: vi.fn()` to `lead` mock.

- [ ] **Step 3: Implement:**

```typescript
router.post('/update-lead-status', requireTool('update_lead_status'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { lead_id, stage, note } = req.body || {};

    if (!lead_id || !stage) {
        res.status(400).json({ ok: false, error: 'lead_id and stage required' });
        return;
    }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
        if (!lead) { res.status(404).json({ ok: false, error: 'lead not found' }); return; }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const updated = await prisma.lead.update({
            where: { id: lead_id },
            data: { lifecycle_stage: stage },
        });

        // Log stage change via Interaction record (reuse Task 9 pattern)
        if (note) {
            try {
                await prisma.interaction.create({
                    data: {
                        tenant_id: lead.tenant_id,
                        phone_number: lead.contact_phone,
                        channel: 'voice',
                        direction: 'internal',
                        event_type: 'stage_change',
                        content: `[Panditji by ${caller.name}]: stage → ${stage}. Note: ${note}`,
                    } as any,
                });
            } catch (e) {
                logger.warn('[Tools] update_lead_status: failed to log interaction note', e);
            }
        }

        res.json({ ok: true, lead_id: updated.id, stage: updated.lifecycle_stage });
    } catch (err) {
        logger.error('[Tools] update_lead_status error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect 3 new PASS.**

---

## Task 5: Build `get_lead_history` Endpoint

**Goal:** Return interaction timeline for a lead (calls, WhatsApp messages, notes, appointments).

- [ ] **Step 1: Append tests:**

```typescript
describe('GET /webhooks/internal/tools/lead-history', () => {
    const rohan = { /* as before */ };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects missing lead_id', async () => {
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411');
        expect(res.status).toBe(400);
    });

    it('returns interactions for the lead contact, newest first, max 10', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'a1', tenant_id: 't1',
        });
        (prisma.interaction.findMany as any).mockResolvedValue([
            { id: 'i1', channel: 'whatsapp', direction: 'inbound', content: 'hi', created_at: new Date() },
            { id: 'i2', channel: 'voice', direction: 'internal', content: '[note]', created_at: new Date() },
        ]);

        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411&lead_id=l1');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.history).toHaveLength(2);
        expect(prisma.interaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { phone_number: '+919111111111' },
            take: 10,
        }));
    });

    it('rejects when employee does not own the lead', async () => {
        (prisma.lead.findUnique as any).mockResolvedValue({
            id: 'l1', contact_phone: '+919111111111', assigned_agent_id: 'other', tenant_id: 't1',
        });
        const res = await request(app).get('/webhooks/internal/tools/lead-history?caller=%2B919958860411&lead_id=l1');
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Update setup.ts** — add `findMany: vi.fn()` to `interaction` mock.

- [ ] **Step 3: Implement:**

```typescript
router.get('/lead-history', requireTool('get_lead_history'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const leadId = req.query.lead_id as string | undefined;

    if (!leadId) { res.status(400).json({ ok: false, error: 'lead_id required' }); return; }

    try {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) { res.status(404).json({ ok: false, error: 'lead not found' }); return; }
        if (caller.role === 'employee' && lead.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'lead not assigned to you' });
            return;
        }

        const history = await prisma.interaction.findMany({
            where: { phone_number: lead.contact_phone },
            orderBy: { created_at: 'desc' },
            take: 10,
        });

        res.json({
            ok: true,
            history: history.map((h: any) => ({
                id: h.id,
                channel: h.channel,
                direction: h.direction,
                event_type: h.event_type,
                content: h.content,
                created_at: h.created_at,
            })),
        });
    } catch (err) {
        logger.error('[Tools] get_lead_history error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect 3 new PASS.**

---

## Task 6: Build `mark_task_done` Endpoint

**Goal:** Close a pending TaskFollowup.

- [ ] **Step 1: Append tests:**

```typescript
describe('POST /webhooks/internal/tools/mark-task-done', () => {
    const rohan = { /* as before */ };
    beforeEach(() => (prisma.agent.findFirst as any).mockResolvedValue(rohan));

    it('rejects missing task_id', async () => {
        const res = await request(app).post('/webhooks/internal/tools/mark-task-done').send({ caller: '+919958860411' });
        expect(res.status).toBe(400);
    });

    it('updates task status to completed and sets executed_at', async () => {
        (prisma.taskFollowup.findUnique as any).mockResolvedValue({
            id: 't1', phone_number: '+919111111111', status: 'pending',
            contact: { assigned_agent_id: 'a1' },
        });
        (prisma.taskFollowup.update as any).mockResolvedValue({ id: 't1', status: 'completed' });

        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411', task_id: 't1', outcome_note: 'Client not interested' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.taskFollowup.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 't1' },
            data: expect.objectContaining({ status: 'completed', executed_at: expect.any(Date) }),
        }));
    });

    it('rejects when task contact is not assigned to the employee', async () => {
        (prisma.taskFollowup.findUnique as any).mockResolvedValue({
            id: 't1', phone_number: '+919111111111', status: 'pending',
            contact: { assigned_agent_id: 'other' },
        });
        const res = await request(app)
            .post('/webhooks/internal/tools/mark-task-done')
            .send({ caller: '+919958860411', task_id: 't1' });
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Update setup.ts** — add `findUnique: vi.fn(), update: vi.fn()` to `taskFollowup` mock.

- [ ] **Step 3: Implement:**

```typescript
router.post('/mark-task-done', requireTool('mark_task_done'), async (req: Request, res: Response) => {
    const caller: ResolvedCaller = (req as any).caller;
    const { task_id, outcome_note } = req.body || {};

    if (!task_id) { res.status(400).json({ ok: false, error: 'task_id required' }); return; }

    try {
        const task = await prisma.taskFollowup.findUnique({
            where: { id: task_id },
            include: { contact: { select: { assigned_agent_id: true, tenant_id: true, phone_number: true } } },
        });
        if (!task) { res.status(404).json({ ok: false, error: 'task not found' }); return; }

        if (caller.role === 'employee' && (task as any).contact?.assigned_agent_id !== caller.id) {
            res.status(403).json({ ok: false, error: 'task not assigned to you' });
            return;
        }

        const updated = await prisma.taskFollowup.update({
            where: { id: task_id },
            data: { status: 'completed', executed_at: new Date() },
        });

        if (outcome_note) {
            logger.info(`[Tools] mark_task_done ${task_id} outcome: ${outcome_note}`);
            // Also log via Interaction for paper trail
            try {
                await prisma.interaction.create({
                    data: {
                        tenant_id: (task as any).contact?.tenant_id,
                        phone_number: task.phone_number,
                        channel: 'voice',
                        direction: 'internal',
                        event_type: 'task_completed',
                        content: `[Panditji by ${caller.name}]: task ${task_id} completed. Outcome: ${outcome_note}`,
                    } as any,
                });
            } catch (e) {
                logger.warn('[Tools] mark_task_done: failed to log interaction', e);
            }
        }

        res.json({ ok: true, task_id: updated.id, status: updated.status });
    } catch (err) {
        logger.error('[Tools] mark_task_done error:', err);
        res.status(500).json({ ok: false, error: 'internal error' });
    }
});
```

- [ ] **Step 4: Run — expect 3 new PASS.**

---

## Task 7: Update Pipecat tools.py with 5 New Tool Specs

**Files:**
- Modify: `agents/pipecat/tools.py`

- [ ] **Step 1: Add these entries to `TEAM_MEMBER_TOOLS` list:**

```python
{
    "name": "search_inventory",
    "description": (
        "Search available properties in the inventory database matching the "
        "caller's (or their client's) requirement. Use when a team member asks "
        "'mere paas Vaishali mein 2BHK hai?' or 'show me Dwarka rentals'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "Area/city/locality, e.g. 'Vaishali', 'Dwarka Sector 12'"},
            "intent": {"type": "string", "enum": ["buy", "rent", "sell"]},
            "bhk": {"type": "integer"},
            "budget_min": {"type": "number"},
            "budget_max": {"type": "number"},
            "property_type": {"type": "string", "description": "flat / house / plot / shop / office"},
            "furnishing": {"type": "string", "description": "furnished / semi_furnished / unfurnished"},
        },
        "required": ["location", "intent"],
    },
},
{
    "name": "schedule_site_visit",
    "description": (
        "Book a site visit appointment for a lead to view a property. Use after "
        "the caller says 'appointment lagao kal 3 baje' and you know the lead_id."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "lead_id": {"type": "string"},
            "datetime": {"type": "string", "description": "ISO8601 datetime"},
            "property_id": {"type": "string", "description": "Optional inventory ID for the specific property being visited"},
            "location": {"type": "string", "description": "Optional — address of the meeting point"},
        },
        "required": ["lead_id", "datetime"],
    },
},
{
    "name": "update_lead_status",
    "description": (
        "Move a lead through the pipeline by updating its lifecycle stage. Use "
        "when the caller says 'is lead ka stage negotiation kar do' or after a "
        "key milestone (visit done, offer made, deal closed)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "lead_id": {"type": "string"},
            "stage": {"type": "string", "description": "e.g. new, contacted, site_visit_scheduled, site_visit_done, negotiation, closed_won, closed_lost"},
            "note": {"type": "string"},
        },
        "required": ["lead_id", "stage"],
    },
},
{
    "name": "get_lead_history",
    "description": (
        "Pull the recent interaction timeline (WhatsApp messages, notes, calls) "
        "for a lead. Use when caller asks 'is lead ka last kya hua tha?' or "
        "'pura history dikhao'."
    ),
    "parameters": {
        "type": "object",
        "properties": {"lead_id": {"type": "string"}},
        "required": ["lead_id"],
    },
},
{
    "name": "mark_task_done",
    "description": (
        "Close a pending callback or follow-up task. Use after the caller says "
        "'ye kaam ho gaya' or 'task complete kar do'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "task_id": {"type": "string"},
            "outcome_note": {"type": "string"},
        },
        "required": ["task_id"],
    },
},
```

- [ ] **Step 2: Add URL path mappings to `_TOOL_PATHS`:**

```python
_TOOL_PATHS: dict[str, tuple[str, str]] = {
    # Phase 1
    "get_my_leads": ("GET", "/my-leads"),
    "get_my_appointments": ("GET", "/my-appointments"),
    "get_my_tasks": ("GET", "/my-tasks"),
    "search_lead": ("GET", "/search-lead"),
    "schedule_callback": ("POST", "/schedule-callback"),
    "log_call_note": ("POST", "/log-call-note"),
    "send_on_whatsapp": ("POST", "/send-whatsapp"),
    # Phase 2
    "search_inventory": ("GET", "/search-inventory"),
    "schedule_site_visit": ("POST", "/schedule-site-visit"),
    "update_lead_status": ("POST", "/update-lead-status"),
    "get_lead_history": ("GET", "/lead-history"),
    "mark_task_done": ("POST", "/mark-task-done"),
}
```

- [ ] **Step 3: Verify** — count should now be 12 tools:
```bash
python -c "from tools import TEAM_MEMBER_TOOLS; print(len(TEAM_MEMBER_TOOLS))"
```

---

## Task 8: Update Team-Member Prompt

**Files:**
- Modify: `agents/pipecat/prompts/panditji_team_member.txt`

- [ ] **Step 1:** Under the "YOUR TOOLS (7 — Phase 1)" section, change header to "YOUR TOOLS (12)" and append:

```
8. **search_inventory(location, intent, bhk?, budget_min?, budget_max?, property_type?, furnishing?)** — find matching properties in the database
9. **schedule_site_visit(lead_id, datetime, property_id?, location?)** — book a property viewing
10. **update_lead_status(lead_id, stage, note?)** — move a lead through the pipeline
11. **get_lead_history(lead_id)** — pull past interactions for a lead
12. **mark_task_done(task_id, outcome_note?)** — close a pending callback/task
```

- [ ] **Step 2:** Extend the "WHEN TO USE TOOLS" table:

```
| "Vaishali mein 2BHK dikhao" / "Show me 2BHK in Vaishali" | search_inventory |
| "Appointment schedule karo 3 baje" | schedule_site_visit |
| "Is lead ka stage negotiation kar do" | update_lead_status |
| "Is lead ki last history batao" | get_lead_history |
| "Ye kaam done kar do" / "Task complete" | mark_task_done |
```

- [ ] **Step 3:** Add a new paragraph under "WHATSAPP PAPER TRAIL RULE":

```
After `search_inventory` returns results, ALWAYS call `send_on_whatsapp` to send the full list (with property IDs + key details) to the caller's WhatsApp. Say something like "Main ye properties WhatsApp par bhi bhej deta hoon — photos aur details ke saath" before sending.

After `schedule_site_visit` succeeds, call `send_on_whatsapp` with an appointment card: "Site visit: [Property locality], [date] [time], [lead name]. Confirmation sent."

After `update_lead_status`, no WhatsApp confirmation needed unless the caller explicitly wants one.
```

---

## Task 9: Deploy + Smoke Test

- [ ] **Step 1:** SCP all modified files to server:

```bash
scp -i ~/.ssh/realty_pandit_key \
  agents/backend/src/services/tool_permission.ts \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/services/tool_permission.ts

scp -i ~/.ssh/realty_pandit_key \
  agents/backend/src/routes/internal_tools.ts \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/routes/internal_tools.ts

scp -i ~/.ssh/realty_pandit_key \
  agents/pipecat/tools.py \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/tools.py

scp -i ~/.ssh/realty_pandit_key \
  agents/pipecat/prompts/panditji_team_member.txt \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/prompts/panditji_team_member.txt
```

- [ ] **Step 2:** Restart services:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 "pm2 restart realty-backend && pm2 restart panditji-voice"
```

- [ ] **Step 3:** Smoke-test endpoints from the server:

```bash
# search_inventory
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'curl -s "http://127.0.0.1:7071/webhooks/internal/tools/search-inventory?caller=%2B919958860411&location=Delhi&intent=rent"'

# get_lead_history (expect 400 missing lead_id)
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'curl -s "http://127.0.0.1:7071/webhooks/internal/tools/lead-history?caller=%2B919958860411"'
```

- [ ] **Step 4:** Phone-call test from the registered team-member number. Try:
  - "Vaishali mein 2BHK rent chahiye, dikhao"
  - "Priya Sharma ki file ki history batao"
  - "Is lead ka stage negotiation kar do"
  - "Appointment lagao kal 3 baje"

---

## Success Criteria

- All 5 new Phase 2 tools have endpoints with permission checks and passing tests
- Total test count: Phase 1 (30) + Phase 2 (16 new) = 46 in `internal_tools.test.ts`
- `tools.py` has 12 tool definitions
- Team-member prompt references all 12 tools
- End-to-end phone call: Panditji can search inventory → send list on WhatsApp → schedule site visit → confirm via WhatsApp — all in one call
- Permission-denied flows still return friendly message
- No regressions in Phase 1 functionality

---

## Out of Scope for Phase 2 (Future Phases)

- Manager tools (team performance, unassigned leads, reassign) — **Phase 3**
- Super Boss company metrics + 9 AM daily briefing cron call — **Phase 4**
- Rich WhatsApp content — property photos auto-sent, location pins, interactive buttons — **Phase 5**
- Proactive outbound calls to team members for due callbacks — **deferred**
- MatchingEngine integration for smarter fuzzy inventory search — **Phase 5 polish**

---

## Estimated Effort

- Tasks 1–6 (backend endpoints + tests): 1.5 days
- Task 7 (tools.py): 30 min
- Task 8 (prompt): 30 min
- Task 9 (deploy + test): 1 hour
- Buffer for schema field name surprises: 1 day
- **Total: ~3 working days**
