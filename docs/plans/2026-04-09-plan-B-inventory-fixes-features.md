# Plan B — Inventory: Bug Fixes + New Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 inventory bugs (aggressive search, incomplete address tile, broken/missing filters) and add 4 new features (BHK+location filters, multi-select WhatsApp share, duplicate share detection, renovation flag).

**Architecture:** `InventoryList.tsx` gets debounce fix, address fix, new filter state, multi-select mode, share modal, duplicate check. Prisma schema gets `renovated` boolean. Backend `inventory.ts` gets duplicate-share check and new `renovated` field handling.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Express 5, Prisma 5.10, PostgreSQL, WhatsApp Business API (existing `WhatsAppService`)

---

## Files Modified

| File | Change |
|------|--------|
| `agents/frontend/src/components/InventoryList.tsx` | Debounce fix, address fix, BHK+location filter UI, multi-select mode, batch share UI, renovation badge |
| `agents/backend/src/routes/inventory.ts` | Duplicate share check before create, `renovated` field in create/update, inventory filter params for BHK+location |
| `agents/backend/prisma/schema.prisma` | Add `renovated Boolean @default(false)` to `Inventory` model |
| `agents/website/src/components/` (property card) | Renovation badge on website listing |

---

## Task 1: Fix — Search Bar Debounce (Too Aggressive)

**Root cause:** `InventoryList.tsx:216` — debounce is `300ms`. Triggers on 1–2 keystrokes.

**Files:**
- Modify: `agents/frontend/src/components/InventoryList.tsx` (line ~216)

- [ ] **Step 1: Change debounce from 300ms → 800ms**

Find the debounce useEffect (~line 213):

```typescript
// BEFORE
searchTimerRef.current = setTimeout(() => {
    setCurrentPage(1);
    loadInventory();
}, 300);
```

Change to:

```typescript
// AFTER
searchTimerRef.current = setTimeout(() => {
    setCurrentPage(1);
    loadInventory();
}, 800);
```

- [ ] **Step 2: Add Enter key trigger for instant search**

Find the search input in the JSX render. Add `onKeyDown`:

```tsx
// Find the search <input> for inventory (has value={searchQuery})
// Add onKeyDown prop:
onKeyDown={(e) => {
    if (e.key === 'Enter') {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setCurrentPage(1);
        loadInventory();
    }
}}
```

- [ ] **Step 3: Verify**

1. Open admin → Inventory
2. Type "f" → nothing should happen immediately
3. Type "fl" → still nothing (under 800ms)
4. Stop typing → after 800ms search fires
5. Type anything + press Enter → instant search

- [ ] **Step 4: Commit**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "fix: increase inventory search debounce to 800ms, add Enter key instant search"
```

---

## Task 2: Fix — Inventory Tile Incomplete Address

**Root cause:** `InventoryList.tsx:1145` renders `full_address || [locality, district, state]` — never shows `apartment_name`. A property at "DLF Park Place, Sector 62" shows only "Sector 62, Noida, UP".

**Files:**
- Modify: `agents/frontend/src/components/InventoryList.tsx` (line 1145)

- [ ] **Step 1: Fix address rendering to include apartment_name**

Find line 1145:

```tsx
// BEFORE
{item.full_address || [item.locality, item.district || item.city, item.state].filter(Boolean).join(', ') || 'Location N/A'}
```

Replace with:

```tsx
// AFTER — shows: "DLF Park Place, Sector 62, Noida, UP" or "Sector 62, Noida, UP"
{[
    item.apartment_name,
    item.full_address || [item.sub_locality, item.locality, item.district || item.city, item.state].filter(Boolean).join(', ')
].filter(Boolean).join(', ') || 'Location N/A'}
```

- [ ] **Step 2: Verify**

1. Open admin → Inventory
2. Find a property with `apartment_name` set (e.g. "Prestige Heights")
3. Tile should now show: "Prestige Heights, Sector 62, Noida, UP"
4. Properties without apartment_name still show full_address or locality chain

- [ ] **Step 3: Commit**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "fix: show apartment_name in inventory tile address"
```

---

## Task 3: Feature — Inventory Filters (BHK + Location)

**What:** Add BHK filter (1BHK–5BHK+ multi-select) and location filter (text search on `locality`/`state`) to inventory list. Backend already supports `category`, `state`, `intent` — extend with `bhk` and `location`.

