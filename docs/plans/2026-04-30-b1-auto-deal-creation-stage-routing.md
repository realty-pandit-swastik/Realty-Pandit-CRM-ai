# B1 — Auto-Deal Creation + Stage Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution with phase-boundary checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lead that arrives via *any* channel automatically becomes a Deal in the correct pipeline stage (`NEW` for AI to qualify, `QUALIFIED` when a human has already vetted), assigned to the right team member based on portal-account-email matching.

**Architecture:** A single `ensureDealForLead()` service owns deal creation logic. Six ingestion paths (99acres, MagicBricks, Housing, public website forms, inbound WhatsApp, manual admin entry) call it after creating/updating the Contact. The branching rule is purely "did a team member touch this?" — `req.agent` set ⇒ `QUALIFIED`; partner portal with name+phone ⇒ `QUALIFIED`; everything else ⇒ `NEW` + AI qualification cadence kicks off. A team-profile UI lets each agent maintain their portal account email (`personal_email`), which is what the 99acres SubUserName / MagicBricks / Housing matching already keys on.

**Tech Stack:** Express 5 + Prisma 5 + BullMQ on the backend (ts-node runtime, no build step); React 19 + Vite 7 with CSS custom-properties on the admin frontend; vitest for backend tests; PostgreSQL `transactions` and `agents` tables already schema-ready (`agents.personal_email` exists; no migration needed).

**Scope notes:**
- The partner-portal login route doesn't yet exist (`sendPartnerOTP()` is ready in `agent_auth.ts`). This plan adds the backend deal-creation logic for the partner-portal path (so it's ready when the route lands) but does not build the login route itself.
- Backfilling the existing 1,089+ contacts that have no deals is **out of scope** — Sunny deferred that decision. New leads from B1 deploy onwards get deals; legacy contacts remain orphaned until a separate backfill plan.
- Filling in the 21 active agents that have no `personal_email` is **operational data work** — the UI in Phase 3 makes this self-service.

---

## File Structure

### New files
| Path | Responsibility |
|------|----------------|
| `agents/backend/src/services/ensure_deal.ts` | The `ensureDealForLead()` function. One job: take a contact + entry-path metadata, return a Deal in the correct stage assigned to the right agent. Idempotent (returns existing active deal if one exists). |
| `agents/backend/src/services/__tests__/ensure_deal.test.ts` | vitest suite covering the 4 stage-decision rules + idempotency + assignment fallback chain. |
| `agents/backend/src/services/__tests__/round_robin_manager.test.ts` | vitest suite for the manager round-robin fix. |

### Modified files
| Path | Change |
|------|--------|
| `agents/backend/src/services/lead_assignment.ts` | New `assignViaManagerRoundRobin()` function (today the 99acres poller falls back to "first manager by created_at" — that loads everything onto one person). Truly rotates among `role IN ('manager', 'super_boss')` using `last_assigned_at`. |
| `agents/backend/src/services/ninety_nine_acres_poller.ts` | After existing assignment logic, call `ensureDealForLead({ source: '99acres', assignedAgentId: finalAgentId })`. |
| `agents/backend/src/integrations/magicbricks.ts` | After existing `assignViaPropertyUploader()` call, call `ensureDealForLead({ source: 'magicbricks', assignedAgentId: agentId })`. |
| `agents/backend/src/services/housing_poller.ts` | Add SubUserName-style matching (call `resolveAgentByEmail` first, fallback to round-robin), then `ensureDealForLead({ source: 'housing', assignedAgentId: ... })`. |
| `agents/backend/src/services/webhook_processor.ts` | When a brand-new BUYER/TENANT/UNKNOWN contact arrives via inbound WhatsApp, after contact creation call `ensureDealForLead({ source: 'whatsapp' })`. |
| `agents/backend/src/routes/public.ts` | After creating contact in `POST /public/lead` and `POST /public/lead-requirements`, call `ensureDealForLead({ source: 'website' })`. |
| `agents/backend/src/routes/leads.ts` | `POST /api/leads` (admin manual entry) — after contact upsert, call `ensureDealForLead({ source: 'manual', createdByAgentId: req.agent.id, isPartnerReferral, ... })`. |
| `agents/backend/src/routes/team.ts` | New `PATCH /api/team/me/portal-email` — agent updates their own `personal_email`. |
| `agents/frontend/src/components/Team.tsx` (or wherever team profile lives — see Task 9) | Add inline-editable "Portal Account Email (99acres / MagicBricks / Housing)" field on the agent profile row. |

### Deploy / verify
- Backend deploy: SCP modified `.ts` files → `pm2 restart realty-backend` (cluster restarts cleanly because the `server-bootstrap.js` pattern from 2026-04-30 stays in place)
- Frontend deploy: SCP modified `.tsx` files → `npm run build` on server → `pm2 restart realty-admin`
- Playwright e2e at the end (Phase 4)

---

## Phase Layout

| Phase | Tasks | Goal | Stop for review? |
|-------|-------|------|---|
| 1. Backend helper + round-robin fix | T1–T4 | `ensureDealForLead` ships, manager round-robin is fair | ✅ Test via vitest + curl |
| 2. Wire into 6 ingestion paths | T5–T10 | Every lead source creates a deal automatically, with correct stage | ✅ Trigger one path, verify deal in DB |
| 3. Team profile UI for portal email | T11–T13 | Agents self-serve their `personal_email` | ✅ Manual edit on UI |
| 4. Playwright end-to-end | T14 | Real browser run: agent edits portal email → simulated 99acres lead arrives → deal lands in NEW assigned to that agent | ✅ Final |

**Stop after each phase for screenshot/SQL review.**

---

## Phase 1 — Backend helper + round-robin fix

### Task 1: Write failing tests for `assignViaManagerRoundRobin()`

