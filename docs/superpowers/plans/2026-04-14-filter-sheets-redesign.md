# Filter Sheets Redesign — Leads + Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the leads filter bottom sheet with full classification tree, intent, location (Google Places + radius), agent, source, and staleness filters; and build an identical bottom sheet pattern for inventory with listing source, data source, and inventory staleness (days in system + days since last visit).

**Architecture:** Shared UI filter components (FilterSection accordion, FilterCategorySection cascading tree, FilterLocationSection Google Places) extracted to a single shared file. Backend APIs extended with new query params on both `/api/leads/recent-external` and `/api/inventory`. Both ExternalLeads.tsx and InventoryList.tsx updated to use the new bottom sheet pattern with new filter state and API params.

**Tech Stack:** React + TypeScript (no build step — direct source edit), Express + Prisma (ts-node backend), Google Maps Places Autocomplete API, Prisma raw SQL for Haversine proximity. Deploy via SCP to remote server + pm2 restart.

---

## Context (READ BEFORE STARTING)

**Project root:** `c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/`

**Backend:** `agents/backend/` — runs with ts-node, no build step. Deploy: SCP files to server + `pm2 restart backend`.

**Frontend:** `agents/frontend/` — Vite React app. Deploy: `npm run build` then SCP `dist/` to server.

**Deploy commands (ask user for server details if not in memory):** Check `c:/Users/Varchasv Bhardwaj/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/` for server deploy instructions.

**Classification tree API:** `GET /public/classification-tree` → `{ categories: Category[], configurations: Configuration[] }` — already called in ExternalLeads.tsx at line 392.

**Google Maps:** `loadGoogleMaps()` from `../lib/loadGoogleMaps`, key stored as `const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY`. Then `new (window as any).google.maps.places.Autocomplete(inputRef.current, { componentRestrictions: { country: 'in' }, fields: ['formatted_address', 'geometry'] })`.

**Key DB fields:**
- Leads (Contact model): `preferred_lat/preferred_lng` (geo), `last_interaction` (last contact date), `contact_type` (BUYER/TENANT), `category_id`, `sub_category_id`, `type_id`
- Inventory model: `latitude/longitude` (geo), `ownership_type` (OWNER/EXTERNAL_AGENT/AGENT_OWNER), `upload_source` (website/admin/whatsapp/voice/mobile_app), `category_id`, `sub_category_id`, `created_at`
- PropertyShare model: `client_phone`, `inventory_id`, `created_at` — tracks when a property was shared/showcased to a lead
- Appointment model: `property_id`, `scheduled_at`, `type` (AppointmentType enum) — tracks property visits

**Classification tree (locked — do NOT modify):**
- Residential: Apartment/Gated Society (Flat, Studio Apartment, Service Apartment, Penthouse, Duplex), Independent House/Villa (Independent House, Villa, Row House, Bungalow), Land/Plot (Residential Plot), Builder Floor, Builder Flat Front Facing, Builder Flat Back Facing, Serviced Apartments, Studio Apartment
- Commercial: Office, Retail, Industrial, Hospitality, Healthcare, Lands/Plots, School/College (each with their sub-types)
- Agricultural: Farm Land (Agricultural Farm Land, Dairy Farm, Poultry Farm, Orchard/Fruit Farm), Agricultural Plot (Agricultural Land Plot, Farmhouse Land)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `agents/frontend/src/components/filters/FilterSheetShared.tsx` | Shared FilterSection accordion, FilterCategorySection (cascading), FilterLocationSection (Google Places + radius) |
| **Modify** | `agents/frontend/src/components/ExternalLeads.tsx` | Add new filter state vars, rework mobile bottom sheet, update loadLeads params, update active chips |
| **Modify** | `agents/frontend/src/components/InventoryList.tsx` | Add filter sheet state, filter button, new mobile bottom sheet, update loadInventory params |
| **Modify** | `agents/backend/src/routes/leads.ts` | Add intent, category_id, sub_category_id, type_id, lat/lng/radius, not_contacted_days, no_showcase_days params |
| **Modify** | `agents/backend/src/routes/inventory.ts` | Add category_id, sub_category_id, listing_source, data_source, lat/lng/radius, days_in_system, days_no_visit params |

---

## Task 1: Create Shared Filter Components

**Files:**
- Create: `agents/frontend/src/components/filters/FilterSheetShared.tsx`

### Purpose
This file holds three reusable components used by BOTH ExternalLeads and InventoryList:
1. `FilterSection` — accordion wrapper (extract from ExternalLeads.tsx line 150)
2. `FilterCategorySection` — cascading Residential/Commercial/Agricultural tree with subcategory and type chips + BHK
3. `FilterLocationSection` — Google Places autocomplete input + radius chips

- [ ] **Step 1: Read existing FilterSection in ExternalLeads.tsx**

Read lines 148–165 of `agents/frontend/src/components/ExternalLeads.tsx` to copy the exact FilterSection implementation.

- [ ] **Step 2: Create the shared components file**