**Files:**
- Modify: `agents/backend/src/routes/inventory.ts` (GET / handler, add bhk + location params)
- Modify: `agents/frontend/src/components/InventoryList.tsx` (add filterBhk + filterLocation state + UI)

### Task 3a: Backend

- [ ] **Step 1: Add bhk and location params to inventory GET route**

Find the inventory list GET handler in `agents/backend/src/routes/inventory.ts`. Find where params like `intent`, `state`, `category` are read. Add:

```typescript
// EXISTING (find these lines)
const intent = req.query.intent as string;
const state = req.query.state as string;
const category = req.query.category as string;

// ADD
const bhk = req.query.bhk as string;        // "2" or "2,3,4"
const location = req.query.location as string; // partial text on locality/state
```

Then add to the Prisma `where` object:

```typescript
// EXISTING where conditions
if (intent) where.intent = intent;
if (state) where.state = state;
if (category) where.category = category;

// ADD
if (bhk) {
    const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
    if (bhkValues.length > 0) {
        where.specs = { path: ['bedrooms'], in: bhkValues };
        // Note: specs is a JSON field. Use raw query if Prisma JSON filter is limited:
        // Alternative: where.flat_property_type_id = { in: bhkValues.map(...) }
        // Safer approach using configuration_id lookup or specs JSON:
        where.OR = [
            ...(where.OR || []),
            ...bhkValues.map(b => ({ specs: { path: ['bedrooms'], equals: b } }))
        ];
        delete where.specs;
    }
}
if (location) {
    where.OR = [
        ...(where.OR || []),
        { locality: { contains: location, mode: 'insensitive' } },
        { state: { contains: location, mode: 'insensitive' } },
        { city: { contains: location, mode: 'insensitive' } },
        { full_address: { contains: location, mode: 'insensitive' } },
    ];
}
```

- [ ] **Step 2: Verify backend**

```
GET /api/inventory?bhk=2,3
GET /api/inventory?location=noida
GET /api/inventory?bhk=2&location=sector+62
```

Each should return filtered results.

- [ ] **Step 3: Commit backend**

```bash
git add agents/backend/src/routes/inventory.ts
git commit -m "feat: add BHK and location filter params to inventory list API"
```

### Task 3b: Frontend

- [ ] **Step 4: Add filter state**

In `InventoryList.tsx`, after existing filter state declarations (~line 108):

```typescript
// Existing
const [filterIntent, setFilterIntent] = useState('');
const [filterState, setFilterState] = useState('');
const [filterType, setFilterType] = useState('');
const [filterStatus, setFilterStatus] = useState('');
const [filterAgent, setFilterAgent] = useState('');
const [searchQuery, setSearchQuery] = useState('');

// ADD
const [filterBhk, setFilterBhk] = useState<number[]>([]);
const [filterLocation, setFilterLocation] = useState('');
```

- [ ] **Step 5: Pass new filters to loadInventory**

In `loadInventory` function (~line 223), update params:

```typescript
const params: Record<string, any> = { page: currentPage, limit: pageSize };
if (filterIntent) params.intent = filterIntent;
if (filterState) params.state = filterState;
if (filterType) params.category = filterType;
if (filterStatus) params.status = filterStatus;
if (filterAgent) params.agent_id = filterAgent;
if (searchQuery.trim()) params.search = searchQuery.trim();
// ADD
if (filterBhk.length > 0) params.bhk = filterBhk.join(',');
if (filterLocation.trim()) params.location = filterLocation.trim();
```

Update the `useEffect` deps at line ~177:

```typescript
// BEFORE
}, [currentPage, filterIntent, filterState, filterType, filterStatus, filterAgent]);

// AFTER
}, [currentPage, filterIntent, filterState, filterType, filterStatus, filterAgent, filterBhk, filterLocation]);
```

Update `clearFilters` (~line 252):

```typescript
const clearFilters = () => {
    setFilterIntent('');
    setFilterState('');
    setFilterType('');
    setFilterStatus('');
    setFilterAgent('');
    setSearchQuery('');
    setFilterBhk([]);      // ADD
    setFilterLocation(''); // ADD
    setCurrentPage(1);
};

// Update hasActiveFilters:
const hasActiveFilters = filterIntent || filterState || filterType || filterStatus || filterAgent || searchQuery.trim() || filterBhk.length > 0 || filterLocation.trim();
```

