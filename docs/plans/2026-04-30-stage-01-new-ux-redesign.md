# Stage 1 NEW — Deal Pipeline UX Redesign (Implementation Plan)

> **For agentic workers:** Use `superpowers:executing-plans` (recommended for this UI-heavy work — needs human screenshot review per phase) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force every NEW-stage deal through a guided "Log Call → outcome → qualify-form" workflow before it can leave NEW, so lead managers always capture customer-confirmed requirements during the call. Remove all bypass paths.

**Architecture:** Backend gets one new endpoint that owns all 6 call-outcome state transitions atomically. Frontend extracts the existing requirements form into a reusable component, replaces the modal's bare "Mark as Qualified" CTA with a single "Log My Call" button, and adds a step-by-step overlay. Mobile gets a full-screen page wrapper for the same content (better PWA UX than a 640px centered modal on a phone).

**Tech Stack:** TypeScript, Express 5 + Prisma 5 + BullMQ (backend), React 19 + Vite 7 with CSS custom-property design tokens (admin frontend, no Tailwind), vitest for backend tests, ts-node runtime (no build step on backend), shared `client.ts` axios instance for CSRF.

**Source-of-truth note:** The local file `clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx` (115 KB, 2026-04-28) is the canonical version. The server's `/var/www/realty-pandit/frontend/src/components/DealPipeline.tsx` (62 KB, 2026-04-17) is **stale** because a recent build/deploy of `dist/` skipped a source sync. Task 1 reconciles this so subsequent edits don't silently revert features.

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `agents/frontend/src/components/leads/BuyerRequirementsForm.tsx` | Reusable form: intent, category, sub-cat, type, BHK, area+unit, amenities, budget, timeline, location. Props: `{initialValues, requireAll, onSubmit, onCancel, submitLabel}`. Save logic stays in caller. |
| `agents/frontend/src/components/deal/DealDetailBriefing.tsx` | Read-only source-data layout for NEW deals: contact block, source attribution block, requirements-from-source block (empty fields show "—"), AI activity strip. |
| `agents/frontend/src/components/deal/LogCallOverlay.tsx` | The 6-outcome workflow. Step 1 = picker, Step 2 = path-specific UI (form / reason / time / etc). Calls the backend `POST /api/deals/:id/log-call` for every outcome. |
| `agents/frontend/src/pages/DealDetailPage.tsx` | Mobile-only full-screen wrapper that hosts `DealDetailBriefing` + a sticky bottom "Log My Call" bar. Reached via `/deal/:id` route. |
| `agents/backend/src/routes/__tests__/deals_log_call.test.ts` | vitest suite covering all 6 outcomes for `POST /api/deals/:id/log-call`: success, validation, status transitions, interaction logging. |

### Modified files

| Path | What changes |
|------|--------------|
| `agents/frontend/src/components/DealPipeline.tsx` | Remove "✅ Qualify" button from NEW tile (only "📞 Log My Call" remains). Restructure `DealDetailModal` Detail tab: render `<DealDetailBriefing />` for NEW status, keep current layout for other stages. Remove the full-width "Mark as Qualified" CTA. Wire "Log My Call" button to open `<LogCallOverlay />`. |
| `agents/frontend/src/components/ExternalLeads.tsx` | Replace inline requirements form (lines ~1280–1330 of editor area) with `<BuyerRequirementsForm />`. Wiring stays the same; behavior must not change. |
| `agents/frontend/src/App.tsx` | Add route `/deal/:id` → `<DealDetailPage />` for mobile. Tile click on mobile navigates instead of opening modal. |
| `agents/backend/src/routes/deals.ts` | Add `POST /:id/log-call` endpoint. Body: `{outcome, payload}`. Switch on `outcome` to dispatch one of 6 handler functions. All transitions go through `transactionStateMachine.transitionTransaction()` and log an `interactions` row with `event_type='human_call_outcome'`. |

### Deploy / housekeeping

| Path | What |
|------|------|
| `/var/www/realty-pandit/frontend/src/` | Sync local → server source so future greps find the same code. (Task 1.) |
| `/var/www/realty-pandit/frontend/dist/` | Rebuilt + redeployed via `mcp__realty-pandit-qa__deploy('frontend')` after each frontend phase. |
| `/var/www/realty-pandit/backend/` | Backend deploy + `pm2 restart realty-backend` after Phase 2. |

---

## Phase Layout

| Phase | Tasks | Goal | Reviewable independently? |
|-------|-------|------|---------------------------|
| 1. Sync stale source | T1 | Eliminate the 17 Apr / 28 Apr drift before editing | ✅ Yes — instant |
| 2. Backend endpoint | T2–T6 | `POST /api/deals/:id/log-call` live + tested | ✅ Yes — testable via curl |
| 3. Form extraction | T7–T9 | `BuyerRequirementsForm` reused; ExternalLeads unchanged in behavior | ✅ Yes — visual regression check |
| 4. Detail tab redesign | T10–T13 | NEW deals show full source briefing; bypass buttons removed | ✅ Yes — screenshot proof |
| 5. LogCallOverlay | T14–T22 | All 6 outcome paths shipped one at a time | ✅ Yes — per outcome |
| 6. Mobile full-screen | T23–T28 | Mobile uses `/deal/:id` page, not modal | ✅ Yes — mobile viewport screenshot |
| 7. Wrap-up | T29–T30 | Memory + 24-hour soak | ✅ Yes |

**Stop at the end of every phase for screenshot review before starting the next.**

---

## Phase 1 — Sync Stale Source

### Task 1: Push local source to server, confirm parity

**Files:**
- Sync: local `agents/frontend/src/components/DealPipeline.tsx` (115 KB) → server `/var/www/realty-pandit/frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Diff local vs server first**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
LOCAL="clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx"
ssh -i "$KEY" -F /dev/null root@72.62.231.224 "wc -l /var/www/realty-pandit/frontend/src/components/DealPipeline.tsx"
wc -l "$LOCAL"
```

Expected: server reports ~1014 lines, local reports ~2900 lines (the 115 KB / 62 KB delta).

- [ ] **Step 2: SCP local → server**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
LOCAL="clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx"
scp -i "$KEY" -F /dev/null "$LOCAL" \
  root@72.62.231.224:/var/www/realty-pandit/frontend/src/components/DealPipeline.tsx
```

Expected: exit 0, no other output.

- [ ] **Step 3: Verify by re-pulling and diffing**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
LOCAL="clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx"
scp -i "$KEY" -F /dev/null \
  root@72.62.231.224:/var/www/realty-pandit/frontend/src/components/DealPipeline.tsx \
  /tmp/DealPipeline_server.tsx
diff "$LOCAL" /tmp/DealPipeline_server.tsx
```

Expected: no output (files identical).

- [ ] **Step 4: Confirm AIStatusBadge.tsx is also synced**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
LOCAL="clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/AIStatusBadge.tsx"
ssh -i "$KEY" -F /dev/null root@72.62.231.224 "ls -la /var/www/realty-pandit/frontend/src/components/AIStatusBadge.tsx 2>&1"
ls -la "$LOCAL"
```

Expected: both files exist; if server is missing it, also `scp` it across.

- [ ] **Step 5: Commit (no production change yet — pure source hygiene)**

```bash
cd "clients/sunny-sharma/projects/reality-pandit"
git add agents/frontend/src/components/DealPipeline.tsx
git commit -m "chore(frontend): mark DealPipeline.tsx as canonical local source

Server /var/www/realty-pandit/frontend/src/ was stale (Apr 17 vs Apr 28
local). Pushed local up to align grep/find results across machines.
No behavior change — deployed dist/ already reflects the local version."
```

---

## Phase 2 — Backend `POST /api/deals/:id/log-call`

### Task 2: Write failing tests for the endpoint

**Files:**
- Create: `agents/backend/src/routes/__tests__/deals_log_call.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// agents/backend/src/routes/__tests__/deals_log_call.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import prisma from '../../db';
import { createTestAdminToken } from '../../utils/test_helpers';