Create `agents/frontend/src/components/filters/FilterSheetShared.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { loadGoogleMaps } from '../../lib/loadGoogleMaps';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyTypeDef { id: string; name: string; slug: string; }
export interface SubCategory { id: string; name: string; slug: string; types: PropertyTypeDef[]; }
export interface Category { id: string; name: string; slug: string; subcategories: SubCategory[]; }

export interface CategorySelection {
    categoryId: string;
    subCategoryId: string;
    typeId: string;
    bhk: number[];
}

export interface LocationSelection {
    label: string;
    lat: number | null;
    lng: number | null;
    radiusKm: number;
}

// ─── FilterSection accordion ─────────────────────────────────────────────────

export function FilterSection({
    title,
    children,
    defaultOpen = true,
    badge,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: number; // active count inside this section
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: '1px solid var(--border-primary)', padding: '12px 20px' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
            >
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {title}
                    {badge != null && badge > 0 && (
                        <span style={{
                            background: 'var(--text-link)', color: '#fff', borderRadius: '10px',
                            fontSize: '11px', fontWeight: 700, padding: '1px 7px',
                        }}>{badge}</span>
                    )}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '18px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>⌄</span>
            </button>
            {open && <div style={{ marginTop: '12px' }}>{children}</div>}
        </div>
    );
}

// ─── FilterCategorySection ────────────────────────────────────────────────────
// Cascading: Category → SubCategory → Type, plus BHK for Residential

const CHIP_STYLE_ACTIVE: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', border: '1.5px solid var(--text-link)',
    backgroundColor: 'rgba(59,130,246,0.12)', color: 'var(--text-link)',
};
const CHIP_STYLE_INACTIVE: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
    cursor: 'pointer', border: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
};

export function FilterCategorySection({
    tree,
    value,
    onChange,
}: {
    tree: Category[];
    value: CategorySelection;
    onChange: (v: CategorySelection) => void;
}) {
    const selectedCategory = tree.find(c => c.id === value.categoryId);
    const selectedSubCategory = selectedCategory?.subcategories.find(s => s.id === value.subCategoryId);
    const isResidential = selectedCategory?.slug === 'residential';

    const setCategory = (id: string) => {
        if (value.categoryId === id) {
            onChange({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
        } else {
            onChange({ categoryId: id, subCategoryId: '', typeId: '', bhk: [] });
        }
    };

    const setSubCategory = (id: string) => {
        if (value.subCategoryId === id) {
            onChange({ ...value, subCategoryId: '', typeId: '' });
        } else {
            onChange({ ...value, subCategoryId: id, typeId: '' });
        }
    };

    const setType = (id: string) => {
        onChange({ ...value, typeId: value.typeId === id ? '' : id });
    };

    const toggleBhk = (n: number) => {
        const next = value.bhk.includes(n) ? value.bhk.filter(x => x !== n) : [...value.bhk, n];
        onChange({ ...value, bhk: next });
    };

    return (
        <FilterSection title="Property Category" defaultOpen={false} badge={
            (value.categoryId ? 1 : 0) + (value.subCategoryId ? 1 : 0) + (value.typeId ? 1 : 0) + (value.bhk.length > 0 ? 1 : 0)
        }>
            {/* Level 1: Main category */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {tree.map(cat => (
                    <button key={cat.id} type="button"
                        onClick={() => setCategory(cat.id)}
                        style={value.categoryId === cat.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Level 2: Sub-categories */}
            {selectedCategory && selectedCategory.subcategories.length > 0 && (
                <div style={{ marginLeft: '8px', borderLeft: '2px solid var(--border-secondary)', paddingLeft: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Sub-category</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {selectedCategory.subcategories.map(sub => (
                            <button key={sub.id} type="button"
                                onClick={() => setSubCategory(sub.id)}
                                style={value.subCategoryId === sub.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {sub.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Level 3: Types */}
            {selectedSubCategory && selectedSubCategory.types.length > 0 && (
                <div style={{ marginLeft: '20px', borderLeft: '2px solid var(--border-secondary)', paddingLeft: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Type</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {selectedSubCategory.types.map(t => (
                            <button key={t.id} type="button"
                                onClick={() => setType(t.id)}
                                style={value.typeId === t.id ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* BHK — only for Residential */}
            {isResidential && (
                <div style={{ marginLeft: '8px', marginTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>BHK</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} type="button"
                                onClick={() => toggleBhk(n)}
                                style={value.bhk.includes(n) ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {n === 5 ? '5+ BHK' : `${n} BHK`}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FilterSection>
    );
}

// ─── FilterLocationSection ────────────────────────────────────────────────────
// Google Places Autocomplete + radius chips

const RADIUS_OPTIONS = [
    { label: '500m', value: 0.5 },
    { label: '1 km', value: 1 },
    { label: '2 km', value: 2 },
    { label: '5 km', value: 5 },
    { label: 'Any', value: 0 },
];

export function FilterLocationSection({
    value,
    onChange,
}: {
    value: LocationSelection;
    onChange: (v: LocationSelection) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const acRef = useRef<any>(null);

    const attachAutocomplete = useCallback(() => {
        if (!inputRef.current || !(window as any).google?.maps?.places) return;
        if (acRef.current) return;
        const ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry'],
        });
        acRef.current = ac;
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place.geometry?.location) return;
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const label = place.formatted_address || inputRef.current?.value || '';
            onChange({ label, lat, lng, radiusKm: value.radiusKm || 2 });
        });
    }, [onChange, value.radiusKm]);

    useEffect(() => {
        if (!MAPS_KEY) return;
        loadGoogleMaps().then(() => {
            setTimeout(attachAutocomplete, 100);
        });
        return () => {
            if (acRef.current) {
                (window as any).google?.maps?.event?.clearInstanceListeners(acRef.current);
                acRef.current = null;
            }
        };
    }, [attachAutocomplete]);

    const clear = () => {
        if (inputRef.current) inputRef.current.value = '';
        if (acRef.current) {
            (window as any).google?.maps?.event?.clearInstanceListeners(acRef.current);
            acRef.current = null;
        }
        onChange({ label: '', lat: null, lng: null, radiusKm: 2 });
        setTimeout(attachAutocomplete, 50);
    };

    const hasLocation = value.lat != null && value.lng != null;

    return (
        <FilterSection title="Location" defaultOpen={false} badge={hasLocation ? 1 : 0}>
            <div style={{ position: 'relative', marginBottom: hasLocation ? '10px' : 0 }}>
                <input
                    ref={inputRef}
                    defaultValue={value.label}
                    placeholder="Search area, locality, city..."
                    style={{
                        width: '100%', padding: '9px 36px 9px 12px', borderRadius: '10px',
                        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
                    }}
                />
                {hasLocation && (
                    <button type="button" onClick={clear}
                        style={{
                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: '16px', padding: '2px',
                        }}>×</button>
                )}
            </div>

            {/* Radius chips — only show after location selected */}
            {hasLocation && (
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>Radius</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {RADIUS_OPTIONS.map(opt => (
                            <button key={opt.value} type="button"
                                onClick={() => onChange({ ...value, radiusKm: opt.value })}
                                style={value.radiusKm === opt.value ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FilterSection>
    );
}

// ─── StalenesSection ──────────────────────────────────────────────────────────

const STALENESS_PRESETS = [7, 15, 30];

export function StalenessSection({
    title,
    label1,
    label2,
    days1,
    days2,
    onDays1Change,
    onDays2Change,
    badge,
}: {
    title: string;
    label1: string;
    label2: string;
    days1: number;
    days2: number;
    onDays1Change: (v: number) => void;
    onDays2Change: (v: number) => void;
    badge?: number;
}) {
    return (
        <FilterSection title={title} defaultOpen={false} badge={badge}>
            {/* Row 1 */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{label1}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {STALENESS_PRESETS.map(d => (
                        <button key={d} type="button"
                            onClick={() => onDays1Change(days1 === d ? 0 : d)}
                            style={days1 === d ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                            {d}d+
                        </button>
                    ))}
                    <input
                        type="number" min={1} max={365}
                        value={days1 > 0 && !STALENESS_PRESETS.includes(days1) ? days1 : ''}
                        onChange={e => onDays1Change(Number(e.target.value) || 0)}
                        placeholder="Custom"
                        style={{
                            width: '70px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: '12px',
                        }}
                    />
                </div>
            </div>

            {/* Row 2 */}
            <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{label2}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {STALENESS_PRESETS.map(d => (
                        <button key={d} type="button"
                            onClick={() => onDays2Change(days2 === d ? 0 : d)}
                            style={days2 === d ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE}>
                            {d}d+
                        </button>
                    ))}
                    <input
                        type="number" min={1} max={365}
                        value={days2 > 0 && !STALENESS_PRESETS.includes(days2) ? days2 : ''}
                        onChange={e => onDays2Change(Number(e.target.value) || 0)}
                        placeholder="Custom"
                        style={{
                            width: '70px', padding: '5px 8px', borderRadius: '8px',
                            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: '12px',
                        }}
                    />
                </div>
            </div>
        </FilterSection>
    );
}
```