- [ ] **Step 6: Add BHK + location filter UI**

Find the existing filter row in the JSX (where `filterIntent`, `filterState` selects are rendered). After the existing filters, add:

```tsx
{/* BHK Filter */}
<div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>BHK:</span>
    {[1, 2, 3, 4, 5].map(n => (
        <button
            key={n}
            onClick={() => {
                setFilterBhk(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
                setCurrentPage(1);
            }}
            style={{
                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                border: filterBhk.includes(n) ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
                backgroundColor: filterBhk.includes(n) ? 'rgba(59,130,246,0.12)' : 'var(--bg-primary)',
                color: filterBhk.includes(n) ? '#3b82f6' : 'var(--text-secondary)',
            }}
        >{n}{n === 5 ? '+' : ''}BHK</button>
    ))}
</div>

{/* Location Filter */}
<input
    type="text"
    placeholder="Location..."
    value={filterLocation}
    onChange={e => { setFilterLocation(e.target.value); setCurrentPage(1); }}
    style={{
        padding: '4px 10px', borderRadius: '6px', fontSize: '12px', minWidth: '140px',
        border: filterLocation ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
    }}
/>
```

- [ ] **Step 7: Commit frontend**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "feat: add BHK and location filters to inventory list UI"
```

---

## Task 4: Feature — Multi-Select Inventory + WhatsApp Share

**What:** Add checkbox mode to inventory tiles. When any checkbox is selected, show a floating action bar with "Share via WhatsApp" button. Opens a contact picker (search from contact base). On confirm, calls existing `/inventory/:id/share-to-client` endpoint per selected item. After each share, checks for duplicates (Task 5).

**Files:**
- Modify: `agents/frontend/src/components/InventoryList.tsx` (selection state + floating bar + share modal)

- [ ] **Step 1: Add selection state**

In `InventoryList.tsx`, add after existing state:

```typescript
// Multi-select state
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [showBatchShareModal, setShowBatchShareModal] = useState(false);
const [batchShareContact, setBatchShareContact] = useState<{ phone_number: string; name: string | null } | null>(null);
const [batchShareLoading, setBatchShareLoading] = useState(false);
const [batchShareResults, setBatchShareResults] = useState<{ id: string; title: string; status: 'sent' | 'already_shared' | 'error'; message: string }[]>([]);
const [batchContactSearch, setBatchContactSearch] = useState('');
const [batchContactResults, setBatchContactResults] = useState<{ phone_number: string; name: string | null }[]>([]);
const [batchContactSearching, setBatchContactSearching] = useState(false);
const batchSearchTimer = useRef<any>(null);
```

- [ ] **Step 2: Add contact search for batch share**

Add a `useEffect` to search contacts when `batchContactSearch` changes:

```typescript
useEffect(() => {
    if (batchContactSearch.trim().length < 2) { setBatchContactResults([]); return; }
    if (batchSearchTimer.current) clearTimeout(batchSearchTimer.current);
    batchSearchTimer.current = setTimeout(async () => {
        setBatchContactSearching(true);
        try {
            const res = await axios.get(`${(import.meta as any).env.VITE_API_URL}/api/leads/search`, {
                params: { q: batchContactSearch.trim() },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setBatchContactResults(res.data || []);
        } catch { setBatchContactResults([]); }
        finally { setBatchContactSearching(false); }
    }, 400);
}, [batchContactSearch]);
```

- [ ] **Step 3: Add batch share handler**

```typescript
const handleBatchShare = async () => {
    if (!batchShareContact || selectedIds.size === 0) return;
    setBatchShareLoading(true);
    setBatchShareResults([]);

    const results: typeof batchShareResults = [];
    for (const invId of Array.from(selectedIds)) {
        const inv = inventory.find(i => i.id === invId);
        const title = [inv?.apartment_name, inv?.locality || inv?.full_address].filter(Boolean).join(', ') || invId;
        try {
            const res = await axios.post(
                `${(import.meta as any).env.VITE_API_URL}/inventory/${invId}/share-to-client`,
                { client_phone: batchShareContact.phone_number },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            if (res.data.already_shared) {
                results.push({ id: invId, title, status: 'already_shared', message: `Already shared on ${new Date(res.data.shared_at).toLocaleDateString('en-IN')}` });
            } else {
                results.push({ id: invId, title, status: 'sent', message: 'Sent via WhatsApp' });
            }
        } catch (err: any) {
            results.push({ id: invId, title, status: 'error', message: err?.response?.data?.error || 'Failed to share' });
        }
    }
    setBatchShareResults(results);
    setBatchShareLoading(false);
};
```

- [ ] **Step 4: Add checkbox to each inventory tile**

Find the inventory tile render loop (the `<tr>` or tile `<div>` for each item). Add a checkbox at the start:

```tsx
{selectionMode && (
    <div
        onClick={e => { e.stopPropagation(); setSelectedIds(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; }); }}
        style={{
            width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer',
            border: selectedIds.has(item.id) ? '2px solid #3b82f6' : '2px solid var(--border-secondary)',
            backgroundColor: selectedIds.has(item.id) ? '#3b82f6' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
    >
        {selectedIds.has(item.id) && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
    </div>
)}
```

- [ ] **Step 5: Add "Select" toggle button to the inventory toolbar**

Find the toolbar where existing buttons like "Add Property" live. Add:

```tsx
<button
    onClick={() => { setSelectionMode(p => !p); setSelectedIds(new Set()); }}
    style={{
        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        border: selectionMode ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
        backgroundColor: selectionMode ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)',
        color: selectionMode ? '#3b82f6' : 'var(--text-secondary)',
    }}
>
    {selectionMode ? `✓ ${selectedIds.size} Selected` : '☐ Select'}
</button>
```

- [ ] **Step 6: Add floating action bar (appears when items selected)**

Add below the inventory list (before closing container div):

```tsx
{selectionMode && selectedIds.size > 0 && (
    <div style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
        borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000,
    }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} selected
        </span>
        <button
            onClick={() => { setShowBatchShareModal(true); setBatchShareResults([]); setBatchShareContact(null); setBatchContactSearch(''); }}
            style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                backgroundColor: '#25d366', border: 'none', color: '#fff',
            }}
        >📲 Share via WhatsApp</button>
        <button
            onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
            style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
        >Cancel</button>
    </div>
)}
```

- [ ] **Step 7: Add batch share modal**

Add the modal JSX (after the existing ShareToClientModal and BookVisitModal):

```tsx
{showBatchShareModal && (
    <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={e => { if (e.target === e.currentTarget) setShowBatchShareModal(false); }}
    >
        <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
                📲 Share {selectedIds.size} Propert{selectedIds.size === 1 ? 'y' : 'ies'} via WhatsApp
            </div>

            {/* Results view */}
            {batchShareResults.length > 0 ? (
                <div>
                    {batchShareResults.map(r => (
                        <div key={r.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-secondary)', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '16px' }}>
                                {r.status === 'sent' ? '✅' : r.status === 'already_shared' ? '⚠️' : '❌'}
                            </span>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.title}</div>
                                <div style={{ fontSize: '11px', color: r.status === 'already_shared' ? '#f59e0b' : r.status === 'error' ? '#ef4444' : '#22c55e' }}>{r.message}</div>
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => { setShowBatchShareModal(false); setSelectionMode(false); setSelectedIds(new Set()); setBatchShareResults([]); }}
                        style={{ marginTop: '16px', width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >Done</button>
                </div>
            ) : (
                <div>
                    {/* Contact picker */}
                    {!batchShareContact ? (
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Search contact to share with:</div>
                            <input
                                type="text"
                                placeholder="Name or phone number..."
                                value={batchContactSearch}
                                onChange={e => setBatchContactSearch(e.target.value)}
                                autoFocus
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                            />
                            {batchContactSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>Searching...</div>}
                            {batchContactResults.map(c => (
                                <div
                                    key={c.phone_number}
                                    onClick={() => { setBatchShareContact(c); setBatchContactSearch(''); setBatchContactResults([]); }}
                                    style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', margin: '4px 0', backgroundColor: 'var(--bg-secondary)', display: 'flex', gap: '10px', alignItems: 'center' }}
                                >
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                        {(c.name || c.phone_number)[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone_number}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div>
                            {/* Selected contact + confirm */}
                            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.3)', marginBottom: '16px' }}>
                                <div style={{ fontSize: '12px', color: '#25d366', fontWeight: 600, marginBottom: '4px' }}>Sending to:</div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{batchShareContact.name || batchShareContact.phone_number}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{batchShareContact.phone_number}</div>
                                <button onClick={() => setBatchShareContact(null)} style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Change contact</button>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} will be sent. Already-shared properties will be flagged, not re-sent.
                            </div>
                            <button
                                onClick={handleBatchShare}
                                disabled={batchShareLoading}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', backgroundColor: '#25d366', color: '#fff', border: 'none', cursor: batchShareLoading ? 'not-allowed' : 'pointer', opacity: batchShareLoading ? 0.7 : 1 }}
                            >{batchShareLoading ? 'Sending...' : '📲 Send via WhatsApp'}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
)}
```

- [ ] **Step 8: Verify end-to-end**

1. Open admin → Inventory
2. Click "Select" → checkboxes appear on tiles
3. Check 3 tiles → floating bar shows "3 properties selected"
4. Click "Share via WhatsApp" → modal opens
5. Search contact → select → confirm
6. Results show ✅ Sent / ⚠️ Already shared / ❌ Error per property
7. Click Done → selection clears

- [ ] **Step 9: Commit**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "feat: multi-select inventory tiles and batch WhatsApp share with contact picker"
```

---

## Task 5: Feature — Duplicate Share Detection

**What:** Before sharing, check if this inventory was already shared with this contact. Return `already_shared: true` + `shared_at` date in the API response so the frontend can warn instead of re-sending.

**Files:**
- Modify: `agents/backend/src/routes/inventory.ts` (share-to-client endpoint, ~line 639)

- [ ] **Step 1: Add duplicate check before creating PropertyShare**

In `agents/backend/src/routes/inventory.ts`, find the `share-to-client` handler. Before the `prisma.propertyShare.create(...)` call (~line 639), add:

```typescript
// Check for existing share
const existingShare = await prisma.propertyShare.findFirst({
    where: {
        inventory_id: inventory.id,
        client_phone: normalized,
    },
    orderBy: { created_at: 'desc' },
});

if (existingShare) {
    // Return warning but don't re-send
    return res.json({
        success: true,
        already_shared: true,
        shared_at: existingShare.created_at,
        share_id: existingShare.id,
        share_link: existingShare.property_link,
        whatsapp_sent: false,
        contact_created: false,
    });
}
```

- [ ] **Step 2: Verify**

1. Share inventory ID X with contact Y → response: `{ already_shared: false, whatsapp_sent: true }`
2. Share same inventory X with contact Y again → response: `{ already_shared: true, shared_at: "2026-04-09T..." }`
3. Frontend batch share modal shows ⚠️ "Already shared on 09/04/2026"

- [ ] **Step 3: Commit**

```bash
git add agents/backend/src/routes/inventory.ts
git commit -m "feat: detect duplicate inventory shares and return warning instead of re-sending"
```

---

## Task 6: Feature — Renovation Flag

**What:** Add `renovated` boolean to `Inventory` model. Toggle in edit form. Badge on admin tile ("Renovated") and website property card.

**Files:**
- Modify: `agents/backend/prisma/schema.prisma` (add `renovated` to Inventory model)
- Modify: `agents/backend/src/routes/inventory.ts` (include in create + update)
- Modify: `agents/frontend/src/components/InventoryList.tsx` (toggle in edit form + badge on tile)
- Modify: website property card component

### Task 6a: Database

- [ ] **Step 1: Add renovated field to Prisma schema**

In `agents/backend/prisma/schema.prisma`, find the `Inventory` model. After `is_enriched Boolean @default(false)` (~line 491), add:

```prisma
renovated      Boolean @default(false) // Property has been renovated
```

- [ ] **Step 2: Run migration**

```bash
cd agents/backend
npx prisma migrate dev --name add_renovated_to_inventory
```

Expected output: `✔ Generated Prisma Client` and new migration file in `prisma/migrations/`.

- [ ] **Step 3: Commit schema**

```bash
git add agents/backend/prisma/schema.prisma agents/backend/prisma/migrations/
git commit -m "feat: add renovated boolean field to Inventory model"
```

### Task 6b: Backend

- [ ] **Step 4: Include renovated in create and update**

In `agents/backend/src/routes/inventory.ts`, find the inventory `POST` (create) handler. Add `renovated` to the destructured body:

```typescript
const { ..., renovated } = req.body;
```

And in the `prisma.inventory.create({ data: { ... } })` block:

```typescript
renovated: renovated === true || renovated === 'true',
```

For the `PATCH` (update) handler, find where `updateData` is built from `req.body`. Ensure `renovated` is included:

```typescript
// Find the line that reads allowed update fields:
const ALLOWED_UPDATE_FIELDS = ['intent', 'status', 'price', /* ... */];
// Add 'renovated' to this list, OR add explicitly:
if (req.body.renovated !== undefined) updateData.renovated = req.body.renovated === true || req.body.renovated === 'true';
```

- [ ] **Step 5: Commit backend**

```bash
git add agents/backend/src/routes/inventory.ts
git commit -m "feat: handle renovated field in inventory create and update API"
```

### Task 6c: Admin Frontend

- [ ] **Step 6: Add renovation toggle to edit form**

In `InventoryList.tsx`, find the `editData` initialization in `populateEditForm` (~line 304). Add:

```typescript
renovated: item.renovated || false,
```

Find the edit form JSX (look for `furnishing` or `property_age` fields — they're near each other). Add renovation toggle after them:

```tsx
{/* Renovation Toggle */}
<div style={{ marginBottom: '12px' }}>
    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Renovation Status</div>
    <button
        onClick={() => setEditData(p => ({ ...p, renovated: !p.renovated }))}
        style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
            borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'left',
            border: editData.renovated ? '1.5px solid #22c55e' : '1px solid var(--border-secondary)',
            backgroundColor: editData.renovated ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
        }}
    >
        <div style={{
            width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
            border: editData.renovated ? '2px solid #22c55e' : '2px solid var(--border-secondary)',
            backgroundColor: editData.renovated ? '#22c55e' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {editData.renovated && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
        </div>
        <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: editData.renovated ? '#22c55e' : 'var(--text-secondary)' }}>
                {editData.renovated ? 'Renovated ✓' : 'Mark as Renovated'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {editData.renovated ? 'Will show "Renovated" badge on website' : 'Property has been newly renovated'}
            </div>
        </div>
    </button>
</div>
```

- [ ] **Step 7: Add renovation badge to inventory tile**

Find the tile badges section (~line 1128 — where `SELL/RENT` and `ACTIVE/PENDING` badges are). Add:

```tsx
{item.renovated && (
    <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
        🔨 Renovated
    </span>
)}
```

- [ ] **Step 8: Commit admin frontend**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "feat: renovation toggle in inventory edit form and badge on tile"
```

### Task 6d: Website Badge

- [ ] **Step 9: Find website property card component**

```bash
ls agents/website/src/components/properties/
```

Look for `PropertyCard.tsx` or similar.

- [ ] **Step 10: Add renovation badge to website property card**

In the property card component, find where badges like "Featured" or "For Sale" are rendered. Add:

```tsx
{property.renovated && (
    <span style={{
        position: 'absolute', top: '8px', left: '8px',
        backgroundColor: '#22c55e', color: '#fff',
        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
        boxShadow: '0 2px 6px rgba(34,197,94,0.4)',
    }}>
        🔨 Renovated
    </span>
)}
```

Ensure the website API response from `/public/properties` includes the `renovated` field. Check `agents/backend/src/routes/public.ts` property select clause — add `renovated: true` to the Prisma select if it's not already included.

- [ ] **Step 11: Commit website**

```bash
git add agents/website/src/components/properties/
git add agents/backend/src/routes/public.ts
git commit -m "feat: show renovated badge on website property listings"
```

---

## Deployment

```bash
# Backend first (schema migration + API changes)
mcp__realty-pandit-qa__deploy("backend")
# Then admin frontend
mcp__realty-pandit-qa__deploy("frontend")
# Then website
mcp__realty-pandit-qa__deploy("website")
# Verify
mcp__realty-pandit-qa__qa_verify_task("Inventory fixes and features", [
  "noerrors:/inventory",
  "exists:/inventory#bhk-filter",
  "api:/api/inventory?bhk=2:200",
  "api:/inventory/test-id/share-to-client:200",
  "loads:/inventory:3000"
])
```