describe('POST /api/deals/:id/log-call', () => {
    let token: string;
    let dealId: string;
    let phone: string;

    beforeEach(async () => {
        token = await createTestAdminToken();
        phone = `+9199999${Math.floor(Math.random() * 100000)}`;
        await prisma.contact.create({
            data: {
                phone_number: phone,
                tenant_id: 'default',
                source: 'manual',
                contact_type: 'BUYER',
                lead_status: 'cold',
            },
        });
        const deal = await prisma.transaction.create({
            data: {
                tenant_id: 'default',
                demand_contact_id: phone,
                type: 'SALE',
                status: 'NEW',
                source: 'manual',
            },
        });
        dealId = deal.id;
    });

    afterAll(async () => { await prisma.$disconnect(); });

    it('rejects unknown outcome', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'BOGUS', payload: {} });
        expect(res.status).toBe(400);
    });

    it('logs no-answer attempt and keeps deal in NEW', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'NO_ANSWER', payload: {} });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('NEW');
        const interaction = await prisma.interaction.findFirst({
            where: { phone_number: phone, event_type: 'human_call_outcome' },
        });
        expect(interaction).toBeTruthy();
        expect((interaction?.metadata as any)?.outcome).toBe('NO_ANSWER');
    });

    it('moves deal to QUALIFIED on ANSWERED_INTERESTED with requirements', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({
                outcome: 'ANSWERED_INTERESTED',
                payload: {
                    requirements: {
                        intent: 'buy',
                        demand_main_category: 'residential',
                        demand_type_slug: 'flat',
                        demand_bhk: 3,
                        budget_min: 5000000,
                        budget_max: 10000000,
                        preferred_location: 'Vaishali',
                        timeline: '1-3_months',
                    },
                },
            });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('QUALIFIED');
        const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
        expect(contact?.demand_bhk).toBe(3);
        expect(contact?.preferred_location).toBe('Vaishali');
    });

    it('moves deal to ON_HOLD on NOT_INTERESTED', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'NOT_INTERESTED', payload: { reason: 'NOT_INTERESTED_NOW', notes: 'Just looking' } });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('ON_HOLD');
    });

    it('moves deal to CLOSED_LOST on WRONG_NUMBER outcome', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'WRONG_OR_SPAM', payload: { reason: 'WRONG_NUMBER' } });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('CLOSED_LOST');
    });

    it('schedules callback and keeps deal in NEW on CALLBACK_REQUESTED', async () => {
        const callbackAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'CALLBACK_REQUESTED', payload: { callback_at: callbackAt, notes: 'After lunch' } });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('NEW');
        const interaction = await prisma.interaction.findFirst({
            where: { phone_number: phone, event_type: 'human_call_outcome' },
        });
        expect((interaction?.metadata as any)?.callback_at).toBe(callbackAt);
    });

    it('keeps deal in NEW and alerts manager on LANGUAGE_BARRIER', async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId}/log-call`)
            .set('Cookie', [`token=${token}`])
            .send({ outcome: 'LANGUAGE_BARRIER', payload: { language: 'Tamil' } });
        expect(res.status).toBe(200);
        const after = await prisma.transaction.findUnique({ where: { id: dealId } });
        expect(after?.status).toBe('NEW');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/routes/__tests__/deals_log_call.test.ts
```

Expected: FAIL — endpoint not yet defined; all tests should error with 404 or "route not found".

### Task 3: Implement the endpoint and 6 handlers

**Files:**
- Modify: `agents/backend/src/routes/deals.ts` (append endpoint at the end of router definitions)

- [ ] **Step 1: Open `deals.ts` and locate the last `router.post(...)` block before `export default router;`. Add the new endpoint immediately above the export.**

- [ ] **Step 2: Add the endpoint code**

```typescript
// agents/backend/src/routes/deals.ts (append before `export default router;`)

const VALID_LOG_CALL_OUTCOMES = [
    'ANSWERED_INTERESTED',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'CALLBACK_REQUESTED',
    'WRONG_OR_SPAM',
    'LANGUAGE_BARRIER',
] as const;

type LogCallOutcome = typeof VALID_LOG_CALL_OUTCOMES[number];

router.post('/:id/log-call', requireAuth, async (req, res) => {
    const dealId = req.params.id;
    const { outcome, payload = {} } = req.body as { outcome: LogCallOutcome; payload?: any };

    if (!VALID_LOG_CALL_OUTCOMES.includes(outcome)) {
        return res.status(400).json({ error: `Unknown outcome: ${outcome}` });
    }

    const deal = await prisma.transaction.findUnique({
        where: { id: dealId },
        include: { demand_contact: { select: { phone_number: true, name: true, tenant_id: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (!deal.demand_contact?.phone_number) {
        return res.status(400).json({ error: 'Deal has no demand contact' });
    }
    if (deal.status !== 'NEW') {
        return res.status(409).json({ error: `Deal is in ${deal.status}, log-call only valid in NEW` });
    }

    const phone = deal.demand_contact.phone_number;
    const performedBy = (req as any).agent?.id || 'system:human';

    try {
        switch (outcome) {
            case 'ANSWERED_INTERESTED': {
                const r = payload.requirements || {};
                const requiredFields = ['intent', 'demand_main_category', 'demand_type_slug', 'demand_bhk',
                                         'budget_min', 'budget_max', 'preferred_location', 'timeline'];
                for (const f of requiredFields) {
                    if (r[f] === undefined || r[f] === null || r[f] === '') {
                        return res.status(400).json({ error: `Missing required field: ${f}` });
                    }
                }
                await prisma.contact.update({
                    where: { phone_number: phone },
                    data: {
                        intent: r.intent,
                        demand_main_category: r.demand_main_category,
                        demand_category: r.demand_category ?? null,
                        demand_type_slug: r.demand_type_slug,
                        property_type: r.demand_type_slug,
                        demand_bhk: r.demand_bhk,
                        budget_min: r.budget_min,
                        budget_max: r.budget_max,
                        preferred_location: r.preferred_location,
                        timeline: r.timeline,
                        area_min: r.area_min ?? null,
                        area_max: r.area_max ?? null,
                        area_unit: r.area_unit ?? null,
                        demand_amenities: r.demand_amenities ?? null,
                        lead_status: 'warm',
                    },
                });
                const { transitionTransaction } = await import('../services/transaction_state_machine');
                await transitionTransaction(dealId, 'QUALIFIED' as any, performedBy, 'admin', {
                    notes: 'Lead qualified by team member after call',
                });
                break;
            }
            case 'NOT_INTERESTED': {
                const reason = payload.reason || 'NOT_INTERESTED_NOW';
                const nextStatus = reason === 'JUST_BROWSING' ? 'CLOSED_LOST' : 'ON_HOLD';
                const { transitionTransaction } = await import('../services/transaction_state_machine');
                await transitionTransaction(dealId, nextStatus as any, performedBy, 'admin', {
                    notes: `Customer not interested: ${reason}. ${payload.notes || ''}`.trim(),
                });
                break;
            }
            case 'NO_ANSWER': {
                // Stays NEW; just log the attempt. AI cadence continues from interaction_engine.
                break;
            }
            case 'CALLBACK_REQUESTED': {
                if (!payload.callback_at) {
                    return res.status(400).json({ error: 'callback_at required' });
                }
                // Notify lead manager via WhatsApp (existing helper).
                const { WhatsAppService } = await import('../services/whatsapp');
                const wa = new WhatsAppService();
                const mgr = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { phone: true } });
                if (mgr?.phone) {
                    wa.sendText(mgr.phone, `📅 Callback scheduled for ${deal.demand_contact.name || phone} at ${new Date(payload.callback_at).toLocaleString('en-IN')}`).catch(() => {});
                }
                break;
            }
            case 'WRONG_OR_SPAM': {
                const reason = payload.reason || 'WRONG_NUMBER';
                const closedReasons = ['WRONG_NUMBER', 'SPAM', 'BANKER_VALUER', 'DUPLICATE'];
                const nextStatus = closedReasons.includes(reason) ? 'CLOSED_LOST' : 'ON_HOLD';
                const { transitionTransaction } = await import('../services/transaction_state_machine');
                await transitionTransaction(dealId, nextStatus as any, performedBy, 'admin', {
                    notes: `Marked as ${reason} by team member`,
                });
                if (reason === 'WRONG_NUMBER' || reason === 'SPAM') {
                    await prisma.contact.update({ where: { phone_number: phone }, data: { lead_status: 'lost' } });
                }
                break;
            }
            case 'LANGUAGE_BARRIER': {
                const { WhatsAppService } = await import('../services/whatsapp');
                const wa = new WhatsAppService();
                const mgr = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' }, select: { phone: true } });
                if (mgr?.phone) {
                    wa.sendText(mgr.phone, `🌐 Language barrier: ${deal.demand_contact.name || phone} speaks ${payload.language || 'unknown'}. Please assign a multilingual agent.`).catch(() => {});
                }
                break;
            }
        }

        await prisma.interaction.create({
            data: {
                tenant_id: deal.demand_contact.tenant_id || deal.tenant_id,
                phone_number: phone,
                channel: 'voice',
                direction: 'outbound',
                event_type: 'human_call_outcome',
                content: `Human call: ${outcome}${payload.notes ? ' — ' + payload.notes : ''}`,
                metadata: { deal_id: dealId, outcome, ...payload },
            },
        });

        return res.json({ ok: true, outcome });
    } catch (err: any) {
        return res.status(500).json({ error: err.message || 'log-call failed' });
    }
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/backend
npx vitest run src/routes/__tests__/deals_log_call.test.ts
```