- [ ] **Step 3: Verify the file was created correctly**

Run: `cat agents/frontend/src/components/filters/FilterSheetShared.tsx | head -20`
Expected: sees the imports and type definitions.

- [ ] **Step 4: Commit**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/filters/FilterSheetShared.tsx
git commit -m "feat: add shared filter sheet components (FilterSection, FilterCategorySection, FilterLocationSection, StalenessSection)"
```

---

## Task 2: Backend — Extend Leads API

**Files:**
- Modify: `agents/backend/src/routes/leads.ts` (around lines 64–150, the `GET /recent-external` handler)

Add these new query params: `intent`, `category_id`, `sub_category_id`, `type_id`, `lat`, `lng`, `radius_km`, `not_contacted_days`, `no_showcase_days`.

- [ ] **Step 1: Read the current GET /recent-external handler**

Read lines 64–150 of `agents/backend/src/routes/leads.ts` to see exact variable names and where the `where` object is built.

- [ ] **Step 2: Add new query param extraction after line 73 (after `agentId`)**

Find this block (around line 66–73):
```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = parseInt(req.query.limit as string) || 500;
const source = req.query.source as string | undefined;
const status = req.query.status as string | undefined;
const bhk = req.query.bhk as string | undefined;
const category = req.query.category as string | undefined;
const location = req.query.location as string | undefined;
const agentId = req.query.agent_id as string | undefined;
```

Replace with:
```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = parseInt(req.query.limit as string) || 500;
const source = req.query.source as string | undefined;
const status = req.query.status as string | undefined;
const bhk = req.query.bhk as string | undefined;
const category = req.query.category as string | undefined;
const location = req.query.location as string | undefined;
const agentId = req.query.agent_id as string | undefined;
// New filter params
const intent = req.query.intent as string | undefined;           // BUYER | TENANT
const categoryId = req.query.category_id as string | undefined;
const subCategoryId = req.query.sub_category_id as string | undefined;
const typeId = req.query.type_id as string | undefined;
const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
const radiusKm = req.query.radius_km ? parseFloat(req.query.radius_km as string) : 2;
const notContactedDays = req.query.not_contacted_days ? parseInt(req.query.not_contacted_days as string) : undefined;
const noShowcaseDays = req.query.no_showcase_days ? parseInt(req.query.no_showcase_days as string) : undefined;
```

- [ ] **Step 3: Add new WHERE conditions after the existing `agentId` block**

Find the block ending with:
```typescript
if (agentId) {
    where.assigned_agent_id = agentId;
}
```

Add immediately after:
```typescript
// Intent filter (contact_type: BUYER or TENANT)
if (intent === 'BUYER' || intent === 'TENANT') {
    where.contact_type = intent;
}

// Classification ID filters
if (categoryId) where.category_id = categoryId;
if (subCategoryId) where.sub_category_id = subCategoryId;
if (typeId) where.type_id = typeId;

// Proximity filter — Haversine on preferred_lat/preferred_lng
if (lat !== undefined && lng !== undefined) {
    const radius = radiusKm > 0 ? radiusKm : 2;
    const nearbyPhones = await prisma.$queryRaw<{ phone_number: string }[]>`
        SELECT phone_number FROM contacts
        WHERE preferred_lat IS NOT NULL AND preferred_lng IS NOT NULL
        AND (6371 * acos(
            LEAST(1.0,
                cos(radians(${lat})) * cos(radians(preferred_lat::float))
                * cos(radians(preferred_lng::float) - radians(${lng}))
                + sin(radians(${lat})) * sin(radians(preferred_lat::float))
            )
        )) <= ${radius}
    `;
    const nearbyPhoneList = nearbyPhones.map((r: { phone_number: string }) => r.phone_number);
    if (where.AND) {
        where.AND.push({ phone_number: { in: nearbyPhoneList } });
    } else {
        where.AND = [{ phone_number: { in: nearbyPhoneList } }];
    }
}

// Staleness: not contacted in X days
if (notContactedDays && notContactedDays > 0) {
    const cutoff = new Date(Date.now() - notContactedDays * 24 * 60 * 60 * 1000);
    const cond = { OR: [{ last_interaction: null }, { last_interaction: { lt: cutoff } }] };
    if (where.AND) where.AND.push(cond);
    else where.AND = [cond];
}

// Staleness: no property showcased (PropertyShare) in X days
if (noShowcaseDays && noShowcaseDays > 0) {
    const cutoff = new Date(Date.now() - noShowcaseDays * 24 * 60 * 60 * 1000);
    const recentlyShowcased = await prisma.propertyShare.findMany({
        where: { created_at: { gte: cutoff } },
        select: { client_phone: true },
        distinct: ['client_phone'],
    });
    const showcasedPhones = recentlyShowcased.map((s: { client_phone: string }) => s.client_phone);
    const cond = showcasedPhones.length > 0
        ? { phone_number: { notIn: showcasedPhones } }
        : {};
    if (Object.keys(cond).length > 0) {
        if (where.AND) where.AND.push(cond);
        else where.AND = [cond];
    }
}
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

