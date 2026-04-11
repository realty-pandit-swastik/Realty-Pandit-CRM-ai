# Plan A — Leads Section: Bug Fixes + New Filters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 lead section bugs (blank popup, owners appearing as leads, missing filters) and add new filter UI for BHK, property category, location, and agent type.

**Architecture:** Backend route `leads.ts` gets new query params and a `contact_type` exclusion. Frontend `ExternalLeads.tsx` gets a new filter bar and a null-safe slide-over error state.

**Tech Stack:** Express 5, Prisma 5.10, React 19, TypeScript, CSS custom properties (no Tailwind in admin)

---

## Files Modified

| File | Change |
|------|--------|
| `agents/backend/src/routes/leads.ts` | Add contact_type exclusion + BHK/category/location/agent filter params to `recent-external` |
| `agents/frontend/src/components/ExternalLeads.tsx` | Add filter bar UI (BHK, category, location, agent) + null-safe blank-popup error message |

---

## Task 1: Fix — Owner Contacts Appearing as Leads

**Root cause:** `GET /api/leads/recent-external` at `leads.ts:73` has no `contact_type` exclusion — `SELLER_LANDLORD` contacts created by inventory upload flow appear in the leads list.

**Files:**
- Modify: `agents/backend/src/routes/leads.ts` (lines 73–85)

- [ ] **Step 1: Add contact_type exclusion to the where clause**

In `agents/backend/src/routes/leads.ts`, find the `recent-external` handler (line ~73). Change:

```typescript
// BEFORE (line ~73)
const where: any = {};

// Role-based visibility
if (!isPrivileged) {
    where.assigned_agent_id = req.agent.id;
}

// Source filter — when specified use it; when not, show all
if (source) {
    where.source = source;
}

if (status) where.lead_status = status;
```

Replace with:

```typescript
const where: any = {
    // Exclude internal/owner contact types from leads view
    contact_type: { notIn: ['SELLER_LANDLORD', 'MANAGEMENT', 'PARTNER_AGENT'] as const },
};

// Role-based visibility
if (!isPrivileged) {
    where.assigned_agent_id = req.agent.id;
}

// Source filter — when specified use it; when not, show all
if (source) {
    where.source = source;
}

if (status) where.lead_status = status;
```

- [ ] **Step 2: Verify manually**

SSH to server or test locally:
```
GET /api/leads/recent-external
```
Confirm no contacts with `contact_type = SELLER_LANDLORD` appear in the response.

- [ ] **Step 3: Commit**

```bash
git add agents/backend/src/routes/leads.ts
git commit -m "fix: exclude owner/seller contacts from leads list"
```

---

## Task 2: Fix — Website Popup Lead Detail Opens Blank

**Root cause:** `openDetail()` in `ExternalLeads.tsx` calls `GET /api/leads/:phone`. If the API returns 404 (phone not found or normalization mismatch), the catch block sets `leadDetail = null` silently — the slide-over renders completely blank with no error message. Also: website popup leads are stored with `source: 'popup'` in `WebsiteLead` table but may not always upsert a `Contact` row if phone is missing.

**Files:**
- Modify: `agents/frontend/src/components/ExternalLeads.tsx` (openDetail catch block ~line 521 + slide-over render ~line 1046)
- Modify: `agents/backend/src/routes/leads.ts` (detail endpoint ~line 411 — better error info)

- [ ] **Step 1: Add error state for blank lead detail**

In `ExternalLeads.tsx`, find the state declarations block (~line 229). Add one new state:

```typescript
const [detailError, setDetailError] = useState<string | null>(null);
```

- [ ] **Step 2: Update openDetail to capture error**

Find `openDetail` function (~line 490). Update the catch block:

```typescript
// BEFORE (~line 521)
} catch {
    setLeadDetail(null);
} finally {
    setDetailLoading(false);
}
```

Replace with:

```typescript
} catch (err: any) {
    setLeadDetail(null);
    const status = err?.response?.status;
    setDetailError(
        status === 404
            ? 'Lead details not found. The contact may have been deleted or the phone number format changed.'
            : 'Failed to load lead details. Please try again.'
    );
} finally {
    setDetailLoading(false);
}
```

Also reset `detailError` at the top of `openDetail` (after `setDetailLoading(true)`):

