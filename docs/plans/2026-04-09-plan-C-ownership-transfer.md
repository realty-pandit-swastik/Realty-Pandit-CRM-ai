# Plan C — Inventory Ownership Transfer (Post Deal Close)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a deal is closed (CLOSED_WON), allow the team to transfer inventory ownership from the seller to the buyer — creating a new owner record, updating the inventory, and preserving audit history.

**Architecture:** New backend endpoint `POST /inventory/:id/transfer-ownership`. Deal Pipeline admin UI gets a "Transfer Ownership" button visible only on `CLOSED_WON` transactions. Ownership history is logged in `TransactionLog` (already exists). Old owner's contact remains intact — only the inventory's `owner_phone` + `owner_id` changes.

**Tech Stack:** Express 5, Prisma 5.10, React 19, TypeScript, CSS custom properties, existing `ensureOwner` utility

---

## Files Modified

| File | Change |
|------|--------|
| `agents/backend/src/routes/inventory.ts` | New `POST /inventory/:id/transfer-ownership` endpoint |
| `agents/backend/src/routes/transactions.ts` | (Read-only) — check TransactionLog write pattern for audit entry |
| `agents/frontend/src/components/DealPipeline.tsx` | "Transfer Ownership" button on CLOSED_WON cards, contact search modal |

---

## Task 1: Backend — Transfer Ownership Endpoint

**What:** `POST /inventory/:id/transfer-ownership` takes `{ new_owner_phone, new_owner_name?, reason? }`. It:
1. Validates inventory exists
2. Validates new owner phone (normalized)
3. Upserts contact as `BUYER_TENANT` (they bought the property)
4. Creates/finds Owner record via `ensureOwner`
5. Updates `inventory.owner_phone` + `inventory.owner_id`
6. Logs to `TransactionLog` with action `OWNERSHIP_TRANSFERRED`
7. Returns updated inventory

**Files:**
- Modify: `agents/backend/src/routes/inventory.ts`

- [ ] **Step 1: Verify ensureOwner import and TransactionLog enum**

Check top of `agents/backend/src/routes/inventory.ts`:

```bash
grep -n "ensureOwner\|TransactionLog\|OWNERSHIP" agents/backend/src/routes/inventory.ts | head -20
```

Confirm `ensureOwner` is imported. If `TransactionLog` has an enum for action, check:

```bash
grep -n "TransactionLogAction\|action.*ENUM" agents/backend/prisma/schema.prisma | head -10
```

- [ ] **Step 2: Add OWNERSHIP_TRANSFERRED to TransactionLogAction enum (if not present)**

In `agents/backend/prisma/schema.prisma`, find:

```prisma
enum TransactionLogAction {
  // existing values...
}
```

Add if missing:

```prisma
  OWNERSHIP_TRANSFERRED
```

If you added a new enum value, run migration:

```bash
cd agents/backend
npx prisma migrate dev --name add_ownership_transferred_action
```

- [ ] **Step 3: Add the transfer-ownership endpoint**

In `agents/backend/src/routes/inventory.ts`, find the existing `POST /inventory/:id/transfer` endpoint (~line 679). Add the NEW endpoint AFTER it:

