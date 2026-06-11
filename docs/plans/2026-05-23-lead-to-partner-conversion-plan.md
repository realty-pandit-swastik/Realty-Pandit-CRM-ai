# Convert Lead → Partner Agent — Implementation Plan

**STATUS: ✅ SHIPPED 2026-05-23.** All code tasks done + deployed (SW `v20260523b`). Backend verified **end-to-end via the live `POST /api/leads/:phone/convert-to-partner` endpoint** with a synthetic contact+deal (super_boss/`act_on_deals` JWT): contact→`PARTNER_AGENT`/`CONVERTED_PARTNER`, PartnerAgent ACTIVE (COMPANY + business_name), deal→`PARTNER_INTERNAL`/`demand_handler=PARTNER`, status kept `QUALIFIED` → **PASS**; synthetic records cleaned up. Frontend tsc-clean + deployed (buttons in DealWorkspace + ExternalLeads) — **UI user-confirmed 2026-05-24** (button + modal visible on both surfaces). Done.



> **Execution:** This project ships via `node deployment/deploy-agent.js backend|frontend --skip-verify` (NO git branches/commits — workspace isn't git-tracked). Execute **inline with phase checkpoints** (per `feedback_subagent_overhead`). "Checkpoint" steps replace git commits: run tsc/E2E and confirm before moving on. Steps use `- [ ]`.

**Goal:** Let any team member (`act_on_deals`) convert an inbound lead whose contact is actually a partner agent into a registered `PartnerAgent`, reframing that contact's open deals as the partner's deals — from both the Deal Workspace and the Ext. Leads lead panel.

**Architecture:** One new contact/phone-centric endpoint `POST /api/leads/:phone/convert-to-partner` that reuses `ensurePartnerAgent` (creates the PartnerAgent + flips `contact_type`) then reframes open deals (`deal_scenario=PARTNER_INTERNAL`, `demand_handler_type=PARTNER`). One shared `ConvertToPartnerModal`, wired into two existing components. Forward-only, no schema change.

**Tech Stack:** Express + Prisma + TypeScript (backend), React + TS inline-styles (frontend), Meta WhatsApp (partner welcome). Verification via tsc + server-side Node/Prisma E2E (`reference_prod_db_script_pattern`) + Playwright (window.open/visual, no client sends).

**Spec:** `docs/plans/2026-05-23-lead-to-partner-conversion-design.md`.

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `backend/src/services/partner_auto_create.ts` | `ensurePartnerAgent` — add optional `partner_category` + `company_name` | Modify |
| `backend/src/routes/leads.ts` | New `POST /:phone/convert-to-partner` endpoint | Modify |
| `frontend/src/api/client.ts` | `convertLeadToPartner` helper | Modify |
| `frontend/src/components/ConvertToPartnerModal.tsx` | Shared convert modal | Create |
| `frontend/src/components/deal/DealWorkspace.tsx` | "Convert to Partner" header button + modal | Modify |
| `frontend/src/components/ExternalLeads.tsx` | "Convert to Partner" lead-panel button + modal | Modify |
| `frontend/index.html` | SW cache-bust stamp | Modify (1 line) |

---

## Task 1: Extend `ensurePartnerAgent` with category + company name

**Files:** Modify `backend/src/services/partner_auto_create.ts`

- [ ] **Step 1: Add an options param and apply it on create.** Replace the function signature and the `partner_category`/`business_name` lines.

Change the signature (currently lines 25-30):
```ts
export async function ensurePartnerAgent(
    phone: string,
    name: string,
    tenantId: string,
    managingAgentId: string,
    options?: { partnerCategory?: 'INDIVIDUAL' | 'COMPANY'; companyName?: string | null }
): Promise<PartnerAutoCreateResult> {
```

In the `prisma.partnerAgent.create({ data: { ... } })` block, change these two lines:
```ts
            partner_category: options?.partnerCategory ?? 'INDIVIDUAL',
            business_name: options?.companyName ?? null,
```
(Leave every other field — status ACTIVE, listing_limit, etc. — unchanged. Existing callers pass no `options`, so behavior is identical for them.)

- [ ] **Step 2: tsc checkpoint.**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep partner_auto_create || echo CLEAN`
Expected: `CLEAN`

---

## Task 2: Backend endpoint `POST /api/leads/:phone/convert-to-partner`

**Files:** Modify `backend/src/routes/leads.ts`

- [ ] **Step 1: Import `checkPermission`.** At the top of `leads.ts`, the existing import is `import { authMiddleware } from '../middleware/auth';` (line 8). Change it to also import `checkPermission`:
```ts
import { authMiddleware, checkPermission } from '../middleware/auth';
```

- [ ] **Step 2: Add the endpoint** immediately AFTER the existing reassign endpoint (after its closing `});` at ~line 410). Paste:

```ts
// POST /api/leads/:phone/convert-to-partner
// Convert an inbound lead whose contact IS a partner agent (dealer) into a registered
// PartnerAgent, and reframe their open deals as that partner's deals. Forward-only.
// Permission: act_on_deals (any team member who works deals). See
// docs/plans/2026-05-23-lead-to-partner-conversion-design.md
router.post('/:phone/convert-to-partner', checkPermission('act_on_deals'), async (req: any, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const actor = req.agent;
        const { name, partner_category, company_name } = req.body || {};
        const category: 'INDIVIDUAL' | 'COMPANY' = partner_category === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL';

        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, tenant_id: true, contact_type: true },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found' });

        // Idempotent: already a partner → no-op.
        if (contact.contact_type === 'PARTNER_AGENT') {
            const existing = await prisma.partnerAgent.findUnique({
                where: { phone_number: phone }, select: { id: true },
            });
            return res.json({ success: true, partner_id: existing?.id ?? null, reframed_deal_ids: [], already_partner: true });
        }

        const partnerName = (name || contact.name || '').trim();
        if (!partnerName) return res.status(400).json({ error: 'A name is required to register a partner agent' });

        // req.agent is a raw JWT with no `name` — fetch it for audit/notify text (feedback_jwt_agent_shape).
        const actorRecord = await prisma.agent.findUnique({ where: { id: actor.id }, select: { name: true } });
        const actorName = actorRecord?.name || actor.email || 'a team member';

        // 1) Register the partner + flip contact_type=PARTNER_AGENT (reuses ensurePartnerAgent).
        const result = await ensurePartnerAgent(phone, partnerName, contact.tenant_id, actor.id, {
            partnerCategory: category,
            companyName: company_name || null,
        });
        const partnerId = result.partnerId;

        // owning_manager cascades from the partner's managing agent.
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: partnerId }, select: { managing_agent_id: true },
        });
        const owningManagerId = partner?.managing_agent_id ?? actor.id;

        // 2) Reframe the contact's OPEN deals as this partner's deals.
        const openDeals = await prisma.transaction.findMany({
            where: { demand_contact_id: phone, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
            select: { id: true },
        });
        const dealIds = openDeals.map(d => d.id);

        await prisma.$transaction([
            prisma.contact.update({
                where: { phone_number: phone },
                data: { verification_status: 'CONVERTED_PARTNER', updated_at: new Date() },
            }),
            prisma.transaction.updateMany({
                where: { id: { in: dealIds } },
                data: {
                    deal_scenario: 'PARTNER_INTERNAL',
                    demand_handler_type: 'PARTNER',
                    demand_handler_id: partnerId,
                    owning_manager_id: owningManagerId,
                    updated_at: new Date(),
                },
            }),
            prisma.interaction.create({
                data: {
                    tenant_id: contact.tenant_id,
                    phone_number: phone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'converted_to_partner',
                    content: `Converted ${contact.name || phone} to Partner Agent by ${actorName}. Reframed ${dealIds.length} deal(s).`,
                    metadata: { partner_id: partnerId, deal_ids: dealIds, actor_id: actor.id, partner_category: category },
                },
            }),
        ]);

        // 3) Partner welcome WhatsApp (non-blocking; same as create-on-behalf flow).
        try {
            await sendPartnerWelcomeWhatsApp(phone, partnerName, category, actorName);
        } catch (waErr) {
            console.warn(`[Leads] partner welcome WA failed for ${phone}: ${(waErr as Error).message}`);
        }

        console.info(`[Leads] ${phone} converted to partner ${partnerId} by ${actorName}; reframed ${dealIds.length} deal(s)`);
        res.json({ success: true, partner_id: partnerId, reframed_deal_ids: dealIds });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'leads#convert-to-partner' });
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Lead not found' });
        console.error('[Leads] convert-to-partner error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});
```

- [ ] **Step 3: tsc checkpoint.**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "routes/leads" || echo CLEAN`
Expected: `CLEAN` (ignore unrelated pre-existing baseline lines if any — diff against `reference_test_tsc_baseline`).

---

## Task 3: Server-side E2E verification of the endpoint

This codebase verifies db-heavy routes with a Node/Prisma script over SSH against prod dist (`reference_prod_db_script_pattern`), not route unit tests. Do this AFTER deploying the backend (Task 8 deploys; run this against the deployed dist).

- [ ] **Step 1: Pick a safe test contact + run the convert via the deployed service path.** SSH to `root@72.62.231.224`, write to `/var/www/realty-pandit/backend`, run (uses the live dist):

```js
// verify_convert.js — run from /var/www/realty-pandit/backend
require('dotenv').config();
const prisma = require('./dist/db').default;
const leadsConvert = require('./dist/services/partner_auto_create'); // ensurePartnerAgent
(async () => {
  // find an inbound BUYER/TENANT contact with an open deal that is NOT already a partner
  const deal = await prisma.transaction.findFirst({
    where: { status: { in: ['NEW', 'QUALIFIED'] }, demand_contact: { contact_type: { in: ['BUYER', 'TENANT', 'UNKNOWN'] } } },
    select: { id: true, demand_contact: { select: { phone_number: true, name: true, contact_type: true } } },
    orderBy: { updated_at: 'desc' },
  });
  console.log('BEFORE', JSON.stringify(deal));
  // (Do NOT mutate here — this script only PROVES the data preconditions exist.
  //  The actual convert is exercised via the live endpoint with a minted act_on_deals JWT,
  //  OR via the Playwright UI test in Task 8. After running the real convert, re-query:)
  const phone = deal.demand_contact.phone_number;
  const after = await prisma.contact.findUnique({ where: { phone_number: phone }, select: { contact_type: true, verification_status: true } });
  const pa = await prisma.partnerAgent.findUnique({ where: { phone_number: phone }, select: { id: true, status: true, partner_category: true } });
  const txn = await prisma.transaction.findFirst({ where: { id: deal.id }, select: { deal_scenario: true, demand_handler_type: true, demand_handler_id: true } });
  console.log('AFTER contact', JSON.stringify(after), 'partner', JSON.stringify(pa), 'deal', JSON.stringify(txn));
  process.exit(0);
})();
```

- [ ] **Step 2: Assert post-convert state.** After triggering the real convert (Playwright, Task 8) for that phone, re-run the script's AFTER block and confirm:
  - `contact.contact_type === 'PARTNER_AGENT'`, `verification_status === 'CONVERTED_PARTNER'`
  - a `PartnerAgent` row exists (`status === 'ACTIVE'`, `partner_category` matches chosen)
  - `deal.deal_scenario === 'PARTNER_INTERNAL'`, `demand_handler_type === 'PARTNER'`, `demand_handler_id === <partner id>`

Expected: all assertions hold.

---

## Task 4: Client helper `convertLeadToPartner`

**Files:** Modify `frontend/src/api/client.ts`

- [ ] **Step 1: Add the helper** next to `reassignLead` (after line ~220). Paste:
```ts
export const convertLeadToPartner = async (
    phone: string,
    payload: { name?: string; partner_category?: 'INDIVIDUAL' | 'COMPANY'; company_name?: string },
) => {
    const res = await client.post(`/api/leads/${encodeURIComponent(phone)}/convert-to-partner`, payload);
    return res.data;
};
```
(Uses the shared `client` axios instance with the CSRF interceptor — `feedback_axios_shared_client`.)

- [ ] **Step 2: tsc checkpoint.**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "api/client" || echo CLEAN`
Expected: `CLEAN`

---

## Task 5: Shared `ConvertToPartnerModal` component

**Files:** Create `frontend/src/components/ConvertToPartnerModal.tsx`

- [ ] **Step 1: Create the file.** Paste complete:
```tsx
import React, { useState } from 'react';
import { convertLeadToPartner } from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface Props {
    phone: string;
    defaultName?: string;
    onClose: () => void;
    onConverted: () => void;
}

export function ConvertToPartnerModal({ phone, defaultName, onClose, onConverted }: Props) {
    const { showToast } = useToast();
    const [name, setName] = useState(defaultName || '');
    const [category, setCategory] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
    const [companyName, setCompanyName] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) { showToast('Name is required', 'error'); return; }
        setSaving(true);
        try {
            await convertLeadToPartner(phone, {
                name: name.trim(),
                partner_category: category,
                company_name: category === 'COMPANY' ? companyName.trim() : undefined,
            });
            showToast('Converted to Partner Agent', 'success');
            onConverted();
            onClose();
        } catch {
            showToast('Convert failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const input: React.CSSProperties = {
        padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13,
        outline: 'none', width: '100%', boxSizing: 'border-box',
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 400 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14, width: 420, maxWidth: '94vw',
                zIndex: 401, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 20,
            }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🤝 Convert to Partner Agent</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Registers this contact as a partner agent and re-tags their open deal(s) as partner deals.
                </div>

                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</label>
                <input style={{ ...input, margin: '4px 0 12px' }} value={name} onChange={e => setName(e.target.value)} placeholder="Partner agent name" />

                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                <input style={{ ...input, margin: '4px 0 12px', opacity: 0.7 }} value={phone} readOnly />

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {(['INDIVIDUAL', 'COMPANY'] as const).map(c => (
                        <button key={c} type="button" onClick={() => setCategory(c)} style={{
                            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${category === c ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                            backgroundColor: category === c ? 'rgba(37,99,235,0.08)' : 'transparent',
                            color: category === c ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        }}>{c === 'INDIVIDUAL' ? 'Individual' : 'Company'}</button>
                    ))}
                </div>

                {category === 'COMPANY' && (
                    <input style={{ ...input, marginBottom: 12 }} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name (optional)" />
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button type="button" onClick={onClose} disabled={saving} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)',
                    }}>Cancel</button>
                    <button type="button" onClick={submit} disabled={saving} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: 'none', backgroundColor: '#10b981', color: '#fff',
                    }}>{saving ? 'Converting…' : 'Convert'}</button>
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 2: tsc checkpoint.**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep ConvertToPartnerModal || echo CLEAN`
Expected: `CLEAN`

---

## Task 6: Wire button into Deal Workspace

**Files:** Modify `frontend/src/components/deal/DealWorkspace.tsx`

- [ ] **Step 1: Import the modal** at the top with the other imports:
```tsx
import { ConvertToPartnerModal } from '../ConvertToPartnerModal';
```

- [ ] **Step 2: Add modal state** next to the existing `useState` modal flags (near `setShowReassign`):
```tsx
const [showConvert, setShowConvert] = useState(false);
```

- [ ] **Step 3: Add the button** in the quick-action row, immediately after the Reassign button (currently line 141 `👤 Reassign`). Insert:
```tsx
                                    {deal.demand_contact?.contact_type !== 'PARTNER_AGENT'
                                        && deal.status !== 'CLOSED_WON' && deal.status !== 'CLOSED_LOST' && (
                                        <button type="button" onClick={() => setShowConvert(true)} style={quickBtnStyle('#10b981', true)}>🤝 Convert to Partner</button>
                                    )}
