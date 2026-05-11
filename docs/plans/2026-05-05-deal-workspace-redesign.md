# Deal Workspace Redesign + Stage Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin Deal Detail Modal with a full deal workspace (editable requirements, property match+share, appointment booking, complete timeline), and remove the MATCHING_APPOINTMENT stage entirely so QUALIFIED → VISIT_SCHEDULED is a direct hop.

**Architecture:** Backend-first — add schema fields, new endpoints, state machine cleanup. Then replace the inline `DealDetailModal` function inside `DealPipeline.tsx` with a standalone `DealWorkspace` component tree split into focused sub-components. All requirement edits auto-save with 600 ms debounce. Property matching runs on demand with client-side filter overrides fed into a new `GET /api/deals/:id/matched-inventory` endpoint.

**Tech Stack:** TypeScript, React (inline styles / CSS vars — no Tailwind), Express, Prisma (PostgreSQL), BullMQ, WhatsApp Business API (Meta templates), wa.me links for personal share.

---

## File Map

### New files (frontend)
| File | Responsibility |
|---|---|
| `frontend/src/components/deal/DealWorkspace.tsx` | Modal shell, header (customer + coordinator + transfer), tab bar, stage action button |
| `frontend/src/components/deal/RequirementsTab.tsx` | Editable requirement fields, debounced auto-save |
| `frontend/src/components/deal/MatchShareTab.tsx` | Filter controls, matched inventory list, multi-select, company/personal WA send |
| `frontend/src/components/deal/SharedTab.tsx` | Already-shared inventory cards, book appointment form |
| `frontend/src/components/deal/TimelineTab.tsx` | Full chronological event feed |

### Modified files (frontend)
| File | Changes |
|---|---|
| `frontend/src/api/client.ts` | Extend Deal interface; add 6 new API functions |
| `frontend/src/components/DealPipeline.tsx` | Remove MATCHING_APPOINTMENT from STAGES/STAGE_COLORS/STAGE_LABELS; import DealWorkspace; delete old DealDetailModal function |

### Modified files (backend)
| File | Changes |
|---|---|
| `backend/prisma/schema.prisma` | Add `demand_area_min Float?`, `demand_area_max Float?` to Transaction |
| `backend/src/services/transaction_state_machine.ts` | QUALIFIED → VISIT_SCHEDULED (direct); remove MATCHING_APPOINTMENT block from ON_HOLD revive options |
| `backend/src/routes/deals.ts` | Add 4 new endpoints: PATCH requirements, GET matched-inventory, POST share-properties, POST book-appointment |
| `backend/src/services/pipeline_crons.ts` | Remove MATCHING_APPOINTMENT escalation cron block |
| `backend/src/services/property_card_reply_handler.ts` | "Schedule Visit" button → VISIT_SCHEDULED (was MATCHING_APPOINTMENT) |
| `backend/src/services/deal_notifications.ts` | Remove MATCHING_APPOINTMENT notification branch; handle VISIT_SCHEDULED appointment notifications |
| `backend/src/services/interaction_engine.ts` | Remove MATCHING_APPOINTMENT probability block |
| `backend/src/services/ensure_deal.ts` | Remove MATCHING_APPOINTMENT from active stage list |
| `backend/src/services/executive_assigner.ts` | Remove MATCHING_APPOINTMENT from assigned stages list |
| `backend/src/services/system_prompt.ts` | Remove MATCHING_APPOINTMENT case; "schedule visit" → VISIT_SCHEDULED |
| `backend/src/services/performance_monitor.ts` | Remove MATCHING_APPOINTMENT counter |
| `backend/src/services/transaction_service.ts` | Remove MATCHING_APPOINTMENT from active stages |
| `backend/src/validators/deals.validator.ts` | Remove MATCHING_APPOINTMENT from status enum |
| `backend/src/agents/types.ts` | Remove MATCHING_APPOINTMENT from TransactionStatus union |
| `backend/src/agents/coordination_agent.ts` | Remove MATCHING_APPOINTMENT from stage check |
| `backend/src/routes/reports.ts` | Remove MATCHING_APPOINTMENT from lifecycle stages |
| `backend/src/config/whatsapp_templates.ts` | Remove Stage 3 MATCHING_APPOINTMENT templates comment block (keep templates themselves as legacy) |

---

## Task 1 — Prisma: add area fields + migrate

**Files:**
- Modify: `backend/prisma/schema.prisma` (after line 1647 `demand_amenities`)

- [ ] **Step 1: Add two fields to Transaction model**

In `schema.prisma`, after the line `demand_amenities   Json? // Array of desired amenities` (around line 1647), add:

```prisma
  demand_area_min    Float? // Minimum desired area in sqft
  demand_area_max    Float? // Maximum desired area in sqft
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx prisma migrate dev --name add_deal_area_fields
```

Expected output: `✔  Database schema updated`

- [ ] **Step 3: Verify**

```bash
npx prisma studio
# Transaction table → check demand_area_min / demand_area_max columns exist
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add demand_area_min/max to Transaction for deal workspace"
```

---

## Task 2 — State machine: remove MATCHING_APPOINTMENT, wire QUALIFIED → VISIT_SCHEDULED

**Files:**
- Modify: `backend/src/services/transaction_state_machine.ts`

- [ ] **Step 1: Update VALID_TRANSITIONS**

Replace the entire `VALID_TRANSITIONS` constant:

```typescript
const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
    NEW: [
        TransactionStatus.QUALIFIED,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    QUALIFIED: [
        TransactionStatus.VISIT_SCHEDULED,   // Direct — appointment booked removes MA stage
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    MATCHING_APPOINTMENT: [
        // Legacy — existing deals only. No new deals enter this state.
        TransactionStatus.VISIT_SCHEDULED,
        TransactionStatus.QUALIFIED,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    VISIT_SCHEDULED: [
        TransactionStatus.VISITED,
        TransactionStatus.QUALIFIED,         // Visit cancelled — back to matching
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    VISITED: [
        TransactionStatus.NEGOTIATION,
        TransactionStatus.VISIT_SCHEDULED,
        TransactionStatus.QUALIFIED,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
    ],
    NEGOTIATION: [
        TransactionStatus.CLOSED_WON,
        TransactionStatus.CLOSED_LOST,
        TransactionStatus.ON_HOLD,
        TransactionStatus.QUALIFIED,
    ],
    CLOSED_WON: [],
    CLOSED_LOST: [
        TransactionStatus.NEW,
    ],
    ON_HOLD: [
        TransactionStatus.NEW,
        TransactionStatus.QUALIFIED,
        TransactionStatus.VISIT_SCHEDULED,
        TransactionStatus.VISITED,
        TransactionStatus.NEGOTIATION,
        TransactionStatus.CLOSED_LOST,
    ],
    MATCHED: [],
};
```

- [ ] **Step 2: Update getStatusLabel**

In the `getStatusLabel` function, update the MATCHING_APPOINTMENT label to clarify it's legacy:

```typescript
MATCHING_APPOINTMENT: 'Booking Appointment (Legacy)',
```

- [ ] **Step 3: Commit**

```bash
git add src/services/transaction_state_machine.ts
git commit -m "feat: QUALIFIED → VISIT_SCHEDULED direct; deprecate MATCHING_APPOINTMENT flow"
```

---

## Task 3 — Remove MATCHING_APPOINTMENT from all backend services

**Files:** Multiple (see file map)

- [ ] **Step 1: pipeline_crons.ts — remove escalation cron**

In `backend/src/services/pipeline_crons.ts`, find the `// ─── 1. MATCHING_APPOINTMENT escalation` section (around line 75) and the cron job registration that calls it (around line 32). Delete:
- The `runMatchingAppointmentEscalation()` function body (lines ~75-150)
- The `cron.schedule(...)` call that invokes it (around line 30-33)
- The `catch` log line that references `MATCHING_APPOINTMENT escalation`

Replace the numbered comment header at the top to renumber remaining crons.

- [ ] **Step 2: property_card_reply_handler.ts — Schedule Visit → VISIT_SCHEDULED**

In `backend/src/services/property_card_reply_handler.ts`, find the block at line ~113-137 where `'Schedule Visit'` tap transitions to `MATCHING_APPOINTMENT`. Change it to transition directly to `VISIT_SCHEDULED`:

```typescript
// Save selected inventory to deal + transition directly to VISIT_SCHEDULED.
const deal = await prisma.transaction.findUnique({
    where: { id: dealId },
    include: { demand_contact: { select: { phone_number: true, name: true } } },
});
if (!deal) { logger.warn(`[PropCardReply] Deal ${dealId} not found`); return; }

try {
    await prisma.transaction.update({
        where: { id: dealId },
        data: { inventory_id: inventoryId, updated_at: new Date() },
    });
    if (deal.status !== 'VISIT_SCHEDULED') {
        await transitionTransaction(
            dealId,
            TransactionStatus.VISIT_SCHEDULED,
            'system',
            'whatsapp_button',
            { notes: 'Customer tapped Schedule Visit — moved to VISIT_SCHEDULED', inventory_id: inventoryId }
        );
        logger.info(`[PropCardReply] Deal ${dealId} → VISIT_SCHEDULED via Schedule Visit tap`);
    }
} catch (err) {
    logger.warn(`[PropCardReply] Transition to VISIT_SCHEDULED failed:`, (err as Error).message);
}
// Send visit availability message
await whatsapp.sendTemplate(deal.demand_contact!.phone_number!, 'rp_visit_availability', {});
```