```typescript
// POST /inventory/:id/transfer-ownership
// Transfer property ownership from current owner to a new buyer contact (after deal close)
router.post('/:id/transfer-ownership', authMiddleware, checkPermission('manage_inventory'), async (req: any, res) => {
    try {
        const { id } = req.params;
        const { new_owner_phone, new_owner_name, reason, transaction_id } = req.body;

        if (!new_owner_phone) {
            return res.status(400).json({ error: 'new_owner_phone is required' });
        }

        // Normalize phone
        const newPhone = normalizePhone(new_owner_phone);
        if (!newPhone) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        // Fetch current inventory
        const inventory = await prisma.inventory.findUnique({
            where: { id },
            include: { owner: true },
        });

        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        const previousOwnerPhone = inventory.owner_phone;
        const previousOwnerName = inventory.owner?.name || null;

        // Upsert new owner as a contact (BUYER_TENANT — they purchased the property)
        await prisma.contact.upsert({
            where: { phone_number: newPhone },
            update: {
                name: new_owner_name || undefined,
                contact_type: 'BUYER_TENANT',
                last_channel: 'admin',
                last_interaction: new Date(),
            },
            create: {
                phone_number: newPhone,
                name: new_owner_name || null,
                source: 'admin_created',
                contact_type: 'BUYER_TENANT',
                intent: 'buy',
                tenant_id: tenant.id,
                last_channel: 'admin',
                last_interaction: new Date(),
            },
        });

        // Ensure Owner record exists for new buyer
        const newOwnerId = await ensureOwner(newPhone, tenant.id);

        // Transfer inventory ownership
        const updated = await prisma.inventory.update({
            where: { id },
            data: {
                owner_phone: newPhone,
                owner_id: newOwnerId,
                // Keep uploader_phone unchanged — preserves who originally listed it
            },
        });

        // Log ownership transfer in TransactionLog (if transaction_id provided, link it; else standalone log)
        await prisma.transactionLog.create({
            data: {
                transaction_id: transaction_id || null,
                action: 'OWNERSHIP_TRANSFERRED',
                performed_by_agent_id: req.agent.id,
                note: [
                    `Ownership transferred from ${previousOwnerName || previousOwnerPhone} (${previousOwnerPhone})`,
                    `to ${new_owner_name || newPhone} (${newPhone})`,
                    reason ? `Reason: ${reason}` : null,
                ].filter(Boolean).join('. '),
                metadata: {
                    inventory_id: id,
                    previous_owner_phone: previousOwnerPhone,
                    previous_owner_name: previousOwnerName,
                    new_owner_phone: newPhone,
                    new_owner_name: new_owner_name || null,
                },
            },
        });

        // Log interaction on new owner contact
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: newPhone,
                channel: 'admin',
                direction: 'inbound',
                event_type: 'ownership_transferred',
                content: `Property ownership transferred to this contact: ${inventory.full_address || inventory.location || id}`,
                metadata: { inventory_id: id, previous_owner_phone: previousOwnerPhone },
            },
        });

        res.json({
            success: true,
            message: `Ownership transferred to ${new_owner_name || newPhone}`,
            previous_owner_phone: previousOwnerPhone,
            new_owner_phone: newPhone,
            inventory: { id: updated.id, owner_phone: updated.owner_phone },
        });
    } catch (error) {
        logger.error('[TransferOwnership] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});
```

- [ ] **Step 4: Test endpoint manually**

```bash
# SSH to server or run locally
curl -X POST https://api.realtypandit.in/inventory/<test-inventory-id>/transfer-ownership \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"new_owner_phone": "9876543210", "new_owner_name": "Rajesh Kumar", "reason": "Property sold via Realty Pandit"}'
```

Expected: `{ success: true, message: "Ownership transferred to Rajesh Kumar", ... }`

- [ ] **Step 5: Commit backend**

```bash
git add agents/backend/src/routes/inventory.ts agents/backend/prisma/schema.prisma agents/backend/prisma/migrations/
git commit -m "feat: add inventory ownership transfer endpoint with audit trail"
```

---

## Task 2: Frontend — Transfer Ownership UI in Deal Pipeline

**What:** In `DealPipeline.tsx`, on deals with status `CLOSED_WON`, show a "Transfer Ownership" button. Clicking opens a modal with contact search. On confirm, calls the new endpoint. Shows success/error.

**Files:**
- Modify: `agents/frontend/src/components/DealPipeline.tsx`

- [ ] **Step 1: Read current DealPipeline structure**

```bash
grep -n "CLOSED_WON\|inventory_id\|owner\|action\|button" agents/frontend/src/components/DealPipeline.tsx | head -30
```

Understand which deal object fields are available and how the deal cards are rendered.

- [ ] **Step 2: Add ownership transfer state**