```

- [ ] **Step 4: Render the modal** alongside the other modals (where `ReassignModal` is rendered, ~line 246-257). Insert:
```tsx
                {showConvert && phone && (
                    <ConvertToPartnerModal
                        phone={phone}
                        defaultName={deal.demand_contact?.name || ''}
                        onClose={() => setShowConvert(false)}
                        onConverted={() => { onReload?.(); }}
                    />
                )}
```
(If the component's deal-refresh callback isn't named `onReload`, use whatever the file already calls after Reassign succeeds — e.g. `onUpdated`/`refresh`. Grep the file for what `ReassignModal`'s success handler calls and reuse it.)

- [ ] **Step 5: tsc checkpoint.**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep DealWorkspace || echo CLEAN`
Expected: `CLEAN`

---

## Task 7: Wire button into Ext. Leads lead panel

**Files:** Modify `frontend/src/components/ExternalLeads.tsx`

- [ ] **Step 1: Import the modal** at the top:
```tsx
import { ConvertToPartnerModal } from './ConvertToPartnerModal';
```

- [ ] **Step 2: Add modal state** next to the other panel `useState`s (near `sliderTab`, ~line 326):
```tsx
const [showConvert, setShowConvert] = useState(false);
```

- [ ] **Step 3: Add the button** in the selected-lead detail panel, next to the "Save Notes" button (~line 1519). Insert a button that only shows when the lead isn't already a partner:
```tsx
                                        {leadDetail.contact_type !== 'PARTNER_AGENT' && (
                                            <button type="button" onClick={() => setShowConvert(true)} style={{
                                                padding: '7px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                                                border: 'none', backgroundColor: '#10b981', color: '#fff', marginLeft: 8,
                                            }}>🤝 Convert to Partner</button>
                                        )}
```
(Place it within the same action row as Save Notes. If the surrounding flex container doesn't exist, wrap Save Notes + this button in a `<div style={{ display:'flex', gap:8 }}>`.)

- [ ] **Step 4: Render the modal** inside the `{selectedPhone && ( … )}` panel block (after line 1265, anywhere in the panel JSX):
```tsx
                            {showConvert && selectedPhone && (
                                <ConvertToPartnerModal
                                    phone={selectedPhone}
                                    defaultName={leadDetail?.name || ''}
                                    onClose={() => setShowConvert(false)}
                                    onConverted={() => {
                                        setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, contact_type: 'PARTNER_AGENT' } : l));
                                        setShowConvert(false);
                                    }}
                                />
                            )}
```

- [ ] **Step 5: tsc checkpoint.**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep ExternalLeads || echo CLEAN`
Expected: `CLEAN`

---

## Task 8: SW bump, deploy, verify both surfaces

- [ ] **Step 1: Bump the SW cache stamp** in `frontend/index.html` — change the `<!-- v… -->` comment to `<!-- v20260523b-convert-to-partner-swbust -->`.

- [ ] **Step 2: Full tsc gate (touched files).**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "partner_auto_create|routes/leads" || echo BE_CLEAN`
Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "ConvertToPartnerModal|DealWorkspace|ExternalLeads|api/client" || echo FE_CLEAN`
Expected: `BE_CLEAN` and `FE_CLEAN`.

- [ ] **Step 3: Deploy.**

Run: `node deployment/deploy-agent.js backend --skip-verify` → SUCCESS
Run: `node deployment/deploy-agent.js frontend --skip-verify` → SUCCESS (confirm new bundle hash + SW updated)

- [ ] **Step 4: Playwright verify — Deal Workspace (no client send).** Cookie-auth as super_boss; open an inbound deal whose contact is a BUYER; click "🤝 Convert to Partner"; pick Individual; Convert. Confirm: the deal header chip flips to **Partner + Internal** and the button disappears. Screenshot.

- [ ] **Step 5: Playwright verify — Ext. Leads panel.** Open the same/another non-partner lead in Ext. Leads; click "🤝 Convert to Partner"; Convert; confirm the button disappears (lead now PARTNER_AGENT). Screenshot.

- [ ] **Step 6: Server assertion (Task 3 AFTER block)** for the converted phone → contact_type=PARTNER_AGENT, PartnerAgent row, deal PARTNER_INTERNAL + demand_handler=PARTNER. 

- [ ] **Step 7: GlitchTip clean** post-deploy; update `docs/PROJECT_STATUS.md` + memory.

---

## Notes / risk
- Pure additive; no schema/migration. Reuses `ensurePartnerAgent` (proven) + the reassign endpoint/audit/notify pattern.
- Permission `act_on_deals` is intentionally broader than `POST /api/partners` (`manage_agents`) — mirrors create-on-behalf openness (owner decision 2026-05-23).
- `ExternalLeads` is shared desktop+PWA (`feedback_mobile_components`) — the single button covers both.
- PWA users must close+reopen once after deploy (SW cache).
- Forward-only: no UI to undo a convert (owner decision). A mis-convert is fixed via Partner Management / DB.