- [ ] **Step 3: Remove MATCHING_APPOINTMENT from remaining services**

In each file below, remove any reference to `MATCHING_APPOINTMENT` where it's used as an active state. Keep comments noting "legacy" where the status still technically exists in Prisma:

**`interaction_engine.ts`** — delete the `MATCHING_APPOINTMENT: { ... }` block in the probability matrix.

**`ensure_deal.ts`** — remove `'MATCHING_APPOINTMENT' as TransactionStatus` from the active stages array.

**`executive_assigner.ts`** — remove `TransactionStatus.MATCHING_APPOINTMENT` from the assigned stages list.

**`transaction_service.ts`** — remove `TransactionStatus.MATCHING_APPOINTMENT` from active stages array.

**`agents/types.ts`** — remove `| 'MATCHING_APPOINTMENT'` from the TransactionStatus union type (keep the Prisma-generated type intact, only remove from custom union if present).

**`coordination_agent.ts`** line ~98 — change:
```typescript
if (currentTransaction.status === 'QUALIFIED' || currentTransaction.status === 'MATCHING_APPOINTMENT') {
```
to:
```typescript
if (currentTransaction.status === 'QUALIFIED') {
```

**`performance_monitor.ts`** — remove `MATCHING_APPOINTMENT: number` from the interface and `MATCHING_APPOINTMENT: 0` from the default object.

**`reports.ts`** line ~691 — remove `'MATCHING_APPOINTMENT'` from the lifecycle_stage `in` array.

**`validators/deals.validator.ts`** — remove `'MATCHING_APPOINTMENT'` from the status z.enum list.

- [ ] **Step 4: deal_notifications.ts — remove MATCHING_APPOINTMENT branch**

In `backend/src/services/deal_notifications.ts`, find both `if (ns === 'MATCHING_APPOINTMENT')` blocks (around lines 233 and 321) and delete those conditional branches entirely.

