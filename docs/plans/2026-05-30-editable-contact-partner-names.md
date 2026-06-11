# Plan — Self-service editable contact & partner-agent names (admin)

**Date:** 2026-05-30
**Author:** Claude (for Puneet / Sunny)
**Status:** PROPOSED — not executed

## Goal

Puneet/Sunny can **edit a name themselves in the panel** — for a regular contact OR a
partner agent / inventory owner — and the change cascades automatically to every place that
name is stored. **No DB scripts.** Editing the corrupted owner `+919650720167`
("I have the key") in the UI must self-heal the partner record AND the inventory cards.

## Problem

Names are **write-once** — captured at creation, never editable:
- `routes/leads.ts` PATCH routes (`/status`, `/reassign`, `/mark-lost`, `/assign`,
  `/requirements`) — **none writes `name`**. No `/api/contacts` mount.
- `routes/api.ts` partner routes (`/verify`, `/status`, `/commission`, `/package`) — **none writes `name`**.
- Frontend: `ExternalLeads.tsx:1309` shows the name read-only; `PartnerManagement.tsx`
  lists `p.name` read-only and imports no edit function (its own comment refers to "the
  edit flow" that was never built).

### Two facts the design must respect
1. **Dual storage** — a `PARTNER_AGENT` has a name in BOTH `contacts.name` and `partner_agents.name`.
2. **Denormalized copies** — `inventory.uploader_name` / `key_holder_name` are snapshots, not
   FKs. They must be re-synced on rename or the cards keep showing the old/corrupted name.

### Reachability (why two UI surfaces)
The leads list filters to BUYER/TENANT/UNKNOWN, so a `PARTNER_AGENT` owner is **not**
reachable in the ExternalLeads detail. The natural place to edit a partner is the
**Partner Management** page. So the edit affordance must exist on BOTH surfaces, and BOTH
backend routes must run the **same** cascade.

---

## Part 0 — Shared cascade helper (the heart of self-service)

New `services/contact_identity.ts`. One function both routes call so a rename from EITHER
surface fixes everything. Overwrites denormalized copies **only where they still equal the
old name**, so a legitimately different uploader/key-holder name is never clobbered.

```ts
import { Prisma } from '@prisma/client';

/** Rename a person everywhere their name is stored: contacts, partner_agents,
 *  and denormalized inventory snapshots (uploader_name / key_holder_name). */
export async function syncContactName(
    tx: Prisma.TransactionClient,
    phone: string,
    oldName: string | null,
    newName: string | null,
) {
    await tx.contact.updateMany({ where: { phone_number: phone }, data: { name: newName, updated_at: new Date() } });
    await tx.partnerAgent.updateMany({ where: { phone_number: phone }, data: { name: newName ?? '' } });
    if (oldName) {
        await tx.inventory.updateMany({ where: { owner_phone: phone, uploader_name: oldName }, data: { uploader_name: newName } });
        await tx.inventory.updateMany({ where: { owner_phone: phone, key_holder_name: oldName }, data: { key_holder_name: newName } });
    }
}
```

## Part 1 — Permission (new, privileged)

`config/permissions.ts` — add `edit_contact` to `super_boss` and `manager` (employees excluded).
```ts
// in super_boss[] and manager[]:
    'edit_contact',
```

## Part 2 — Backend: contact identity route

`routes/leads.ts` — new `PATCH /api/leads/:phone`:
```ts
import { syncContactName } from '../services/contact_identity';

// PATCH /api/leads/:phone — edit contact identity (name/email). Privileged. Cascades.
router.patch('/:phone', checkPermission('edit_contact'), async (req, res) => {
    try {
        const phone = await resolvePhone(req.params.phone);
        const { name, email } = req.body || {};
        if (name === undefined && email === undefined) return res.status(400).json({ error: 'Nothing to update' });

        const existing = await prisma.contact.findUnique({ where: { phone_number: phone }, select: { name: true } });
        if (!existing) return res.status(404).json({ error: 'Contact not found' });

        const newName = name !== undefined ? (String(name).trim() || null) : undefined;

        await prisma.$transaction(async (tx) => {
            if (email !== undefined) await tx.contact.update({ where: { phone_number: phone }, data: { email: email || null } });
            if (newName !== undefined) await syncContactName(tx, phone, existing.name, newName);
        });

        const updated = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { phone_number: true, name: true, email: true, contact_type: true },
        });
        res.json({ success: true, contact: updated });
    } catch (error) {
        captureRouteError(error, req, { route: 'leads#editIdentity' });
        res.status(500).json({ error: (error as Error).message });
    }
});
```

## Part 3 — Backend: partner identity route (the one you'll use for the corrupted record)

`routes/api.ts` — new general `PATCH /api/partners/:id`, permission `manage_agents`, runs the
SAME cascade via the linked phone:
```ts
import { syncContactName } from '../services/contact_identity';

// PATCH /api/partners/:id — edit partner identity. Cascades name to contact + inventory.
router.patch('/partners/:id', checkPermission('manage_agents'), async (req, res) => {
    const { id } = req.params;
    const { name, email, company_name, city, agency_name } = req.body || {};
    try {
        const current = await prisma.partnerAgent.findUnique({ where: { id }, select: { name: true, phone_number: true } });
        if (!current) return res.status(404).json({ error: 'Partner not found' });

        const data: any = {};
        if (email !== undefined) data.email = email || null;
        if (company_name !== undefined) data.company_name = company_name || null;
        if (agency_name !== undefined) data.agency_name = agency_name || null;
        if (city !== undefined) data.city = city || null;

        const newName = name !== undefined ? (String(name).trim() || null) : undefined;

        await prisma.$transaction(async (tx) => {
            if (Object.keys(data).length) await tx.partnerAgent.update({ where: { id }, data });
            if (newName !== undefined && current.phone_number) {
                await syncContactName(tx, current.phone_number, current.name, newName);
            }
        });

        const partner = await prisma.partnerAgent.findUnique({ where: { id } });
        res.json({ success: true, partner });
    } catch (error) {
        captureRouteError(error, req, { route: 'api#partnerEdit' });
        res.status(500).json({ error: (error as Error).message });
    }
});
```

## Part 4 — Frontend: api client

`api/client.ts` — add two functions (mirror existing partner helpers):
```ts
export const updatePartner = async (id: string, data: { name?: string; email?: string; company_name?: string; city?: string; agency_name?: string }) => {
    const res = await client.patch(`/api/partners/${id}`, data);
    return res.data;
};
export const updateContactIdentity = async (phone: string, data: { name?: string; email?: string }) => {
    const res = await client.patch(`/api/leads/${encodeURIComponent(phone)}`, data);
    return res.data;
};
```

## Part 5 — Frontend: Partner Management edit (PRIMARY — for the corrupted owner)

`components/PartnerManagement.tsx`:
- import `updatePartner` (line 2).
- Add per-row **Edit** state: `const [editId, setEditId] = useState<string|null>(null); const [editName, setEditName] = useState('');`
- On the row (near the read-only `{p.name}` at ~257/314) add an **✎ Edit** button → sets
  `editId=p.id; editName=p.name`. When `editId===p.id`, render an `<input value={editName}>`
  + **Save** button:
```tsx
const handleSavePartnerName = async (p: Partner) => {
    try {
        await updatePartner(p.id, { name: editName.trim() });
        setPartners(prev => prev.map(x => x.id === p.id ? { ...x, name: editName.trim() } : x));
        setEditId(null);
        showToast('Name updated', 'success');
    } catch { showToast('Failed to update name', 'error'); }
};
```

## Part 6 — Frontend: Lead detail edit (for regular contacts)

`components/ExternalLeads.tsx`:
- State near `editNotes` (~263): `const [editName, setEditName] = useState(''); const [savingName, setSavingName] = useState(false);`
- Seed where `setEditNotes(d.notes || '')` is (~536): `setEditName(d.name || '');`
- Handler (mirror `handleSaveNotes`, ~721):
```tsx
const handleSaveName = async () => {
    if (!selectedPhone) return;
    setSavingName(true);
    try {
        await updateContactIdentity(selectedPhone, { name: editName.trim() });
        setLeadDetail(prev => prev ? { ...prev, name: editName.trim() } : prev);
        setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, name: editName.trim() } : l));
    } catch (err: any) { alert(err?.response?.data?.error || 'Failed to update name'); }
    finally { setSavingName(false); }
};
```
- UI block at top of detail body (~1327, before Lifecycle), privileged-gated, mirroring Notes:
```tsx
{isPrivileged && (
  <div>
    <label style={soLabel}>Name</label>
    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Contact name" style={soInput} />
    <button onClick={handleSaveName} disabled={savingName} style={{ ...outlineBtn, fontSize: '12px', padding: '5px 12px', marginTop: '6px' }}>
      {savingName ? 'Saving...' : 'Save Name'}
    </button>
  </div>
)}
```

---

## Fixing the corrupted record — now self-service (no script)

After deploy: open **Partner Management** → find owner `+919650720167` ("I have the key")
→ ✎ Edit → type the real name → Save. The cascade updates `partner_agents.name`,
`contacts.name`, and both inventory rows' `uploader_name`/`key_holder_name` automatically.
The "flat" display bug is separate (taxonomy plan).

## Deploy notes
- Server NOT git-tracked — edit/build on server. Backend: `npx tsc` → `pm2 restart realty-backend`.
  Frontend: `npm run build` (serves from `dist/`).
- No schema/migration change.
- Verify: rename a partner in Partner Management → confirm `partner_agents`, `contacts`, and
  that owner's `inventory.uploader_name` all change; rename a contact in ExternalLeads;
  confirm an `employee` login gets 403 on both routes.

## Out of scope
- Original 2026-05-11 leak path (how the label became the name) — separate investigation.
- "Shows as flat" + 37 unmapped TYPE nodes — separate taxonomy plan.