In `DealPipeline.tsx`, add state for the transfer modal:

```typescript
const [ownershipTransferDeal, setOwnershipTransferDeal] = useState<any>(null); // deal being transferred
const [transferPhone, setTransferPhone] = useState('');
const [transferName, setTransferName] = useState('');
const [transferReason, setTransferReason] = useState('');
const [transferring, setTransferring] = useState(false);
const [transferError, setTransferError] = useState('');
const [transferSuccess, setTransferSuccess] = useState(false);
const [transferContactResults, setTransferContactResults] = useState<{ phone_number: string; name: string | null }[]>([]);
const [transferContactSearch, setTransferContactSearch] = useState('');
const [transferContactSearching, setTransferContactSearching] = useState(false);
const transferSearchTimer = useRef<any>(null);
```

- [ ] **Step 3: Add contact search for transfer modal**

```typescript
useEffect(() => {
    if (transferContactSearch.trim().length < 2) { setTransferContactResults([]); return; }
    if (transferSearchTimer.current) clearTimeout(transferSearchTimer.current);
    transferSearchTimer.current = setTimeout(async () => {
        setTransferContactSearching(true);
        try {
            const res = await client.get('/api/leads/search', { params: { q: transferContactSearch.trim() } });
            setTransferContactResults(res.data || []);
        } catch { setTransferContactResults([]); }
        finally { setTransferContactSearching(false); }
    }, 400);
    return () => { if (transferSearchTimer.current) clearTimeout(transferSearchTimer.current); };
}, [transferContactSearch]);
```

- [ ] **Step 4: Add transfer handler**

```typescript
const handleOwnershipTransfer = async () => {
    if (!ownershipTransferDeal || !transferPhone.trim()) return;
    setTransferring(true);
    setTransferError('');
    try {
        await client.post(`/inventory/${ownershipTransferDeal.inventory_id}/transfer-ownership`, {
            new_owner_phone: transferPhone,
            new_owner_name: transferName || undefined,
            reason: transferReason || undefined,
            transaction_id: ownershipTransferDeal.id,
        });
        setTransferSuccess(true);
    } catch (err: any) {
        setTransferError(err?.response?.data?.error || 'Failed to transfer ownership');
    } finally {
        setTransferring(false);
    }
};
```

- [ ] **Step 5: Add "Transfer Ownership" button on CLOSED_WON deal cards**

Find where deal cards are rendered — look for where `deal.status === 'CLOSED_WON'` or the stage label is displayed. Add the button inside CLOSED_WON deal cards:

```tsx
{deal.status === 'CLOSED_WON' && deal.inventory_id && (
    <button
        onClick={() => {
            setOwnershipTransferDeal(deal);
            setTransferPhone('');
            setTransferName('');
            setTransferReason('');
            setTransferError('');
            setTransferSuccess(false);
            setTransferContactSearch('');
            setTransferContactResults([]);
        }}
        style={{
            marginTop: '8px', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)',
            color: '#22c55e', cursor: 'pointer', width: '100%',
        }}
    >
        🏠 Transfer Ownership
    </button>
)}
```

- [ ] **Step 6: Add ownership transfer modal**

Add the modal JSX (at the end of the component, before the closing `</div>`):