- [ ] **Step 5: Compile check**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: remove MATCHING_APPOINTMENT as active pipeline stage from all services"
```

---

## Task 4 — Backend: PATCH /api/deals/:id/requirements

**Files:**
- Modify: `backend/src/routes/deals.ts`

- [ ] **Step 1: Add the endpoint after the existing share-next-property route (~line 230)**

```typescript
// ─── PATCH /api/deals/:id/requirements — Live-edit customer requirements ─────
router.patch('/:id/requirements', checkPermission('manage_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    const allowed = [
        'demand_intent', 'demand_category', 'demand_type_slug', 'demand_property_type',
        'demand_bedrooms', 'demand_location', 'demand_budget_min', 'demand_budget_max',
        'demand_area_min', 'demand_area_max', 'demand_amenities', 'demand_notes',
    ] as const;

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: { id: true, status: true },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const updates: Record<string, any> = {};
        const changes: Record<string, any> = {};
        for (const key of allowed) {
            if (key in req.body) {
                updates[key] = req.body[key];
                changes[key] = req.body[key];
            }
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        await prisma.$transaction([
            prisma.transaction.update({ where: { id }, data: { ...updates, updated_at: new Date() } }),
            prisma.transactionLog.create({
                data: {
                    transaction_id: id,
                    action: 'REQUIREMENTS_UPDATED' as any,
                    performed_by: agent.id,
                    channel: 'admin',
                    details: { changes, updated_by_name: agent.name },
                },
            }),
        ]);

        res.json({ success: true });
    } catch (err: any) {
        logger.error('[DealAPI] Requirements update error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/deals.ts
git commit -m "feat: PATCH /api/deals/:id/requirements for live CRM field editing"
```

---

## Task 5 — Backend: GET /api/deals/:id/matched-inventory

**Files:**
- Modify: `backend/src/routes/deals.ts`

- [ ] **Step 1: Add endpoint after Task 4's route**

```typescript
// ─── GET /api/deals/:id/matched-inventory — Property matches for deal workspace ─
router.get('/:id/matched-inventory', checkPermission('manage_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;

    // Allow filter overrides from query string
    const {
        intent, category, type_slug, bedrooms, location,
        budget_min, budget_max, area_min, area_max,
    } = req.query as Record<string, string>;

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Which inventory IDs have already been shared for this deal?
        const sharedInteractions = await prisma.interaction.findMany({
            where: {
                event_type: 'property_shared',
                metadata: { path: ['deal_id'], equals: id },
            },
            select: { metadata: true },
        });
        const alreadySharedIds = new Set<string>(
            sharedInteractions.map((s: any) => s.metadata?.inventory_id).filter(Boolean)
        );

        // Build criteria — query overrides take precedence over deal fields
        const { MatchingEngine, buildMatchCriteriaFromLead } = await import('../services/matching_engine');
        const engine = new MatchingEngine();
        const bhkRaw = bedrooms || deal.demand_bedrooms;
        const bhkNum = bhkRaw?.match(/\d+/)?.[0];
        const criteria = buildMatchCriteriaFromLead({
            intent: (intent || deal.demand_intent || 'buy') as 'buy' | 'rent',
            demand_type_slug: type_slug || deal.demand_type_slug || deal.demand_property_type || null,
            budget_min: budget_min ? parseFloat(budget_min) : (deal.demand_budget_min ?? null),
            budget_max: budget_max ? parseFloat(budget_max) : (deal.demand_budget_max ?? null),
            preferred_location: location || deal.demand_location || null,
            demand_bhk: bhkNum ? parseInt(bhkNum, 10) : null,
        });

        const matches = await engine.findMatches(criteria, 50);

        // Mark already-shared; sort unshared to top
        const results = matches.map((m: any) => ({
            ...m,
            already_shared: alreadySharedIds.has(m.id),
        }));
        results.sort((a: any, b: any) => Number(a.already_shared) - Number(b.already_shared));

        res.json({ data: results, already_shared_count: alreadySharedIds.size });
    } catch (err: any) {
        logger.error('[DealAPI] matched-inventory error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Compile check + commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add src/routes/deals.ts
git commit -m "feat: GET /api/deals/:id/matched-inventory with already_shared flag"
```

---

## Task 6 — Backend: POST /api/deals/:id/share-properties

**Files:**
- Modify: `backend/src/routes/deals.ts`

- [ ] **Step 1: Add endpoint**

```typescript
// ─── POST /api/deals/:id/share-properties — Send selected inventory via Meta template ─
router.post('/:id/share-properties', checkPermission('manage_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    const { inventory_ids }: { inventory_ids: string[] } = req.body;

    if (!Array.isArray(inventory_ids) || inventory_ids.length === 0) {
        return res.status(400).json({ error: 'inventory_ids array required' });
    }

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            include: { demand_contact: { select: { phone_number: true, name: true } } },
        });
        if (!deal || !deal.demand_contact?.phone_number) {
            return res.status(404).json({ error: 'Deal or contact not found' });
        }

        const { shareSpecificProperty } = await import('../services/property_sharing');
        const results: Array<{ inventory_id: string; sent: boolean; error?: string }> = [];

        for (const invId of inventory_ids) {
            try {
                await shareSpecificProperty(id, invId, agent.id);
                results.push({ inventory_id: invId, sent: true });
            } catch (err: any) {
                results.push({ inventory_id: invId, sent: false, error: err.message });
            }
        }

        // Log team action time so AI backs off
        await prisma.transaction.update({
            where: { id },
            data: { last_team_action_at: new Date() },
        });

        res.json({ success: true, results });
    } catch (err: any) {
        logger.error('[DealAPI] share-properties error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Add `shareSpecificProperty` to property_sharing.ts**

In `backend/src/services/property_sharing.ts`, add this function after `shareNextProperty`:

```typescript
/**
 * Share a specific inventory item (by ID) for a deal.
 * Used by manual team selection in the deal workspace.
 */
export async function shareSpecificProperty(dealId: string, inventoryId: string, agentId: string): Promise<void> {
    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: { demand_contact: { select: { phone_number: true, name: true } } },
    });
    if (!deal || !deal.demand_contact?.phone_number) {
        throw new Error(`Deal ${dealId} missing or has no contact phone`);
    }

    const inv: any = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { specs: true, features: true },
    });
    if (!inv) throw new Error(`Inventory ${inventoryId} not found`);

    const bhk = inv.specs?.bhk_count ? `${inv.specs.bhk_count}BHK ${inv.type || 'Property'}` : (inv.type || 'Property');
    const society = inv.specs?.society_name || inv.location || 'Property';
    const city = inv.city || inv.district || 'UP';
    const price = formatPrice(inv.price, inv.price_unit);
    const highlight1 = inv.specs?.furnishing ? capitalize(inv.specs.furnishing) : (inv.intent === 'rent' ? 'Available Now' : 'Ready to Move');
    const highlight2 = inv.specs?.floor ? `${inv.specs.floor} Floor` : (inv.specs?.facing ? `${inv.specs.facing} Facing` : 'Prime Location');
    const highlight3 = buildAmenityLine(inv.features);
    const API_BASE = process.env.API_BASE_URL || 'https://api.realtypandit.in';
    const rawImageUrl = inv.media_urls?.[0];
    const imageUrl = rawImageUrl
        ? (rawImageUrl.startsWith('http') ? rawImageUrl : `${API_BASE}${rawImageUrl}`)
        : 'https://realtypandit.in/logo.png';
    const templateName = inv.intent === 'rent' ? 'rp_property_card_rent_v2' : 'rp_property_card_sale_v2';

    await whatsapp.sendTemplate(
        deal.demand_contact.phone_number,
        templateName,
        { p1: bhk, p2: society, p3: city, p4: price, p5: highlight1, p6: highlight2, p7: highlight3 },
        imageUrl,
    );

    await prisma.interaction.create({
        data: {
            tenant_id: deal.tenant_id,
            phone_number: deal.demand_contact.phone_number,
            channel: 'whatsapp',
            direction: 'outbound',
            event_type: 'property_shared',
            content: `Team shared property card: ${bhk} at ${society}`,
            metadata: { deal_id: dealId, inventory_id: inventoryId, shared_by_agent_id: agentId, manual: true },
        },
    });

    logger.info(`[PropShare] Deal ${dealId} → property ${inventoryId} manually shared by agent ${agentId}`);
}
```

- [ ] **Step 3: Compile check + commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add src/routes/deals.ts src/services/property_sharing.ts
git commit -m "feat: POST share-properties; shareSpecificProperty for manual team selection"
```

---

## Task 7 — Backend: POST /api/deals/:id/book-appointment

**Files:**
- Modify: `backend/src/routes/deals.ts`
- Modify: `backend/src/services/deal_notifications.ts`

- [ ] **Step 1: Add book-appointment endpoint**

```typescript
// ─── POST /api/deals/:id/book-appointment — Book visit, move to VISIT_SCHEDULED ─
router.post('/:id/book-appointment', checkPermission('manage_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    const { inventory_id, date, time }: { inventory_id: string; date: string; time: string } = req.body;

    if (!inventory_id || !date || !time) {
        return res.status(400).json({ error: 'inventory_id, date, and time are required' });
    }

    // Validate date format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    // Validate time format: HH:MM
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'time must be HH:MM' });
    }

    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            include: {
                demand_contact: { select: { phone_number: true, name: true } },
                coordinator: { select: { id: true, name: true, phone: true } },
            },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const inv: any = await prisma.inventory.findUnique({
            where: { id: inventory_id },
            select: {
                id: true, type: true, location: true, price: true, price_unit: true,
                key_holder_name: true, key_holder_phone: true,
                specs: { select: { society_name: true, bhk_count: true } },
            },
        });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });

        const visitDateTime = new Date(`${date}T${time}:00+05:30`); // IST

        // 1. Update deal: pin inventory, transition to VISIT_SCHEDULED
        await prisma.transaction.update({
            where: { id },
            data: { inventory_id, updated_at: new Date(), last_team_action_at: new Date() },
        });

        await transitionTransaction(
            id,
            'VISIT_SCHEDULED' as any,
            agent.id,
            'admin',
            { inventory_id, visit_date: date, visit_time: time, booked_by: agent.name }
        );

        // 2. Create Appointment record
        const appointment = await prisma.appointment.create({
            data: {
                tenant_id: deal.tenant_id,
                transaction_id: id,
                inventory_id,
                visit_date: visitDateTime,
                status: 'SCHEDULED',
                notes: `Booked by ${agent.name} on behalf of customer`,
            },
        });

        // 3. Notify — customer, coordinator, key holder
        const { notifyAppointmentBooked } = await import('../services/deal_notifications');
        await notifyAppointmentBooked({ deal: deal as any, inv, appointment, visitDate: date, visitTime: time, bookedByName: agent.name });

        res.json({ success: true, appointment_id: appointment.id });
    } catch (err: any) {
        logger.error('[DealAPI] book-appointment error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Add `notifyAppointmentBooked` to deal_notifications.ts**

In `backend/src/services/deal_notifications.ts`, add at the bottom:

```typescript
/**
 * Fires 3 appointment notifications:
 * 1. Customer — confirmation with date/time
 * 2. Coordinator (lead manager) — deal + visit details
 * 3. Key holder — masked customer details + visit time
 */
export async function notifyAppointmentBooked(params: {
    deal: any;
    inv: any;
    appointment: any;
    visitDate: string;
    visitTime: string;
    bookedByName: string;
}) {
    const { deal, inv, appointment, visitDate, visitTime, bookedByName } = params;
    const whatsapp = new WhatsAppService();
    const propertyLabel = inv.specs?.bhk_count
        ? `${inv.specs.bhk_count}BHK ${inv.type}`
        : inv.type;
    const dateLabel = new Date(`${visitDate}T${visitTime}:00+05:30`)
        .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    // 1. Customer confirmation
    if (deal.demand_contact?.phone_number) {
        try {
            await whatsapp.sendTemplate(
                deal.demand_contact.phone_number,
                'rp_visit_confirmation_customer',
                {
                    customer_name: deal.demand_contact.name || 'Customer',
                    property_label: propertyLabel,
                    location: inv.location || '-',
                    visit_datetime: dateLabel,
                }
            );
        } catch (e) { logger.warn('[Notify] Customer visit confirmation failed:', e); }
    }

    // 2. Coordinator / lead manager
    if (deal.coordinator?.phone) {
        try {
            await whatsapp.sendTemplate(
                deal.coordinator.phone,
                'rp_visit_booked_manager',
                {
                    manager_name: deal.coordinator.name || 'Team',
                    customer_name: deal.demand_contact?.name || 'Customer',
                    customer_phone: deal.demand_contact?.phone_number || '-',
                    property_label: propertyLabel,
                    location: inv.location || '-',
                    visit_datetime: dateLabel,
                }
            );
        } catch (e) { logger.warn('[Notify] Manager visit notification failed:', e); }
    }

    // 3. Key holder (masked customer phone — show only last 4 digits)
    if (inv.key_holder_phone) {
        const rawPhone = deal.demand_contact?.phone_number || '';
        const maskedPhone = rawPhone.length > 4 ? `XXXXXX${rawPhone.slice(-4)}` : 'XXXXXX';
        try {
            await whatsapp.sendTemplate(
                inv.key_holder_phone,
                'rp_visit_keyholder_alert',
                {
                    keyholder_name: inv.key_holder_name || 'Key Holder',
                    property_label: propertyLabel,
                    location: inv.location || '-',
                    visit_datetime: dateLabel,
                    customer_masked_phone: maskedPhone,
                }
            );
        } catch (e) { logger.warn('[Notify] Key holder visit notification failed:', e); }
    }
}
```

- [ ] **Step 3: Add 3 WhatsApp templates to whatsapp_templates.ts**

In `backend/src/config/whatsapp_templates.ts`, add after the QUALIFIED stage block:

```typescript
// ─── Appointment Booking Notifications (3) ──────────────────────────────────

rp_visit_confirmation_customer: {
    name: 'rp_visit_confirmation_customer',
    category: 'UTILITY',
    language: 'en',
    body: '✅ *Visit Confirmed!*\n\nNamaste {{1}} 🙏\n\nAapki property visit book ho gayi hai:\n\n🏡 *{{2}}*\n📍 {{3}}\n📅 {{4}}\n\nHumara team aapka swagat karega. Koi sawaal ho toh humse baat karein. 😊',
    params: [
        { key: 'customer_name', example: 'Nandini Ji' },
        { key: 'property_label', example: '3BHK Flat' },
        { key: 'location', example: 'Raj Nagar Extension, Ghaziabad' },
        { key: 'visit_datetime', example: '12 May 2026, 11:00 AM' },
    ],
    buttons: [],
},

rp_visit_booked_manager: {
    name: 'rp_visit_booked_manager',
    category: 'UTILITY',
    language: 'en',
    body: '📅 *Visit Scheduled*\n\n👤 Customer: {{1}}\n📞 Phone: {{2}}\n🏡 Property: {{3}}\n📍 {{4}}\n🕐 Date/Time: {{5}}\n\nPlease ensure property is ready for visit.',
    params: [
        { key: 'customer_name', example: 'Nandini Paliwal' },
        { key: 'customer_phone', example: '+919182873898' },
        { key: 'property_label', example: '3BHK Flat' },
        { key: 'location', example: 'Raj Nagar Extension, Ghaziabad' },
        { key: 'visit_datetime', example: '12 May 2026, 11:00 AM' },
    ],
    buttons: [],
},

rp_visit_keyholder_alert: {
    name: 'rp_visit_keyholder_alert',
    category: 'UTILITY',
    language: 'en',
    body: '🔑 *Property Visit Alert*\n\nNamaste {{1}} 🙏\n\nEk customer property dekhne aayega:\n\n🏡 *{{2}}*\n📍 {{3}}\n📅 {{4}}\n\nCustomer ka masked number: {{5}}\n\nPlease key aur access ready rakhein. Shukriya!',
    params: [
        { key: 'keyholder_name', example: 'Ramesh Ji' },
        { key: 'property_label', example: '3BHK Flat' },
        { key: 'location', example: 'Raj Nagar Extension, Ghaziabad' },
        { key: 'visit_datetime', example: '12 May 2026, 11:00 AM' },
        { key: 'customer_masked_phone', example: 'XXXXXX3898' },
    ],
    buttons: [],
},
```

- [ ] **Step 4: Compile check + commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add src/routes/deals.ts src/services/deal_notifications.ts src/config/whatsapp_templates.ts
git commit -m "feat: book-appointment endpoint → VISIT_SCHEDULED + 3 WhatsApp notifications"
```

---

## Task 8 — Backend: Enhanced timeline endpoint

**Files:**
- Modify: `backend/src/routes/deals.ts` (find existing `GET /:id/timeline`)

- [ ] **Step 1: Find the existing timeline endpoint**

```bash
grep -n "timeline" src/routes/deals.ts | head -10
```

- [ ] **Step 2: Replace with enriched version**

Find the existing `GET /:id/timeline` handler and replace its body so it aggregates from multiple sources:

```typescript
router.get('/:id/timeline', async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    try {
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: { id: true, demand_contact_id: true, source: true, created_at: true },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // 1. Status transitions (TransactionLog)
        const logs = await prisma.transactionLog.findMany({
            where: { transaction_id: id },
            orderBy: { created_at: 'asc' },
        });

        // 2. All interactions for this deal (calls, WA messages, property shares, etc.)
        const interactions = await prisma.interaction.findMany({
            where: { metadata: { path: ['deal_id'], equals: id } },
            orderBy: { created_at: 'asc' },
        });

        // 3. Team actions (manual call logs, pauses, transfers)
        const teamActions = await prisma.teamAction.findMany({
            where: { transaction_id: id },
            include: { agent: { select: { name: true } } },
            orderBy: { created_at: 'asc' },
        });

        // 4. Appointments
        const appointments = await prisma.appointment.findMany({
            where: { transaction_id: id },
            include: { inventory: { select: { type: true, location: true } } },
            orderBy: { created_at: 'asc' },
        });

        // 5. Requirement updates from TransactionLog (action = REQUIREMENTS_UPDATED)
        // Already captured in logs above.

        // Merge + label all events
        const events: any[] = [
            // Deal created event
            { id: `deal-created`, type: 'deal_created', label: 'Deal Created', source: deal.source, at: deal.created_at },
            ...logs.map(l => ({
                id: l.id, type: l.action, label: formatLogAction(l), at: l.created_at,
                old_status: l.old_status, new_status: l.new_status,
                performed_by: l.performed_by, details: l.details,
            })),
            ...interactions.map((i: any) => ({
                id: i.id, type: i.event_type, label: formatInteractionLabel(i.event_type),
                content: i.content, direction: i.direction, channel: i.channel, at: i.created_at,
                metadata: i.metadata,
            })),
            ...teamActions.map((a: any) => ({
                id: a.id, type: 'team_action', label: a.action_type,
                performed_by_name: a.agent?.name, notes: a.notes, at: a.created_at,
            })),
            ...appointments.map((a: any) => ({
                id: a.id, type: 'appointment', label: 'Appointment Booked',
                visit_date: a.visit_date, status: a.status,
                property_label: a.inventory ? `${a.inventory.type} @ ${a.inventory.location}` : null,
                at: a.created_at,
            })),
        ];

        // Sort chronologically
        events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

function formatLogAction(log: any): string {
    if (log.action === 'STATUS_CHANGED') return `${log.old_status} → ${log.new_status}`;
    if (log.action === 'REQUIREMENTS_UPDATED') {
        const changes = (log.details as any)?.changes || {};
        const fields = Object.keys(changes).map(k => k.replace('demand_', '')).join(', ');
        return `Requirements updated: ${fields}`;
    }
    return log.action;
}

function formatInteractionLabel(eventType: string): string {
    const labels: Record<string, string> = {
        property_shared: 'Property Sent',
        property_share_exhausted: 'All Properties Sent',
        pipeline_cold_nudge: 'AI Follow-up Sent',
        call_initiated: 'Call Made',
        whatsapp_sent: 'WhatsApp Sent',
        whatsapp_received: 'WhatsApp Received',
    };
    return labels[eventType] || eventType;
}
```

- [ ] **Step 3: Compile check + commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add src/routes/deals.ts
git commit -m "feat: enriched timeline endpoint aggregating logs, interactions, team actions, appointments"
```

---

## Task 9 — Backend: deploy + smoke test

- [ ] **Step 1: Deploy backend**

```bash
cd clients/sunny-sharma/projects/reality-pandit
bash deploy-now.sh 2>&1 | tail -20
```

- [ ] **Step 2: Smoke test new endpoints**

```bash
# Replace TOKEN and DEAL_ID with real values from admin panel
TOKEN="<your-jwt>"
DEAL_ID="<a-qualified-deal-id>"
BASE="https://api.realtypandit.in"

# Requirements patch
curl -s -X PATCH "$BASE/api/deals/$DEAL_ID/requirements" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"demand_location":"Indirapuram","demand_budget_max":2500000}' | jq .

# Matched inventory
curl -s "$BASE/api/deals/$DEAL_ID/matched-inventory" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# Timeline
curl -s "$BASE/api/deals/$DEAL_ID/timeline" \
  -H "Authorization: Bearer $TOKEN" | jq 'length'
```

Expected: `{"success":true}`, integer count > 0, integer count >= 1.

---

## Task 10 — Frontend: extend api/client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Extend Deal interface**

Add missing fields to the `Deal` interface:

```typescript
export interface Deal {
    id: string;
    type: string;
    status: string;
    deal_scenario: string | null;
    source?: string;
    demand_contact_id: string;
    supply_contact_id: string | null;
    coordinator_agent_id: string | null;
    demand_handler_type: string | null;
    demand_handler_id: string | null;
    supply_handler_type: string | null;
    supply_handler_id: string | null;
    inventory_id: string | null;
    demand_intent: string | null;
    demand_property_type: string | null;
    demand_type_slug: string | null;
    demand_category: string | null;
    demand_bedrooms: string | null;
    demand_location: string | null;
    demand_budget_min: number | null;
    demand_budget_max: number | null;
    demand_area_min: number | null;      // NEW
    demand_area_max: number | null;      // NEW
    demand_amenities: string[] | null;   // NEW
    demand_notes: string | null;         // NEW
    demand_contact?: { phone_number?: string; name?: string; email?: string; contact_type?: string };
    supply_contact?: { phone_number?: string; name?: string };
    coordinator?: { id: string; name: string; phone?: string };
    inventory?: { id: string; type: string; location: string; price: number | null; media_urls?: string[] };
    valid_next_statuses?: string[];
    ai_status?: string;
    ai_paused?: boolean;
    created_at: string;
    updated_at: string;
}
```

- [ ] **Step 2: Add new API functions**

Add these functions after the existing deal functions:

```typescript
export const updateDealRequirements = (dealId: string, fields: Partial<{
    demand_intent: string;
    demand_category: string;
    demand_type_slug: string;
    demand_property_type: string;
    demand_bedrooms: string;
    demand_location: string;
    demand_budget_min: number;
    demand_budget_max: number;
    demand_area_min: number;
    demand_area_max: number;
    demand_amenities: string[];
    demand_notes: string;
}>) => client.patch(`/api/deals/${dealId}/requirements`, fields);

export const getDealMatchedInventory = (dealId: string, filters?: Record<string, string>) =>
    client.get(`/api/deals/${dealId}/matched-inventory`, { params: filters });

export const shareDealProperties = (dealId: string, inventoryIds: string[]) =>
    client.post(`/api/deals/${dealId}/share-properties`, { inventory_ids: inventoryIds });

export const bookDealAppointment = (dealId: string, payload: {
    inventory_id: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM
}) => client.post(`/api/deals/${dealId}/book-appointment`, payload);

export const getDealPropertyShares = (dealId: string) =>
    client.get(`/api/deals/${dealId}/property-shares`);
```

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: extend Deal interface + 5 new deal workspace API functions"
```

---

## Task 11 — Frontend: DealWorkspace shell + header

**Files:**
- Create: `frontend/src/components/deal/DealWorkspace.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p frontend/src/components/deal
```

Create `frontend/src/components/deal/DealWorkspace.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { Deal } from '../../api/client';
import { STAGE_COLORS, STAGE_LABELS, SCENARIO_LABELS } from '../DealPipeline';
import { RequirementsTab } from './RequirementsTab';
import { MatchShareTab } from './MatchShareTab';
import { SharedTab } from './SharedTab';
import { TimelineTab } from './TimelineTab';
import { getDealTimeline, getDealPropertyShares } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export interface DealWorkspaceProps {
    deal: Deal;
    onClose: () => void;
    onRefresh: () => void;
    onLogCall?: (deal: Deal) => void;
    onVisitOutcome?: (deal: Deal) => void;
    onRevive?: (deal: Deal) => void;
}

type Tab = 'detail' | 'match' | 'shared' | 'timeline';

export function DealWorkspace({ deal, onClose, onRefresh, onLogCall, onVisitOutcome, onRevive }: DealWorkspaceProps) {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<Tab>('detail');
    const [timeline, setTimeline] = useState<any[]>([]);
    const [shares, setShares] = useState<any[]>([]);
    const [loadingMeta, setLoadingMeta] = useState(true);

    const loadMeta = useCallback(async () => {
        try {
            const [tlRes, shRes] = await Promise.all([
                getDealTimeline(deal.id),
                getDealPropertyShares(deal.id).catch(() => ({ data: { data: [] } })),
            ]);
            setTimeline(tlRes.data || []);
            setShares(shRes.data?.data || []);
        } catch { /* silent */ }
        finally { setLoadingMeta(false); }
    }, [deal.id]);

    useEffect(() => { loadMeta(); }, [loadMeta]);

    const phone = deal.demand_contact?.phone_number?.replace(/\D/g, '') || '';
    const coordinatorPhone = (deal.coordinator as any)?.phone || '';

    const tabs: { key: Tab; label: string }[] = [
        { key: 'detail',   label: 'Detail' },
        { key: 'match',    label: '🔍 Match & Share' },
        { key: 'shared',   label: `🏘️ Shared${shares.length ? ` (${shares.length})` : ''}` },
        { key: 'timeline', label: `Timeline${timeline.length ? ` (${timeline.length})` : ''}` },
    ];

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
                zIndex: 100, backdropFilter: 'blur(2px)',
            }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: '16px',
                width: '700px', maxWidth: '95vw', maxHeight: '88vh',
                overflow: 'hidden', zIndex: 101,
                boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
                display: 'flex', flexDirection: 'column',
            }}>

                {/* ── Header ── */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
                    {/* Row 1: customer + coordinator */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Customer block */}
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {deal.demand_contact?.name || 'Unknown'}
                                </span>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    backgroundColor: STAGE_COLORS[deal.status] + '18', color: STAGE_COLORS[deal.status],
                                }}>
                                    {STAGE_LABELS[deal.status] || deal.status}
                                </span>
                                {deal.deal_scenario && (
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                                        backgroundColor: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)',
                                    }}>
                                        {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
                                    </span>
                                )}
                            </div>
                            {/* Call + WA buttons */}
                            {phone && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                    <a href={`tel:+${phone}`}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#16a34a', textDecoration: 'none' }}>
                                        📞 Call
                                    </a>
                                    <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, backgroundColor: 'rgba(37,211,102,0.1)', border: '1.5px solid rgba(37,211,102,0.4)', color: '#25d366', textDecoration: 'none' }}>
                                        💬 WhatsApp
                                    </a>
                                    {onLogCall && (
                                        <button onClick={() => onLogCall(deal)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, backgroundColor: 'rgba(59,130,246,0.1)', border: '1.5px solid rgba(59,130,246,0.4)', color: 'var(--btn-blue-text)', cursor: 'pointer' }}>
                                            📋 Log Call
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Coordinator block (top-right) */}
                        <div style={{ textAlign: 'right', marginLeft: 12 }}>
                            {deal.coordinator ? (
                                <>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Coordinator</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{deal.coordinator.name}</div>
                                    {coordinatorPhone && (
                                        <a href={`tel:${coordinatorPhone}`} style={{ fontSize: 11, color: '#22c55e', textDecoration: 'none' }}>
                                            📞 {coordinatorPhone}
                                        </a>
                                    )}
                                </>
                            ) : (
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unassigned</div>
                            )}
                        </div>

                        {/* Close */}
                        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0 0 12px', minWidth: 36 }}>×</button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-secondary)', padding: '0 20px', overflowX: 'auto', flexShrink: 0 }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                            padding: '10px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                            backgroundColor: 'transparent',
                            color: activeTab === t.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === t.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Tab content ── */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'detail' && (
                        <RequirementsTab deal={deal} onRefresh={onRefresh} onLogCall={onLogCall} onVisitOutcome={onVisitOutcome} onRevive={onRevive} />
                    )}
                    {activeTab === 'match' && (
                        <MatchShareTab deal={deal} onShared={() => { loadMeta(); setActiveTab('shared'); }} />
                    )}
                    {activeTab === 'shared' && (
                        <SharedTab deal={deal} shares={shares} onAppointmentBooked={() => { onRefresh(); onClose(); }} />
                    )}
                    {activeTab === 'timeline' && (
                        <TimelineTab events={timeline} loading={loadingMeta} />
                    )}
                </div>
            </div>
        </>
    );
}
```

> **Note:** `STAGE_COLORS`, `STAGE_LABELS`, `SCENARIO_LABELS` need to be exported from `DealPipeline.tsx`. Do that in Task 15.

- [ ] **Step 2: Commit (compile check after Task 15 when imports resolve)**

```bash
git add src/components/deal/DealWorkspace.tsx
git commit -m "feat: DealWorkspace modal shell with header layout"
```

---

## Task 12 — Frontend: RequirementsTab

**Files:**
- Create: `frontend/src/components/deal/RequirementsTab.tsx`

- [ ] **Step 1: Create file**

```tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Deal } from '../../api/client';
import { updateDealRequirements, updateDealStatus } from '../../api/client';
import { client } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { STAGE_LABELS } from '../DealPipeline';
import { AIStatusBadge } from '../AIStatusBadge';

