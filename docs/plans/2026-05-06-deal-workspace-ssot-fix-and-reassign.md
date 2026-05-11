# Deal Workspace — Requirements SSOT Fix + Employee Reassign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Requirements tab so it always shows the correct lead data (reading from the contact as SSOT when transaction fields are blank), make edits write back to the contact so both stay in sync, and build a proper "Reassign to Employee" feature that transfers both the deal coordinator and the lead assignment together.

**Architecture:** Lead = Contact (SSOT). Deal = Transaction (working snapshot). The `listDeals` query already returns `demand_contact` with all requirement fields. We fix the RequirementsTab to fall back to contact data when transaction fields are null, and write back to both on save. The Transfer button is currently wired to inventory ownership — we keep that and add a separate "Reassign" button for team member handoff.

**Tech Stack:** React 19 + inline CSS vars (no Tailwind), Express 5 + Prisma, TypeScript throughout. No new DB tables or migrations needed.

---

## Files to Modify / Create

| File | Change |
|---|---|
| `frontend/src/api/client.ts` | Expand `Deal.demand_contact` type; add `updateLeadRequirements` fn; add `getTeamMembersList` fn; add `reassignDeal` fn |
| `frontend/src/components/deal/RequirementsTab.tsx` | Add contact-field fallbacks to all 10 `useState` initializers; add contact write-back in `save()` |
| `frontend/src/components/deal/ReassignModal.tsx` | **NEW** — employee search + confirm reassignment modal |
| `frontend/src/components/deal/DealWorkspace.tsx` | Add Reassign button + `ReassignModal` wiring |
| `backend/src/routes/deals.ts` | Add `PATCH /api/deals/:id/reassign` endpoint |

---

## Task 1 — Expand `Deal.demand_contact` type in client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

The current typed shape is: `{ phone_number?, name?, email?, contact_type? }`. The `listDeals` backend query already returns the full contact requirements (fixed 2026-05-02). We just need the TypeScript type to match so the rest of the code can use these fields without `as any`.

- [ ] **Step 1: Locate the Deal interface**

Open `frontend/src/api/client.ts`. Find the line:
```ts
demand_contact?: { phone_number?: string; name?: string; email?: string; contact_type?: string };
```
It is around line 865.

- [ ] **Step 2: Replace with full shape**

```ts
demand_contact?: {
    phone_number?: string;
    name?: string;
    email?: string;
    contact_type?: string;
    // Requirements fields (SSOT — fallback source for RequirementsTab)
    intent?: string | null;
    demand_main_category?: string | null;   // = demand_property_type on transaction
    demand_category?: string | null;
    demand_type_slug?: string | null;
    demand_bhk?: number | null;             // = demand_bedrooms as number
    budget_min?: number | null;             // = demand_budget_min
    budget_max?: number | null;             // = demand_budget_max
    preferred_location?: string | null;     // = demand_location
    area_min?: number | null;
    area_max?: number | null;
    demand_amenities?: string[] | null;
};
```

- [ ] **Step 3: Add `updateLeadRequirements` API function**

After the `updateDealRequirements` function (around line 943), add:

```ts
export const updateLeadRequirements = async (phone: string, fields: {
    intent?: string;
    demand_main_category?: string | null;
    demand_category?: string | null;
    demand_type_slug?: string | null;
    demand_bhk?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_location?: string;
    area_min?: number | null;
    area_max?: number | null;
    demand_amenities?: string[];
}) => {
    const res = await client.patch(`/api/leads/${encodeURIComponent(phone)}/requirements`, fields);
    return res.data;
};
```

- [ ] **Step 4: Add `getTeamMembersList` API function**

```ts
export const getTeamMembersList = async () => {
    const res = await client.get('/api/team/members-list');
    return res.data as { id: string; name: string; role: string }[];
};
```

- [ ] **Step 5: Add `reassignDeal` API function**

```ts
export const reassignDeal = async (dealId: string, agentId: string, reason?: string) => {
    const res = await client.patch(`/api/deals/${dealId}/reassign`, { agent_id: agentId, reason });
    return res.data;
};
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd agents/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

---

## Task 2 — RequirementsTab: contact fallback + bidirectional save

**Files:**
- Modify: `frontend/src/components/deal/RequirementsTab.tsx`

### 2A — Add `updateLeadRequirements` to import

- [ ] **Step 1: Update import line at top of file**

Change:
```ts
import { updateDealRequirements, updateDealStatus } from '../../api/client';
```
To:
```ts
import { updateDealRequirements, updateDealStatus, updateLeadRequirements } from '../../api/client';
```

### 2B — Add contact fallbacks to all 10 useState initializers

- [ ] **Step 2: Replace the `useState` initializer block**

Find (around line 34):
```ts
const [fields, setFields] = useState({
    demand_intent:        deal.demand_intent        || '',
    demand_property_type: (deal.demand_property_type as string | null) || '',
    demand_category:      deal.demand_category      || '',
    demand_type_slug:     deal.demand_type_slug     || '',
    demand_bedrooms:      deal.demand_bedrooms      || '',
    demand_location:      deal.demand_location      || '',
    demand_budget_min:    deal.demand_budget_min    ?? ('' as any),
    demand_budget_max:    deal.demand_budget_max    ?? ('' as any),
    demand_area_min:      deal.demand_area_min      ?? ('' as any),
    demand_area_max:      deal.demand_area_max      ?? ('' as any),
    demand_amenities:    (deal.demand_amenities as string[]) || [],
    demand_notes:         deal.demand_notes         || '',
});
```

Replace with (contact fields used as fallback when transaction fields are null/empty):
```ts
const dc = deal.demand_contact;  // shorthand for contact SSOT