```tsx
{ownershipTransferDeal && (
    <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={e => { if (e.target === e.currentTarget && !transferring) setOwnershipTransferDeal(null); }}
    >
        <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '440px', maxWidth: '90vw' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                🏠 Transfer Property Ownership
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Inventory: {ownershipTransferDeal.inventory_id}
            </div>

            {transferSuccess ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>Ownership Transferred!</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                        Property now belongs to {transferName || transferPhone}. Audit log created.
                    </div>
                    <button
                        onClick={() => setOwnershipTransferDeal(null)}
                        style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 700, backgroundColor: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >Done</button>
                </div>
            ) : (
                <>
                    {/* Contact search / manual entry */}
                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                            New Owner — Search Contact
                        </label>
                        <input
                            type="text"
                            placeholder="Search by name or phone..."
                            value={transferContactSearch}
                            onChange={e => setTransferContactSearch(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {transferContactSearching && <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>Searching...</div>}
                        {transferContactResults.map(c => (
                            <div
                                key={c.phone_number}
                                onClick={() => { setTransferPhone(c.phone_number); setTransferName(c.name || ''); setTransferContactSearch(''); setTransferContactResults([]); }}
                                style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', margin: '4px 0', backgroundColor: 'var(--bg-secondary)', display: 'flex', gap: '10px', alignItems: 'center' }}
                            >
                                <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                    {(c.name || c.phone_number)[0].toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.name || 'Unknown'}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone_number}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Phone (editable) */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                            New Owner Phone *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. 9876543210"
                            value={transferPhone}
                            onChange={e => setTransferPhone(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: transferPhone ? '1.5px solid #22c55e' : '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Name (optional) */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                            New Owner Name (optional)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Rajesh Kumar"
                            value={transferName}
                            onChange={e => setTransferName(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Reason (optional) */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                            Reason (optional)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Sold via Realty Pandit, Deal #12"
                            value={transferReason}
                            onChange={e => setTransferReason(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Info box */}
                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: '16px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        <strong style={{ color: '#3b82f6' }}>What happens:</strong> The inventory ownership will be reassigned to the new contact. The previous owner's record is preserved. An audit log entry is created. The new contact will appear as BUYER_TENANT in the system.
                    </div>

                    {transferError && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
                            {transferError}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setOwnershipTransferDeal(null)}
                            disabled={transferring}
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >Cancel</button>
                        <button
                            onClick={handleOwnershipTransfer}
                            disabled={transferring || !transferPhone.trim()}
                            style={{ flex: 2, padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: !transferPhone.trim() ? 'var(--bg-secondary)' : '#22c55e', color: !transferPhone.trim() ? 'var(--text-muted)' : '#fff', border: 'none', cursor: !transferPhone.trim() ? 'not-allowed' : 'pointer', opacity: transferring ? 0.7 : 1 }}
                        >{transferring ? 'Transferring...' : '🏠 Confirm Transfer'}</button>
                    </div>
                </>
            )}
        </div>
    </div>
)}
```

- [ ] **Step 7: Verify end-to-end**

1. Open admin → Deals section
2. Find a deal in `CLOSED_WON` stage with an inventory linked
3. See "Transfer Ownership" button
4. Click → modal opens
5. Search contact OR type phone manually
6. Fill optional name + reason
7. Click "Confirm Transfer" → success state shows ✅
8. Verify in DB:
   ```sql
   SELECT owner_phone FROM inventory WHERE id = '<test-id>';
   SELECT * FROM transaction_logs WHERE action = 'OWNERSHIP_TRANSFERRED' ORDER BY created_at DESC LIMIT 1;
   ```

- [ ] **Step 8: Commit frontend**

```bash
git add agents/frontend/src/components/DealPipeline.tsx
git commit -m "feat: ownership transfer modal on CLOSED_WON deal cards with contact search and audit trail"
```

---

## Deployment

```bash
# Backend first (new endpoint + possible migration)
mcp__realty-pandit-qa__deploy("backend")
# Admin frontend
mcp__realty-pandit-qa__deploy("frontend")
# Verify
mcp__realty-pandit-qa__qa_verify_task("Ownership transfer feature", [
  "noerrors:/deals",
  "api:/inventory/health:200",
  "exists:/deals#closed-won-section"
])
```

---

## Notes

- The `TransactionLog` action enum may need `OWNERSHIP_TRANSFERRED` added — Task 1, Step 2 covers this.
- If a deal does NOT have `inventory_id` set (deals without a linked property), the "Transfer Ownership" button is hidden (`deal.inventory_id && ...`).
- When property is re-listed in the future by the new owner, the new `owner_phone` will be used automatically — no further changes needed.