```typescript
setDetailLoading(true);
setDetailError(null);  // ← add this line
```

- [ ] **Step 3: Show error in slide-over instead of blank**

Find the slide-over render section (around line 1046, where `{selectedPhone && (` begins). Inside the slide-over body, find where `detailLoading` spinner shows, and add an error state below it:

```typescript
{detailLoading && (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
)}

{/* ADD THIS — error state instead of blank */}
{!detailLoading && detailError && (
    <div style={{
        margin: '40px 24px',
        padding: '20px',
        borderRadius: '10px',
        backgroundColor: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        textAlign: 'center',
    }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
            Could Not Load Lead
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{detailError}</div>
    </div>
)}

{!detailLoading && !detailError && leadDetail && (
    /* existing lead detail body */
)}
```

- [ ] **Step 4: Verify fix**

1. Open admin panel → Leads section
2. Click on a `website_popup` source lead
3. Should now show either the lead data OR the error card — never blank

- [ ] **Step 5: Commit**

```bash
git add agents/frontend/src/components/ExternalLeads.tsx
git commit -m "fix: show error message when lead detail fails to load instead of blank slide-over"
```

---

## Task 3: Feature — Lead Filters (BHK, Category, Location, Agent Type)

**What:** Add filter bar to leads list with: BHK (multi-select), Property Category (Residential/Commercial), Location (text search), Agent (dropdown). All filters combinable. Backend must accept and apply these params.

**Files:**
- Modify: `agents/backend/src/routes/leads.ts` (recent-external endpoint, add filter params)
- Modify: `agents/frontend/src/components/ExternalLeads.tsx` (add filter bar UI + state)

### Task 3a: Backend — Add Filter Params

- [ ] **Step 1: Add new filter params to recent-external**

In `agents/backend/src/routes/leads.ts`, find `recent-external` handler. After the existing `source` and `status` params, add:

```typescript
// EXISTING
const source = req.query.source as string | undefined;
const status = req.query.status as string | undefined;

// ADD THESE
const bhk = req.query.bhk as string | undefined;           // e.g. "2" or "2,3,4"
const category = req.query.category as string | undefined; // "residential" or "commercial"
const location = req.query.location as string | undefined; // partial text match
const agentId = req.query.agent_id as string | undefined;
```

Then add the corresponding `where` conditions after the existing status filter:

```typescript
if (status) where.lead_status = status;

// New filters
if (bhk) {
    const bhkValues = bhk.split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
    if (bhkValues.length > 0) where.demand_bhk = { in: bhkValues };
}
if (category) {
    // category maps to contact.property_type (residential/commercial) OR contact.category_id lookup
    where.property_type = { contains: category, mode: 'insensitive' };
}
if (location) {
    where.preferred_location = { contains: location, mode: 'insensitive' };
}
if (agentId) {
    where.assigned_agent_id = agentId;
}
```

- [ ] **Step 2: Verify backend filters work**

Test with curl or browser:
```
GET /api/leads/recent-external?bhk=2,3
GET /api/leads/recent-external?category=residential
GET /api/leads/recent-external?location=noida
GET /api/leads/recent-external?agent_id=<agent-uuid>
```
Each should return filtered results.

- [ ] **Step 3: Commit backend**

```bash
git add agents/backend/src/routes/leads.ts
git commit -m "feat: add BHK, category, location, agent filters to leads API"
```

### Task 3b: Frontend — Filter Bar UI

- [ ] **Step 4: Add filter state variables**

In `ExternalLeads.tsx`, after the existing filter state declarations (~line 188):

```typescript
// Existing
const [searchQuery, setSearchQuery] = useState('');
const [statusFilter, setStatusFilter] = useState('');
const [sourceFilter, setSourceFilter] = useState('');
const [agentFilter, setAgentFilter] = useState('');
const [dateFrom, setDateFrom] = useState('');
const [dateTo, setDateTo] = useState('');

// ADD
const [bhkFilter, setBhkFilter] = useState<number[]>([]); // multi-select
const [categoryFilter, setCategoryFilter] = useState(''); // residential | commercial | ''
const [locationFilter, setLocationFilter] = useState('');
```

- [ ] **Step 5: Pass new filters to loadData**

Find `loadData` function (~line 306). Update the params object:

```typescript
const [sourceRes, recentRes] = await Promise.all([
    client.get('/api/leads/by-source'),
    client.get('/api/leads/recent-external', {
        params: {
            ...(sourceFilter ? { source: sourceFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
            // ADD THESE
            ...(bhkFilter.length > 0 ? { bhk: bhkFilter.join(',') } : {}),
            ...(categoryFilter ? { category: categoryFilter } : {}),
            ...(locationFilter.trim() ? { location: locationFilter.trim() } : {}),
            ...(agentFilter ? { agent_id: agentFilter } : {}),
        },
    }),
]);
```

Update `useEffect` dependency array for `loadData` to include new filters:

```typescript
// Find the useCallback deps array for loadData — update to:
}, [sourceFilter, statusFilter, bhkFilter, categoryFilter, locationFilter, agentFilter]);
```

- [ ] **Step 6: Add filter bar UI**

Find the filter row section in the render (search for `statusFilter` in JSX, ~line 900+). Add a new filter bar section after the existing source/status filters:

```tsx
{/* ── Advanced Filter Bar ── */}
<div style={{
    display: 'flex', flexWrap: 'wrap', gap: '8px',
    padding: '10px 16px', borderBottom: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-secondary)',
}}>
    {/* BHK Multi-Select */}
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>BHK:</span>
        {[1, 2, 3, 4, 5].map(n => (
            <button
                key={n}
                onClick={() => setBhkFilter(prev =>
                    prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
                )}
                style={{
                    padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    border: bhkFilter.includes(n) ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
                    backgroundColor: bhkFilter.includes(n) ? 'rgba(59,130,246,0.12)' : 'var(--bg-primary)',
                    color: bhkFilter.includes(n) ? '#3b82f6' : 'var(--text-secondary)',
                }}
            >{n}BHK</button>
        ))}
    </div>

    {/* Category Filter */}
    <select
        value={categoryFilter}
        onChange={e => setCategoryFilter(e.target.value)}
        style={{
            padding: '4px 8px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: categoryFilter ? '#3b82f6' : 'var(--text-secondary)', cursor: 'pointer',
        }}
    >
        <option value="">All Types</option>
        <option value="residential">Residential</option>
        <option value="commercial">Commercial</option>
        <option value="agricultural">Agricultural</option>
    </select>

    {/* Location Search */}
    <input
        type="text"
        placeholder="Filter by location..."
        value={locationFilter}
        onChange={e => setLocationFilter(e.target.value)}
        style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', minWidth: '160px',
            border: locationFilter ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
        }}
    />

    {/* Agent Filter */}
    {isPrivileged && (
        <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            style={{
                padding: '4px 8px', borderRadius: '6px', fontSize: '12px',
                border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                color: agentFilter ? '#3b82f6' : 'var(--text-secondary)', cursor: 'pointer',
            }}
        >
            <option value="">All Agents</option>
            {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
            ))}
        </select>
    )}

    {/* Clear All */}
    {(bhkFilter.length > 0 || categoryFilter || locationFilter || agentFilter) && (
        <button
            onClick={() => { setBhkFilter([]); setCategoryFilter(''); setLocationFilter(''); setAgentFilter(''); }}
            style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)',
                color: '#ef4444', cursor: 'pointer',
            }}
        >✕ Clear Filters</button>
    )}
</div>
```

- [ ] **Step 7: Verify filter UI works end-to-end**

1. Open admin → Leads
2. Click 2BHK + 3BHK buttons → list updates to show only 2-3BHK leads
3. Select "Residential" → list filters further
4. Type "Noida" in location → list filters to Noida leads
5. Select an agent → list shows only that agent's leads
6. Click "Clear Filters" → all leads return

- [ ] **Step 8: Commit**

```bash
git add agents/frontend/src/components/ExternalLeads.tsx
git commit -m "feat: add BHK, category, location, agent filter bar to leads section"
```

---

## Deployment

```bash
# Deploy backend first (API changes)
mcp__realty-pandit-qa__deploy("backend")
# Then frontend
mcp__realty-pandit-qa__deploy("frontend")
# Verify
mcp__realty-pandit-qa__qa_verify_task("Leads filters and bug fixes", [
  "exists:/leads#filter-bar",
  "noerrors:/leads",
  "api:/api/leads/recent-external?bhk=2:200",
  "api:/api/leads/recent-external?category=residential:200"
])
```