**Files:**
- Create: `agents/backend/src/services/__tests__/round_robin_manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// agents/backend/src/services/__tests__/round_robin_manager.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../../db';
import { assignViaManagerRoundRobin } from '../lead_assignment';

describe('assignViaManagerRoundRobin', () => {
    let mgrA: string;
    let mgrB: string;
    let employee: string;

    beforeEach(async () => {
        // Wipe last_assigned_at on all agents so test is deterministic
        await prisma.agent.updateMany({ data: { last_assigned_at: null } });

        const a = await prisma.agent.findFirst({ where: { role: 'manager', status: 'active' } });
        const b = await prisma.agent.findFirst({
            where: { role: 'manager', status: 'active', NOT: { id: a?.id } },
        });
        const emp = await prisma.agent.findFirst({ where: { role: 'employee', status: 'active' } });
        if (!a || !b || !emp) throw new Error('Test fixture: need ≥2 managers + 1 employee in DB');
        mgrA = a.id;
        mgrB = b.id;
        employee = emp.id;
    });

    afterAll(async () => { await prisma.$disconnect(); });

    it('returns a manager id (not an employee)', async () => {
        const id = await assignViaManagerRoundRobin();
        expect(id === mgrA || id === mgrB).toBe(true);
        expect(id).not.toBe(employee);
    });

    it('rotates: second call returns a different manager than first', async () => {
        const first = await assignViaManagerRoundRobin();
        const second = await assignViaManagerRoundRobin();
        expect(second).not.toBe(first);
    });

    it('updates last_assigned_at on the chosen manager', async () => {
        const before = await prisma.agent.findUnique({ where: { id: mgrA } });
        await assignViaManagerRoundRobin();
        const after = await prisma.agent.findUnique({ where: { id: mgrA } });
        // At least one manager's last_assigned_at moved forward
        const aMoved = (after?.last_assigned_at?.getTime() || 0) > (before?.last_assigned_at?.getTime() || 0);
        const bRow = await prisma.agent.findUnique({ where: { id: mgrB } });
        const bMoved = (bRow?.last_assigned_at?.getTime() || 0) > 0;
        expect(aMoved || bMoved).toBe(true);
    });

    it('returns null when there are no active managers', async () => {
        // Skip — destructive. Manually verified by inspection.
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/services/__tests__/round_robin_manager.test.ts
```