Expected: PASS — all 7 tests green.

- [ ] **Step 4: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/backend/src/routes/deals.ts agents/backend/src/routes/__tests__/deals_log_call.test.ts
git commit -m "feat(backend): POST /api/deals/:id/log-call — 6-outcome workflow

Single endpoint accepting an outcome enum. ANSWERED_INTERESTED requires
the full requirements payload, persists to Contact, transitions deal
NEW→QUALIFIED. Other outcomes route per Stage 1 KRA: NOT_INTERESTED→
ON_HOLD/CLOSED_LOST, WRONG_OR_SPAM→CLOSED_LOST, NO_ANSWER stays NEW,
CALLBACK_REQUESTED schedules and alerts manager, LANGUAGE_BARRIER
alerts manager. Every call logs an 'human_call_outcome' interaction."
```

### Task 4: Deploy backend, verify endpoint exists

- [ ] **Step 1: Sync source to server**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
scp -i "$KEY" -F /dev/null \
  clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/deals.ts \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/routes/deals.ts
```

- [ ] **Step 2: Restart backend**

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null root@72.62.231.224 "pm2 restart realty-backend && sleep 4 && pm2 list | grep realty-backend"
```

Expected: both cluster instances online with 0s uptime → climbing.

- [ ] **Step 3: Smoke-test endpoint with a real NEW deal**

Find a NEW deal id from the live DB (read-only):

```bash
KEY="$HOME/.ssh/realty_pandit_key"
ssh -i "$KEY" -F /dev/null root@72.62.231.224 \
  "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"SELECT id, demand_contact_id FROM transactions WHERE status='NEW' LIMIT 1;\""
```

Then curl with NO_ANSWER (safest test — does not change state):

```bash
# Use a real admin token — copy from browser cookies after login.
TOKEN="<paste admin token here>"
DEAL_ID="<paste id from above>"
curl -X POST "https://api.realtypandit.in/api/deals/${DEAL_ID}/log-call" \
  -H "Cookie: token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"NO_ANSWER","payload":{}}'
```

Expected: `{"ok":true,"outcome":"NO_ANSWER"}`. Verify a new `human_call_outcome` interaction was logged in DB.

- [ ] **Step 4: Stop here for review**

Pause for human screenshot/log review. Confirm endpoint works in production before proceeding to Phase 3.

---

## Phase 3 — Extract `BuyerRequirementsForm`

### Task 5: Read current ExternalLeads form to lock the props contract

**Files:**
- Read-only inspection: `agents/frontend/src/components/ExternalLeads.tsx` lines ~520–760 (form state) and ~1280–1350 (form JSX)

- [ ] **Step 1: Run grep to confirm exact line ranges**

```bash
grep -n "editIntent\|editBhk\|editBudgetMin\|editBudgetMax\|editLocation\|editAmenities\|editTimeline\|handleSaveRequirements" \
  clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/ExternalLeads.tsx
```

Expected: a list of state setters and the save handler. Note the line numbers — Task 7 deletes the JSX and Task 8 imports the new component.

### Task 6: Create the reusable `BuyerRequirementsForm` component

**Files:**
- Create: `agents/frontend/src/components/leads/BuyerRequirementsForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
// agents/frontend/src/components/leads/BuyerRequirementsForm.tsx
import { useState, useEffect } from 'react';
import client from '../../api/client';

export interface RequirementsValues {
    intent: string;
    demand_main_category: string;
    demand_category: string | null;
    demand_type_slug: string;
    demand_bhk: number | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string;
    demand_amenities: string[];
    budget_min: number | null;
    budget_max: number | null;
    timeline: string;
    preferred_location: string;
}

export interface BuyerRequirementsFormProps {
    initialValues: Partial<RequirementsValues>;
    requireAll: boolean;            // when true (qualify flow), Submit disabled until all required fields present
    onSubmit: (values: RequirementsValues) => Promise<void> | void;
    onCancel: () => void;
    submitLabel?: string;
    submitting?: boolean;
}

const AMENITIES = ['Parking', 'Lift', 'Gym', 'Security', 'Power Backup', 'Garden',
                   'Swimming Pool', 'Water Supply', 'Club House', 'Intercom', 'Gas Pipeline', 'Park'];

const TIMELINES = [
    { value: '', label: 'Not set' },
    { value: 'immediate', label: 'Immediate (< 1 month)' },
    { value: '1-3_months', label: '1–3 months' },
    { value: '3-6_months', label: '3–6 months' },
    { value: '6-12_months', label: '6–12 months' },
];

const REQUIRED_FIELDS: (keyof RequirementsValues)[] = [
    'intent', 'demand_main_category', 'demand_type_slug', 'demand_bhk',
    'budget_min', 'budget_max', 'preferred_location', 'timeline',
];

