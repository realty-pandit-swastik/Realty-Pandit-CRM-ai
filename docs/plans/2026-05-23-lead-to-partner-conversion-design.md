# Design — Convert inbound lead → Partner Agent (during qualify)

> Design/spec (brainstorming output). Implementation plan to follow via writing-plans.

## Context / why
Inbound leads from **99acres / Housing / MagicBricks / website / WhatsApp** auto-create a `Contact` (BUYER/TENANT/UNKNOWN) + a `Transaction` (deal) in `NEW`→`QUALIFIED` (via `ensureDealForLead`). Some of these inbound "customers" are actually **partner agents (dealers)**, not end customers. Today the only way to record a partner is the manual **"create lead on behalf of a partner agent"** flow at *creation* time (`ExternalLeads` 2‑step Add Lead → `POST /api/leads` with `referral_partner_*`). There is no way to reclassify an **already‑inbound** lead/deal. Team members need to, during qualify, **convert** such a lead: register the person as a partner agent and **reframe their existing deal** as that partner's deal so it keeps flowing through the pipeline.

## Decisions (Puneet, 2026-05-23)
1. The inbound person **IS** the partner agent (not a customer referred by one).
2. **Reframe** the existing deal (keep requirements; partner becomes the handler) — do **not** close it.
3. **Forward‑only** — no reverse / un‑convert action in v1.
4. Permission: **any team member who works deals** (`act_on_deals`) — intentionally broader than `POST /api/partners` (`manage_agents`), mirroring how the create‑on‑behalf flow lets any agent attach/create a partner.
5. Entry points: **both** the **Deal Workspace** and the **Ext. Leads lead panel**.
6. Approach **A** — dedicated endpoint + modal (atomic server‑side; reuse `ensurePartnerAgent`).

## Behavior
A team member viewing an **open** inbound lead/deal whose contact is **not already** a partner sees a **"🤝 Convert to Partner Agent"** action. Confirming a small modal (name prefilled, phone locked, Individual/Company toggle, optional company name):
- The contact becomes a registered partner agent.
- Their open deal(s) are reframed as that partner's deal(s) — same requirements, same stage, now tagged **Partner + Internal**.
- A partner‑welcome WhatsApp goes out (same as the create‑on‑behalf flow).

## Backend
**New endpoint (contact/phone‑centric so it serves both UIs):**
`POST /api/leads/:phone/convert-to-partner` — `routes/leads.ts` (sits beside the existing `PATCH /api/leads/:phone/reassign`). Permission: `checkPermission('act_on_deals')`.
Body: `{ name?: string, partner_category?: 'INDIVIDUAL'|'COMPANY', company_name?: string }`.

In one DB transaction:
1. Resolve the `Contact` by normalized phone. If `contact_type` already `PARTNER_AGENT` → 200 no‑op (idempotent). Require a non‑empty name (body `name` or `contact.name`) else 400.
2. `ensurePartnerAgent(phone, name, tenant_id, req.agent.id)` (reuse `services/partner_auto_create.ts`) → creates the `PartnerAgent` (`status=ACTIVE`, `managing_agent_id=req.agent.id`, `onboarded_by_agent_id=req.agent.id`) and flips `Contact.contact_type=PARTNER_AGENT`, `verification_status=CONVERTED_PARTNER`. Extend `ensurePartnerAgent` (optional args) to also set `partner_category` + `business_name=company_name` when provided.
3. Reframe the contact's **open** deals (`status NOT IN (CLOSED_WON, CLOSED_LOST)`): set `deal_scenario='PARTNER_INTERNAL'`, `demand_handler_type='PARTNER'`, `demand_handler_id=<partnerId>`, `owning_manager_id = partner.managing_agent_id`. **Unchanged:** `status`, all `demand_*` requirements, `demand_contact_id` (the partner is the contact + the handler — sourcing on behalf of their client).
4. Audit (mirror reassign at `deals.ts:326-448`): `Interaction(event_type='converted_to_partner', direction='outbound', metadata={partner_id, deal_ids})` + a `TeamAction`. Fire the existing `sendPartnerWelcomeWhatsApp(phone, name, partner_category, req.agent.name)`.
5. Return `{ success, partner_id, reframed_deal_ids }`.

No schema/migration change (all fields already exist on Contact / PartnerAgent / Transaction).