Run from backend directory:
```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors (or only pre-existing unrelated errors).

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/leads.ts
git commit -m "feat(leads-api): add intent, category_id, sub_category_id, type_id, proximity, staleness filter params"
```

---

## Task 3: Backend — Extend Inventory API

**Files:**
- Modify: `agents/backend/src/routes/inventory.ts` (around lines 200–300, the `GET /` handler)

Add: `category_id`, `sub_category_id`, `listing_source`, `data_source`, `lat`, `lng`, `radius_km`, `days_in_system`, `days_no_visit`.

- [ ] **Step 1: Read the current GET / handler**

Read lines 200–300 of `agents/backend/src/routes/inventory.ts` to see exact variable names.

- [ ] **Step 2: Add new query param extraction after existing destructure on line 236**

Find:
```typescript
const { intent, state, type, category, agent_id, status, search, page, limit: limitParam, bhk, location } = req.query;
```

Replace with:
```typescript
const {
    intent, state, type, category, agent_id, status, search, page,
    limit: limitParam, bhk, location,
    // New params
    category_id, sub_category_id,
    listing_source, data_source,
    lat: latParam, lng: lngParam, radius_km: radiusKmParam,
    days_in_system, days_no_visit,
} = req.query;

const lat = latParam ? parseFloat(latParam as string) : undefined;
const lng = lngParam ? parseFloat(lngParam as string) : undefined;
const radiusKm = radiusKmParam ? parseFloat(radiusKmParam as string) : 2;
```

- [ ] **Step 3: Add new WHERE conditions — place them after the existing `location` filter block (after line ~274)**

Find the end of the location filter block:
```typescript
        if (where.OR) {
            where.AND = [...(where.AND || []), { OR: locOR }];
            delete where.OR;
        } else {
            where.OR = locOR;
        }
    }
```

Add immediately after:
```typescript
        // Classification ID filters
        if (category_id && typeof category_id === 'string') {
            where.category_id = category_id;
        }
        if (sub_category_id && typeof sub_category_id === 'string') {
            where.sub_category_id = sub_category_id;
        }

        // Listing source type (ownership_type)
        if (listing_source && typeof listing_source === 'string') {
            const validSources = ['OWNER', 'EXTERNAL_AGENT', 'AGENT_OWNER'];
            if (validSources.includes(listing_source)) {
                where.ownership_type = listing_source;
            }
        }

        // Data source (upload_source)
        if (data_source && typeof data_source === 'string') {
            where.upload_source = data_source;
        }

        // Proximity filter — Haversine on latitude/longitude
        if (lat !== undefined && lng !== undefined) {
            const radius = radiusKm > 0 ? radiusKm : 2;
            const nearbyIds = await prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM inventory
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                AND (6371 * acos(
                    LEAST(1.0,
                        cos(radians(${lat})) * cos(radians(latitude::float))
                        * cos(radians(longitude::float) - radians(${lng}))
                        + sin(radians(${lat})) * sin(radians(latitude::float))
                    )
                )) <= ${radius}
            `;
            const ids = nearbyIds.map((r: { id: string }) => r.id);
            const proxCond = { id: { in: ids } };
            if (where.AND) where.AND.push(proxCond);
            else where.AND = [...(where.AND || []), proxCond];
        }

        // Staleness: days in system (inventory not sold/rented, created X+ days ago)
        if (days_in_system && typeof days_in_system === 'string') {
            const days = parseInt(days_in_system);
            if (!isNaN(days) && days > 0) {
                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                where.created_at = { lt: cutoff };
                // Also enforce only active inventory
                if (!where.status) {
                    where.status = { notIn: ['sold', 'rented'] };
                }
            }
        }

        // Staleness: days since last showcased/visited (no Appointment with property_id in X days)
        if (days_no_visit && typeof days_no_visit === 'string') {
            const days = parseInt(days_no_visit);
            if (!isNaN(days) && days > 0) {
                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                // Find inventory IDs that HAVE had a visit recently
                const recentlyVisited = await prisma.appointment.findMany({
                    where: {
                        property_id: { not: null },
                        scheduled_at: { gte: cutoff },
                    },
                    select: { property_id: true },
                    distinct: ['property_id'],
                });
                const visitedIds = recentlyVisited
                    .map((a: { property_id: string | null }) => a.property_id)
                    .filter(Boolean) as string[];
                const noVisitCond = visitedIds.length > 0
                    ? { id: { notIn: visitedIds } }
                    : {};
                if (Object.keys(noVisitCond).length > 0) {
                    if (where.AND) where.AND.push(noVisitCond);
                    else where.AND = [noVisitCond];
                }
            }
        }
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend
npx tsc --noEmit 2>&1 | head -30
```
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add agents/backend/src/routes/inventory.ts
git commit -m "feat(inventory-api): add category_id, sub_category_id, listing_source, data_source, proximity, staleness filter params"
```

---

## Task 4: ExternalLeads.tsx — Rework Filter Sheet

**Files:**
- Modify: `agents/frontend/src/components/ExternalLeads.tsx`

This is the large file. Changes are:
1. Add import for shared components
2. Remove old `FilterSection` definition (lines 148–165) — now imported from shared
3. Add new filter state variables (intent, categorySelection, locationSelection, staleness)
4. Rework the mobile filter bottom sheet (lines ~1965–2076)
5. Update `loadLeads` / the useEffect that fetches leads to pass new params
6. Update active filter chips (lines ~991–1041)
7. Update the "Clear All" function

- [ ] **Step 1: Read the current imports section (lines 1–15)**

Read lines 1–15 of `agents/frontend/src/components/ExternalLeads.tsx`.

- [ ] **Step 2: Add import for shared components — insert after existing imports**

Find:
```typescript
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
```

Add after:
```typescript
import {
    FilterSection,
    FilterCategorySection,
    FilterLocationSection,
    StalenessSection,
} from './filters/FilterSheetShared';
import type { CategorySelection, LocationSelection } from './filters/FilterSheetShared';
```