export default function BuyerRequirementsForm({
    initialValues, requireAll, onSubmit, onCancel,
    submitLabel = 'Save Requirements', submitting = false,
}: BuyerRequirementsFormProps) {
    const [v, setV] = useState<RequirementsValues>({
        intent: initialValues.intent || 'buy',
        demand_main_category: initialValues.demand_main_category || '',
        demand_category: initialValues.demand_category || null,
        demand_type_slug: initialValues.demand_type_slug || '',
        demand_bhk: initialValues.demand_bhk ?? null,
        area_min: initialValues.area_min ?? null,
        area_max: initialValues.area_max ?? null,
        area_unit: initialValues.area_unit || 'sqft',
        demand_amenities: initialValues.demand_amenities || [],
        budget_min: initialValues.budget_min ?? null,
        budget_max: initialValues.budget_max ?? null,
        timeline: initialValues.timeline || '',
        preferred_location: initialValues.preferred_location || '',
    });

    const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([]);
    const [subCats, setSubCats] = useState<{ id: string; name: string; slug: string }[]>([]);
    const [types, setTypes] = useState<{ id: string; name: string; slug: string }[]>([]);

    useEffect(() => {
        client.get('/public/master/categories').then(r => setCategories(r.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!v.demand_main_category) { setSubCats([]); return; }
        client.get(`/public/master/subcategories?category=${v.demand_main_category}`)
            .then(r => setSubCats(r.data || [])).catch(() => setSubCats([]));
    }, [v.demand_main_category]);

    useEffect(() => {
        if (!v.demand_main_category) { setTypes([]); return; }
        client.get(`/public/master/types?category=${v.demand_main_category}`)
            .then(r => setTypes(r.data || [])).catch(() => setTypes([]));
    }, [v.demand_main_category]);

    const toggleAmenity = (a: string) => {
        setV(prev => ({
            ...prev,
            demand_amenities: prev.demand_amenities.includes(a)
                ? prev.demand_amenities.filter(x => x !== a)
                : [...prev.demand_amenities, a],
        }));
    };

    const missingRequired = requireAll
        ? REQUIRED_FIELDS.filter(f => v[f] === null || v[f] === undefined || v[f] === '')
        : [];

    const canSubmit = !submitting && missingRequired.length === 0;

    const labelStyle: React.CSSProperties = {
        fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block',
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)', fontSize: '13px',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <label style={labelStyle}>Intent (Buy / Rent) *</label>
                <select style={inputStyle} value={v.intent}
                        onChange={e => setV({ ...v, intent: e.target.value })}>
                    <option value="buy">Buy</option>
                    <option value="rent">Rent</option>
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Category *</label>
                    <select style={inputStyle} value={v.demand_main_category}
                            onChange={e => setV({ ...v, demand_main_category: e.target.value, demand_category: null, demand_type_slug: '' })}>
                        <option value="">Any</option>
                        {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Sub-Category</label>
                    <select style={inputStyle} value={v.demand_category || ''}
                            onChange={e => setV({ ...v, demand_category: e.target.value || null })}>
                        <option value="">Any</option>
                        {subCats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Property Type *</label>
                    <select style={inputStyle} value={v.demand_type_slug}
                            onChange={e => setV({ ...v, demand_type_slug: e.target.value })}>
                        <option value="">Any</option>
                        {types.map(t => <option key={t.id} value={t.slug}>{t.name}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label style={labelStyle}>BHK *</label>
                <select style={inputStyle} value={v.demand_bhk ?? ''}
                        onChange={e => setV({ ...v, demand_bhk: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} BHK</option>)}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Area Min</label>
                    <input style={inputStyle} type="number" placeholder="500" value={v.area_min ?? ''}
                           onChange={e => setV({ ...v, area_min: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                    <label style={labelStyle}>Area Max</label>
                    <input style={inputStyle} type="number" placeholder="2000" value={v.area_max ?? ''}
                           onChange={e => setV({ ...v, area_max: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                    <label style={labelStyle}>Unit</label>
                    <select style={inputStyle} value={v.area_unit}
                            onChange={e => setV({ ...v, area_unit: e.target.value })}>
                        <option value="sqft">sqft</option>
                        <option value="sqyd">sqyd</option>
                        <option value="acre">acre</option>
                    </select>
                </div>
            </div>

            <div>
                <label style={labelStyle}>Preferred Amenities</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {AMENITIES.map(a => {
                        const on = v.demand_amenities.includes(a);
                        return (
                            <button key={a} type="button" onClick={() => toggleAmenity(a)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '16px', fontSize: '12px',
                                        border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                                        backgroundColor: on ? 'rgba(59,130,246,0.15)' : 'transparent',
                                        color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}>
                                {a}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                    <label style={labelStyle}>Budget Min (₹) *</label>
                    <input style={inputStyle} type="number" placeholder="5000000" value={v.budget_min ?? ''}
                           onChange={e => setV({ ...v, budget_min: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                    <label style={labelStyle}>Budget Max (₹) *</label>
                    <input style={inputStyle} type="number" placeholder="10000000" value={v.budget_max ?? ''}
                           onChange={e => setV({ ...v, budget_max: e.target.value ? Number(e.target.value) : null })} />
                </div>
            </div>

            <div>
                <label style={labelStyle}>Timeline *</label>
                <select style={inputStyle} value={v.timeline}
                        onChange={e => setV({ ...v, timeline: e.target.value })}>
                    {TIMELINES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>

            <div>
                <label style={labelStyle}>Preferred Location *</label>
                <input style={inputStyle} type="text" placeholder="e.g. Vaishali, Ghaziabad"
                       value={v.preferred_location}
                       onChange={e => setV({ ...v, preferred_location: e.target.value })} />
            </div>

            {requireAll && missingRequired.length > 0 && (
                <div style={{
                    padding: '8px 12px', borderRadius: '6px',
                    backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '12px',
                }}>
                    Required: {missingRequired.join(', ')}
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={onCancel} disabled={submitting}
                        style={{
                            padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            border: '1px solid var(--border-secondary)', backgroundColor: 'transparent',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                        }}>
                    Cancel
                </button>
                <button type="button" onClick={() => onSubmit(v)} disabled={!canSubmit}
                        style={{
                            padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                            border: 'none', backgroundColor: canSubmit ? 'var(--accent-primary)' : '#94a3b8',
                            color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed',
                        }}>
                    {submitting ? 'Saving...' : submitLabel}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit (no use yet — pure introduction)**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/leads/BuyerRequirementsForm.tsx
git commit -m "feat(frontend): introduce BuyerRequirementsForm reusable component

Pulls all 13 fields from the existing ExternalLeads inline form into a
single component with explicit props contract: initialValues, requireAll,
onSubmit, onCancel. Save logic stays in the caller. Categories, sub-cats,
and types fetched from /public/master/* on mount.

Required fields (when requireAll=true): intent, demand_main_category,
demand_type_slug, demand_bhk, budget_min, budget_max, preferred_location,
timeline. Submit button stays disabled until all are filled."
```

### Task 7: Wire ExternalLeads to use the new component (no behavior change)

**Files:**
- Modify: `agents/frontend/src/components/ExternalLeads.tsx`

- [ ] **Step 1: Read the current form JSX to identify the exact replace region**

```bash
sed -n '1280,1360p' clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/ExternalLeads.tsx
```

Note the JSX block starting at the "Requirements" comment.

- [ ] **Step 2: Add import at top of file**

```typescript
// agents/frontend/src/components/ExternalLeads.tsx, near other imports
import BuyerRequirementsForm, { RequirementsValues } from './leads/BuyerRequirementsForm';
```

- [ ] **Step 3: Replace the inline form JSX with the component**

Locate the existing `{/* Requirements */}` block and replace its content with:

```tsx
<BuyerRequirementsForm
    initialValues={{
        intent: leadDetail?.intent || 'buy',
        demand_main_category: leadDetail?.demand_main_category || '',
        demand_category: leadDetail?.demand_category || null,
        demand_type_slug: leadDetail?.demand_type_slug || '',
        demand_bhk: leadDetail?.demand_bhk ?? null,
        area_min: leadDetail?.area_min ?? null,
        area_max: leadDetail?.area_max ?? null,
        area_unit: leadDetail?.area_unit || 'sqft',
        demand_amenities: leadDetail?.demand_amenities || [],
        budget_min: leadDetail?.budget_min ? Number(leadDetail.budget_min) : null,
        budget_max: leadDetail?.budget_max ? Number(leadDetail.budget_max) : null,
        timeline: leadDetail?.timeline || '',
        preferred_location: leadDetail?.preferred_location || '',
    }}
    requireAll={false}
    submitLabel="Save Requirements"
    submitting={savingRequirements}
    onSubmit={async (values: RequirementsValues) => {
        setSavingRequirements(true);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(selectedPhone)}/requirements`, values);
            await reloadLeadDetail();
        } finally {
            setSavingRequirements(false);
        }
    }}
    onCancel={() => { /* no-op — inline form, no overlay */ }}
/>
```

- [ ] **Step 4: Remove the old per-field state setters and `handleSaveRequirements` function**

Delete the unused `useState` hooks for `editIntent`, `editBhk`, `editBudgetMin`, `editBudgetMax`, `editLocation`, `editAmenities`, `editTimeline`, etc., and the `handleSaveRequirements` function. Add `savingRequirements` state.

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit -p . 2>&1 | grep "ExternalLeads\|BuyerRequirementsForm" | head -20
```

Expected: zero errors in these two files.

- [ ] **Step 6: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/ExternalLeads.tsx
git commit -m "refactor(frontend): ExternalLeads uses BuyerRequirementsForm

Pure refactor — replaces ~80 lines of inline form JSX + 12 useState
hooks + handleSaveRequirements with a single component instance.
Behavior, save endpoint, and visual layout unchanged."
```

### Task 8: Deploy + visual regression check on ExternalLeads

- [ ] **Step 1: Deploy frontend**

Use the MCP tool: `mcp__realty-pandit-qa__deploy('frontend')`.

- [ ] **Step 2: Verify ExternalLeads still works**

Use `mcp__realty-pandit-qa__qa_verify_task` with checks:
- `loads:/leads:5000`
- `noerrors:/leads`

- [ ] **Step 3: Manual visual check**

Open https://admin.realtypandit.in/ → Ext. Leads → click any lead → confirm Requirements form renders correctly with all 13 fields and Save Requirements button works.

- [ ] **Step 4: Stop here for review**

Pause for human screenshot review. The form should look identical to before.

---

## Phase 4 — Detail Tab Redesign

### Task 9: Build `DealDetailBriefing` component

**Files:**
- Create: `agents/frontend/src/components/deal/DealDetailBriefing.tsx`

- [ ] **Step 1: Write the component**

```tsx
// agents/frontend/src/components/deal/DealDetailBriefing.tsx
import type { Deal } from '../../api/client';
import AIStatusBadge from '../AIStatusBadge';

interface Props {
    deal: Deal;
    contact: any;          // full Contact record from /api/leads/:phone
    callAttempts: number;
    lastCallAt: string | null;
    nextCallAt: string | null;
    aiPaused: boolean;
    onPauseToggle: () => void;
    pausing: boolean;
}

const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px',
};

const valueStyle: React.CSSProperties = {
    fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500,
};

const dash = (v: any) => (v === null || v === undefined || v === '' ? '—' : v);

const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return '—';
    const fmt = (v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)} Cr`
                              : v >= 100000 ? `${(v / 100000).toFixed(1)} L`
                              : `${(v / 1000).toFixed(0)}K`;
    if (min && max) return `₹${fmt(min)} – ₹${fmt(max)}`;
    if (max) return `Up to ₹${fmt(max)}`;
    return `₹${fmt(min!)}+`;
};

const formatArea = (min?: number | null, max?: number | null, unit?: string | null) => {
    if (!min && !max) return '—';
    const u = unit || 'sqft';
    if (min && max) return `${min} – ${max} ${u}`;
    if (max) return `Up to ${max} ${u}`;
    return `${min}+ ${u}`;
};

const formatAmenities = (a: any) => {
    if (!a) return '—';
    if (Array.isArray(a)) return a.length ? a.join(', ') : '—';
    if (typeof a === 'object') {
        const keys = Object.keys(a).filter(k => a[k]);
        return keys.length ? keys.map(k => k.replace(/_/g, ' ')).join(', ') : '—';
    }
    return String(a);
};

export default function DealDetailBriefing({
    deal, contact, callAttempts, lastCallAt, nextCallAt, aiPaused, onPauseToggle, pausing,
}: Props) {
    const sourceUrl = (contact as any)?.metadata?.source_url || (contact as any)?.metadata?.property_url;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* AI ACTIVITY STRIP */}
            <div style={{
                padding: '12px 14px', borderRadius: '10px',
                backgroundColor: aiPaused ? 'rgba(107,114,128,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${aiPaused ? 'rgba(107,114,128,0.3)' : 'rgba(34,197,94,0.3)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
            }}>
                <div>
                    <AIStatusBadge active={!aiPaused} />
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {callAttempts} call{callAttempts === 1 ? '' : 's'}
                        {lastCallAt && ` · Last ${new Date(lastCallAt).toLocaleString('en-IN')}`}
                        {nextCallAt && ` · Next ${new Date(nextCallAt).toLocaleString('en-IN')}`}
                    </div>
                </div>
                <button type="button" onClick={onPauseToggle} disabled={pausing}
                        style={{
                            padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                            border: '1px solid var(--border-secondary)', cursor: 'pointer',
                            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                        }}>
                    {pausing ? '...' : aiPaused ? '▶ Resume AI' : '⏸ Pause AI'}
                </button>
            </div>

            {/* CONTACT */}
            <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={labelStyle}>Contact</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {dash(contact?.name)}
                </div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>📞 {dash(contact?.phone_number)}</span>
                    <span>📧 {dash(contact?.email)}</span>
                    {contact?.phone_number && (
                        <a href={`https://wa.me/${contact.phone_number.replace(/\D/g, '')}`}
                           target="_blank" rel="noopener" style={{ color: '#22c55e', textDecoration: 'none' }}>
                            💬 WhatsApp
                        </a>
                    )}
                    <span>🌐 {dash(contact?.preferred_language)}</span>
                </div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px',
                              fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>Source: <strong>{dash(contact?.source)}</strong></span>
                    <span>Arrived: {contact?.created_at ? new Date(contact.created_at).toLocaleString('en-IN') : '—'}</span>
                </div>
                {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noopener"
                       style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: 'var(--accent-primary)' }}>
                        🔗 View source listing →
                    </a>
                )}
                {contact?.referral_partner_name && (
                    <div style={{ marginTop: '8px', fontSize: '12px' }}>
                        Partner referral: <strong>{contact.referral_partner_name}</strong>
                        {contact.referral_partner_phone && ` (${contact.referral_partner_phone})`}
                    </div>
                )}
            </div>

            {/* REQUIREMENTS FROM SOURCE */}
            <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ ...labelStyle, marginBottom: '10px' }}>Buyer Requirements — from source</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    <div><div style={labelStyle}>Intent</div><div style={valueStyle}>{dash(contact?.intent || contact?.demand_intent)}</div></div>
                    <div><div style={labelStyle}>Category</div><div style={valueStyle}>{dash(contact?.demand_main_category)}</div></div>
                    <div><div style={labelStyle}>Sub-Category</div><div style={valueStyle}>{dash(contact?.demand_category)}</div></div>
                    <div><div style={labelStyle}>Property Type</div><div style={valueStyle}>{dash(contact?.demand_type_slug || contact?.property_type)}</div></div>
                    <div><div style={labelStyle}>BHK</div><div style={valueStyle}>{contact?.demand_bhk ? `${contact.demand_bhk} BHK` : '—'}</div></div>
                    <div><div style={labelStyle}>Area</div><div style={valueStyle}>{formatArea(contact?.area_min, contact?.area_max, contact?.area_unit)}</div></div>
                    <div style={{ gridColumn: '1 / span 2' }}><div style={labelStyle}>Amenities</div><div style={valueStyle}>{formatAmenities(contact?.demand_amenities)}</div></div>
                    <div><div style={labelStyle}>Budget</div><div style={valueStyle}>{formatBudget(contact?.budget_min, contact?.budget_max)}</div></div>
                    <div><div style={labelStyle}>Timeline</div><div style={valueStyle}>{dash(contact?.timeline)}</div></div>
                    <div style={{ gridColumn: '1 / span 2' }}><div style={labelStyle}>Preferred Location</div><div style={valueStyle}>{dash(contact?.preferred_location)}</div></div>
                </div>
            </div>

            {/* AI Summary if any */}
            {contact?.ai_summary && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={labelStyle}>AI Summary</div>
                    <div style={{ ...valueStyle, fontStyle: 'italic' }}>{contact.ai_summary}</div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/deal/DealDetailBriefing.tsx
git commit -m "feat(frontend): DealDetailBriefing read-only source view

Renders the full source-data briefing for a NEW deal: AI activity strip
with pause toggle, contact block (name, phone, email, WA, language,
source, arrival time, source URL, partner referral), and a 10-field
Buyer Requirements grid showing source-populated values with em-dash
for empty fields. AI summary block at bottom if present."
```

### Task 10: Wire `DealDetailBriefing` into `DealPipeline.tsx` Detail tab

**Files:**
- Modify: `agents/frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Add import**

Near other component imports at the top:

```typescript
import DealDetailBriefing from './deal/DealDetailBriefing';
```

- [ ] **Step 2: In `DealDetailModal` add full-contact + call-attempt fetch**

Locate the `loadDetail()` function inside `DealDetailModal`. Extend it:

```typescript
// existing useState block — add:
const [contact, setContact] = useState<any>(null);
const [callAttempts, setCallAttempts] = useState(0);
const [lastCallAt, setLastCallAt] = useState<string | null>(null);
const [nextCallAt, setNextCallAt] = useState<string | null>(null);

// extend loadDetail():
const loadDetail = async () => {
    try {
        setLoading(true);
        const phone = deal.demand_contact?.phone_number;
        const [timelineRes, queriesRes, contactRes, callsRes] = await Promise.all([
            getDealTimeline(deal.id),
            getDealQueries(deal.id),
            phone ? client.get(`/api/leads/${encodeURIComponent(phone)}`) : Promise.resolve({ data: null }),
            phone ? client.get(`/api/leads/${encodeURIComponent(phone)}/interactions?channel=voice&limit=20`) : Promise.resolve({ data: [] }),
        ]);
        setTimeline(timelineRes.data || []);
        setQueries(queriesRes.data || []);
        setContact(contactRes.data || null);
        const calls = (callsRes.data || []).filter((i: any) =>
            i.event_type === 'omnidim_call_attempt' || i.event_type === 'human_call_outcome');
        setCallAttempts(calls.length);
        setLastCallAt(calls[0]?.created_at || null);
        setNextCallAt(deal.next_call_at || null);
    } finally {
        setLoading(false);
    }
};
```

- [ ] **Step 3: Replace Detail tab body for NEW status**

Find the `{activeTab === 'detail' && (` block. Replace its inner content with a status-conditional render:

```tsx
{activeTab === 'detail' && (
    deal.status === 'NEW' ? (
        <DealDetailBriefing
            deal={deal}
            contact={contact}
            callAttempts={callAttempts}
            lastCallAt={lastCallAt}
            nextCallAt={nextCallAt}
            aiPaused={(deal as any).ai_paused || false}
            onPauseToggle={handlePauseToggle}
            pausing={aiToggling}
        />
    ) : (
        // existing Detail tab JSX (preserved for QUALIFIED, MATCHING_APPOINTMENT, etc.)
        <div>
            {/* …keep current generic 6-field grid + status buttons here… */}
        </div>
    )
)}
```

- [ ] **Step 4: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/DealPipeline.tsx
git commit -m "feat(frontend): NEW-stage deals use DealDetailBriefing in modal

Detail tab now renders the rich source-data briefing for NEW deals
(call attempts, full contact card, source attribution, full requirements
grid). Other stages keep the existing generic detail layout — they have
their own KRA work in later phases."
```

### Task 11: Remove bypass paths from NEW tile and modal

**Files:**
- Modify: `agents/frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Locate the NEW-tile "Qualify" button**

```bash
grep -n "Mark as Qualified? AI calling stops" \
  clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx
```

Two hits — one in mobile card list (~line 528–540), one in desktop kanban tile (~line 733–745). Both must go.

- [ ] **Step 2: Delete both Qualify buttons (keep only "Log My Call")**

Remove the entire `<button>...Qualify...</button>` JSX blocks at both locations. Leave the "📞 Log My Call" button in place.

- [ ] **Step 3: Remove the "Mark as Qualified" full-width CTA from `DealDetailModal`**

```bash
grep -n "Mark as Qualified" \
  clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/DealPipeline.tsx
```

Locate around line 1458. Delete the entire button block. Detail tab for NEW now has NO direct qualify path — only "Log My Call" leads to QUALIFIED.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit -p . 2>&1 | grep "DealPipeline" | head
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/DealPipeline.tsx
git commit -m "feat(frontend): enforce Log Call → Qualify (no bypass)

Removes the 'Qualify' button from the NEW kanban tile and the 'Mark as
Qualified' CTA from the deal modal. The only way to qualify a NEW deal
is now via Log My Call → outcome=Answered → submit form. Process
compliance per Stage 1 KRA."
```

### Task 12: Deploy + screenshot

- [ ] **Step 1: Deploy frontend** via `mcp__realty-pandit-qa__deploy('frontend')`.

- [ ] **Step 2: Take screenshots**

- Open admin in browser → Deal Pipeline → click any NEW tile → screenshot the new Detail tab
- Compare against the earlier "before" screenshots
- Confirm: no "Qualify" button on tile, no "Mark as Qualified" in modal, source data fully shown

- [ ] **Step 3: Stop here for review.** Human approves before Phase 5.

---

## Phase 5 — LogCallOverlay (the heart of the feature)

### Task 13: Build LogCallOverlay step-1 picker

**Files:**
- Create: `agents/frontend/src/components/deal/LogCallOverlay.tsx`

- [ ] **Step 1: Write the picker shell**

```tsx
// agents/frontend/src/components/deal/LogCallOverlay.tsx
import { useState } from 'react';
import client from '../../api/client';
import BuyerRequirementsForm, { RequirementsValues } from '../leads/BuyerRequirementsForm';

export type CallOutcome =
    | 'ANSWERED_INTERESTED'
    | 'NOT_INTERESTED'
    | 'NO_ANSWER'
    | 'CALLBACK_REQUESTED'
    | 'WRONG_OR_SPAM'
    | 'LANGUAGE_BARRIER';

interface Props {
    dealId: string;
    contactName: string;
    contactPhone: string;
    initialRequirements: Partial<RequirementsValues>;
    onClose: () => void;
    onSuccess: () => void;
}

const OUTCOME_BUTTONS: { id: CallOutcome; emoji: string; title: string; subtitle: string; color: string }[] = [
    { id: 'ANSWERED_INTERESTED', emoji: '✅', title: 'Answered — interested', subtitle: 'Capture requirements & qualify', color: '#22c55e' },
    { id: 'NOT_INTERESTED',      emoji: '❌', title: 'Not interested',          subtitle: 'Customer declined',            color: '#ef4444' },
    { id: 'NO_ANSWER',           emoji: '📞', title: 'No answer',                subtitle: 'AI continues retry cadence',  color: '#94a3b8' },
    { id: 'CALLBACK_REQUESTED',  emoji: '📅', title: 'Callback requested',       subtitle: 'Schedule a time to call back',color: '#f59e0b' },
    { id: 'WRONG_OR_SPAM',       emoji: '🚫', title: 'Wrong number / spam / banker', subtitle: 'Mark and close',         color: '#6b7280' },
    { id: 'LANGUAGE_BARRIER',    emoji: '🌐', title: 'Language barrier',         subtitle: 'Alert manager for handoff',   color: '#3b82f6' },
];

export default function LogCallOverlay({
    dealId, contactName, contactPhone, initialRequirements, onClose, onSuccess,
}: Props) {
    const [outcome, setOutcome] = useState<CallOutcome | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (payload: any) => {
        if (!outcome) return;
        setSubmitting(true);
        setError(null);
        try {
            await client.post(`/api/deals/${dealId}/log-call`, { outcome, payload });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to log call');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: 200, backdropFilter: 'blur(2px)',
            }} />
            {/* Sheet */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: '16px',
                width: outcome === 'ANSWERED_INTERESTED' ? '720px' : '480px', maxWidth: '94vw', maxHeight: '90vh',
                overflow: 'hidden', zIndex: 201, boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '14px 18px', borderBottom: '1px solid var(--border-secondary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Log Call — {contactName || contactPhone}
                        </h3>
                        {outcome && (
                            <button type="button" onClick={() => setOutcome(null)}
                                    style={{ marginTop: '4px', background: 'none', border: 'none',
                                             fontSize: '12px', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}>
                                ← Change outcome
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} aria-label="Close"
                            style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer',
                                     color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px' }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                    {error && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '12px',
                                      backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px' }}>
                            {error}
                        </div>
                    )}

                    {!outcome && <OutcomePicker onPick={setOutcome} />}

                    {outcome === 'ANSWERED_INTERESTED' && (
                        <AnsweredPath
                            initialRequirements={initialRequirements}
                            submitting={submitting}
                            onSubmit={(values) => submit({ requirements: values })}
                            onCancel={onClose}
                        />
                    )}
                    {outcome === 'NOT_INTERESTED' && (
                        <NotInterestedPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                    {outcome === 'NO_ANSWER' && (
                        <NoAnswerPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                    {outcome === 'CALLBACK_REQUESTED' && (
                        <CallbackPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                    {outcome === 'WRONG_OR_SPAM' && (
                        <WrongOrSpamPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                    {outcome === 'LANGUAGE_BARRIER' && (
                        <LanguageBarrierPath submitting={submitting} onSubmit={submit} onCancel={onClose} />
                    )}
                </div>
            </div>
        </>
    );
}

function OutcomePicker({ onPick }: { onPick: (o: CallOutcome) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                What was the outcome?
            </div>
            {OUTCOME_BUTTONS.map(b => (
                <button key={b.id} type="button" onClick={() => onPick(b.id)}
                        style={{
                            padding: '14px 16px', borderRadius: '10px', textAlign: 'left',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                        }}>
                    <span style={{ fontSize: '22px' }}>{b.emoji}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{b.subtitle}</div>
                    </div>
                </button>
            ))}
        </div>
    );
}

// — PATH COMPONENTS — defined as separate functions in the same file, each a small focused unit

function AnsweredPath({ initialRequirements, submitting, onSubmit, onCancel }: {
    initialRequirements: Partial<RequirementsValues>; submitting: boolean;
    onSubmit: (v: RequirementsValues) => void; onCancel: () => void;
}) {
    return (
        <BuyerRequirementsForm
            initialValues={initialRequirements}
            requireAll={true}
            submitting={submitting}
            submitLabel="✅ Save & Qualify Lead"
            onSubmit={onSubmit}
            onCancel={onCancel}
        />
    );
}

function NotInterestedPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean; onSubmit: (p: any) => void; onCancel: () => void;
}) {
    const [reason, setReason] = useState('NOT_INTERESTED_NOW');
    const [notes, setNotes] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ reason, notes })}
            submitLabel="Mark not interested"
            submitting={submitting}
        >
            <Field label="Reason">
                <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
                    <option value="NOT_INTERESTED_NOW">Not interested right now (revisit later)</option>
                    <option value="JUST_BROWSING">Just browsing — close the lead</option>
                </select>
            </Field>
            <Field label="Notes (optional)">
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle}
                          placeholder="What did the customer say?" />
            </Field>
        </PathShell>
    );
}

function NoAnswerPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean; onSubmit: (p: any) => void; onCancel: () => void;
}) {
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({})}
            submitLabel="Log no-answer"
            submitting={submitting}
        >
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                The deal stays in NEW. AI continues its retry cadence (5 min → 1 hr → every 3 hr per KRA).
            </div>
        </PathShell>
    );
}

function CallbackPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean; onSubmit: (p: any) => void; onCancel: () => void;
}) {
    const [callbackAt, setCallbackAt] = useState('');
    const [notes, setNotes] = useState('');
    const canSubmit = !!callbackAt;
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ callback_at: new Date(callbackAt).toISOString(), notes })}
            submitLabel="Schedule callback"
            submitting={submitting}
            disabled={!canSubmit}
        >
            <Field label="Callback at *">
                <input type="datetime-local" value={callbackAt}
                       onChange={e => setCallbackAt(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Notes (optional)">
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle}
                          placeholder="What did the customer ask you to call about?" />
            </Field>
        </PathShell>
    );
}

function WrongOrSpamPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean; onSubmit: (p: any) => void; onCancel: () => void;
}) {
    const [reason, setReason] = useState('WRONG_NUMBER');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ reason })}
            submitLabel="Mark and close"
            submitting={submitting}
        >
            <Field label="Reason">
                <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
                    <option value="WRONG_NUMBER">Wrong number</option>
                    <option value="SPAM">Spam</option>
                    <option value="BANKER_VALUER">Banker / valuer (not a customer)</option>
                    <option value="DUPLICATE">Duplicate of another deal</option>
                    <option value="PARTNER_AGENT">Partner agent (review later)</option>
                </select>
            </Field>
        </PathShell>
    );
}

function LanguageBarrierPath({ submitting, onSubmit, onCancel }: {
    submitting: boolean; onSubmit: (p: any) => void; onCancel: () => void;
}) {
    const [language, setLanguage] = useState('');
    return (
        <PathShell
            onCancel={onCancel}
            onSubmit={() => onSubmit({ language })}
            submitLabel="Alert manager"
            submitting={submitting}
            disabled={!language.trim()}
        >
            <Field label="Customer's language *">
                <input type="text" value={language} onChange={e => setLanguage(e.target.value)}
                       style={inputStyle} placeholder="e.g. Tamil, Bengali" />
            </Field>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Manager will get a WhatsApp alert. Deal stays in NEW for human handoff.
            </div>
        </PathShell>
    );
}

// — SHARED LITTLE BITS —

function PathShell({ children, onCancel, onSubmit, submitLabel, submitting, disabled = false }: {
    children: React.ReactNode; onCancel: () => void; onSubmit: () => void;
    submitLabel: string; submitting: boolean; disabled?: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {children}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={onCancel} disabled={submitting}
                        style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                 border: '1px solid var(--border-secondary)', backgroundColor: 'transparent',
                                 color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Cancel
                </button>
                <button type="button" onClick={onSubmit} disabled={submitting || disabled}
                        style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                                 border: 'none', backgroundColor: (submitting || disabled) ? '#94a3b8' : 'var(--accent-primary)',
                                 color: '#fff', cursor: (submitting || disabled) ? 'not-allowed' : 'pointer' }}>
                    {submitting ? 'Saving...' : submitLabel}
                </button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {label}
            </div>
            {children}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px',
};
```

- [ ] **Step 2: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/deal/LogCallOverlay.tsx
git commit -m "feat(frontend): LogCallOverlay with all 6 outcome paths

Single-file overlay implementing the call-outcome workflow. Step 1 is
a 6-button picker; Step 2 routes per outcome. ANSWERED_INTERESTED
embeds the BuyerRequirementsForm with requireAll=true. Other paths
are small focused PathShell-wrapped forms (reason, callback time,
notes, language). All paths POST to /api/deals/:id/log-call."
```

### Task 14: Wire LogCallOverlay into DealPipeline

**Files:**
- Modify: `agents/frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Add import**

```typescript
import LogCallOverlay from './deal/LogCallOverlay';
```

- [ ] **Step 2: Add state in `DealPipeline`**

```typescript
const [logCallDeal, setLogCallDeal] = useState<Deal | null>(null);
```

- [ ] **Step 3: Wire the existing "📞 Log My Call" tile button**

Locate both "Log My Call" buttons (mobile + desktop). Change their `onClick`:

```typescript
onClick={(e) => { e.stopPropagation(); setLogCallDeal(deal); }}
```

- [ ] **Step 4: Add the overlay render at the end of `DealPipeline` JSX**

Just before the existing `<DealCloseCommissionDialog>` block:

```tsx
{logCallDeal && (
    <LogCallOverlay
        dealId={logCallDeal.id}
        contactName={logCallDeal.demand_contact?.name || ''}
        contactPhone={logCallDeal.demand_contact?.phone_number || ''}
        initialRequirements={{
            intent: logCallDeal.demand_intent || 'buy',
            preferred_location: logCallDeal.demand_location || '',
            budget_min: logCallDeal.demand_budget_min ?? null,
            budget_max: logCallDeal.demand_budget_max ?? null,
            demand_bhk: logCallDeal.demand_bedrooms ? Number(logCallDeal.demand_bedrooms.match(/\d+/)?.[0]) : null,
            demand_type_slug: logCallDeal.demand_type_slug || logCallDeal.demand_property_type || '',
        }}
        onClose={() => setLogCallDeal(null)}
        onSuccess={() => { setLogCallDeal(null); fetchData(); }}
    />
)}
```

- [ ] **Step 5: Add a "Log My Call" button INSIDE `DealDetailModal` Detail tab (NEW only)**

In the `DealDetailBriefing` render block, append below it inside the modal:

```tsx
{deal.status === 'NEW' && (
    <button type="button" onClick={() => { onClose(); setLogCallDealFromModal?.(deal); }}
            style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', fontWeight: 700, fontSize: '14px',
                     border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff',
                     cursor: 'pointer', width: '100%' }}>
        📞 Log My Call
    </button>
)}
```

(Note: pass `setLogCallDealFromModal` as a new prop on `DealDetailModalProps` and from `DealPipeline`.)

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit -p . 2>&1 | grep "DealPipeline\|LogCallOverlay" | head
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/DealPipeline.tsx
git commit -m "feat(frontend): wire LogCallOverlay from tile + modal

Tile and modal 'Log My Call' buttons now open the overlay. Initial
requirements pre-fill from whatever the source already gave us so
the agent only fills the gaps."
```