## Frontend
**Client** (`api/client.ts`): `convertLeadToPartner(phone, { name, partner_category, company_name })` → `POST /api/leads/:phone/convert-to-partner` (uses the shared CSRF axios client per `feedback_axios_shared_client`).

**Shared modal** `components/ConvertToPartnerModal.tsx` (new): props `{ phone, defaultName, onClose, onConverted }`. Fields: **Name** (prefilled, editable, required), **Phone** (read‑only = contact phone), **Individual / Company** toggle (default Individual), optional **Company name** (shown when Company). Confirm → `convertLeadToPartner` → toast + `onConverted()`.

**Entry point 1 — Deal Workspace** (`components/deal/DealWorkspace.tsx`): add **"🤝 Convert to Partner"** in the header action row (next to Reassign), visible when the deal is open AND `deal.demand_contact.contact_type !== 'PARTNER_AGENT'`. Opens the modal with the deal's contact phone/name; `onConverted` refreshes the deal (the existing "Direct + Internal" → "Partner + Internal" chip flips).

**Entry point 2 — Ext. Leads lead panel** (`components/ExternalLeads.tsx`): add the same button in the selected‑lead detail panel (near the existing actions), visible when the selected lead isn't already a partner. Opens the same modal with `selectedPhone`; `onConverted` refreshes the lead list/panel.

PWA cache‑bust: bump `frontend/index.html` SW stamp.

## Edge cases
- Contact already `PARTNER_AGENT` → button hidden in both UIs; endpoint no‑ops if hit.
- All deals closed / no open deal → still registers the partner (contact flip); `reframed_deal_ids=[]`.
- Missing name → modal blocks confirm; endpoint 400s.
- Idempotent: re‑convert is safe.
- The partner's other deals/inventory are untouched.

## Out of scope (v1)
- Reverse / un‑convert (explicitly dropped).
- Supply‑side handler choice (always demand‑side, matching create‑on‑behalf).
- Capturing a *separate* end‑customer at convert time (that's the existing create‑on‑behalf flow, used afterwards).
- Bulk convert; delivery‑status tracking.

## Reuse / references
- `services/partner_auto_create.ts:ensurePartnerAgent` — partner creation + contact flip (already used by the qualify‑workflow `'PARTNER_AGENT'` outcome and the create‑on‑behalf flow).
- `routes/deals.ts:326-448` (reassign) — endpoint shape, audit (Interaction + TeamAction), notify pattern.
- `routes/leads.ts` create‑on‑behalf (`POST /api/leads`) — exact partner‑deal end‑state to match (`deal_scenario=PARTNER_INTERNAL`, owning_manager cascade).
- `feedback_axios_shared_client`, `feedback_mobile_components` (ExternalLeads is shared desktop+PWA), `feedback_phone_normalization` (normalize `:phone`).

## Verification
1. tsc clean on touched files; deploy backend + frontend; SW bump.
2. Server E2E (read‑mostly): pick a real inbound `NEW/QUALIFIED` deal whose contact is a BUYER; mint an `act_on_deals` JWT; `POST /api/leads/<phone>/convert-to-partner`; assert `Contact.contact_type=PARTNER_AGENT`, a `PartnerAgent` row exists, and the deal now has `deal_scenario=PARTNER_INTERNAL` + `demand_handler_type=PARTNER` + `demand_handler_id`. (Partner‑welcome WhatsApp is the only outbound side‑effect — to a test/partner number.)
3. Playwright (no client send): open the deal → "Convert to Partner" → confirm modal → the chip flips to **Partner + Internal**; repeat from the Ext. Leads lead panel; screenshot both.
4. GlitchTip clean post‑deploy.

## Files
- `backend/src/routes/leads.ts` — new `POST /:phone/convert-to-partner`.
- `backend/src/services/partner_auto_create.ts` — optional args (`partner_category`, `company_name`) on `ensurePartnerAgent`.
- `frontend/src/api/client.ts` — `convertLeadToPartner`.
- `frontend/src/components/ConvertToPartnerModal.tsx` — new shared modal.
- `frontend/src/components/deal/DealWorkspace.tsx` — header button (entry point 1).
- `frontend/src/components/ExternalLeads.tsx` — lead‑panel button (entry point 2).
- `frontend/index.html` — SW cache‑bust stamp.