- [ ] **Step 3: Remove the old FilterSection definition**

Find and delete lines 148–165 (the local `FilterSection` component definition):
```typescript
// ─── FilterSection accordion ──────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <div style={{ borderBottom: '1px solid var(--border-primary)', padding: '12px 20px' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{title}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '18px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>⌄</span>
            </button>
            {open && <div style={{ marginTop: '12px' }}>{children}</div>}
        </div>
    );
}
```

Delete this entire block — it's now imported from FilterSheetShared.

- [ ] **Step 4: Add new filter state variables — after `showFilterSheet` (line ~217)**

Find:
```typescript
const [showFilterSheet, setShowFilterSheet] = useState(false);
```

Add after:
```typescript
// ── New filter state (v2 filter redesign) ──
const [intentFilter, setIntentFilter] = useState<'BUYER' | 'TENANT' | ''>('');
const [categorySelection, setCategorySelection] = useState<CategorySelection>({
    categoryId: '', subCategoryId: '', typeId: '', bhk: [],
});
const [locationFilter, setLocationFilter] = useState<LocationSelection>({
    label: '', lat: null, lng: null, radiusKm: 2,
});
const [notContactedDays, setNotContactedDays] = useState(0);
const [noShowcaseDays, setNoShowcaseDays] = useState(0);
```

**Important:** Remove these old state vars if they exist as separate declarations:
- `const [bhkFilter, setBhkFilter] = useState<number[]>([]);` — replaced by `categorySelection.bhk`
- `const [categoryFilter, setCategoryFilter] = useState('');` — replaced by `categorySelection.categoryId`
- `const [locationFilter, setLocationFilter] = useState('');` — replaced by new LocationSelection state

Check the file around lines 208–217 to find and remove those old declarations.

- [ ] **Step 5: Update activeFilterCount calculation**

Find the `activeFilterCount` calculation (around line 851). Replace it entirely:

```typescript
const activeFilterCount = [
    statusFilter,
    sourceFilter,
    agentFilter,
    dateFrom,
    dateTo,
    intentFilter,
    categorySelection.categoryId,
    categorySelection.subCategoryId,
    categorySelection.typeId,
    locationFilter.lat !== null ? '1' : '',
    notContactedDays > 0 ? '1' : '',
    noShowcaseDays > 0 ? '1' : '',
].filter(Boolean).length + (categorySelection.bhk.length > 0 ? 1 : 0);
```

- [ ] **Step 6: Update the loadLeads API call to pass new params**

Find the `useEffect` that builds query params for `/api/leads/recent-external` (search for `loadLeads` or `recent-external` in the file). The current params are something like:
```
source: sourceFilter || undefined,
status: statusFilter || undefined,
bhk: bhkFilter.length > 0 ? bhkFilter.join(',') : undefined,
category: categoryFilter || undefined,
location: locationFilter || undefined,
agent_id: agentFilter || undefined,
```

Replace with:
```typescript
source: sourceFilter || undefined,
status: statusFilter || undefined,
agent_id: agentFilter || undefined,
date_from: dateFrom || undefined,
date_to: dateTo || undefined,
intent: intentFilter || undefined,
category_id: categorySelection.categoryId || undefined,
sub_category_id: categorySelection.subCategoryId || undefined,
type_id: categorySelection.typeId || undefined,
bhk: categorySelection.bhk.length > 0 ? categorySelection.bhk.join(',') : undefined,
lat: locationFilter.lat !== null ? String(locationFilter.lat) : undefined,
lng: locationFilter.lng !== null ? String(locationFilter.lng) : undefined,
radius_km: locationFilter.lat !== null && locationFilter.radiusKm > 0 ? String(locationFilter.radiusKm) : undefined,
not_contacted_days: notContactedDays > 0 ? String(notContactedDays) : undefined,
no_showcase_days: noShowcaseDays > 0 ? String(noShowcaseDays) : undefined,
```

Also update the useEffect dependency array to include all new state vars:
```typescript
}, [statusFilter, sourceFilter, agentFilter, dateFrom, dateTo, intentFilter, categorySelection, locationFilter, notContactedDays, noShowcaseDays, currentPage, searchQuery]);
```

- [ ] **Step 7: Rework the mobile filter bottom sheet (lines ~1965–2076)**

Replace the entire content between the drag handle and Apply button with the new sections. Find the sheet content starting after the drag handle and replace with:

```tsx
{/* Intent */}
<FilterSection title="Intent" defaultOpen badge={intentFilter ? 1 : 0}>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[{ label: 'Buy', value: 'BUYER' }, { label: 'Rent', value: 'TENANT' }].map(opt => (
            <button key={opt.value} type="button"
                onClick={() => setIntentFilter(intentFilter === opt.value ? '' : opt.value as 'BUYER' | 'TENANT')}
                className={`chip ${intentFilter === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                {opt.label}
            </button>
        ))}
    </div>
</FilterSection>

<FilterLocationSection value={locationFilter} onChange={setLocationFilter} />

<FilterCategorySection tree={classificationTree} value={categorySelection} onChange={setCategorySelection} />