### Task 15: Deploy + screenshot all 6 outcome paths

- [ ] **Step 1: Deploy frontend** via `mcp__realty-pandit-qa__deploy('frontend')`.

- [ ] **Step 2: Manually walk through each outcome on a test deal**

For each of the 6 outcomes:
- Click "Log My Call"
- Pick the outcome
- Fill required fields
- Submit
- Verify deal moves to expected status (or stays NEW)
- Verify interaction logged

Take a screenshot of each outcome's Step 2 UI.

- [ ] **Step 3: Stop here for review.** Human approves before Phase 6.

---

## Phase 6 — Mobile Full-Screen Page

### Task 16: Add `/deal/:id` route

**Files:**
- Modify: `agents/frontend/src/App.tsx`
- Create: `agents/frontend/src/pages/DealDetailPage.tsx`

- [ ] **Step 1: Build `DealDetailPage.tsx`**

```tsx
// agents/frontend/src/pages/DealDetailPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client, { type Deal } from '../api/client';
import DealDetailBriefing from '../components/deal/DealDetailBriefing';
import LogCallOverlay from '../components/deal/LogCallOverlay';

export default function DealDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<Deal | null>(null);
    const [contact, setContact] = useState<any>(null);
    const [callAttempts, setCallAttempts] = useState(0);
    const [lastCallAt, setLastCallAt] = useState<string | null>(null);
    const [aiPaused, setAiPaused] = useState(false);
    const [pausing, setPausing] = useState(false);
    const [showLogCall, setShowLogCall] = useState(false);

    useEffect(() => {
        if (!id) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const load = async () => {
        const dealRes = await client.get(`/api/deals/${id}`);
        setDeal(dealRes.data);
        setAiPaused((dealRes.data as any).ai_paused || false);
        const phone = dealRes.data?.demand_contact?.phone_number;
        if (phone) {
            const [c, calls] = await Promise.all([
                client.get(`/api/leads/${encodeURIComponent(phone)}`),
                client.get(`/api/leads/${encodeURIComponent(phone)}/interactions?channel=voice&limit=20`),
            ]);
            setContact(c.data);
            const list = (calls.data || []).filter((i: any) =>
                i.event_type === 'omnidim_call_attempt' || i.event_type === 'human_call_outcome');
            setCallAttempts(list.length);
            setLastCallAt(list[0]?.created_at || null);
        }
    };

    const handlePauseToggle = async () => {
        if (!deal) return;
        setPausing(true);
        try {
            await client.patch(`/api/deals/${deal.id}/ai-paused`, { paused: !aiPaused });
            setAiPaused(!aiPaused);
        } finally { setPausing(false); }
    };

    if (!deal) return <div style={{ padding: '20px' }}>Loading...</div>;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
                      backgroundColor: 'var(--bg-primary)' }}>
            {/* Top bar */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border-secondary)',
                display: 'flex', alignItems: 'center', gap: '12px',
                position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)', zIndex: 5,
            }}>
                <button type="button" onClick={() => navigate(-1)}
                        style={{ background: 'none', border: 'none', fontSize: '20px',
                                 minWidth: '44px', minHeight: '44px', color: 'var(--text-primary)',
                                 cursor: 'pointer' }}>
                    ←
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {deal.demand_contact?.name || 'Deal'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {deal.status} · {deal.deal_scenario || ''}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', paddingBottom: '90px' }}>
                {deal.status === 'NEW' ? (
                    <DealDetailBriefing
                        deal={deal} contact={contact}
                        callAttempts={callAttempts} lastCallAt={lastCallAt} nextCallAt={null}
                        aiPaused={aiPaused} onPauseToggle={handlePauseToggle} pausing={pausing}
                    />
                ) : (
                    <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>
                        This stage's mobile view is not yet redesigned.
                    </div>
                )}
            </div>

            {/* Sticky bottom bar */}
            {deal.status === 'NEW' && (
                <div style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0,
                    padding: '12px 16px', borderTop: '1px solid var(--border-secondary)',
                    backgroundColor: 'var(--bg-primary)', zIndex: 5,
                }}>
                    <button type="button" onClick={() => setShowLogCall(true)}
                            style={{ width: '100%', padding: '14px', borderRadius: '10px',
                                     border: 'none', backgroundColor: 'var(--accent-primary)',
                                     color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
                        📞 Log My Call
                    </button>
                </div>
            )}

            {showLogCall && (
                <LogCallOverlay
                    dealId={deal.id}
                    contactName={deal.demand_contact?.name || ''}
                    contactPhone={deal.demand_contact?.phone_number || ''}
                    initialRequirements={{
                        intent: deal.demand_intent || 'buy',
                        preferred_location: deal.demand_location || '',
                        budget_min: deal.demand_budget_min ?? null,
                        budget_max: deal.demand_budget_max ?? null,
                        demand_bhk: deal.demand_bedrooms ? Number(deal.demand_bedrooms.match(/\d+/)?.[0]) : null,
                        demand_type_slug: deal.demand_type_slug || deal.demand_property_type || '',
                    }}
                    onClose={() => setShowLogCall(false)}
                    onSuccess={() => { setShowLogCall(false); load(); }}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

If `App.tsx` does not yet use `react-router-dom`, wrap its root with `<BrowserRouter>` and define routes. If it already uses state-based view switching, keep the state-based main shell but add a separate `<BrowserRouter>` route that renders DealDetailPage when the URL matches `/deal/:id`. The simplest non-disruptive option:

```typescript
// agents/frontend/src/App.tsx — at the top
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DealDetailPage from './pages/DealDetailPage';