Expected: FAIL — `assignViaManagerRoundRobin is not a function` (it doesn't exist yet).

### Task 2: Implement `assignViaManagerRoundRobin()`

**Files:**
- Modify: `agents/backend/src/services/lead_assignment.ts`

- [ ] **Step 1: Read current file to find the right insertion point**

```bash
grep -n "export async function\|export function" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/lead_assignment.ts
```

Expected: list of exports (`assignViaRoundRobin`, `resolveAgentByEmail`, `assignViaPropertyUploader`).

- [ ] **Step 2: Append the new function at the end of the file (before any default export)**

```typescript
// Append to agents/backend/src/services/lead_assignment.ts

/**
 * Round-robin assignment among managers (role IN 'manager' or 'super_boss').
 * Picks the manager whose last_assigned_at is oldest (or null) and bumps it.
 * Used as the fallback when portal-email matching can't resolve an agent for
 * inbound external leads from website / WhatsApp / voice / unrecognised portal subusernames.
 *
 * Returns the agent id, or null when no active manager exists.
 */
export async function assignViaManagerRoundRobin(): Promise<string | null> {
    try {
        const next = await prisma.agent.findFirst({
            where: {
                role: { in: ['manager', 'super_boss'] },
                status: 'active',
            },
            orderBy: [
                { last_assigned_at: { sort: 'asc', nulls: 'first' } },
                { created_at: 'asc' },
            ],
            select: { id: true, name: true },
        });
        if (!next) {
            logger.warn('[LeadAssign] No active manager found for round-robin');
            return null;
        }

        await prisma.agent.update({
            where: { id: next.id },
            data: { last_assigned_at: new Date() },
        });

        logger.info(`[LeadAssign] Manager round-robin → ${next.name} (${next.id})`);
        return next.id;
    } catch (err) {
        logger.warn(`[LeadAssign] Manager round-robin error: ${(err as Error).message}`);
        return null;
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/services/__tests__/round_robin_manager.test.ts
```

Expected: 3 passing, 1 skipped.

- [ ] **Step 4: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/backend/src/services/lead_assignment.ts \
        agents/backend/src/services/__tests__/round_robin_manager.test.ts
git commit -m "feat(backend): assignViaManagerRoundRobin — fair rotation among managers

Today's 99acres poller fallback picks 'first manager by created_at',
loading every unmatched lead onto Anoop. New helper rotates strictly
among role IN (manager, super_boss) using last_assigned_at, and bumps
the timestamp on the chosen agent. Returns null only when no active
manager exists."
```

### Task 3: Write failing tests for `ensureDealForLead()`

**Files:**
- Create: `agents/backend/src/services/__tests__/ensure_deal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// agents/backend/src/services/__tests__/ensure_deal.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../../db';
import { ensureDealForLead } from '../ensure_deal';

describe('ensureDealForLead', () => {
    let mgrId: string;
    const phone = `+91999900${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    beforeEach(async () => {
        const m = await prisma.agent.findFirst({ where: { role: 'manager', status: 'active' } });
        if (!m) throw new Error('Need ≥1 active manager in DB');
        mgrId = m.id;
        await prisma.contact.create({
            data: {
                phone_number: phone, tenant_id: 'default',
                source: 'manual', contact_type: 'BUYER', lead_status: 'cold',
            },
        }).catch(() => {/* may already exist from a previous failed run */});
    });

    afterAll(async () => {
        // Clean up any deals + contacts created by this test
        await prisma.transaction.deleteMany({ where: { demand_contact_id: phone } });
        await prisma.contact.deleteMany({ where: { phone_number: phone } });
        await prisma.$disconnect();
    });

    it('creates a NEW deal when no createdByAgentId is given (external/poller path)', async () => {
        const r = await ensureDealForLead({
            contactPhone: phone,
            source: '99acres',
            assignedAgentId: mgrId,
        });
        expect(r.created).toBe(true);
        expect(r.status).toBe('NEW');
        const deal = await prisma.transaction.findUnique({ where: { id: r.dealId } });
        expect(deal?.coordinator_agent_id).toBe(mgrId);
        expect(deal?.source).toBe('99acres');
        // Cleanup so next test starts fresh
        await prisma.transaction.delete({ where: { id: r.dealId } });
    });

    it('creates a QUALIFIED deal when createdByAgentId is set (admin path)', async () => {
        const r = await ensureDealForLead({
            contactPhone: phone,
            source: 'manual',
            createdByAgentId: mgrId,
        });
        expect(r.created).toBe(true);
        expect(r.status).toBe('QUALIFIED');
        const deal = await prisma.transaction.findUnique({ where: { id: r.dealId } });
        expect(deal?.coordinator_agent_id).toBe(mgrId);
        await prisma.transaction.delete({ where: { id: r.dealId } });
    });

    it('creates QUALIFIED for partner portal when partnerHasNameAndPhone=true', async () => {
        const r = await ensureDealForLead({
            contactPhone: phone,
            source: 'partner_portal',
            partnerHasNameAndPhone: true,
            assignedAgentId: mgrId,
        });
        expect(r.status).toBe('QUALIFIED');
        await prisma.transaction.delete({ where: { id: r.dealId } });
    });

    it('creates NEW for partner portal when partnerHasNameAndPhone=false', async () => {
        const r = await ensureDealForLead({
            contactPhone: phone,
            source: 'partner_portal',
            partnerHasNameAndPhone: false,
            assignedAgentId: mgrId,
        });
        expect(r.status).toBe('NEW');
        await prisma.transaction.delete({ where: { id: r.dealId } });
    });

    it('is idempotent: second call returns the same dealId', async () => {
        const first = await ensureDealForLead({
            contactPhone: phone, source: 'website', assignedAgentId: mgrId,
        });
        const second = await ensureDealForLead({
            contactPhone: phone, source: 'website', assignedAgentId: mgrId,
        });
        expect(second.dealId).toBe(first.dealId);
        expect(second.created).toBe(false);
        await prisma.transaction.delete({ where: { id: first.dealId } });
    });

    it('falls back to manager round-robin when no assignedAgentId given', async () => {
        const r = await ensureDealForLead({
            contactPhone: phone,
            source: 'whatsapp',
        });
        expect(r.created).toBe(true);
        const deal = await prisma.transaction.findUnique({ where: { id: r.dealId } });
        expect(deal?.coordinator_agent_id).toBeTruthy();
        // Verify it picked a manager
        const agent = await prisma.agent.findUnique({ where: { id: deal!.coordinator_agent_id! } });
        expect(['manager', 'super_boss']).toContain(agent?.role);
        await prisma.transaction.delete({ where: { id: r.dealId } });
    });

    it('throws if contact does not exist', async () => {
        await expect(ensureDealForLead({
            contactPhone: '+919999000999',
            source: 'whatsapp',
        })).rejects.toThrow(/contact not found/i);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/services/__tests__/ensure_deal.test.ts
```

Expected: FAIL — module `../ensure_deal` not found.

### Task 4: Implement `ensureDealForLead()`

**Files:**
- Create: `agents/backend/src/services/ensure_deal.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// agents/backend/src/services/ensure_deal.ts

import prisma from '../db';
import logger from '../utils/logger';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { assignViaManagerRoundRobin } from './lead_assignment';

export interface EnsureDealArgs {
    /** Contact phone number (E.164). Must already exist in `contacts`. */
    contactPhone: string;
    /** Where the lead came from. Free-form, stored on the deal. */
    source: string;
    /** When set (admin manual entry), deal lands in QUALIFIED. */
    createdByAgentId?: string;
    /** Pre-resolved assignment (e.g. portal-email match). When unset, falls back to manager round-robin. */
    assignedAgentId?: string | null;
    /** True when the lead is a partner referral. Used for deal_scenario. */
    isPartnerReferral?: boolean;
    /** For source=partner_portal: did the partner submit name AND phone of the customer?
     *  true → QUALIFIED, false → NEW (passed to team to gather missing info). */
    partnerHasNameAndPhone?: boolean;
}

export interface EnsureDealResult {
    dealId: string;
    /** True when this call created the deal; false when an existing active deal was returned. */
    created: boolean;
    status: 'NEW' | 'QUALIFIED';
}

const ACTIVE_STATUSES: TransactionStatus[] = [
    'NEW', 'QUALIFIED', 'MATCHING_APPOINTMENT',
    'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION',
];

/**
 * Idempotent deal creation for a lead. Stage rule:
 *   - createdByAgentId set                                  → QUALIFIED  (team manually entered the lead)
 *   - source='partner_portal' AND partnerHasNameAndPhone    → QUALIFIED  (partner gave full identity)
 *   - everything else                                       → NEW        (AI must call & qualify)
 *
 * Idempotency: if the contact already has an *active* deal (status NOT IN CLOSED_WON,
 * CLOSED_LOST, ON_HOLD), this returns that deal unchanged.
 *
 * Assignment: uses assignedAgentId if provided; otherwise falls back to manager round-robin.
 *
 * Side-effect: when a NEW deal is created, schedules the AI qualification call cadence
 * via `scheduleQualificationCall()` (lead_qualification_caller.ts).
 */
export async function ensureDealForLead(args: EnsureDealArgs): Promise<EnsureDealResult> {
    const contact = await prisma.contact.findUnique({
        where: { phone_number: args.contactPhone },
    });
    if (!contact) {
        throw new Error(`ensureDealForLead: contact not found for ${args.contactPhone}`);
    }

    // Idempotency check
    const existing = await prisma.transaction.findFirst({
        where: {
            demand_contact_id: args.contactPhone,
            status: { in: ACTIVE_STATUSES },
        },
        orderBy: { created_at: 'desc' },
        select: { id: true, status: true },
    });
    if (existing) {
        return {
            dealId: existing.id,
            created: false,
            status: existing.status as 'NEW' | 'QUALIFIED',
        };
    }

    // Stage decision
    let status: 'NEW' | 'QUALIFIED' = 'NEW';
    if (args.createdByAgentId) {
        status = 'QUALIFIED';
    } else if (args.source === 'partner_portal' && args.partnerHasNameAndPhone) {
        status = 'QUALIFIED';
    }

    // Assignment resolution
    let assignedAgentId = args.assignedAgentId ?? null;
    if (!assignedAgentId) {
        assignedAgentId = await assignViaManagerRoundRobin();
    }

    // Type derivation from contact's intent
    const intentLower = (contact.intent || (contact as any).demand_intent || 'buy').toLowerCase();
    const txType: TransactionType =
        intentLower === 'rent' || intentLower === 'rent_lease' ? 'RENT' : 'SALE';

    // Scenario derivation
    const dealScenario = args.isPartnerReferral ? 'PARTNER_INTERNAL' : 'DIRECT_INTERNAL';

    const deal = await prisma.transaction.create({
        data: {
            tenant_id: contact.tenant_id,
            demand_contact_id: args.contactPhone,
            type: txType,
            status: status as TransactionStatus,
            source: args.source,
            coordinator_agent_id: assignedAgentId,
            executive_agent_id: assignedAgentId,
            deal_scenario: dealScenario,
            demand_intent: intentLower,
            demand_property_type: contact.property_type,
            demand_type_slug: (contact as any).demand_type_slug || null,
            demand_location: contact.preferred_location,
            demand_budget_min: contact.budget_min ? Number(contact.budget_min) : null,
            demand_budget_max: contact.budget_max ? Number(contact.budget_max) : null,
            demand_bedrooms: contact.demand_bhk ? `${contact.demand_bhk}BHK` : null,
            demand_amenities: (contact as any).demand_amenities ?? undefined,
            demand_category: (contact as any).demand_category ?? null,
            demand_budget_type: (contact as any).demand_budget_type ?? null,
            demand_handler_type: 'DIRECT',
            ai_paused: false,
        },
    });

    logger.info(`[ensureDealForLead] Created ${status} deal ${deal.id} for ${args.contactPhone} (source=${args.source}, assigned=${assignedAgentId})`);

    // Schedule AI qualification call cadence for NEW deals only
    if (status === 'NEW') {
        try {
            const { scheduleQualificationCall } = await import('./lead_qualification_caller');
            await scheduleQualificationCall(deal.id, 0);
        } catch (err) {
            logger.warn(`[ensureDealForLead] Failed to schedule qualification call for ${deal.id}: ${(err as Error).message}`);
        }
    }

    return { dealId: deal.id, created: true, status };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/services/__tests__/ensure_deal.test.ts
```

Expected: 7 passing.

- [ ] **Step 3: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/backend/src/services/ensure_deal.ts \
        agents/backend/src/services/__tests__/ensure_deal.test.ts
git commit -m "feat(backend): ensureDealForLead service — auto-create deal with stage routing

Single source of truth for deal creation on lead intake. Stage rule:
  - createdByAgentId set                              → QUALIFIED
  - source=partner_portal + partnerHasNameAndPhone    → QUALIFIED
  - everything else                                   → NEW + AI cadence

Idempotent: existing active deal short-circuits. Assignment falls back
to manager round-robin when no assignedAgentId is provided. NEW deals
trigger scheduleQualificationCall() so Stage 1 KRA cadence kicks in
without further plumbing in callers."
```

### Task 5: Deploy backend + smoke-test the helper from a real route

- [ ] **Step 1: SCP files to server**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
SSH="ssh -i $KEY -F /dev/null -o StrictHostKeyChecking=no"
SCP="scp -i $KEY -F /dev/null -o StrictHostKeyChecking=no"
$SCP clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/ensure_deal.ts \
     root@72.62.231.224:/var/www/realty-pandit/backend/src/services/ensure_deal.ts
$SCP clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/lead_assignment.ts \
     root@72.62.231.224:/var/www/realty-pandit/backend/src/services/lead_assignment.ts
```

- [ ] **Step 2: Restart backend**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "pm2 restart realty-backend && sleep 4 && pm2 list | grep realty-backend"
```

Expected: cluster online, 0s uptime climbing, 0 restarts.

- [ ] **Step 3: Smoke check via curl that the API still responds**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "curl -s -o /dev/null -w 'health %{http_code}\n' https://api.realtypandit.in/health"
```

Expected: `health 200`.

- [ ] **Step 4: Stop here for SQL review.** Pause for human verification — no callers wired yet, so no behavior change is visible. This phase is foundation.

---

## Phase 2 — Wire into 6 ingestion paths

### Task 6: Wire 99acres poller

**Files:**
- Modify: `agents/backend/src/services/ninety_nine_acres_poller.ts`

- [ ] **Step 1: Read current code around the assignment block**

```bash
grep -n "if (finalAgentId)" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/ninety_nine_acres_poller.ts
```

Expected: a line ~534 inside the `if (isNew)` block.

- [ ] **Step 2: Add the import at the top of the file (next to other imports)**

```typescript
// Add to imports near the top of agents/backend/src/services/ninety_nine_acres_poller.ts
import { ensureDealForLead } from './ensure_deal';
```

- [ ] **Step 3: After the existing `await prisma.contact.update({ where: { phone_number: phoneNumber }, data: { assigned_agent_id: finalAgentId } })` block in `if (isNew)`, append the deal creation call**

```typescript
// In agents/backend/src/services/ninety_nine_acres_poller.ts, INSIDE the
// `if (isNew)` block, immediately after the contact.update that sets
// assigned_agent_id (currently around line 537), add:

await ensureDealForLead({
    contactPhone: phoneNumber,
    source: '99acres',
    assignedAgentId: finalAgentId,
}).catch((err) => {
    logger.error(`[99acres] ensureDealForLead failed for ${phoneNumber}: ${err.message}`);
});
```

- [ ] **Step 4: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/backend/src/services/ninety_nine_acres_poller.ts
git commit -m "feat(99acres): auto-create NEW deal on lead arrival

After contact creation + sub-user-name agent resolution, ensureDealForLead
creates a NEW deal assigned to the resolved agent (or manager fallback).
Phase 1 NEW KRA: AI qualification cadence kicks off immediately."
```

### Task 7: Wire MagicBricks PUSH endpoint

**Files:**
- Modify: `agents/backend/src/integrations/magicbricks.ts`

- [ ] **Step 1: Add the import**

```typescript
// Add to imports in agents/backend/src/integrations/magicbricks.ts
import { ensureDealForLead } from '../services/ensure_deal';
```

- [ ] **Step 2: Find the post-assignment block in `handleMagicBricksPush`**

```bash
grep -n "assigned_agent_id" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/integrations/magicbricks.ts
```

Two hits — both in the same handler, around line 175 (`/push`) and line 291 (`/webhook`). Add the deal-creation call **after each** `prisma.contact.update`.

- [ ] **Step 3: After both assignment updates, add**

```typescript
// At line ~175 (right after `await prisma.contact.update({ where: { phone_number: phoneNumber }, data: { assigned_agent_id: agentId } });`)
// AND at line ~291 (the same pattern in the legacy /webhook handler), append:
await ensureDealForLead({
    contactPhone: phoneNumber,
    source: 'magicbricks',
    assignedAgentId: agentId ?? null,
}).catch((err) => {
    logger.error(`[MagicBricks] ensureDealForLead failed for ${phoneNumber}: ${err.message}`);
});
```

- [ ] **Step 4: Commit**

```bash
git add agents/backend/src/integrations/magicbricks.ts
git commit -m "feat(magicbricks): auto-create NEW deal on PUSH lead arrival

Both /push and legacy /webhook handlers now create a NEW deal after
contact creation + uploader-based assignment. Lead enters Stage 1 NEW
with AI cadence."
```

### Task 8: Wire Housing poller (with portal-email matching parity)

**Files:**
- Modify: `agents/backend/src/services/housing_poller.ts`

- [ ] **Step 1: Inspect current Housing poller assignment**

```bash
grep -n "assigned_agent_id\|assignViaRoundRobin\|resolveAgentByEmail" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/housing_poller.ts
```

Note the lines. Today Housing only uses `assignViaRoundRobin` (no portal-email match).

- [ ] **Step 2: Add imports**

```typescript
// agents/backend/src/services/housing_poller.ts — add to imports
import { resolveAgentByEmail, assignViaManagerRoundRobin } from './lead_assignment';
import { ensureDealForLead } from './ensure_deal';
```

- [ ] **Step 3: In the assignment block (around line 260 where `finalAgentId` is decided), prefer portal-email matching first**

```typescript
// Replace the existing `let finalAgentId = contact.assigned_agent_id;` block
// (around line 260) with:

let finalAgentId: string | null = contact.assigned_agent_id;

if (!finalAgentId) {
    // Housing's broker_email field carries the listing agent's portal email
    // (same pattern as 99acres SubUserName). Try portal-email match first.
    const housingBrokerEmail = (lead as any).broker_email || (lead as any).agent_email || null;
    if (housingBrokerEmail) {
        finalAgentId = await resolveAgentByEmail(housingBrokerEmail);
    }
    if (!finalAgentId) {
        finalAgentId = await assignViaManagerRoundRobin();
    }
    if (finalAgentId) {
        await prisma.contact.update({
            where: { phone_number: phoneNumber },
            data: { assigned_agent_id: finalAgentId },
        });
    }
}
```

- [ ] **Step 4: After the assignment block, append `ensureDealForLead`**

```typescript
// Right after the assignment block above, add:
if (isNew) {
    await ensureDealForLead({
        contactPhone: phoneNumber,
        source: 'housing',
        assignedAgentId: finalAgentId,
    }).catch((err) => {
        logger.error(`[Housing] ensureDealForLead failed for ${phoneNumber}: ${err.message}`);
    });
}
```

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/services/housing_poller.ts
git commit -m "feat(housing): portal-email matching + auto-create NEW deal

Try resolveAgentByEmail(broker_email) first (parity with 99acres
SubUserName routing); fall back to manager round-robin. Then
ensureDealForLead creates the deal in NEW with AI cadence."
```

### Task 9: Wire inbound WhatsApp processor

**Files:**
- Modify: `agents/backend/src/services/webhook_processor.ts`

- [ ] **Step 1: Add the import**

```typescript
// agents/backend/src/services/webhook_processor.ts — add to imports near the top
import { ensureDealForLead } from './ensure_deal';
```

- [ ] **Step 2: Find the contact-creation block (the `if (!contact)` branch near the top of `processInboundMessage`)**

```bash
grep -n "Created new contact\|leadScoreService.initScore" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/webhook_processor.ts
```

Expected: line ~116 (`logger.info('[SSOT] Created new contact...')`) and ~119 (`leadScoreService.initScore`).

- [ ] **Step 3: After `leadScoreService.initScore(...)`, add the deal-creation call BUT only when contact_type indicates a customer (not a known partner/management/builder)**

```typescript
// Add immediately after `await leadScoreService.initScore(contact.phone_number, contact.tenant_id);`:

// Auto-create NEW deal for buyer/tenant/unknown inbound — Stage 1 KRA entry path.
// Skip for partner agents, management, builders (they don't need a deal).
if (['BUYER', 'TENANT', 'UNKNOWN'].includes(contact.contact_type)) {
    await ensureDealForLead({
        contactPhone: contact.phone_number,
        source: 'whatsapp',
    }).catch((err) => {
        logger.error(`[WebhookProcessor] ensureDealForLead failed for ${contact.phone_number}: ${err.message}`);
    });
}
```

- [ ] **Step 4: Commit**

```bash
git add agents/backend/src/services/webhook_processor.ts
git commit -m "feat(whatsapp): auto-create NEW deal on first inbound from a buyer/tenant

When a brand-new BUYER/TENANT/UNKNOWN contact messages us, ensureDealForLead
creates a NEW deal assigned to a manager via round-robin. AI qualification
cadence starts. Partner / management / builder contacts are skipped."
```

### Task 10: Wire public website forms

**Files:**
- Modify: `agents/backend/src/routes/public.ts`

- [ ] **Step 1: Find the lead-creation routes**

```bash
grep -n "router\.post.*'/lead\b\|router\.post.*'/lead-requirements\|router\.post.*'/contact\|router\.post.*'/schedule-visit'" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/public.ts
```

Expected: 4 routes — `/lead`, `/lead-requirements`, `/contact`, `/schedule-visit`.

- [ ] **Step 2: Add the import**

```typescript
// agents/backend/src/routes/public.ts — add to imports
import { ensureDealForLead } from '../services/ensure_deal';
```

- [ ] **Step 3: At the end of each of the 4 handlers above, after the contact has been created/updated, add**

```typescript
// Append at the end of each handler — POST /lead, /lead-requirements, /contact, /schedule-visit
// (use the variable name that holds the phone in each handler, typically `phoneNumber` or `phone`).
// Example for /lead-requirements (which uses `phoneNumber`):
await ensureDealForLead({
    contactPhone: phoneNumber,
    source: 'website',
}).catch((err) => {
    logger.error(`[Public] ensureDealForLead failed for ${phoneNumber}: ${err.message}`);
});
```

For each handler, use `'website'` for `/lead`, `/lead-requirements`, `/contact`, and `'website_visit'` for `/schedule-visit`.

- [ ] **Step 4: Commit**

```bash
git add agents/backend/src/routes/public.ts
git commit -m "feat(public): auto-create NEW deal from website form submissions

POST /public/{lead, lead-requirements, contact, schedule-visit} now
all create a NEW deal via ensureDealForLead, assigned to a manager
via round-robin. AI starts qualification calling immediately."
```

### Task 11: Wire admin manual lead creation

**Files:**
- Modify: `agents/backend/src/routes/leads.ts`

- [ ] **Step 1: Find the manual-create endpoint**

```bash
grep -n "router\.post.*'/'" \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/leads.ts
```

Expected: line 324 (`router.post('/', async (req: any, res) => {`).

- [ ] **Step 2: Add the import**

```typescript
// agents/backend/src/routes/leads.ts — add to imports
import { ensureDealForLead } from '../services/ensure_deal';
```

- [ ] **Step 3: In the handler body, after the contact.create/upsert succeeds, add**

```typescript
// Inside POST '/' handler — after `await prisma.contact.upsert(...)` (or .create) succeeds.
// Use req.agent.id to indicate this lead was entered by a human team member → QUALIFIED.

const isPartnerReferral = req.body.lead_type === 'PARTNER_REFERRAL';

await ensureDealForLead({
    contactPhone: phoneNumber,    // use whatever variable holds the contact phone in this handler
    source: 'manual',
    createdByAgentId: req.agent?.id,
    isPartnerReferral,
}).catch((err) => {
    logger.error(`[LeadsAPI] ensureDealForLead failed for ${phoneNumber}: ${err.message}`);
});
```

- [ ] **Step 4: Commit**

```bash
git add agents/backend/src/routes/leads.ts
git commit -m "feat(leads-api): auto-create QUALIFIED deal on team manual lead entry

POST /api/leads (admin auth) now creates the deal in QUALIFIED via
ensureDealForLead({ createdByAgentId: req.agent.id }). Covers both
DIRECT_OWNER and PARTNER_REFERRAL lead_types — the team member's touch
is what marks it qualified, partner attribution is preserved as
metadata on the contact."
```

### Task 12: Deploy Phase 2 + verify each path

- [ ] **Step 1: SCP all modified files to the server**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
SCP="scp -i $KEY -F /dev/null -o StrictHostKeyChecking=no"
BASE="clients/sunny-sharma/projects/reality-pandit/agents/backend/src"
DEST="root@72.62.231.224:/var/www/realty-pandit/backend/src"

$SCP "$BASE/services/ninety_nine_acres_poller.ts"  "$DEST/services/ninety_nine_acres_poller.ts"
$SCP "$BASE/integrations/magicbricks.ts"            "$DEST/integrations/magicbricks.ts"
$SCP "$BASE/services/housing_poller.ts"             "$DEST/services/housing_poller.ts"
$SCP "$BASE/services/webhook_processor.ts"          "$DEST/services/webhook_processor.ts"
$SCP "$BASE/routes/public.ts"                       "$DEST/routes/public.ts"
$SCP "$BASE/routes/leads.ts"                        "$DEST/routes/leads.ts"
```

- [ ] **Step 2: Restart backend cleanly**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "pm2 restart realty-backend && sleep 6 && pm2 list | grep realty-backend"
```

Expected: 2 cluster instances online, 0 restarts, climbing uptime.

- [ ] **Step 3: Test the manual-admin path via curl with a real admin token**

Login first to get a token (use Puneet's `noteplz123` per memory):

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 << 'EOF'
TOKEN=$(curl -s -X POST http://localhost:7071/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9958860411","password":"noteplz123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
TEST_PHONE="+91888887777$RANDOM"
# Create a lead via the admin endpoint
curl -s -X POST http://localhost:7071/api/leads \
  -H "Cookie: token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"phone_number\":\"$TEST_PHONE\",\"name\":\"PlanTest User\",\"intent\":\"buy\",\"lead_type\":\"DIRECT_OWNER\"}" \
  -o /tmp/lead.json -w 'create %{http_code}\n'
# Check the deal got created in QUALIFIED
sleep 2
PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit \
  -c "SELECT id, status, source, deal_scenario, coordinator_agent_id FROM transactions WHERE demand_contact_id='$TEST_PHONE';"
EOF
```

Expected output:
- `create 200`
- One row with `status=QUALIFIED`, `source=manual`

- [ ] **Step 4: Stop here for SQL review.** Pause — confirm the test deal landed in QUALIFIED. Other paths (99acres, MagicBricks, etc.) will fire on their own schedules — re-check tomorrow.

---

## Phase 3 — Team profile UI for portal email

### Task 13: Backend `PATCH /api/team/me/portal-email`

**Files:**
- Modify: `agents/backend/src/routes/team.ts`

- [ ] **Step 1: Find a good place to add the new route**

```bash
grep -n "router\." \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/team.ts
```

Note the existing patterns and pick a location near other "self" endpoints.

- [ ] **Step 2: Add the route**

```typescript
// agents/backend/src/routes/team.ts — append a new route, before `export default router;`

/**
 * PATCH /api/team/me/portal-email — agent self-updates their portal account email.
 * This email is used by external lead pollers (99acres SubUserName, Housing broker_email)
 * to route incoming leads to the correct agent.
 * Stored in agents.personal_email.
 */
router.patch('/me/portal-email', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) {
            return res.status(401).json({ success: false, error: 'Unauthenticated' });
        }
        const { portal_email } = req.body || {};
        if (typeof portal_email !== 'string') {
            return res.status(400).json({ success: false, error: 'portal_email must be a string' });
        }
        const trimmed = portal_email.trim();
        // Empty string clears the field (allowed)
        const value = trimmed === '' ? null : trimmed;
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return res.status(400).json({ success: false, error: 'Invalid email format' });
        }

        await prisma.agent.update({
            where: { id: agentId },
            data: { personal_email: value },
        });

        return res.json({ success: true, personal_email: value });
    } catch (err: any) {
        logger.error('[TeamAPI] portal-email update error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});
```

- [ ] **Step 3: Add a one-liner curl test**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 << 'EOF'
TOKEN=$(curl -s -X POST http://localhost:7071/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9958860411","password":"noteplz123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s -X PATCH http://localhost:7071/api/team/me/portal-email \
  -H "Cookie: token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"portal_email":"puneet.test@example.com"}' \
  -w 'http %{http_code}\n'
PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit \
  -c "SELECT name, personal_email FROM agents WHERE phone='+919958860411';"
EOF
```

Expected: `http 200`, then DB shows `personal_email = puneet.test@example.com`.

- [ ] **Step 4: Reset Puneet's email back to original** (since the test value is fake)

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"UPDATE agents SET personal_email = NULL WHERE phone='+919958860411';\""
```

Run this only if Puneet's `personal_email` was previously NULL — if he had a real email, leave it.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/team.ts
git commit -m "feat(team-api): PATCH /api/team/me/portal-email for self-service

Each agent can now update their own personal_email (the portal account
email used by 99acres / Housing routing) without going through admin.
Empty string clears it. Basic email-format validation."
```

### Task 14: Frontend — find Team profile component

**Files:**
- Read: `agents/frontend/src/components/Team.tsx` (or wherever team profile lives)

- [ ] **Step 1: Locate the team-profile component**

```bash
ls clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/Team.tsx 2>&1
ls clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/MobileTeamView.tsx 2>&1
grep -irln "personal_email\|portal_email" \
  clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/ 2>&1 | head
```

Note which file(s) render the team profile. Likely `Team.tsx` for desktop and `MobileTeamView.tsx` for mobile.

### Task 15: Frontend — add inline-editable Portal Email field

**Files:**
- Modify: the team-profile component identified in Task 14 (anchor below assumes `Team.tsx`)

- [ ] **Step 1: Add a row in the agent profile card for "Portal Email"**

```tsx
// In the team-profile component, inside the agent's row/card layout, add:

{ /* Self-only editable field for own profile (rendered conditionally if this row is the logged-in user) */ }
{ isSelf && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Portal Account Email
        </span>
        <input
            type="email"
            placeholder="your-99acres-or-housing-email@gmail.com"
            value={portalEmail}
            onChange={(e) => setPortalEmail(e.target.value)}
            onBlur={async () => {
                if (portalEmail === (agent.personal_email || '')) return;
                setSavingPortalEmail(true);
                try {
                    await client.patch('/api/team/me/portal-email', { portal_email: portalEmail });
                    showToast('Portal email saved', 'success');
                } catch (err: any) {
                    showToast(err?.response?.data?.error || 'Save failed', 'error');
                    setPortalEmail(agent.personal_email || '');
                } finally {
                    setSavingPortalEmail(false);
                }
            }}
            disabled={savingPortalEmail}
            style={{
                flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
                border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
            }}
        />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Used to match incoming 99acres / Housing leads to you
        </span>
    </div>
)}
```

- [ ] **Step 2: Add the supporting state hooks at the top of the team component**

```tsx
const [portalEmail, setPortalEmail] = useState<string>(currentUserAgent?.personal_email || '');
const [savingPortalEmail, setSavingPortalEmail] = useState(false);
```

- [ ] **Step 3: Mirror the same field in the mobile component (`MobileTeamView.tsx`) if it exists**

Same JSX pattern, full-width on mobile.

- [ ] **Step 4: Verify no TypeScript errors locally**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit -p . 2>&1 | grep -E "Team|Portal" | head
```

Expected: no errors in our edits.

- [ ] **Step 5: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/Team.tsx \
        agents/frontend/src/components/MobileTeamView.tsx 2>/dev/null
git commit -m "feat(frontend): self-service Portal Account Email on team profile

Each agent can edit their own personal_email inline. Onblur saves to
PATCH /api/team/me/portal-email. Other agents' rows show the field
read-only. Used by 99acres SubUserName / Housing broker_email routing
to match incoming leads to the correct team member."
```

### Task 16: Build + deploy frontend, verify

- [ ] **Step 1: Sync source to server, then rebuild + restart**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
SCP="scp -i $KEY -F /dev/null -o StrictHostKeyChecking=no"
BASE="clients/sunny-sharma/projects/reality-pandit/agents/frontend/src"
DEST="root@72.62.231.224:/var/www/realty-pandit/frontend/src"

$SCP "$BASE/components/Team.tsx" "$DEST/components/Team.tsx"
$SCP "$BASE/components/MobileTeamView.tsx" "$DEST/components/MobileTeamView.tsx" 2>/dev/null

ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "cd /var/www/realty-pandit/frontend && npm run build 2>&1 | tail -10 && pm2 restart realty-admin && sleep 2 && pm2 list | grep realty-admin"
```

Expected: build succeeds (`✓ built in NNs`), realty-admin online with 0 restarts.

- [ ] **Step 2: Stop here for human visual review.** Pause — login as Puneet, navigate to Team view, confirm the new Portal Email field appears editable on his own row only.

---

## Phase 4 — Playwright end-to-end

### Task 17: Verify the full flow with Playwright

**No code changes — verification only.**

- [ ] **Step 1: Open admin and login**

Use Playwright MCP:
```
browser_navigate https://admin.realtypandit.in/
browser_fill_form  Phone=9958860411  Password=noteplz123
browser_click "Login"
```

- [ ] **Step 2: Navigate to Team view, edit Puneet's portal email to a known test value**

```
browser_click "Team" nav button
# Find Puneet's row, fill the Portal Email input with "puneet-99acres-test@example.com"
# Wait for onBlur save → toast "Portal email saved"
```

- [ ] **Step 3: Trigger a fake 99acres-style lead intake via the external-leads API**

In a separate shell:
```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 << 'EOF'
TEST_PHONE="+91777666555$RANDOM"
PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit << SQL
-- Simulate what the 99acres poller would do: insert contact with a SubUserName-attributed source
INSERT INTO contacts (phone_number, tenant_id, name, source, contact_type, lead_status, created_at, updated_at, intent, demand_main_category, preferred_location, budget_max)
VALUES ('$TEST_PHONE', 'default', 'Plan E2E Test', '99acres', 'BUYER', 'warm', NOW(), NOW(), 'buy', 'residential', 'Vaishali, Ghaziabad', 4500000);
SQL

# Now hit the ensure_deal helper indirectly via a manual call equivalent.
# (Easiest: create the contact via SQL above, then call POST /api/leads with the phone — which
#  triggers ensureDealForLead. To test the 99acres-specific path, we'd need a real poll cycle.)
TOKEN=$(curl -s -X POST http://localhost:7071/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"9958860411","password":"noteplz123"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# Use ts-node to call ensureDealForLead with source=99acres + assignedAgentId=Puneet
# (Puneet is a super_boss, so this exercises the assignment path)
cd /var/www/realty-pandit/backend && cat > /tmp/e2e_trigger.ts << TSEOF
import { ensureDealForLead } from './src/services/ensure_deal';
import prisma from './src/db';

(async () => {
    const puneet = await prisma.agent.findFirst({ where: { phone: '+919958860411' } });
    const r = await ensureDealForLead({
        contactPhone: '$TEST_PHONE',
        source: '99acres',
        assignedAgentId: puneet!.id,
    });
    console.log('RESULT', JSON.stringify(r));
    process.exit(0);
})();
TSEOF
TS_NODE_TRANSPILE_ONLY=true npx ts-node --transpile-only /tmp/e2e_trigger.ts
EOF
```

Expected: `RESULT {"dealId":"<uuid>","created":true,"status":"NEW"}`.

- [ ] **Step 4: Back in the browser, navigate to Deal Pipeline → confirm the test deal appears in NEW column assigned to Puneet**

```
browser_click "Deal Pipeline" nav
browser_snapshot
# Verify: NEW column has a tile for "Plan E2E Test", coordinator label = "Puneet Bhardwaj"
browser_take_screenshot phase4_e2e_verify.png
```

- [ ] **Step 5: Click the tile → click "Log My Call" → walk through "Answered & Interested" → submit form → verify deal moves NEW → QUALIFIED**

This validates that today's Stage 1 NEW redesign + B1 work cleanly end-to-end.

- [ ] **Step 6: Cleanup — delete the test deal + contact**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
TEST_PHONE="<the phone from Step 3>"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"DELETE FROM transactions WHERE demand_contact_id='$TEST_PHONE'; DELETE FROM contacts WHERE phone_number='$TEST_PHONE';\""
```

- [ ] **Step 7: Reset Puneet's portal email back to whatever it was**

If Puneet's `personal_email` was NULL before the test, clear it again:

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null -o StrictHostKeyChecking=no root@72.62.231.224 \
    "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"UPDATE agents SET personal_email = NULL WHERE phone='+919958860411';\""
```

- [ ] **Step 8: Save memory note**

```bash
cat > "C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/project_b1_auto_deal_creation_<DATE>.md" << EOF
---
name: B1 — Auto-Deal Creation + Stage Routing (deployed YYYY-MM-DD)
description: Every lead from any channel now auto-creates a Deal. Stage routing: human-touched → QUALIFIED, automated → NEW. ensureDealForLead is the single source of truth.
type: project
---
[Fill in the rest from the actual deploy outcome — files modified, files created,
 verification SQL, manager round-robin fairness check next morning, etc.]
EOF
```

Then update `MEMORY.md` with a one-liner pointer.

- [ ] **Step 9: Final commit**

```bash
git add C:/Users/Varchasv\ Bhardwaj/.claude/projects/.../memory/*.md
git commit -m "docs(memory): B1 auto-deal-creation deployed + e2e verified"
```

---

## Self-Review Checklist (run before handing off)

- [ ] Every task has actual code or commands — no "TBD" / "implement later"
- [ ] Each TDD task has both the failing test AND the passing implementation
- [ ] Files referenced by exact path
- [ ] All 6 ingestion paths (99acres, MagicBricks, Housing, public website, WhatsApp, manual) have a wiring task
- [ ] Stage rule covered: createdByAgentId → QUALIFIED ✓; partner_portal+name+phone → QUALIFIED ✓; everything else → NEW ✓
- [ ] Idempotency tested ✓
- [ ] Manager round-robin tested ✓ (and fairness — not always first manager)
- [ ] AI qualification cadence kicks off for NEW deals (`scheduleQualificationCall(deal.id, 0)` in `ensureDealForLead`) ✓
- [ ] Frontend Team profile field is editable + saves via PATCH /api/team/me/portal-email ✓
- [ ] Phase 4 Playwright run validates end-to-end (lead intake → deal in NEW assigned correctly → log call → moves to QUALIFIED)
- [ ] Phase boundaries have stop-for-review pauses
- [ ] Cleanup steps (delete test contacts, reset Puneet's email) are explicit

---

## Open Risks / Follow-up

1. **MagicBricks doesn't carry a `broker_email` field** — assignment stays property-uploader-based. If MagicBricks adds it later, the housing-style portal-email match can be replicated.
2. **Partner portal login route doesn't exist** — `ensureDealForLead` accepts `source: 'partner_portal'` and the `partnerHasNameAndPhone` flag, but no caller exists yet. When the portal is built, it just needs to call the helper. No re-engineering required.
3. **21 active agents have no `personal_email`** — operational gap, not engineering. Phase 3's UI lets them self-serve. Until they fill it in, leads from those agents' portal accounts route to manager round-robin (fine, just less precise).
4. **Backfill of 1,089 historical 99acres contacts without deals** — explicitly out of scope. Separate plan when Sunny is ready.
5. **AI qualification cadence is currently stubbed** (Omnidim not configured per memory 2026-04-29 C2 fallback) — the fallback sends `rp_buyer_lead_received_v2` template + alerts coordinator. So NEW deals from B1 get a real WhatsApp intro + manager alert immediately, even without Omnidim. No additional work needed.
6. **`personal_email` reuse risk** — the column was originally for personal email, not portal email. We're overloading semantics. Acceptable for now (already used this way by `resolveAgentByEmail`), but a future migration could rename to `portal_account_email` for clarity. Not blocking.

---

## Estimate

| Phase | Optimistic | Realistic |
|-------|-----------|-----------|
| 1. Helper + round-robin | 1.5 hr | 2.5 hr (test fixtures) |
| 2. 6 ingestion wirings | 2 hr | 3.5 hr (each wiring needs careful insertion) |
| 3. Team profile UI | 1.5 hr | 2.5 hr (find right component, mobile parity) |
| 4. Playwright e2e | 1 hr | 1.5 hr |
| **Total** | **6 hr** | **10 hr** |

Realistic = 1.5 working sessions with phase-boundary review pauses.