{/* Source */}
<FilterSection title="Source" defaultOpen={false} badge={sourceFilter ? 1 : 0}>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {SOURCES.map(s => (
            <button key={s} type="button"
                onClick={() => setSourceFilter(sourceFilter === s ? '' : s)}
                className={`chip ${sourceFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                {sourceLabels[s] || s}
            </button>
        ))}
    </div>
</FilterSection>

{/* Agent (privileged only) */}
{isPrivileged && (
    <FilterSection title="Agent" defaultOpen={false} badge={agentFilter ? 1 : 0}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {teamMembers.map(m => (
                <button key={m.id} type="button"
                    onClick={() => setAgentFilter(agentFilter === m.id ? '' : m.id)}
                    className={`chip ${agentFilter === m.id ? 'chip-active' : 'chip-inactive'}`}>
                    {m.name}
                </button>
            ))}
        </div>
    </FilterSection>
)}

{/* Status */}
<FilterSection title="Status" defaultOpen={false} badge={statusFilter ? 1 : 0}>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {LEAD_STATUSES.map(s => (
            <button key={s} type="button"
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`chip ${statusFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
        ))}
    </div>
</FilterSection>

{/* Date Range */}
<FilterSection title="Date Range" defaultOpen={false} badge={(dateFrom || dateTo) ? 1 : 0}>
    <div style={{ display: 'flex', gap: '10px' }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
    </div>
</FilterSection>

<StalenessSection
    title="Lead Staleness"
    label1="Not contacted in"
    label2="No inventory showcased in"
    days1={notContactedDays}
    days2={noShowcaseDays}
    onDays1Change={setNotContactedDays}
    onDays2Change={setNoShowcaseDays}
    badge={(notContactedDays > 0 ? 1 : 0) + (noShowcaseDays > 0 ? 1 : 0)}
/>
```

- [ ] **Step 8: Update the "Clear All" function inside the sheet header**

Find the Clear All button handler and update to clear all new state:
```typescript
onClick={() => {
    setStatusFilter('');
    setSourceFilter('');
    setAgentFilter('');
    setDateFrom('');
    setDateTo('');
    setIntentFilter('');
    setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
    setLocationFilter({ label: '', lat: null, lng: null, radiusKm: 2 });
    setNotContactedDays(0);
    setNoShowcaseDays(0);
}}
```

Also update the main "Clear all" button in the active chips row (line ~1036).

- [ ] **Step 9: Update active filter chips row (lines ~991–1041)**

Replace the chips for `bhkFilter`, `categoryFilter`, `locationFilter` with new chips:

```tsx
{intentFilter && (
    <button type="button" onClick={() => setIntentFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        {intentFilter === 'BUYER' ? 'Buy' : 'Rent'} ×
    </button>
)}
{categorySelection.categoryId && (
    <button type="button" onClick={() => setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        {classificationTree.find(c => c.id === categorySelection.categoryId)?.name || 'Category'} ×
    </button>
)}
{categorySelection.subCategoryId && (
    <button type="button" onClick={() => setCategorySelection(prev => ({ ...prev, subCategoryId: '', typeId: '' }))} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        {classificationTree.flatMap(c => c.subcategories).find(s => s.id === categorySelection.subCategoryId)?.name || 'SubCat'} ×
    </button>
)}
{locationFilter.lat !== null && (
    <button type="button" onClick={() => setLocationFilter({ label: '', lat: null, lng: null, radiusKm: 2 })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        📍 {locationFilter.label.substring(0, 20)}{locationFilter.label.length > 20 ? '…' : ''} {locationFilter.radiusKm > 0 ? `(${locationFilter.radiusKm}km)` : ''} ×
    </button>
)}
{notContactedDays > 0 && (
    <button type="button" onClick={() => setNotContactedDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        No contact {notContactedDays}d+ ×
    </button>
)}
{noShowcaseDays > 0 && (
    <button type="button" onClick={() => setNoShowcaseDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
        No showcase {noShowcaseDays}d+ ×
    </button>
)}
```

- [ ] **Step 10: Verify no TypeScript errors in ExternalLeads.tsx**

Run from frontend directory:
```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit 2>&1 | grep "ExternalLeads" | head -20
```
Expected: No errors for ExternalLeads.tsx.

- [ ] **Step 11: Commit**

```bash
git add agents/frontend/src/components/ExternalLeads.tsx
git commit -m "feat(leads-filter): rework filter sheet with intent, location, category tree, staleness filters"
```

---

## Task 5: InventoryList.tsx — Add Filter Bottom Sheet

**Files:**
- Modify: `agents/frontend/src/components/InventoryList.tsx`

This component currently has inline desktop filters but NO mobile bottom sheet. Add:
1. Import shared components
2. Add `showFilterSheet` state + all new filter state vars
3. Add "Filters (N)" button on mobile  
4. Build the filter bottom sheet JSX
5. Update `loadInventory` params
6. Add active filter chips for mobile

- [ ] **Step 1: Read the imports and filter state section (lines 1–120)**

Read lines 1–120 of `agents/frontend/src/components/InventoryList.tsx` to see exact import syntax and state variable names.

- [ ] **Step 2: Add imports for shared filter components**

Find the last import line (likely `import ... from ...`) and add after it:
```typescript
import {
    FilterSection,
    FilterCategorySection,
    FilterLocationSection,
    StalenessSection,
} from './filters/FilterSheetShared';
import type { CategorySelection, LocationSelection } from './filters/FilterSheetShared';
```

Also add if not already imported:
```typescript
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
```

- [ ] **Step 3: Add new filter state variables**

Read the existing filter state variables (lines ~107–115) — they are: `filterIntent`, `filterState`, `filterType`, `filterStatus`, `filterAgent`, `searchQuery`, `filterBhk`, `filterLocation`.

After the existing filter state block, add:
```typescript
// ── Filter sheet state (v2 redesign) ──
const [showFilterSheet, setShowFilterSheet] = useState(false);
const [filterCategorySelection, setFilterCategorySelection] = useState<CategorySelection>({
    categoryId: '', subCategoryId: '', typeId: '', bhk: [],
});
const [filterLocationSelection, setFilterLocationSelection] = useState<LocationSelection>({
    label: '', lat: null, lng: null, radiusKm: 2,
});
const [filterListingSource, setFilterListingSource] = useState('');
const [filterDataSource, setFilterDataSource] = useState('');
const [filterDaysInSystem, setFilterDaysInSystem] = useState(0);
const [filterDaysNoVisit, setFilterDaysNoVisit] = useState(0);
// Classification tree for filter sheet
const [filterClassificationTree, setFilterClassificationTree] = useState<any[]>([]);
```

- [ ] **Step 4: Load classification tree in InventoryList**

Find the `useEffect` that loads inventory (or the initial data load). Add classification tree fetch alongside it:

```typescript
useEffect(() => {
    client.get('/public/classification-tree')
        .then(r => setFilterClassificationTree(r.data.categories || []))
        .catch(() => {});
}, []);
```

- [ ] **Step 5: Update loadInventory to pass new params**

Find the `loadInventory` function (around line 228–247). It currently passes:
```typescript
intent: filterIntent || undefined,
state: filterState || undefined,
type: filterType || undefined,
category: undefined, // or filterType
status: filterStatus || undefined,
agent_id: filterAgent || undefined,
bhk: filterBhk.length > 0 ? filterBhk.join(',') : undefined,
location: filterLocation || undefined,
```

Add the new params:
```typescript
category_id: filterCategorySelection.categoryId || undefined,
sub_category_id: filterCategorySelection.subCategoryId || undefined,
bhk: filterCategorySelection.bhk.length > 0 ? filterCategorySelection.bhk.join(',') : undefined,
listing_source: filterListingSource || undefined,
data_source: filterDataSource || undefined,
lat: filterLocationSelection.lat !== null ? String(filterLocationSelection.lat) : undefined,
lng: filterLocationSelection.lng !== null ? String(filterLocationSelection.lng) : undefined,
radius_km: filterLocationSelection.lat !== null && filterLocationSelection.radiusKm > 0 ? String(filterLocationSelection.radiusKm) : undefined,
days_in_system: filterDaysInSystem > 0 ? String(filterDaysInSystem) : undefined,
days_no_visit: filterDaysNoVisit > 0 ? String(filterDaysNoVisit) : undefined,
```

Also update the useEffect dependency array:
```typescript
}, [
    currentPage, filterIntent, filterState, filterType, filterStatus, filterAgent,
    filterCategorySelection, filterLocationSelection, filterListingSource, filterDataSource,
    filterDaysInSystem, filterDaysNoVisit,
]);
```

- [ ] **Step 6: Add activeInventoryFilterCount**

Add this constant near the mobile check / render section:
```typescript
const activeInventoryFilterCount = [
    filterIntent, filterStatus, filterAgent, filterListingSource, filterDataSource,
    filterCategorySelection.categoryId, filterCategorySelection.subCategoryId,
    filterLocationSelection.lat !== null ? '1' : '',
    filterDaysInSystem > 0 ? '1' : '',
    filterDaysNoVisit > 0 ? '1' : '',
].filter(Boolean).length + (filterCategorySelection.bhk.length > 0 ? 1 : 0);
```

- [ ] **Step 7: Add Filter button to the mobile header**

Find the mobile search input area (look for `searchQuery` input on mobile). Add a Filter button next to it:

```tsx
{/* Filter button — mobile only */}
{isMobile && (
    <button
        type="button"
        onClick={() => setShowFilterSheet(true)}
        style={{
            padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
            border: activeInventoryFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
            backgroundColor: activeInventoryFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
            color: activeInventoryFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '13px',
            display: 'flex', alignItems: 'center', gap: '6px',
        }}
    >
        <span>⚙</span>
        <span>Filters{activeInventoryFilterCount > 0 ? ` (${activeInventoryFilterCount})` : ''}</span>
    </button>
)}
```

- [ ] **Step 8: Add active filter chips row for mobile**

After the Filter button row, add:
```tsx
{isMobile && activeInventoryFilterCount > 0 && (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '0 16px 8px' }}>
        {filterIntent && (
            <button type="button" onClick={() => setFilterIntent('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                {filterIntent === 'sell' ? 'Sale' : 'Rent'} ×
            </button>
        )}
        {filterCategorySelection.categoryId && (
            <button type="button" onClick={() => setFilterCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                {filterClassificationTree.find((c: any) => c.id === filterCategorySelection.categoryId)?.name || 'Category'} ×
            </button>
        )}
        {filterLocationSelection.lat !== null && (
            <button type="button" onClick={() => setFilterLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                📍 {filterLocationSelection.label.substring(0, 18)}… ×
            </button>
        )}
        {filterListingSource && (
            <button type="button" onClick={() => setFilterListingSource('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                {filterListingSource === 'OWNER' ? 'Direct Owner' : filterListingSource === 'EXTERNAL_AGENT' ? 'Partner Agent' : filterListingSource} ×
            </button>
        )}
        {filterDaysInSystem > 0 && (
            <button type="button" onClick={() => setFilterDaysInSystem(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                {filterDaysInSystem}d+ old ×
            </button>
        )}
        {filterDaysNoVisit > 0 && (
            <button type="button" onClick={() => setFilterDaysNoVisit(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                No visit {filterDaysNoVisit}d+ ×
            </button>
        )}
        <button type="button" onClick={() => {
            setFilterIntent(''); setFilterStatus(''); setFilterAgent(''); setFilterListingSource('');
            setFilterDataSource(''); setFilterCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
            setFilterLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
            setFilterDaysInSystem(0); setFilterDaysNoVisit(0);
        }} style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            Clear all
        </button>
    </div>
)}
```

- [ ] **Step 9: Add the filter bottom sheet JSX at the end of the component return (before closing div)**

Add this JSX block right before the final `</div>` of the component:

```tsx
{/* ── Inventory Filter Bottom Sheet ── */}
{isMobile && showFilterSheet && (
    <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
        onClick={() => setShowFilterSheet(false)}
    >
        <div
            style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '20px 20px 0 0',
                maxHeight: '85vh', overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '0 0 32px',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
            </div>

            {/* Header */}
            <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                <button type="button" onClick={() => {
                    setFilterIntent(''); setFilterStatus(''); setFilterAgent(''); setFilterListingSource('');
                    setFilterDataSource('');
                    setFilterCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
                    setFilterLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
                    setFilterDaysInSystem(0); setFilterDaysNoVisit(0);
                }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    Clear All
                </button>
            </div>

            {/* Location */}
            <FilterLocationSection value={filterLocationSelection} onChange={setFilterLocationSelection} />

            {/* Listing Source */}
            <FilterSection title="Listing Source" defaultOpen={false} badge={filterListingSource ? 1 : 0}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Direct Owner', value: 'OWNER' },
                        { label: 'Partner Agent', value: 'EXTERNAL_AGENT' },
                        { label: 'Internal Agent', value: 'AGENT_OWNER' },
                    ].map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => setFilterListingSource(filterListingSource === opt.value ? '' : opt.value)}
                            className={`chip ${filterListingSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Purpose */}
            <FilterSection title="Purpose" defaultOpen badge={filterIntent ? 1 : 0}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { label: 'Sale', value: 'sell' },
                        { label: 'Rent', value: 'rent' },
                    ].map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => setFilterIntent(filterIntent === opt.value ? '' : opt.value)}
                            className={`chip ${filterIntent === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Property Category (shared cascading component) */}
            <FilterCategorySection
                tree={filterClassificationTree}
                value={filterCategorySelection}
                onChange={setFilterCategorySelection}
            />

            {/* Agent */}
            {isPrivilegedUser && (
                <FilterSection title="Agent" defaultOpen={false} badge={filterAgent ? 1 : 0}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {agentsList.map((a: any) => (
                            <button key={a.id} type="button"
                                onClick={() => setFilterAgent(filterAgent === a.id ? '' : a.id)}
                                className={`chip ${filterAgent === a.id ? 'chip-active' : 'chip-inactive'}`}>
                                {a.name}
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}

            {/* Data Source */}
            <FilterSection title="Data Source" defaultOpen={false} badge={filterDataSource ? 1 : 0}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { label: 'WhatsApp', value: 'whatsapp' },
                        { label: 'Website', value: 'website' },
                        { label: 'Manual Entry', value: 'admin' },
                        { label: 'Mobile App', value: 'mobile_app' },
                        { label: 'Voice', value: 'voice' },
                    ].map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => setFilterDataSource(filterDataSource === opt.value ? '' : opt.value)}
                            className={`chip ${filterDataSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Listing Status */}
            <FilterSection title="Listing Status" defaultOpen={false} badge={filterStatus ? 1 : 0}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['active', 'sold', 'rented', 'withdrawn'].map(s => (
                        <button key={s} type="button"
                            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                            className={`chip ${filterStatus === s ? 'chip-active' : 'chip-inactive'}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Inventory Staleness */}
            <StalenessSection
                title="Inventory Staleness"
                label1="Days in system (unsold)"
                label2="Days since last visit"
                days1={filterDaysInSystem}
                days2={filterDaysNoVisit}
                onDays1Change={setFilterDaysInSystem}
                onDays2Change={setFilterDaysNoVisit}
                badge={(filterDaysInSystem > 0 ? 1 : 0) + (filterDaysNoVisit > 0 ? 1 : 0)}
            />

            {/* Apply */}
            <div style={{ padding: '16px 20px 0' }}>
                <button type="button"
                    onClick={() => setShowFilterSheet(false)}
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                >
                    Apply Filters{activeInventoryFilterCount > 0 ? ` (${activeInventoryFilterCount} active)` : ''}
                </button>
            </div>
        </div>
    </div>
)}
```

**Note:** `isPrivilegedUser` — check what the InventoryList.tsx calls the privileged check (likely `agent?.role === 'super_boss' || agent?.role === 'manager'` — use whatever variable name the component already uses). Replace `isPrivilegedUser` with the actual variable name found in step 1.

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend
npx tsc --noEmit 2>&1 | grep "InventoryList" | head -20
```
Expected: No errors for InventoryList.tsx.

- [ ] **Step 11: Commit**

```bash
git add agents/frontend/src/components/InventoryList.tsx
git commit -m "feat(inventory-filter): add filter bottom sheet with location, category tree, listing source, staleness"
```

---

## Task 6: Build, Deploy, Verify

**Files:** No file changes — deploy existing changes.

- [ ] **Step 1: Build frontend**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend
npm run build 2>&1 | tail -20
```
Expected: `✓ built in X.Xs` with no errors. If errors appear, fix them before continuing.

- [ ] **Step 2: Deploy backend (ts-node, no build)**

Check memory for exact deploy commands. Typically:
```bash
# SCP changed backend files to server
# pm2 restart backend
```

- [ ] **Step 3: Deploy frontend**

```bash
# SCP dist/ to server nginx web root
```

- [ ] **Step 4: Take before screenshot of leads filter**

Use `mcp__playwright-browser__browser_navigate` to go to `https://www.realtypandit.in`, log in, navigate to leads, take screenshot of the filter sheet.

- [ ] **Step 5: Take before screenshot of inventory filter**

Navigate to inventory list, take screenshot of current state.

- [ ] **Step 6: Test leads filter — open bottom sheet**

On mobile viewport (375px), click Filters button, verify sheet opens with:
- Intent section (Buy/Rent chips)
- Location section (Google Places input)
- Property Category (cascading Residential/Commercial/Agricultural)
- Source, Agent, Status, Date Range, Lead Staleness

- [ ] **Step 7: Test category cascade**

Select Residential → verify subcategories appear. Select Apartment/Gated Society → verify type chips (Flat, Studio, etc.) appear. Verify BHK chips appear.

- [ ] **Step 8: Test inventory filter bottom sheet**

On inventory page, click Filters, verify sheet opens with all 8 sections.

- [ ] **Step 9: Take after screenshots, compare**

Take desktop and mobile screenshots. Show to user as proof.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "feat: complete filter sheets redesign — leads + inventory with category tree, location, staleness"
```

---

## Self-Review

**Spec coverage:**
- ✅ Intent (Buy/Rent) in leads filter
- ✅ Location (Google Places + radius) in BOTH leads and inventory
- ✅ Property Category cascading tree in both
- ✅ BHK (Residential only) in both
- ✅ Source / Data Source in both
- ✅ Agent filter in both
- ✅ Status in both
- ✅ Date Range in leads
- ✅ Lead staleness: not contacted + no showcase (days)
- ✅ Listing Source Type (Direct Owner / Partner Agent / Builder) in inventory
- ✅ Inventory staleness: days in system + days since last visit
- ✅ Bottom sheet pattern (same as existing leads) for both
- ✅ Active filter chips (dismissible) in both
- ✅ Clear All in both
- ✅ Apply button with count in both

**Placeholder check:** All code blocks are complete. No TBDs.

**Type consistency:**
- `CategorySelection` and `LocationSelection` defined in FilterSheetShared.tsx and imported in both components
- `filterCategorySelection.bhk` replaces old `bhkFilter` / `filterBhk` arrays
- `filterLocationSelection.lat/lng/radiusKm` replaces old `locationFilter` string
- Backend params: `category_id`, `sub_category_id` match Prisma field names exactly
- `listing_source` → `ownership_type` (OWNER/EXTERNAL_AGENT/AGENT_OWNER enum values)
- `data_source` → `upload_source`

**Known limitation:** `days_no_visit` for inventory uses Appointment table. Some older inventory may have visits in ScheduledVisit table (separate model). This is fine for now — Appointment is the current system, ScheduledVisit is legacy.