// in the render:
return (
    <BrowserRouter>
        <Routes>
            <Route path="/deal/:id" element={<DealDetailPage />} />
            <Route path="*" element={<ExistingApp />} />
        </Routes>
    </BrowserRouter>
);
```

Where `ExistingApp` is the current root component renamed.

- [ ] **Step 3: Make mobile tile click navigate to the page**

In `DealPipeline.tsx`, find the mobile card list `onClick={() => setSelectedDeal(deal)}` and change it conditionally:

```typescript
onClick={() => {
    if (isMobile) {
        window.history.pushState({}, '', `/deal/${deal.id}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
        setSelectedDeal(deal);
    }
}}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit -p . 2>&1 | grep "DealDetailPage\|App.tsx" | head
```

- [ ] **Step 5: Commit**

```bash
cd clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/pages/DealDetailPage.tsx \
        agents/frontend/src/components/DealPipeline.tsx \
        agents/frontend/src/App.tsx
git commit -m "feat(frontend): mobile uses /deal/:id full-screen page

On mobile (useIsMobile=true), tile clicks navigate to /deal/:id which
renders the same DealDetailBriefing in full-screen with a sticky
bottom 'Log My Call' bar. Browser back works, deep-linkable.
Desktop continues to use the modal."
```

### Task 17: Deploy + mobile screenshot

- [ ] **Step 1: Deploy frontend.**

- [ ] **Step 2: Open admin in mobile viewport (Chrome devtools → iPhone 14)**

- Navigate to Deal Pipeline → tap a NEW tile → verify full-screen page renders, sticky bar visible
- Tap "Log My Call" → verify overlay covers the screen comfortably
- Walk through 1-2 outcomes
- Take screenshots

- [ ] **Step 3: Stop for review.** Human approves before wrap-up.

---

## Phase 7 — Wrap-up

### Task 18: Memory + soak

- [ ] **Step 1: Save a memory note**

Create `C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/project_stage1_new_ux_redesign_<DATE>.md`:

```markdown
---
name: Stage 1 NEW UX Redesign (deployed YYYY-MM-DD)
description: DealPipeline NEW-stage tile + modal + mobile page redesigned to enforce Log Call → outcome → qualify-form workflow. No bypass paths. Backend POST /api/deals/:id/log-call owns all 6 outcome state transitions.
type: project
---

## What shipped
- Backend: `POST /api/deals/:id/log-call` (6 outcomes, all state transitions atomic)
- Frontend: `BuyerRequirementsForm` (reused by ExternalLeads + LogCallOverlay), `DealDetailBriefing` (NEW source-data view), `LogCallOverlay` (6-path workflow), `DealDetailPage` (mobile full-screen)
- Removed: tile "Qualify" shortcut, modal "Mark as Qualified" CTA — only path to QUALIFIED is via Log Call → Answered & Interested → form submit

## Stage enum gap noted but NOT fixed in this plan
Frontend STAGES array still uses old `MATCHED`. Backend uses `QUALIFIED` + `MATCHING_APPOINTMENT` per DEC-003. Address in Stage 2/3 redesign.

## Files modified (also list paths)
[list of files from this plan]
```

- [ ] **Step 2: Update root MEMORY.md routing entry**

Add a one-line pointer in `C:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/MEMORY.md`.

- [ ] **Step 3: 24-hour soak**

For 24 hours, watch:
- The `behavior_auditor` daily digest tomorrow at 9:30 AM IST. Should not flag anything new from Stage 1.
- Check `interactions` table for new `human_call_outcome` rows — confirms team is using the flow.
- Any deal stuck in NEW > 48h after deploy → R5 will alert.

```sql
SELECT outcome, COUNT(*) FROM (
    SELECT (metadata->>'outcome') as outcome FROM interactions
    WHERE event_type = 'human_call_outcome' AND created_at > NOW() - INTERVAL '24 hours'
) t GROUP BY outcome ORDER BY count DESC;
```

- [ ] **Step 4: Commit memory**

```bash
git add C:/Users/Varchasv\ Bhardwaj/.claude/projects/.../memory/*.md
git commit -m "docs(memory): Stage 1 NEW UX redesign complete"
```

---

## Self-Review Checklist (run before handing off)

- [ ] Every task has actual code or commands — no "TBD" / "implement later"
- [ ] Each TDD task has both the failing test AND the passing implementation
- [ ] Files are referenced by exact path (not "the deals route")
- [ ] All 6 outcomes from KRA Area 3 are represented in tests AND in the overlay
- [ ] The "no bypass" requirement is enforced — Tile Qualify removed (Task 11), Modal Qualify removed (Task 11), only path is Log Call (Task 14)
- [ ] Backend endpoint matches the contract the frontend calls (`POST /api/deals/:id/log-call`, body `{outcome, payload}`, response `{ok: true, outcome}`)
- [ ] `BuyerRequirementsForm` is single-source — both ExternalLeads (Task 7) and LogCallOverlay (Task 13) use it
- [ ] `requireAll` prop exists on the form, only set true in the qualify path (Task 13 AnsweredPath)
- [ ] Mobile uses `/deal/:id` route (Task 16); desktop uses the modal (Tasks 9–11)
- [ ] Stale-source sync done before any frontend edit (Task 1)
- [ ] Each phase has a deploy + screenshot stop for human review

---

## Open Risks (flag for the user before execution)

1. **Master data endpoints** — `/public/master/categories`, `/subcategories`, `/types` are assumed to exist (per memory `master.ts` line in architecture). If shape differs, the form's category dropdown won't populate. Plan B: hardcode the category list as a temporary fallback.
2. **`PATCH /api/deals/:id/ai-paused` endpoint** — used by the Pause AI button. Check if it exists; if not, add it as a small Task 4b.
3. **`GET /api/leads/:phone/interactions` endpoint with channel filter** — may need to be added or extended.
4. **App.tsx routing** — current code uses state-based view switching (no react-router for the main app). Adding `<BrowserRouter>` may conflict with existing nav. If risk too high, fallback: render `DealDetailPage` as a state-conditional view in App.tsx instead of via URL.
5. **Stage enum migration** — frontend still uses `MATCHED`; this plan does NOT fix it. Stage 2/3 redesign will. If you want it fixed now, add a pre-Phase 1 task to migrate the constants.

---

## Estimate

| Phase | Optimistic | Realistic |
|-------|-----------|-----------|
| 1. Sync source | 5 min | 15 min |
| 2. Backend endpoint | 1.5 hr | 2.5 hr (test fixtures + auth wiring) |
| 3. Form extraction | 1 hr | 2 hr (visual regression risk) |
| 4. Detail tab redesign | 1.5 hr | 3 hr |
| 5. LogCallOverlay | 2.5 hr | 5 hr (6 paths + edge cases) |
| 6. Mobile page | 2 hr | 4 hr (routing risk) |
| 7. Wrap-up | 30 min | 1 hr |
| **Total** | **9 hr** | **17.5 hr** |

Realistic = 2–3 working sessions with screenshot review cycles in between.