const [fields, setFields] = useState({
    demand_intent:
        deal.demand_intent || dc?.intent || '',
    demand_property_type:
        (deal.demand_property_type as string | null) || dc?.demand_main_category || '',
    demand_category:
        deal.demand_category || dc?.demand_category || '',
    demand_type_slug:
        deal.demand_type_slug || dc?.demand_type_slug || '',
    demand_bedrooms:
        deal.demand_bedrooms
        || (dc?.demand_bhk ? `${dc.demand_bhk}BHK` : ''),
    demand_location:
        deal.demand_location || dc?.preferred_location || '',
    demand_budget_min:
        deal.demand_budget_min ?? dc?.budget_min ?? ('' as any),
    demand_budget_max:
        deal.demand_budget_max ?? dc?.budget_max ?? ('' as any),
    demand_area_min:
        deal.demand_area_min ?? dc?.area_min ?? ('' as any),
    demand_area_max:
        deal.demand_area_max ?? dc?.area_max ?? ('' as any),
    demand_amenities:
        (deal.demand_amenities as string[] | null)
        || (dc?.demand_amenities as string[] | null)
        || [],
    demand_notes:
        deal.demand_notes || '',
});
```

### 2C — Add contact write-back in the `save()` function

- [ ] **Step 3: Add contact write-back at end of `save()` function**

Find the `save` function. After the `await updateDealRequirements(deal.id, payload)` call and before the closing `} catch {`, add:

```ts
// Write back to contact (SSOT) — fire-and-forget, deal update is primary
const contactPhone = deal.demand_contact?.phone_number;
if (contactPhone) {
    const bhkNum = updated.demand_bedrooms
        ? Number(updated.demand_bedrooms.match(/\d+/)?.[0]) || null
        : null;
    updateLeadRequirements(contactPhone, {
        intent:                updated.demand_intent        || undefined,
        demand_main_category:  updated.demand_property_type || undefined,
        demand_category:       updated.demand_category       || null,
        demand_type_slug:      updated.demand_type_slug      || null,
        demand_bhk:            bhkNum,
        budget_min:            updated.demand_budget_min !== '' ? Number(updated.demand_budget_min) : null,
        budget_max:            updated.demand_budget_max !== '' ? Number(updated.demand_budget_max) : null,
        preferred_location:    updated.demand_location   || undefined,
        area_min:              updated.demand_area_min   !== '' ? Number(updated.demand_area_min)   : null,
        area_max:              updated.demand_area_max   !== '' ? Number(updated.demand_area_max)   : null,
        demand_amenities:      updated.demand_amenities,
    }).catch(() => {/* silent — contact sync is best-effort */});
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd agents/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

---

## Task 3 — Backend: PATCH /api/deals/:id/reassign endpoint

**Files:**
- Modify: `backend/src/routes/deals.ts`

This endpoint changes the deal's coordinator and the contact's assigned agent atomically, then logs a TRANSFER action to the timeline.

- [ ] **Step 1: Add the endpoint**

In `backend/src/routes/deals.ts`, add after the `PATCH /:id/requirements` route (around line 278):

```ts
// ─── PATCH /api/deals/:id/reassign — Reassign deal coordinator + lead agent ──
router.patch('/:id/reassign', checkPermission('manage_deals'), async (req: any, res) => {
    const { id } = req.params;
    const agent = req.agent;
    const { agent_id, reason } = req.body;

    if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });

    try {
        // Verify the target agent belongs to this tenant and is active
        const targetAgent = await prisma.agent.findFirst({
            where: { id: agent_id, tenant_id: agent.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true, phone: true },
        });
        if (!targetAgent) return res.status(404).json({ error: 'Agent not found or inactive' });

        // Load the deal to get contact phone and current status
        const deal = await prisma.transaction.findFirst({
            where: { id, tenant_id: agent.tenant_id },
            select: {
                id: true, status: true, tenant_id: true,
                coordinator_agent_id: true,
                demand_contact: { select: { phone_number: true } },
            },
        });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const contactPhone = deal.demand_contact?.phone_number;
        const noteText = reason || `Reassigned to ${targetAgent.name}`;

        // Atomic update: transaction coordinator + contact assignment + timeline log
        await prisma.$transaction([
            prisma.transaction.update({
                where: { id },
                data: { coordinator_agent_id: agent_id, updated_at: new Date() },
            }),
            ...(contactPhone ? [
                prisma.contact.update({
                    where: { phone_number: contactPhone },
                    data: { assigned_agent_id: agent_id },
                }),
            ] : []),
            prisma.teamAction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    transaction_id: id,
                    agent_id: agent.id,
                    stage: deal.status,
                    action_type: 'TRANSFER',
                    outcome: `To: ${targetAgent.name} (${targetAgent.role})`,
                    notes: noteText,
                },
            }),
            prisma.transaction.update({
                where: { id },
                data: { last_team_action_at: new Date() },
            }),
        ]);

        logger.info(`[DealAPI] Deal ${id} reassigned from ${deal.coordinator_agent_id} to ${agent_id} by ${agent.name}`);
        res.json({ success: true, new_coordinator: targetAgent });
    } catch (err: any) {
        logger.error('[DealAPI] Reassign error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Verify TypeScript compiles on backend**

Run: `cd agents/backend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

---

## Task 4 — Frontend: ReassignModal component (NEW)

**Files:**
- Create: `frontend/src/components/deal/ReassignModal.tsx`

A self-contained modal that searches active team members and reassigns the deal + lead.

- [ ] **Step 1: Create `ReassignModal.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import type { Deal } from '../../api/client';
import { getTeamMembersList, reassignDeal } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

interface TeamMember { id: string; name: string; role: string }

interface Props {
    deal: Deal;
    onClose: () => void;
    onReassigned: () => void;
}

const ROLE_LABELS: Record<string, string> = {
    super_boss: 'Super Boss', manager: 'Manager',
    employee: 'Employee', partner: 'Partner',
};

export function ReassignModal({ deal, onClose, onReassigned }: Props) {
    const { showToast } = useToast();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string>('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        getTeamMembersList()
            .then(list => setMembers(list))
            .catch(() => showToast('Failed to load team members', 'error'))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = members.filter(m =>
        !search || m.name.toLowerCase().includes(search.toLowerCase())
    );

    const currentCoordinator = deal.coordinator?.name || 'Unassigned';

    const handleReassign = async () => {
        if (!selected) { showToast('Select a team member', 'error'); return; }
        setSaving(true);
        try {
            await reassignDeal(deal.id, selected, reason || undefined);
            showToast('Deal and lead reassigned successfully', 'success');
            onReassigned();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Reassignment failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 12,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 200,
            }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: 'var(--bg-primary)', borderRadius: 14, padding: 24,
                width: 420, maxWidth: '92vw', maxHeight: '80vh', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', gap: 16,
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)', zIndex: 201,
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        🔄 Reassign Deal
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 0,
                    }}>×</button>
                </div>

                {/* Current coordinator */}
                <div style={{
                    padding: '8px 12px', borderRadius: 8, fontSize: 12,
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                }}>
                    <strong>Currently assigned to:</strong> {currentCoordinator}
                </div>

                {/* Info note */}
                <div style={{
                    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                    padding: '6px 10px', borderRadius: 6,
                    backgroundColor: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.2)',
                }}>
                    This will reassign both the deal coordinator and the lead contact to the selected employee.
                </div>

                {/* Search */}
                <input
                    style={inputStyle}
                    placeholder="Search team member…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                {/* Member list */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 120, maxHeight: 240 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                            Loading…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                            No members found
                        </div>
                    ) : (
                        filtered.map(m => {
                            const isSelected = selected === m.id;
                            const isCurrent = deal.coordinator?.id === m.id;
                            return (
                                <div
                                    key={m.id}
                                    onClick={() => !isCurrent && setSelected(m.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                                        cursor: isCurrent ? 'not-allowed' : 'pointer',
                                        backgroundColor: isSelected
                                            ? 'rgba(59,130,246,0.12)'
                                            : 'transparent',
                                        border: isSelected
                                            ? '1.5px solid rgba(59,130,246,0.4)'
                                            : '1.5px solid transparent',
                                        opacity: isCurrent ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        backgroundColor: 'var(--bg-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)',
                                    }}>
                                        {(m.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {m.name}
                                            {isCurrent && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>(current)</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {ROLE_LABELS[m.role] || m.role}
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <span style={{ fontSize: 16, color: 'var(--accent-primary)' }}>✓</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Reason */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase' }}>
                        Reason (optional)
                    </div>
                    <input
                        style={inputStyle}
                        placeholder="e.g. Language barrier, area specialist needed…"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={handleReassign}
                        disabled={saving || !selected}
                        style={{
                            flex: 1, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                            backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
                            cursor: saving || !selected ? 'not-allowed' : 'pointer',
                            opacity: saving || !selected ? 0.6 : 1,
                        }}
                    >
                        {saving ? 'Reassigning…' : '✅ Confirm Reassign'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '9px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                            backgroundColor: 'transparent', border: '1px solid var(--border-secondary)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd agents/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

---

## Task 5 — DealWorkspace: wire the Reassign button

**Files:**
- Modify: `frontend/src/components/deal/DealWorkspace.tsx`

The existing Transfer button (`onTransfer` prop) is for inventory ownership — we leave it. We add a new **Reassign** button inside the workspace header that opens the new `ReassignModal`.

- [ ] **Step 1: Import ReassignModal**

Add to the imports at the top of `DealWorkspace.tsx`:
```ts
import { ReassignModal } from './ReassignModal';
```

- [ ] **Step 2: Add `showReassign` state**

Inside the component body, after the existing state declarations, add:
```ts
const [showReassign, setShowReassign] = useState(false);
```

- [ ] **Step 3: Add Reassign button next to the Transfer button**

In the header's quick action buttons section (the `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` block around line 124), add a new button after the existing Transfer button:

```tsx
<button
    onClick={() => setShowReassign(true)}
    style={quickBtnStyle('#6366f1', true)}
>
    👤 Reassign
</button>
```

- [ ] **Step 4: Render ReassignModal when open**

Inside the modal `<div>` (the one with `zIndex: 101`), add after the call log modal block:

```tsx
{/* Reassign Modal */}
{showReassign && (
    <ReassignModal
        deal={deal}
        onClose={() => setShowReassign(false)}
        onReassigned={() => {
            setShowReassign(false);
            onRefresh();
            onClose();
        }}
    />
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd agents/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

---

## Task 6 — Build, Deploy, Verify

- [ ] **Step 1: Full frontend build**

```bash
cd agents/frontend && npm run build 2>&1 | tail -10
```
Expected: `✓ built in XX.XXs` — no TypeScript errors.

- [ ] **Step 2: Deploy frontend + backend together**

```bash
cd agents && node deployment/deploy-agent.js frontend backend
```
Expected: Both show `SUCCESS`.

- [ ] **Step 3: Smoke test — Requirements tab shows contact data**

Open admin.realtypandit.in → Deal Pipeline → click any deal where Category was blank before.
- Detail tab → Category should now show "Residential" (or whatever the contact has)
- Sub-Category and Type should populate from contact fallback
- BHK visible only for Residential deals ✅

- [ ] **Step 4: Smoke test — Edit requirements syncs both ways**

1. Open any deal → Detail tab → Edit
2. Change location to a new value → Done
3. Open ExternalLeads → find the same contact → verify `preferred_location` updated ✅
4. Open the deal again → verify location still shows the new value ✅

- [ ] **Step 5: Smoke test — Reassign button**

1. Open any deal → click "👤 Reassign" button in header
2. Modal opens → shows list of team members
3. Search works → filter narrows list
4. Select a different employee → Confirm
5. Toast: "Deal and lead reassigned successfully" ✅
6. Modal closes, workspace refreshes
7. Coordinator name in top-right of header shows new employee ✅
8. Open Timeline tab → TRANSFER event logged with "To: [Name]" ✅
9. Open ExternalLeads → same contact → `assigned_agent_id` changed ✅

---

## Edge Cases Covered

| Case | Handling |
|---|---|
| Contact has no phone_number | Contact write-back skipped silently; deal update still succeeds |
| Target agent is already the coordinator | UI shows "(current)" label, click disabled |
| Target agent not found / inactive | Backend returns 404, toast shown |
| Contact sync fails (network) | Fire-and-forget with `.catch(() => {})` — deal update is primary |
| All transaction fields are populated | Fallback to contact never fires (`||` short-circuits) |
| Deal has no coordinator | "Unassigned" shown in ReassignModal header |

---

## What Is NOT Changed

- Existing `onTransfer` / inventory ownership transfer — untouched, different feature
- `POST /api/deals/:id/log-action` — untouched
- All other tabs (Match & Share, Shared, Timeline) — untouched
- DB schema — no migrations needed
- `PATCH /api/leads/:phone/requirements` backend — already correct, no change

---

## Estimated Change Size

| File | Lines |
|---|---|
| `client.ts` | +35 |
| `RequirementsTab.tsx` | ~20 modified |
| `ReassignModal.tsx` | ~180 new |
| `DealWorkspace.tsx` | ~15 |
| `deals.ts` (backend) | ~50 |
| **Total** | ~300 lines |
