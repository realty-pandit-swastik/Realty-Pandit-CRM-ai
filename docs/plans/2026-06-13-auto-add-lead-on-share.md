# Auto-Add-Lead on Inventory Share Implementation Plan

> **For agentic workers:** Execute with **superpowers:executing-plans** (INLINE, phase checkpoints — per `feedback_subagent_overhead`). Steps use `- [ ]`.

**Goal:** When a team member shares inventory and types a phone number that isn't in our DB, offer to **add it as a lead**: ask **direct client or partner agent**, confirm/pick the requirement (auto-derived from the inventory being shared), and create the contact + a pipeline deal — for a partner, create it **on the partner's behalf** (the partner isn't the buyer) with the welcome/invitation fired. Then continue the share.

**Architecture:** A new thin backend endpoint `POST /api/inventory/share/add-lead` that maps the chosen inventory → a demand payload and reuses the **proven lead-creation primitives** (`ensurePartnerAgent`, `sendPartnerWelcomeWhatsApp`, `ensureDealForLead`) the lead page already uses — **without touching the battle-tested `routes/leads.ts` handler** (zero regression risk there). The frontend share modal gets a "not in database → add" prompt. Assignment goes to the uploader; partner deals get `PARTNER_INTERNAL` attribution; the partner's buyer is a `PENDING-` placeholder (client name/phone optional, addable later — per `reference_partner_multi_lead`).

**Tech Stack:** Node/TS, Prisma, the existing demand-canonical helpers. Vite+React frontend.

**Decisions (from brainstorm):** Q1=**ask requirement at add-time** (pick which shared inventory defines it); Q2=**auto-create a pipeline deal**; Q3=**fire partner welcome + create lead on the partner's behalf**; Q4=**assign to the uploader**; partner client name/phone **never required**, attach later.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `agents/backend/src/services/inventory_to_demand.ts` | **Create** | `buildDemandFromInventory(inv)` — map a listing → buyer demand |
| `agents/backend/src/routes/inventory.ts` | **Modify** | `POST /share/add-lead` (recognize role, map demand, create lead/deal) |
| `agents/backend/src/__tests__/inventory_to_demand.test.ts` | **Create** | unit: sell→buy, bhk, budget band, location, partner vs direct payload |
| `agents/frontend/src/components/InventoryList.tsx` (+ `mobile/MobileInventoryList.tsx`) | **Modify** | "not in DB → add as lead" prompt in the share modal |

---

## Phase 1 — `buildDemandFromInventory` (the mapper, pure + tested)

**Files:** Create `services/inventory_to_demand.ts` + test.

- [ ] **Step 1: Write the failing test** (`inventory_to_demand.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { buildDemandFromInventory } from '../services/inventory_to_demand';

const inv: any = {
  intent: 'sell', type: 'flat', category_id: 'c1', sub_category_id: 's1', type_id: 't1',
  taxonomy_node_id: 'node-3bhk', specs: { bhk: 3 },
  locality: 'Vaishali', city: 'Ghaziabad', display_price: 10000000,
  preferred_lat: null, preferred_lng: null,
};

describe('buildDemandFromInventory', () => {
  const d = buildDemandFromInventory(inv);
  it('maps sell -> buy intent', () => expect(d.intent).toBe('buy'));
  it('carries bhk + taxonomy + type ids', () => {
    expect(d.demand_bhk).toBe('3');
    expect(d.demand_taxonomy_node_id).toBe('node-3bhk');
    expect(d.type_id).toBe('t1');
  });
  it('location = locality + city', () => expect(d.preferred_location).toBe('Vaishali, Ghaziabad'));
  it('budget band brackets the listing price', () => {
    expect(d.budget_min).toBeLessThan(10000000);
    expect(d.budget_max).toBeGreaterThan(10000000);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `services/inventory_to_demand.ts`:**

```ts
export interface DemandFromInventory {
  intent: 'buy' | 'rent';
  property_type: string | null;
  category_id: string | null;
  sub_category_id: string | null;
  type_id: string | null;
  demand_taxonomy_node_id: string | null;
  demand_bhk: string | null;
  preferred_location: string | null;
  preferred_lat: number | null;
  preferred_lng: number | null;
  budget_min: number | null;
  budget_max: number | null;
}

/**
 * Map a listing the team is sharing → the buyer demand to seed a new lead.
 * "Looking for something like THIS." Inventory intent is sell/rent; lead intent
 * is buy/rent (sell→buy). Budget is a ±15% band around the listing price so the
 * matching engine has a range, not an exact point.
 */
export function buildDemandFromInventory(inv: any): DemandFromInventory {
  const s = (inv.specs || {}) as Record<string, any>;
  const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
  const price = Number(inv.display_price ?? inv.customer_price ?? inv.price ?? 0) || null;
  const loc = [inv.locality, inv.city].filter(Boolean).join(', ') || inv.location || null;
  return {
    intent: inv.intent === 'rent' || inv.intent === 'rent_lease' ? 'rent' : 'buy',
    property_type: inv.type ?? null,
    category_id: inv.category_id ?? null,
    sub_category_id: inv.sub_category_id ?? null,
    type_id: inv.type_id ?? null,
    demand_taxonomy_node_id: inv.taxonomy_node_id ?? inv.demand_taxonomy_node_id ?? null,
    demand_bhk: room != null ? String(room) : null,
    preferred_location: loc,
    preferred_lat: inv.preferred_lat ?? inv.lat ?? null,
    preferred_lng: inv.preferred_lng ?? inv.lng ?? null,
    budget_min: price ? Math.round(price * 0.85) : null,
    budget_max: price ? Math.round(price * 1.15) : null,
  };
}
```
> **Verify during impl:** confirm the Inventory model's taxonomy field name (`taxonomy_node_id` vs other) and that `category_id/sub_category_id/type_id` exist on the row — adjust the field reads to match (Grep `model Inventory` in `schema.prisma`). The leads handler accepts exactly these keys.

- [ ] **Step 4: Run → PASS. tsc diff = 381.**

---

## Phase 2 — Backend endpoint `POST /api/inventory/share/add-lead`

**File:** `routes/inventory.ts` (new route; reuses primitives, does NOT touch `leads.ts`).

- [ ] **Step 1: Add the route** (mirror the partner/direct branches of `leads.ts:780` using its primitives):

```ts
// POST /inventory/share/add-lead — create a lead for a number that isn't in our DB,
// from the inventory the team member is sharing. role = 'direct' | 'partner'.
// direct  → BUYER contact + pipeline deal (assigned to the uploader).
// partner → PartnerAgent + welcome + on-behalf lead/deal (PENDING- buyer, PARTNER_INTERNAL).
router.post('/share/add-lead', authMiddleware, async (req: any, res) => {
    try {
        const { phone, name, role, inventory_id } = req.body || {};
        const agent = req.agent!;
        const normalized = normalizePhone(phone);
        if (!normalized || isPlaceholderPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
        if (!['direct', 'partner'].includes(role)) return res.status(400).json({ error: 'role must be direct|partner' });

        const inv = await prisma.inventory.findUnique({
            where: { id: inventory_id },
            select: { id: true, intent: true, type: true, category_id: true, sub_category_id: true, type_id: true, taxonomy_node_id: true, specs: true, locality: true, city: true, location: true, display_price: true, price: true, customer_price: true },
        });
        if (!inv) return res.status(404).json({ error: 'Inventory not found' });

        const tenant = await prisma.tenant.findFirst();
        const { buildDemandFromInventory } = await import('../services/inventory_to_demand');
        const { ensureDealForLead } = await import('../services/ensure_deal');
        const d = buildDemandFromInventory(inv);
        const intentForContact = d.intent; // 'buy' | 'rent'

        if (role === 'partner') {
            const { ensurePartnerAgent } = await import('../services/partner_auto_create');
            const { sendPartnerWelcomeWhatsApp } = await import('../services/partner_notifications');
            const pa = await ensurePartnerAgent(normalized, name || 'Partner Agent', agent.tenant_id, agent.id);
            if (pa.wasCreated) {
                sendPartnerWelcomeWhatsApp(pa.partnerPhone, name || 'Partner Agent', 'INDIVIDUAL', agent.name)
                    .catch((e: any) => logger.warn(`[ShareAddLead] partner welcome failed: ${e.message}`));
            }
            const owningManagerId = (await prisma.partnerAgent.findUnique({ where: { id: pa.partnerId }, select: { managing_agent_id: true } }))?.managing_agent_id ?? agent.id;
            // On-behalf buyer = PENDING- placeholder (partner's client name/phone optional, added later)
            const pendingKey = `PENDING-${normalized.replace(/\D/g, '').slice(-10)}-${Date.now().toString(36)}`;
            await prisma.contact.create({
                data: {
                    phone_number: pendingKey, tenant_id: agent.tenant_id, name: null, source: 'inventory_share',
                    contact_type: 'BUYER', intent: intentForContact, lead_type: 'PARTNER_REFERRAL',
                    referral_partner_id: pa.partnerId, owning_manager_id: owningManagerId,
                    preferred_location: d.preferred_location, preferred_lat: d.preferred_lat, preferred_lng: d.preferred_lng,
                    budget_min: d.budget_min, budget_max: d.budget_max,
                    category_id: d.category_id, sub_category_id: d.sub_category_id, type_id: d.type_id,
                    demand_taxonomy_node_id: d.demand_taxonomy_node_id,
                    demand_schema_values: d.demand_bhk ? { bhk: d.demand_bhk } : undefined,
                } as any,
            });
            const deal = await ensureDealForLead({ contactPhone: pendingKey, source: 'inventory_share', createdByAgentId: agent.id, assignedAgentId: agent.id, isPartnerReferral: true });
            // Partner attribution on the deal (mirror leads.ts convert-to-partner)
            await prisma.transaction.update({ where: { id: deal.dealId }, data: { deal_scenario: 'PARTNER_INTERNAL', demand_handler_type: 'PARTNER', demand_handler_id: pa.partnerId, owning_manager_id: owningManagerId } as any });
            return res.json({ success: true, role, partner_id: pa.partnerId, partner_created: pa.wasCreated, deal_id: deal.dealId, contact_phone: normalized });
        }

        // direct client
        const existing = await prisma.contact.findUnique({ where: { phone_number: normalized } });
        await prisma.contact.upsert({
            where: { phone_number: normalized },
            update: { name: name || undefined, intent: intentForContact, preferred_location: d.preferred_location, budget_min: d.budget_min, budget_max: d.budget_max, category_id: d.category_id, sub_category_id: d.sub_category_id, type_id: d.type_id, demand_taxonomy_node_id: d.demand_taxonomy_node_id, demand_schema_values: d.demand_bhk ? { bhk: d.demand_bhk } : undefined } as any,
            create: { phone_number: normalized, tenant_id: agent.tenant_id, name: name || null, source: 'inventory_share', contact_type: 'BUYER', intent: intentForContact, preferred_location: d.preferred_location, preferred_lat: d.preferred_lat, preferred_lng: d.preferred_lng, budget_min: d.budget_min, budget_max: d.budget_max, category_id: d.category_id, sub_category_id: d.sub_category_id, type_id: d.type_id, demand_taxonomy_node_id: d.demand_taxonomy_node_id, demand_schema_values: d.demand_bhk ? { bhk: d.demand_bhk } : undefined, created_by: agent.id } as any,
        });
        const deal = await ensureDealForLead({ contactPhone: normalized, source: 'inventory_share', createdByAgentId: agent.id, assignedAgentId: agent.id });
        res.json({ success: true, role, deal_id: deal.dealId, contact_created: !existing, contact_phone: normalized });
    } catch (error) {
        captureRouteError(error, req, { route: 'inventory#share-add-lead' });
        logger.error('[ShareAddLead] Error:', error);
        res.status(500).json({ error: 'Failed to add lead' });
    }
});
```
> **Verify during impl:** confirm the Contact model field names (`referral_partner_id`, `owning_manager_id`, `lead_type`, `category_id`/`sub_category_id`/`type_id`, `demand_taxonomy_node_id`, `demand_schema_values`, `budget_min/max`, `preferred_lat/lng`) against `schema.prisma` — they're all set by `leads.ts:945-1050`, so copy that block's exact keys. Route is **`/share/add-lead`** (static, mounted at both `/inventory` and `/api/inventory`; no `:id` collision).

- [ ] **Step 2: tsc diff = 381** (the `as any` casts absorb Prisma key strictness, matching the leads handler's style). Commit backend.

---

## Phase 3 — Frontend: "not in DB → add as lead" prompt

**Files:** `InventoryList.tsx` + `mobile/MobileInventoryList.tsx` (the batch-share modal).

- [ ] **Step 1:** In the contact-search step of the batch-share modal, when `batchContactResults` is **empty** and the typed query is a valid-looking phone, render an **"➕ Not in our database — add as a new lead"** block:
  - radio/buttons: **Direct client** | **Partner agent**
  - optional **Name** field
  - **Requirement basis** (Q1): a small select of the currently-selected inventories ("Use requirement from: <3 BHK Vaishali ▾>") defaulting to the first.
  - **Add** button → `POST /api/inventory/share/add-lead` with `{ phone: <typed>, name, role, inventory_id: <chosen> }`.

- [ ] **Step 2:** On success, set `batchShareContact` to the new contact (`{ phone_number: res.data.contact_phone, name }`) so the flow proceeds straight into the normal share (which will now recognize partner→brochure / direct→card). Show a toast: *"Added as {role} lead — deal created."*

- [ ] **Step 3:** Keep it minimal — reuse existing modal styles. No new deps.

- [ ] **Step 4:** Desktop + mobile parity (same block in both lists). tsc/build clean. Commit frontend.

---

## Phase 4 — Deploy + verify (live, as a user)

- [ ] **Step 1:** Merge `wt/backend` + `wt/frontend` → `feature/contact-system-refactor`; bump `index.html` PWA stamp; deploy backend + frontend.
- [ ] **Step 2: Verify (Playwright, like a user)** on the share page with a **fresh number not in DB**:
  - **Direct:** add as direct client → confirm a BUYER contact + a pipeline deal exist (assigned to the uploader), demand = the inventory's (type/bhk/location/budget band), then the share proceeds as a v5 card.
  - **Partner:** add as partner agent → confirm a `PartnerAgent` (welcome fired), a `PENDING-` on-behalf deal with `deal_scenario=PARTNER_INTERNAL` + `demand_handler_id`, assigned to the uploader; then the share proceeds as a brochure.
  - Confirm via DB read (the share-add script pattern) + the deal pipeline.
- [ ] Use a **test number you control** (NOT the dev number `+919958860411`).

---

## Skills used while executing
- **superpowers:executing-plans** — inline, phase checkpoints.
- **superpowers:test-driven-development** — vitest for `buildDemandFromInventory` (diff vs `reference_test_tsc_baseline`).
- **verify** + **playwright** — drive the share page; confirm contact/deal/partner created with correct attribution + assignment.
- **verification-before-completion** — DB + pipeline evidence before done.
- **Project runbooks** — `deploy.md`; GlitchTip via `captureRouteError`; reuses `reference_partner_multi_lead` semantics (PENDING- buyer, attach-later).

## Verification
- A direct add → contact + deal, demand from inventory, assigned to uploader, share continues as card.
- A partner add → PartnerAgent + welcome + on-behalf PENDING- deal (PARTNER_INTERNAL), assigned to uploader, share continues as brochure.
- Re-running with the same number ATTACHES (no duplicate) per `ensureDealForLead` idempotency.

## Self-review
- **Coverage:** unknown-number prompt ✅; direct vs partner ✅; requirement from inventory (pick at add-time) ✅; deal auto-created ✅; partner welcome + on-behalf attribution ✅; assign to uploader ✅; attach-client-later (PENDING- + existing lead-page edit) ✅.
- **Reuse / low risk:** reuses `ensureDealForLead`, `ensurePartnerAgent`, `sendPartnerWelcomeWhatsApp`, demand keys — **without modifying `leads.ts`** (no regression to the lead page). Only new: the mapper + one endpoint + the modal prompt.
- **Type consistency:** `buildDemandFromInventory` returns the exact keys the contact upsert + `ensureDealForLead` consume.
- **Open verify-at-impl items (flagged, not placeholders):** exact Inventory taxonomy field name + Contact field names — both resolved by reading `schema.prisma` / copying `leads.ts:945-1050` at implementation.

## On completion
Add a memory note (extend `reference_partner_multi_lead` or a new `reference_add_lead_from_share`): the share page can now create a direct/partner lead from an unknown number, demand seeded from the shared inventory, partner on-behalf with PENDING- buyer.