const INTENT_OPTIONS = ['buy', 'rent_lease'];
const CATEGORY_OPTIONS = ['residential', 'commercial', 'agricultural'];
const BHK_OPTIONS = ['1BHK', '2BHK', '3BHK', '4BHK', '5BHK', 'Studio'];
const COMMON_AMENITIES = ['Lift', 'Parking', 'Swimming Pool', 'Gym', 'Power Backup', 'Security', 'Club House', 'Garden'];

interface Props {
    deal: Deal;
    onRefresh: () => void;
    onLogCall?: (deal: Deal) => void;
    onVisitOutcome?: (deal: Deal) => void;
    onRevive?: (deal: Deal) => void;
}

export function RequirementsTab({ deal, onRefresh, onLogCall, onVisitOutcome, onRevive }: Props) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [fields, setFields] = useState({
        demand_intent:       deal.demand_intent || '',
        demand_category:     deal.demand_category || '',
        demand_type_slug:    deal.demand_type_slug || '',
        demand_bedrooms:     deal.demand_bedrooms || '',
        demand_location:     deal.demand_location || '',
        demand_budget_min:   deal.demand_budget_min ?? '' as any,
        demand_budget_max:   deal.demand_budget_max ?? '' as any,
        demand_area_min:     deal.demand_area_min ?? '' as any,
        demand_area_max:     deal.demand_area_max ?? '' as any,
        demand_amenities:    deal.demand_amenities || [] as string[],
        demand_notes:        deal.demand_notes || '',
    });
    const [saving, setSaving] = useState(false);
    const [statusChanging, setStatusChanging] = useState(false);
    const [aiToggling, setAiToggling] = useState(false);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const save = useCallback(async (updated: typeof fields) => {
        setSaving(true);
        try {
            const payload: Record<string, any> = {};
            if (updated.demand_intent)    payload.demand_intent    = updated.demand_intent;
            if (updated.demand_category)  payload.demand_category  = updated.demand_category;
            if (updated.demand_type_slug) payload.demand_type_slug = updated.demand_type_slug;
            if (updated.demand_bedrooms)  payload.demand_bedrooms  = updated.demand_bedrooms;
            if (updated.demand_location)  payload.demand_location  = updated.demand_location;
            if (updated.demand_budget_min !== '') payload.demand_budget_min = Number(updated.demand_budget_min);
            if (updated.demand_budget_max !== '') payload.demand_budget_max = Number(updated.demand_budget_max);
            if (updated.demand_area_min !== '')   payload.demand_area_min   = Number(updated.demand_area_min);
            if (updated.demand_area_max !== '')   payload.demand_area_max   = Number(updated.demand_area_max);
            payload.demand_amenities = updated.demand_amenities;
            if (updated.demand_notes) payload.demand_notes = updated.demand_notes;
            await updateDealRequirements(deal.id, payload);
        } catch (err: any) {
            showToast('Failed to save requirements', 'error');
        } finally {
            setSaving(false);
        }
    }, [deal.id, showToast]);

    const handleChange = (key: keyof typeof fields, value: any) => {
        const next = { ...fields, [key]: value };
        setFields(next);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => save(next), 600);
    };

    const toggleAmenity = (a: string) => {
        const next = fields.demand_amenities.includes(a)
            ? fields.demand_amenities.filter(x => x !== a)
            : [...fields.demand_amenities, a];
        handleChange('demand_amenities', next);
    };

    const handleStatusChange = async (status: string) => {
        const ok = await confirm(`Move deal to ${STAGE_LABELS[status] || status}?`);
        if (!ok) return;
        setStatusChanging(true);
        try {
            await updateDealStatus(deal.id, status);
            onRefresh();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Status change failed', 'error');
        } finally { setStatusChanging(false); }
    };

    const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
    const selectStyle: React.CSSProperties = { ...inputStyle };

    return (
        <div style={{ padding: '16px 20px' }}>

            {/* Saving indicator */}
            {saving && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Saving...</div>
            )}

            {/* Requirements grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

                {/* Intent */}
                <div>
                    <div style={labelStyle}>Intent</div>
                    <select style={selectStyle} value={fields.demand_intent} onChange={e => handleChange('demand_intent', e.target.value)}>
                        <option value="">— Select —</option>
                        <option value="buy">Buy</option>
                        <option value="rent_lease">Rent / Lease</option>
                    </select>
                </div>

                {/* Category */}
                <div>
                    <div style={labelStyle}>Category</div>
                    <select style={selectStyle} value={fields.demand_category} onChange={e => handleChange('demand_category', e.target.value)}>
                        <option value="">— Select —</option>
                        {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                </div>

                {/* Sub-category / Type */}
                <div>
                    <div style={labelStyle}>Property Type (Sub-category)</div>
                    <input style={inputStyle} value={fields.demand_type_slug} onChange={e => handleChange('demand_type_slug', e.target.value)} placeholder="flat, shop, office, plot…" />
                </div>

                {/* BHK */}
                <div>
                    <div style={labelStyle}>BHK</div>
                    <select style={selectStyle} value={fields.demand_bedrooms} onChange={e => handleChange('demand_bedrooms', e.target.value)}>
                        <option value="">— Select —</option>
                        {BHK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>

                {/* Area min / max */}
                <div>
                    <div style={labelStyle}>Area Min (sqft)</div>
                    <input type="number" style={inputStyle} value={fields.demand_area_min} onChange={e => handleChange('demand_area_min', e.target.value)} placeholder="e.g. 800" />
                </div>
                <div>
                    <div style={labelStyle}>Area Max (sqft)</div>
                    <input type="number" style={inputStyle} value={fields.demand_area_max} onChange={e => handleChange('demand_area_max', e.target.value)} placeholder="e.g. 1500" />
                </div>

                {/* Budget min / max */}
                <div>
                    <div style={labelStyle}>Budget Min (₹)</div>
                    <input type="number" style={inputStyle} value={fields.demand_budget_min} onChange={e => handleChange('demand_budget_min', e.target.value)} placeholder="e.g. 500000" />
                </div>
                <div>
                    <div style={labelStyle}>Budget Max (₹)</div>
                    <input type="number" style={inputStyle} value={fields.demand_budget_max} onChange={e => handleChange('demand_budget_max', e.target.value)} placeholder="e.g. 2500000" />
                </div>

                {/* Preferred location — full width */}
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={labelStyle}>Preferred Location</div>
                    <input style={inputStyle} value={fields.demand_location} onChange={e => handleChange('demand_location', e.target.value)} placeholder="e.g. Raj Nagar Extension, Ghaziabad" />
                </div>
            </div>

            {/* Amenities */}
            <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Preferred Amenities</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {COMMON_AMENITIES.map(a => {
                        const selected = fields.demand_amenities.includes(a);
                        return (
                            <button key={a} type="button" onClick={() => toggleAmenity(a)} style={{
                                padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                backgroundColor: selected ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: selected ? '#fff' : 'var(--text-secondary)',
                                border: `1.5px solid ${selected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                            }}>
                                {a}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Notes</div>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={fields.demand_notes} onChange={e => handleChange('demand_notes', e.target.value)} placeholder="Any additional customer notes…" />
            </div>

            {/* AI Status */}
            {(deal as any).ai_status && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)' }}>
                    <AIStatusBadge status={(deal as any).ai_status} />
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {(deal as any).ai_paused ? 'AI paused' : 'AI automation running'}
                    </div>
                    <button disabled={aiToggling} onClick={async () => {
                        setAiToggling(true);
                        try {
                            const action = (deal as any).ai_paused ? 'RESUMED_AI' : 'PAUSED_AI';
                            await client.post(`/api/deals/${deal.id}/log-action`, { action_type: action });
                            onRefresh();
                        } catch (err: any) { showToast(err?.response?.data?.error || 'Failed', 'error'); }
                        finally { setAiToggling(false); }
                    }} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        backgroundColor: (deal as any).ai_paused ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                        border: '1px solid ' + ((deal as any).ai_paused ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.4)'),
                        color: (deal as any).ai_paused ? '#22c55e' : '#6b7280',
                    }}>
                        {aiToggling ? '...' : (deal as any).ai_paused ? '▶ Resume AI' : '⏸ Pause AI'}
                    </button>
                </div>
            )}

            {/* Stage actions */}
            <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Stage Actions</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(deal.valid_next_statuses || []).map(s => (
                        <button key={s} disabled={statusChanging} onClick={() => handleStatusChange(s)} style={{
                            padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)',
                        }}>
                            → {STAGE_LABELS[s] || s}
                        </button>
                    ))}
                    {deal.status === 'VISIT_SCHEDULED' && onVisitOutcome && (
                        <button type="button" onClick={() => onVisitOutcome(deal)} style={{
                            padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            backgroundColor: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.4)', color: '#f59e0b',
                        }}>
                            📝 Submit Visit Outcome
                        </button>
                    )}
                    {deal.status === 'ON_HOLD' && onRevive && (
                        <button type="button" onClick={() => onRevive(deal)} style={{
                            padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#22c55e',
                        }}>
                            ♻️ Revive Deal
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/deal/RequirementsTab.tsx
git commit -m "feat: RequirementsTab — editable deal requirements with 600ms debounce auto-save"
```

---

## Task 13 — Frontend: MatchShareTab

**Files:**
- Create: `frontend/src/components/deal/MatchShareTab.tsx`

- [ ] **Step 1: Create file**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { Deal } from '../../api/client';
import { getDealMatchedInventory, shareDealProperties } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

interface MatchedProperty {
    id: string;
    type: string;
    location: string;
    city: string;
    price: number | null;
    price_unit: string | null;
    match_score: number;
    already_shared: boolean;
    media_urls?: string[];
    specs?: { society_name?: string; bhk_count?: number };
    intent?: string;
}

interface Filters {
    intent: string;
    category: string;
    type_slug: string;
    bedrooms: string;
    location: string;
    budget_min: string;
    budget_max: string;
}

interface Props {
    deal: Deal;
    onShared: () => void;
}

function formatPrice(price: number | null, unit: string | null): string {
    if (!price) return '-';
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(1)}Cr`;
    if (price >= 100000)   return `₹${(price / 100000).toFixed(1)}L`;
    if (price >= 1000)     return `₹${(price / 1000).toFixed(0)}K`;
    return `₹${price}`;
}

export function MatchShareTab({ deal, onShared }: Props) {
    const { showToast } = useToast();
    const [filters, setFilters] = useState<Filters>({
        intent:     deal.demand_intent || '',
        category:   deal.demand_category || '',
        type_slug:  deal.demand_type_slug || '',
        bedrooms:   deal.demand_bedrooms || '',
        location:   deal.demand_location || '',
        budget_min: deal.demand_budget_min?.toString() || '',
        budget_max: deal.demand_budget_max?.toString() || '',
    });
    const [results, setResults] = useState<MatchedProperty[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sending, setSending] = useState(false);
    const [sendResults, setSendResults] = useState<Record<string, 'pending' | 'sent' | 'failed'>>({});

    const search = useCallback(async () => {
        setLoading(true);
        setSendResults({});
        try {
            const params: Record<string, string> = {};
            if (filters.intent)     params.intent     = filters.intent;
            if (filters.type_slug)  params.type_slug  = filters.type_slug;
            if (filters.bedrooms)   params.bedrooms   = filters.bedrooms;
            if (filters.location)   params.location   = filters.location;
            if (filters.budget_min) params.budget_min = filters.budget_min;
            if (filters.budget_max) params.budget_max = filters.budget_max;
            const res = await getDealMatchedInventory(deal.id, params);
            setResults(res.data.data || []);
        } catch {
            showToast('Failed to load matches', 'error');
        } finally {
            setLoading(false);
        }
    }, [deal.id, filters, showToast]);

    useEffect(() => { search(); }, []); // initial load with deal defaults

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const sendViaCompanyWA = async () => {
        if (selected.size === 0) return;
        setSending(true);
        const ids = Array.from(selected);
        ids.forEach(id => setSendResults(p => ({ ...p, [id]: 'pending' })));
        try {
            const res = await shareDealProperties(deal.id, ids);
            const results: any[] = res.data.results || [];
            results.forEach((r: any) => {
                setSendResults(p => ({ ...p, [r.inventory_id]: r.sent ? 'sent' : 'failed' }));
            });
            const sentCount = results.filter((r: any) => r.sent).length;
            showToast(`${sentCount} propert${sentCount === 1 ? 'y' : 'ies'} sent via WhatsApp`, 'success');
            setSelected(new Set());
            onShared();
        } catch {
            showToast('Send failed', 'error');
        } finally {
            setSending(false);
        }
    };

    const sendViaPersonalWA = () => {
        if (selected.size === 0) return;
        const selectedProps = results.filter(r => selected.has(r.id));
        const lines = selectedProps.map(p => {
            const label = p.specs?.bhk_count ? `${p.specs.bhk_count}BHK ${p.type}` : p.type;
            const society = p.specs?.society_name || p.location;
            const price = formatPrice(p.price, p.price_unit);
            return `🏡 *${label}* — ${society}\n📍 ${p.city}\n💰 ${price}`;
        });
        const msg = encodeURIComponent(
            `Hi! Here are some properties for you:\n\n${lines.join('\n\n')}\n\n— Realty Pandit Team`
        );
        const customerPhone = deal.demand_contact?.phone_number?.replace(/\D/g, '') || '';
        window.open(`https://wa.me/${customerPhone}?text=${msg}`, '_blank');
    };

    const inputStyle: React.CSSProperties = {
        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12,
        outline: 'none', width: '100%', boxSizing: 'border-box',
    };

    return (
        <div style={{ padding: '14px 20px' }}>
            {/* Filters */}
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Search Filters</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <select style={inputStyle} value={filters.intent} onChange={e => setFilters(f => ({ ...f, intent: e.target.value }))}>
                        <option value="">Intent</option>
                        <option value="buy">Buy</option>
                        <option value="rent_lease">Rent</option>
                    </select>
                    <input style={inputStyle} placeholder="Type (flat, shop…)" value={filters.type_slug} onChange={e => setFilters(f => ({ ...f, type_slug: e.target.value }))} />
                    <select style={inputStyle} value={filters.bedrooms} onChange={e => setFilters(f => ({ ...f, bedrooms: e.target.value }))}>
                        <option value="">BHK</option>
                        {['1BHK','2BHK','3BHK','4BHK','5BHK'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <input style={inputStyle} placeholder="Location" value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} />
                    <input type="number" style={inputStyle} placeholder="Budget Min ₹" value={filters.budget_min} onChange={e => setFilters(f => ({ ...f, budget_min: e.target.value }))} />
                    <input type="number" style={inputStyle} placeholder="Budget Max ₹" value={filters.budget_max} onChange={e => setFilters(f => ({ ...f, budget_max: e.target.value }))} />
                </div>
                <button onClick={search} disabled={loading} style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                }}>
                    {loading ? 'Searching…' : '🔍 Search'}
                </button>
            </div>

            {/* Action bar */}
            {selected.size > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, alignSelf: 'center' }}>
                        {selected.size} selected
                    </span>
                    <button onClick={sendViaCompanyWA} disabled={sending} style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        backgroundColor: 'rgba(37,211,102,0.12)', border: '1.5px solid rgba(37,211,102,0.5)', color: '#16a34a',
                    }}>
                        {sending ? '⏳ Sending…' : '📤 Company WhatsApp'}
                    </button>
                    <button onClick={sendViaPersonalWA} style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        backgroundColor: 'rgba(59,130,246,0.1)', border: '1.5px solid rgba(59,130,246,0.4)', color: 'var(--btn-blue-text)',
                    }}>
                        💬 Personal WhatsApp
                    </button>
                </div>
            )}

            {/* Results */}
            {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading matches…</div>
            ) : results.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No matching inventory found. Try adjusting filters.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {results.map(prop => {
                        const isSelected = selected.has(prop.id);
                        const status = sendResults[prop.id];
                        const label = prop.specs?.bhk_count ? `${prop.specs.bhk_count}BHK ${prop.type}` : prop.type;
                        const society = prop.specs?.society_name || prop.location;
                        return (
                            <div key={prop.id} onClick={() => toggleSelect(prop.id)} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                backgroundColor: isSelected ? 'rgba(37,99,235,0.06)' : 'var(--bg-primary)',
                                opacity: prop.already_shared ? 0.65 : 1,
                            }}>
                                {/* Thumbnail */}
                                {prop.media_urls?.[0] ? (
                                    <img src={prop.media_urls[0]} alt="" style={{ width: 52, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: 52, height: 40, borderRadius: 6, backgroundColor: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏡</div>
                                )}
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label} — {society}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📍 {prop.city} · {formatPrice(prop.price, prop.price_unit)}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                        Match: {Math.round((prop.match_score || 0) * 100)}%
                                        {prop.already_shared && <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 600 }}>✓ Already sent</span>}
                                    </div>
                                </div>
                                {/* Status indicator */}
                                {status === 'pending' && <span style={{ fontSize: 14 }}>⏳</span>}
                                {status === 'sent'    && <span style={{ fontSize: 14 }}>✅</span>}
                                {status === 'failed'  && <span style={{ fontSize: 14 }}>❌</span>}
                                {/* Checkbox */}
                                <div style={{
                                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                    border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 11,
                                }}>
                                    {isSelected ? '✓' : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/deal/MatchShareTab.tsx
git commit -m "feat: MatchShareTab — property search, multi-select, company/personal WA send"
```

---

## Task 14 — Frontend: SharedTab with appointment booking

**Files:**
- Create: `frontend/src/components/deal/SharedTab.tsx`

- [ ] **Step 1: Create file**

```tsx
import React, { useState } from 'react';
import type { Deal } from '../../api/client';
import { bookDealAppointment } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

interface ShareRecord {
    id: string;
    inventory_id: string;
    inventory?: {
        id: string;
        type: string;
        location: string;
        price: number | null;
        media_urls?: string[];
        specs?: { society_name?: string; bhk_count?: number };
    };
    shared_at?: string;
    created_at?: string;
    content?: string;
}

interface Props {
    deal: Deal;
    shares: ShareRecord[];
    onAppointmentBooked: () => void;
}

export function SharedTab({ deal, shares, onAppointmentBooked }: Props) {
    const { showToast } = useToast();
    const [bookingFor, setBookingFor] = useState<string | null>(null); // inventory_id
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [booking, setBooking] = useState(false);

    const handleBook = async (inventoryId: string) => {
        if (!date || !time) {
            showToast('Please select date and time', 'error');
            return;
        }
        setBooking(true);
        try {
            await bookDealAppointment(deal.id, { inventory_id: inventoryId, date, time });
            showToast('Appointment booked! Deal moved to Visit Scheduled.', 'success');
            onAppointmentBooked();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Booking failed', 'error');
        } finally {
            setBooking(false);
            setBookingFor(null);
        }
    };

    const inputStyle: React.CSSProperties = {
        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
    };

    if (shares.length === 0) {
        return (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No properties shared yet. Go to Match & Share tab to send properties.
            </div>
        );
    }

    return (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shares.map(share => {
                const inv = share.inventory;
                const label = inv?.specs?.bhk_count ? `${inv.specs.bhk_count}BHK ${inv.type}` : (inv?.type || 'Property');
                const society = inv?.specs?.society_name || inv?.location || '-';
                const price = inv?.price
                    ? inv.price >= 10000000 ? `₹${(inv.price / 10000000).toFixed(1)}Cr`
                    : inv.price >= 100000   ? `₹${(inv.price / 100000).toFixed(1)}L`
                    : `₹${inv.price}`
                    : '-';
                const sharedAt = new Date(share.shared_at || share.created_at || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
                const isBookingThis = bookingFor === share.inventory_id;

                return (
                    <div key={share.id} style={{
                        borderRadius: 10, border: '1px solid var(--border-secondary)',
                        backgroundColor: 'var(--bg-primary)', overflow: 'hidden',
                    }}>
                        {/* Property info row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                            {inv?.media_urls?.[0] ? (
                                <img src={inv.media_urls[0]} alt="" style={{ width: 52, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                                <div style={{ width: 52, height: 40, borderRadius: 6, backgroundColor: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏡</div>
                            )}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label} — {society}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💰 {price} · Sent {sharedAt}</div>
                            </div>
                            {!isBookingThis && (
                                <button
                                    onClick={() => { setBookingFor(share.inventory_id); setDate(''); setTime(''); }}
                                    style={{
                                        padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#16a34a',
                                        whiteSpace: 'nowrap',
                                    }}>
                                    📅 Book Appointment
                                </button>
                            )}
                        </div>

                        {/* Appointment form — expands inline */}
                        {isBookingThis && (
                            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                                    Book visit for {label}
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]} />
                                    <input type="time" style={inputStyle} value={time} onChange={e => setTime(e.target.value)} />
                                    <button onClick={() => handleBook(share.inventory_id)} disabled={booking || !date || !time} style={{
                                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                                        opacity: booking ? 0.7 : 1,
                                    }}>
                                        {booking ? 'Booking…' : '✅ Confirm'}
                                    </button>
                                    <button onClick={() => setBookingFor(null)} style={{
                                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)',
                                    }}>
                                        Cancel
                                    </button>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Customer, coordinator & key holder will be notified automatically.
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/deal/SharedTab.tsx
git commit -m "feat: SharedTab — shared inventory list + inline appointment booking"
```

---

## Task 15 — Frontend: TimelineTab

**Files:**
- Create: `frontend/src/components/deal/TimelineTab.tsx`

- [ ] **Step 1: Create file**

```tsx
import React from 'react';

interface TimelineEvent {
    id: string;
    type: string;
    label: string;
    at: string;
    old_status?: string;
    new_status?: string;
    performed_by?: string;
    performed_by_name?: string;
    content?: string;
    direction?: string;
    channel?: string;
    metadata?: any;
    visit_date?: string;
    status?: string;
    property_label?: string;
    source?: string;
    details?: any;
}

const EVENT_ICONS: Record<string, string> = {
    deal_created:          '🟢',
    STATUS_CHANGED:        '🔄',
    REQUIREMENTS_UPDATED:  '✏️',
    property_shared:       '🏠',
    property_share_exhausted: '📦',
    pipeline_cold_nudge:   '💬',
    call_initiated:        '📞',
    whatsapp_sent:         '📤',
    whatsapp_received:     '📥',
    team_action:           '👤',
    appointment:           '📅',
    CLOSED:                '🔒',
    REOPENED:              '🔓',
};

interface Props {
    events: TimelineEvent[];
    loading: boolean;
}

export function TimelineTab({ events, loading }: Props) {
    if (loading) {
        return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading timeline…</div>;
    }
    if (events.length === 0) {
        return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No events yet.</div>;
    }

    return (
        <div style={{ padding: '14px 20px' }}>
            <div style={{ position: 'relative' }}>
                {/* Vertical line */}
                <div style={{ position: 'absolute', left: 16, top: 0, bottom: 0, width: 2, backgroundColor: 'var(--border-secondary)' }} />

                {events.map((ev, i) => {
                    const icon = EVENT_ICONS[ev.type] || '•';
                    const ts = new Date(ev.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

                    let detail: React.ReactNode = null;
                    if (ev.type === 'STATUS_CHANGED') {
                        detail = <span style={{ fontWeight: 600 }}>{ev.old_status} → {ev.new_status}</span>;
                    } else if (ev.type === 'REQUIREMENTS_UPDATED') {
                        const changes = ev.details?.changes || {};
                        detail = (
                            <div>
                                {Object.entries(changes).map(([k, v]) => (
                                    <div key={k} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                        <span style={{ fontWeight: 600 }}>{k.replace('demand_', '')}</span>: {String(v)}
                                    </div>
                                ))}
                            </div>
                        );
                    } else if (ev.type === 'property_shared') {
                        detail = <span>{ev.content}</span>;
                    } else if (ev.type === 'appointment') {
                        detail = (
                            <span>
                                {ev.property_label} · {ev.visit_date ? new Date(ev.visit_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                            </span>
                        );
                    } else if (ev.content) {
                        detail = <span>{ev.content}</span>;
                    } else if (ev.source) {
                        detail = <span>Source: {ev.source}</span>;
                    }

                    return (
                        <div key={ev.id || i} style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}>
                            {/* Dot */}
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                backgroundColor: 'var(--bg-secondary)', border: '2px solid var(--border-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, zIndex: 1,
                            }}>
                                {icon}
                            </div>
                            {/* Content */}
                            <div style={{ flex: 1, paddingTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{ts}</div>
                                </div>
                                {detail && (
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        {detail}
                                    </div>
                                )}
                                {(ev.performed_by_name || ev.performed_by) && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                        by {ev.performed_by_name || ev.performed_by}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/deal/TimelineTab.tsx
git commit -m "feat: TimelineTab — complete chronological event feed with icons"
```

---

## Task 16 — Frontend: update DealPipeline.tsx

**Files:**
- Modify: `frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Export constants so DealWorkspace can import them**

Add `export` keyword to the three constants near the top of the file:

```typescript
export const STAGES = [...] as const;
export const STAGE_COLORS: Record<string, string> = { ... };
export const STAGE_LABELS: Record<string, string> = { ... };
export const SCENARIO_LABELS: Record<string, string> = { ... };
```

- [ ] **Step 2: Remove MATCHING_APPOINTMENT from those constants**

In `STAGES`, remove `'MATCHING_APPOINTMENT'`.
In `STAGE_COLORS`, remove the `MATCHING_APPOINTMENT: '#ec4899'` entry.
In `STAGE_LABELS`, remove the `MATCHING_APPOINTMENT: 'Booking Appt'` entry.

- [ ] **Step 3: Replace import and usage of DealDetailModal**

At the top of `DealPipeline.tsx`, add:

```typescript
import { DealWorkspace } from './deal/DealWorkspace';
```

Find the `{/* Deal Detail Modal */}` block (around line 907) and replace it:

```tsx
{/* Deal Workspace */}
{selectedDeal && (
    <DealWorkspace
        deal={selectedDeal}
        onClose={closeSelectedDeal}
        onRefresh={fetchData}
        onLogCall={d => setLogCallDeal(d)}
        onVisitOutcome={openVisitOutcomeModal}
        onRevive={d => { setReviveStage(''); setReviveDeal(d); }}
    />
)}
```

- [ ] **Step 4: Delete the old DealDetailModal function**

Delete everything from `// ─── Deal Detail Modal ──────────────────────────────────────────────────────` (around line 1228) to the end of the file (the `DealDetailModal` function and its helpers `formatBudget`).

> **Note:** `formatBudget` was previously defined at module level and duplicated inside DealDetailModal. Keep the module-level definition, delete only the one inside the old modal function.

- [ ] **Step 5: Remove MATCHING_APPOINTMENT case from `getStageInfoLine` or any switch**

Search for `case 'MATCHING_APPOINTMENT':` in the file and delete that case block.

- [ ] **Step 6: Remove the ON_HOLD revive stage option for MATCHING_APPOINTMENT**

In the revive modal select options (around line 1200), remove:
```tsx
<option value="MATCHING_APPOINTMENT">Booking Appointment</option>
```

- [ ] **Step 7: TypeScript compile check**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors. Common fixes:
- If `getDealTimeline` or `getDealPropertyShares` aren't exported from `api/client.ts`, add them.
- If `updateDealStatus` isn't exported, it should already exist — check spelling.

- [ ] **Step 8: Commit**

```bash
git add src/components/DealPipeline.tsx src/components/deal/
git commit -m "feat: replace DealDetailModal with DealWorkspace; remove MATCHING_APPOINTMENT from pipeline UI"
```

---

## Task 17 — Build + deploy + verify

- [ ] **Step 1: Build frontend**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` — no errors.

- [ ] **Step 2: Deploy everything**

```bash
cd clients/sunny-sharma/projects/reality-pandit
bash deploy-now.sh 2>&1 | tail -15
```

- [ ] **Step 3: Manual verify checklist**

Open https://admin.realtypandit.in → Deal Pipeline:

1. **MATCHING_APPOINTMENT column gone** — pipeline shows: New → Qualified → Visit Scheduled → Visited → Negotiation
2. **Click any deal card** → DealWorkspace opens
3. **Header**: customer name + Call + WhatsApp + Log Call buttons at top; coordinator name + phone top-right
4. **Detail tab**: all requirement fields visible and editable; change Budget Max → save indicator appears → refresh shows saved value
5. **Match & Share tab**: results load pre-filtered by deal requirements; already-sent items show "✓ Already sent" and appear at bottom; select 2 items → "Company WhatsApp" → check customer phone received WhatsApp cards
6. **Personal WhatsApp**: select items → click Personal WhatsApp → opens wa.me link with pre-filled message
7. **Shared tab**: shows previously sent properties; click "Book Appointment" → date + time form expands → confirm → deal moves to Visit Scheduled → modal closes
8. **Timeline tab**: shows full chronological feed — deal created, stage change, property sends, requirement updates
9. **Back button on phone**: modal closes, stays on Deal Pipeline page (from previous fix)

- [ ] **Step 4: Verify WhatsApp templates registered on Meta**

The 3 new templates (`rp_visit_confirmation_customer`, `rp_visit_booked_manager`, `rp_visit_keyholder_alert`) need to be submitted via Meta Business Suite → WhatsApp Manager → Message Templates. Submit them and note that they may take up to 24h to approve. Until approved, the `book-appointment` endpoint will succeed but the 3 notifications will log a warning and continue (they're wrapped in try/catch).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: deal workspace redesign + MATCHING_APPOINTMENT stage removal — complete"
```

---

## Self-Review

**Spec coverage check:**
- ✅ All stages — standard design; RequirementsTab applies to all statuses
- ✅ Intent · Category · Sub-Category · BHK · Area Min/Max · Amenities · Budget · Location — all in RequirementsTab
- ✅ Editable at any stage, auto-save 600ms debounce, logged to timeline
- ✅ Coordinator top-right; customer call/WA top-left
- ✅ Property search pre-filled from deal; team can modify filters before searching
- ✅ Unshared inventory on top; already-shared marked + at bottom
- ✅ Multi-select with Company WhatsApp (Meta template with 3 reply buttons) and Personal WhatsApp (wa.me)
- ✅ Shared tab shows all sent properties; Book Appointment inline form
- ✅ Appointment booking → VISIT_SCHEDULED directly (MATCHING_APPOINTMENT skipped)
- ✅ Notifications on booking: customer, coordinator, key holder (masked phone)
- ✅ Timeline: all events — stage changes, requirement edits (field-level detail), calls, WA messages, property shares, appointments
- ✅ Transfer ownership — **GAP**: transfer button not added to DealWorkspace header

**Transfer ownership fix** — add to Task 16 Step 3, inside the DealWorkspace header (after the coordinator block):

The existing transfer modal machinery (`ownershipTransferDeal`, `openTransferModal`) lives in `DealPipeline.tsx`. Pass it as a prop:

In `DealWorkspaceProps`, add: `onTransfer?: (deal: Deal) => void`

In `DealWorkspace.tsx` header, after the coordinator block add:

```tsx
{onTransfer && (
    <button onClick={() => onTransfer(deal)} style={{
        marginTop: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        backgroundColor: 'rgba(249,115,22,0.1)', border: '1.5px solid rgba(249,115,22,0.4)', color: '#f97316',
    }}>
        🔁 Transfer
    </button>
)}
```

In `DealPipeline.tsx` where `DealWorkspace` is rendered, add:

```tsx
onTransfer={d => openTransferModal(d)}
```

Add this to Task 16 Step 3 before committing.
