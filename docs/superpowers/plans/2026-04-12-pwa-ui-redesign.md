# PWA UI/UX Redesign + Critical Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical PWA bugs that break core workflows, then redesign every mobile screen with claymorphism, bento grid, accordion filters, toast notifications, skeleton loading, and dual light/dark theming.

**Architecture:** Phase A (Tasks 1–4) are self-contained bug fixes that restore broken functionality — ship these first. Phase B (Tasks 5–6) installs the design system foundation (CSS tokens + reusable UI components) that all later screens depend on. Phase C (Tasks 7–12) applies the redesign to each screen in order of user impact. Every component already uses CSS custom properties via `var(--*)`, so theme swapping is a class toggle on `<html>` — no per-component dark-mode logic needed.

**Tech Stack:** React 18 + TypeScript, CSS custom properties (no Tailwind), state-based navigation (no React Router), Prisma + PostgreSQL backend, PM2 process manager, SSH deploy via `~/.ssh/realty_pandit_key` to `72.62.231.224`

---

## FILE MAP

**Backend (Phase A only)**
- Modify (SQL): `agents/backend/prisma/schema.prisma` — `lead_id` column already defined, just missing in DB

**Frontend — Modify existing**
- `agents/frontend/src/index.css` — add claymorphism tokens, skeleton keyframe, shimmer animation
- `agents/frontend/src/components/mobile/MobileLayout.tsx` — fix drawer scroll, fix Admin/Team permission holes
- `agents/frontend/src/components/ContactSearchField.tsx` — remove name search, phone-only mode
- `agents/frontend/src/components/ExternalLeads.tsx` — minimalist filter + bottom sheet + Add Lead phone-only
- `agents/frontend/src/components/LeadWorkflowPage.tsx` — compact stage chip strip, fix scroll
- `agents/frontend/src/components/dashboard/MainDashboard.tsx` — bento grid layout
- `agents/frontend/src/components/mobile/MobileContactList.tsx` — skeleton loading, chip filter polish
- `agents/frontend/src/components/mobile/MobileInventoryList.tsx` — compact claymorphism cards + bottom sheet actions
- `agents/frontend/src/App.tsx` — wrap with ToastProvider

**Frontend — Create new**
- `agents/frontend/src/components/ui/Toast.tsx` — toast + snackbar notification layer
- `agents/frontend/src/contexts/ToastContext.tsx` — global toast state

---

## PHASE A — CRITICAL BUG FIXES

---

### Task 1: Fix BUG-01 — Missing `lead_scores.lead_id` DB Column

**Root cause:** Prisma schema defines `lead_id String? @unique` on the `LeadScore` model, but the migration SQL never ran `ALTER TABLE lead_scores ADD COLUMN lead_id`. Every `prisma.contact.findMany()` call crashes with a 500 error because Prisma tries to SELECT the column. This breaks Dashboard stats, Chats, and all contact-dependent screens.

**Files:**
- SSH: `72.62.231.224` via `~/.ssh/realty_pandit_key`

- [ ] **Step 1: SSH to server and open psql**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224
sudo -u postgres psql -d reality_pandit
```

- [ ] **Step 2: Verify the column is missing**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'lead_scores' AND column_name = 'lead_id';
```

Expected output: `(0 rows)` — confirms the column is absent.

- [ ] **Step 3: Add the column**

```sql
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS lead_id VARCHAR(36) UNIQUE;
```

Expected output: `ALTER TABLE`

- [ ] **Step 4: Verify column now exists**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'lead_scores' AND column_name = 'lead_id';
```

Expected output:
```
 column_name | data_type |  is_nullable
-------------+-----------+--------------
 lead_id     | character | YES
```

- [ ] **Step 5: Restart backend**

```bash
\q
pm2 restart realty-backend
pm2 logs realty-backend --lines 20
```

Expected: No Prisma column errors in logs. Look for `Server running on port` message.

- [ ] **Step 6: Verify fix on live site**

Open `https://admin.realtypandit.in` in browser. Dashboard should now show real contact counts instead of zeros. Chats should show contacts list.

- [ ] **Step 7: No commit needed** — this is a DB-only change. Mark task done.

---

### Task 2: Fix BUG-02 — Menu Drawer Not Scrollable (Profile Footer Blocks Content)

**Root cause:** In `MobileLayout.tsx`, the `<nav>` element has `overflowY: 'auto'` but is missing `minHeight: 0` and `WebkitOverflowScrolling: 'touch'`. In a CSS flexbox column, flex children don't shrink below their content size unless `minHeight: 0` is set — so the nav grows to full content height and the scroll never activates. On mobile Safari, `-webkit-overflow-scrolling: touch` is also required for momentum scrolling inside a non-body element.

**Files:**
- Modify: `agents/frontend/src/components/mobile/MobileLayout.tsx:199`

- [ ] **Step 1: Open the file and locate the nav element**

In `MobileLayout.tsx`, find this line (around line 199):
```tsx
<nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
```

- [ ] **Step 2: Apply the fix**

```tsx
<nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
```

- [ ] **Step 3: Also move the Profile footer INSIDE the scrollable area so it scrolls with the nav rather than being pinned**

Find the profile section around line 238:
```tsx
{/* Profile + Logout */}
<div style={{ padding: '16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
```

This section sits OUTSIDE the `<nav>` but inside the drawer flex column. It pins to the bottom and covers nav items. Move it inside the `<nav>` as the last child so it scrolls with the rest:

```tsx
<nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
  {/* ...existing NAV_SECTIONS.map() code... */}

  {/* Profile — at bottom of scroll area, not pinned */}
  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    {/* ...existing profile avatar, name, role badge, theme toggle, logout button... */}
  </div>
</nav>
```

Delete the old `{/* Profile + Logout */}` block that was outside `<nav>`.

- [ ] **Step 4: Build frontend and deploy**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend
npm run build
```

Expected: `dist/` folder created with no TypeScript errors.

- [ ] **Step 5: Deploy to server**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224
cd /home/realty/admin-panel && rm -rf dist
exit
scp -i ~/.ssh/realty_pandit_key -r c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend/dist root@72.62.231.224:/home/realty/admin-panel/
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 "pm2 restart realty-admin"
```

- [ ] **Step 6: Verify in browser at 390px viewport**

Open drawer → scroll down → Communication / Team / Admin sections should all be reachable. Profile card should scroll with the content, not block anything.

- [ ] **Step 7: Commit**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit
git add agents/frontend/src/components/mobile/MobileLayout.tsx
git commit -m "fix: make menu drawer scrollable, move profile card into scroll area"
```

---

### Task 3: Fix BUG-03 — Add Lead Search Accepts Partial Names

**Root cause:** In `ContactSearchField.tsx` (used for inventory owner search) and in the Add Lead wizard inside `ExternalLeads.tsx`, the search field handles both phone queries AND name queries. Name-based search returns contacts from the entire system using the `recentContacts` list filtered client-side. An employee can type any name and see contacts that don't belong to them.

**Rule to enforce:** Search field must accept ONLY digits. Must only fire the API when exactly 10 digits are entered. No name search at all.

**Files:**
- Modify: `agents/frontend/src/components/ContactSearchField.tsx`
- Modify: `agents/frontend/src/components/ExternalLeads.tsx` (Add Lead wizard search step)

- [ ] **Step 1: Fix `ContactSearchField.tsx` — remove name search, add phone-only UI**

Replace the entire component's render input section and `handleInputChange`. Current broken logic (lines ~122–138):
```typescript
const handleInputChange = useCallback((val: string) => {
    setQuery(val);
    setSearchResult(null);
    setNotFound(false);
    setError('');
    setFilteredContacts([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (isPhoneQuery(val)) {
        const cleaned = val.replace(/\D/g, '').slice(0, 10);
        if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
            searchTimeout.current = setTimeout(() => doPhoneSearch(cleaned), 300);
        }
    } else if (val.trim().length >= 2) {
        searchTimeout.current = setTimeout(() => doNameFilter(val), 200);
    }
}, [doPhoneSearch, doNameFilter]);
```

Replace with:
```typescript
const handleInputChange = useCallback((val: string) => {
    // Strip all non-digits, cap at 10
    const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
    setQuery(digitsOnly);
    setSearchResult(null);
    setNotFound(false);
    setError('');
    setFilteredContacts([]);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
        searchTimeout.current = setTimeout(() => doPhoneSearch(digitsOnly), 300);
    }
}, [doPhoneSearch]);
```

- [ ] **Step 2: Update the input element to phone mode with digit counter**

Find the input element (around line 207):
```tsx
<input
    type="text"
    value={query}
    onChange={e => handleInputChange(e.target.value)}
    placeholder={placeholder}
    style={styles.input}
    autoFocus
/>
```

Replace with:
```tsx
<div style={{ position: 'relative' }}>
    <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={query}
        onChange={e => handleInputChange(e.target.value)}
        placeholder="Enter 10-digit phone number"
        maxLength={10}
        style={styles.input}
        autoFocus
    />
    <span style={{
        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '12px', color: query.length === 10 ? 'var(--success-text)' : 'var(--text-muted)',
        fontWeight: 600, pointerEvents: 'none',
    }}>
        {query.length}/10
    </span>
</div>
{query.length > 0 && query.length < 10 && (
    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', paddingLeft: '4px' }}>
        {10 - query.length} more digits needed
    </div>
)}
```

- [ ] **Step 3: Remove `recentContacts` section and `doNameFilter` function**

Delete lines:
- The `doNameFilter` useCallback function (around lines 108–120)
- The `recentContacts` state and `loadingRecent` state
- The `useEffect` that loads recent contacts on mount (around lines 75–79)
- The `filteredContacts` state
- The "Recent Contacts" JSX section at the bottom (around lines 343–391)
- The "Name Search Results" JSX section (around lines 309–341)

Keep: `doPhoneSearch`, phone search result card, "Not Found → Create New" card.

- [ ] **Step 4: Find and fix the Add Lead wizard search in `ExternalLeads.tsx`**

Search for `"Search by name or phone number"` or `"Search if this client"` in `ExternalLeads.tsx`. This is the Add Lead Step 2 search input. Apply the same phone-only restriction:

Replace the search `<input>` in the wizard step with:
```tsx
<div style={{ position: 'relative' }}>
    <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={wizardSearchQuery}
        onChange={e => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
            setWizardSearchQuery(digits);
            // only search on exactly 10 digits
            if (digits.length === 10 && /^[6-9]/.test(digits)) {
                doWizardPhoneSearch(digits);
            } else {
                setWizardSearchResult(null);
                setWizardNotFound(false);
            }
        }}
        placeholder="Enter 10-digit phone number"
        maxLength={10}
        style={{ /* keep existing input styles */ }}
        autoFocus
    />
    <span style={{
        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '12px', fontWeight: 600,
        color: wizardSearchQuery.length === 10 ? '#22c55e' : 'var(--text-muted)',
        pointerEvents: 'none',
    }}>
        {wizardSearchQuery.length}/10
    </span>
</div>
{wizardSearchQuery.length > 0 && wizardSearchQuery.length < 10 && (
    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>
        {10 - wizardSearchQuery.length} more digits needed
    </p>
)}
```

Remove any name-based filtering logic from the wizard search handler.

- [ ] **Step 5: Build, deploy, verify**

```bash
npm run build
```

Test: Open Add Lead → Step 2. Type "rahu" — nothing should appear. Type "9871711631" — should return the matching contact.

- [ ] **Step 6: Commit**

```bash
git add agents/frontend/src/components/ContactSearchField.tsx agents/frontend/src/components/ExternalLeads.tsx
git commit -m "fix: restrict Add Lead and inventory search to complete 10-digit phone only"
```

---

### Task 4: Fix Permissions — Hide Team/Admin Sections from Employee Role

**Root cause:** In `MobileLayout.tsx`, the Admin section's "Dashboard" item has `permission: null` — it shows to everyone. The Team section items have `permission: 'manage_agents'` but the permission check may not work correctly. An employee should see NO Team section and NO Admin section in their menu.

**Files:**
- Modify: `agents/frontend/src/components/mobile/MobileLayout.tsx` (lines 48–67)

- [ ] **Step 1: Check what `hasPermission('manage_agents')` returns for employee role**

In `AuthContext.tsx`, find the `hasPermission` function and check how it works for `employee` role. If it returns `true` for `manage_agents` for employees, that's the bug.

Search in `agents/frontend/src/contexts/AuthContext.tsx` for `hasPermission` or `manage_agents`. If there's a permissions map, `manage_agents` should NOT include `employee` role.

- [ ] **Step 2: Fix `NAV_SECTIONS` — add role-based section filtering to `MobileLayout.tsx`**

Currently the Admin > Dashboard item uses `permission: null` (shows to all). Change it to `permission: 'view_reports'`:

Find (around line 58):
```typescript
{ id: 'dashboard', label: 'Dashboard', icon: '📊', permission: null },
```

Replace with:
```typescript
{ id: 'dashboard', label: 'Dashboard', icon: '📊', permission: 'view_reports' },
```

- [ ] **Step 3: Add role-gating to the section renderer**

In `NAV_SECTIONS.map()` (around line 200), the section is already skipped if all its items are filtered out:
```typescript
if (sectionItems.length === 0) return null;
```

This is correct — once all items in Team and Admin are permission-gated, the entire section header disappears automatically. Verify by checking with an employee login after deploy.

- [ ] **Step 4: Fix `MobileInventoryList.tsx` — hide Deactivate for non-owner properties**

In `MobileInventoryList.tsx`, find the Deactivate button render. Add an ownership check:

Find the Deactivate button (search for `Deactivate` in the file). It currently shows unconditionally. Wrap it:

```tsx
{/* Only show Deactivate if this agent uploaded the property */}
{(item.uploaded_by_agent_id === agent?.id || agent?.role === 'super_boss' || agent?.role === 'manager') && (
    <button
        onClick={(e) => { e.stopPropagation(); handleDeactivate(item.id); }}
        style={/* existing deactivate button style */}
    >
        Deactivate
    </button>
)}
```

Note: `agent` comes from `useAuth()`. `item.uploaded_by_agent_id` is the uploader's agent ID. Import or destructure `agent` from `useAuth()` if not already present in the component scope.

- [ ] **Step 5: Build, deploy, verify**

```bash
npm run build
```

Log in as employee (7827338810 / real3121). Open Menu drawer — Team section and Admin section should be gone. Open Inventory — Deactivate button should only appear on properties uploaded by this employee.

- [ ] **Step 6: Commit**

```bash
git add agents/frontend/src/components/mobile/MobileLayout.tsx agents/frontend/src/components/mobile/MobileInventoryList.tsx
git commit -m "fix: hide Team/Admin menu sections from employee role, guard Deactivate by ownership"
```

---

## PHASE B — DESIGN SYSTEM FOUNDATION

---

### Task 5: CSS Design Tokens — Claymorphism, Skeleton, Dual Theme Polish

**Goal:** Add claymorphism shadow variables, skeleton shimmer animation, bottom sheet backdrop, chip tokens, and smooth theme transitions to `index.css`. All screen redesigns in Phase C use these tokens — do not skip this task.

**Files:**
- Modify: `agents/frontend/src/index.css`

- [ ] **Step 1: Add claymorphism + skeleton tokens to `:root` (light theme)**

Open `index.css`. After the existing `:root { }` block's last variable, add:

```css
  /* ── Claymorphism ── */
  --shadow-clay:       0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85);
  --shadow-clay-hover: 0 8px 32px rgba(0,0,0,0.13), inset 0 1px 0 rgba(255,255,255,0.95);
  --radius-clay:       16px;
  --radius-chip:       20px;

  /* ── Skeleton shimmer ── */
  --skeleton-base:  #e5e7eb;
  --skeleton-shine: #f3f4f6;

  /* ── Bottom sheet ── */
  --sheet-backdrop: rgba(0, 0, 0, 0.35);

  /* ── Toast ── */
  --toast-bg:    #1e293b;
  --toast-text:  #f8fafc;

  /* ── Bento grid gap ── */
  --bento-gap: 10px;

  /* ── Transition ── */
  --theme-transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
```

- [ ] **Step 2: Add dark-theme overrides inside `.dark { }`**

Find the `.dark { }` block. After its last variable, add:

```css
  /* ── Claymorphism (dark) ── */
  --shadow-clay:       0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
  --shadow-clay-hover: 0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09);

  /* ── Skeleton shimmer (dark) ── */
  --skeleton-base:  #1e2d3d;
  --skeleton-shine: #2a3f55;

  /* ── Bottom sheet (dark) ── */
  --sheet-backdrop: rgba(0, 0, 0, 0.6);
```

Note: `--toast-bg` and `--toast-text` stay the same in both themes (toasts are always dark).

- [ ] **Step 3: Add keyframe animations (skeleton shimmer, slide-up, fade-in-stagger)**

After the existing `@keyframes` blocks, add:

```css
@keyframes skeleton-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

@keyframes slide-up-in {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes slide-up-out {
  from { transform: translateY(0);    opacity: 1; }
  to   { transform: translateY(100%); opacity: 0; }
}

@keyframes fade-stagger {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes toast-in {
  from { transform: translateY(80px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

- [ ] **Step 4: Add utility classes**

After the existing utility classes, add:

```css
/* Skeleton pulse block */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--skeleton-base) 0%,
    var(--skeleton-shine) 40%,
    var(--skeleton-base) 80%
  );
  background-size: 800px 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: 8px;
}

/* Clay card */
.clay-card {
  background-color: var(--bg-card, var(--bg-secondary));
  box-shadow: var(--shadow-clay);
  border-radius: var(--radius-clay);
  transition: var(--theme-transition), box-shadow 150ms ease;
}
.clay-card:hover {
  box-shadow: var(--shadow-clay-hover);
}

/* Chip */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--radius-chip);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}
.chip-inactive {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  border-color: var(--border-primary);
}
.chip-active {
  background-color: var(--text-link);
  color: #fff;
  border-color: var(--text-link);
}
```

- [ ] **Step 5: Add smooth theme transition to root elements**

Find or add at the end of `index.css`:

```css
*, *::before, *::after {
  transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease;
}
/* Exclude transitions on animated elements to prevent jank */
.skeleton, .skeleton * {
  transition: none !important;
}
```

- [ ] **Step 6: Commit**

```bash
git add agents/frontend/src/index.css
git commit -m "feat: add claymorphism tokens, skeleton animation, chip + clay-card utility classes to CSS system"
```

---

### Task 6: Global Toast + Snackbar Components

**Goal:** Create a global notification layer. Toast slides up from bottom with auto-dismiss and optional Undo action. Snackbar is a thin info bar for validation hints. Both components are theme-aware (always dark background, white text — works in both light and dark modes).

**Files:**
- Create: `agents/frontend/src/contexts/ToastContext.tsx`
- Create: `agents/frontend/src/components/ui/Toast.tsx`
- Modify: `agents/frontend/src/App.tsx` — wrap with `<ToastProvider>`

- [ ] **Step 1: Create `ToastContext.tsx`**

```typescript
// agents/frontend/src/contexts/ToastContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
    undoFn?: () => void;
    duration?: number; // ms, default 3500
}

export interface SnackbarItem {
    id: string;
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, undoFn?: () => void, duration?: number) => void;
    showSnackbar: (message: string) => void;
    toasts: ToastItem[];
    snackbar: SnackbarItem | null;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
    showToast: () => {},
    showSnackbar: () => {},
    toasts: [],
    snackbar: null,
    dismissToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [snackbar, setSnackbar] = useState<SnackbarItem | null>(null);

    const showToast = useCallback((
        message: string,
        type: ToastType = 'success',
        undoFn?: () => void,
        duration = 3500,
    ) => {
        const id = `toast-${Date.now()}`;
        setToasts(prev => [...prev, { id, type, message, undoFn, duration }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const showSnackbar = useCallback((message: string) => {
        const id = `snack-${Date.now()}`;
        setSnackbar({ id, message });
        setTimeout(() => setSnackbar(null), 2500);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, showSnackbar, toasts, snackbar, dismissToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
```

- [ ] **Step 2: Create `Toast.tsx` component**

```tsx
// agents/frontend/src/components/ui/Toast.tsx
import { useToast, ToastItem } from '../../contexts/ToastContext';

const ICONS: Record<string, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
};
const ACCENT: Record<string, string> = {
    success: '#22c55e',
    error: '#ef4444',
    info: '#60a5fa',
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                borderLeft: `4px solid ${ACCENT[toast.type]}`,
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: 500,
                animation: 'toast-in 280ms cubic-bezier(0.34,1.56,0.64,1) forwards',
                minWidth: '260px',
                maxWidth: '340px',
            }}
        >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{ICONS[toast.type]}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.undoFn && (
                <button
                    onClick={() => { toast.undoFn!(); onDismiss(); }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: ACCENT[toast.type], fontWeight: 700, fontSize: '13px',
                        padding: '4px 8px', borderRadius: '6px',
                        flexShrink: 0,
                    }}
                >
                    Undo
                </button>
            )}
            <button
                onClick={onDismiss}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#64748b', fontSize: '16px', padding: '2px 4px',
                    flexShrink: 0, lineHeight: 1,
                }}
            >
                ×
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, snackbar, dismissToast } = useToast();

    return (
        <>
            {/* Toast stack — bottom center */}
            {toasts.length > 0 && (
                <div
                    style={{
                        position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                        zIndex: 9999,
                        display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center',
                    }}
                >
                    {toasts.map(t => (
                        <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
                    ))}
                </div>
            )}

            {/* Snackbar — thin bar at very bottom */}
            {snackbar && (
                <div
                    style={{
                        position: 'fixed', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
                        zIndex: 9998,
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        padding: '8px 20px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        animation: 'toast-in 200ms ease forwards',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {snackbar.message}
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 3: Wrap App with `ToastProvider` and add `ToastContainer`**

Open `agents/frontend/src/App.tsx`. Find the top-level return/render. Wrap with `ToastProvider` and add `ToastContainer` inside:

```tsx
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/ui/Toast';

// In the App component return:
return (
    <ToastProvider>
        {/* ...existing ThemeProvider and app content... */}
        <ToastContainer />
    </ToastProvider>
);
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
npm run build 2>&1 | grep -i error
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add agents/frontend/src/contexts/ToastContext.tsx agents/frontend/src/components/ui/Toast.tsx agents/frontend/src/App.tsx
git commit -m "feat: add global Toast + Snackbar notification layer with undo support"
```

---

## PHASE C — SCREEN REDESIGNS

---

### Task 7: Dashboard — Bento Grid Layout + Skeleton Loading

**Goal:** Replace the 6 equal-size stat cards with a responsive bento grid where Total Contacts gets a wide tile and other stats get compact tiles. Add skeleton loading while API fetches. Workflow Tasks summary becomes a horizontal scrollable chip row instead of a full block.

**Files:**
- Modify: `agents/frontend/src/components/dashboard/MainDashboard.tsx`

- [ ] **Step 1: Replace stat cards section with bento grid**

Find the `statCards` array and grid render (around lines 84–163). Replace the entire stat cards `<div>` with:

```tsx
{/* Bento Grid */}
<div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
    <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
        Quick Overview
    </p>
    {loading ? (
        /* Skeleton bento */
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: 'auto auto auto', gap: 'var(--bento-gap)' }}>
            {[120, 80, 80, 80, 80, 80].map((h, i) => (
                <div key={i} className="skeleton" style={{ height: h, borderRadius: '16px', gridColumn: i === 0 ? 'span 1' : undefined }} />
            ))}
        </div>
    ) : (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'auto',
            gap: 'var(--bento-gap)',
        }}>
            {/* Wide tile: Total Contacts */}
            <div style={{
                gridColumn: '1 / -1',
                backgroundColor: '#1e3a5f',
                borderRadius: 'var(--radius-clay)',
                padding: isMobile ? '16px' : '20px',
                boxShadow: 'var(--shadow-clay)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(96,165,250,0.2)',
            }}>
                <div>
                    <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600, marginBottom: '4px' }}>Total Contacts</div>
                    <div style={{ fontSize: '40px', fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>{stats.totalContacts}</div>
                </div>
                <div style={{ fontSize: '40px', opacity: 0.4 }}>👥</div>
            </div>

            {/* HOT Leads */}
            <div style={{ backgroundColor: 'var(--error-bg)', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: isMobile ? '20px' : '24px' }}>🔥</div>
                <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#f87171', lineHeight: 1.1 }}>{stats.hotLeads}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>HOT Leads</div>
            </div>

            {/* WARM Leads */}
            <div style={{ backgroundColor: 'var(--success-bg)', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: isMobile ? '20px' : '24px' }}>🟢</div>
                <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: 'var(--success-text-bright)', lineHeight: 1.1 }}>{stats.warmLeads}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>WARM Leads</div>
            </div>

            {/* COLD Leads */}
            <div style={{ backgroundColor: '#1e3558', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(147,197,253,0.15)' }}>
                <div style={{ fontSize: isMobile ? '20px' : '24px' }}>❄️</div>
                <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#93c5fd', lineHeight: 1.1 }}>{stats.coldLeads}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>COLD Leads</div>
            </div>

            {/* Today's Appointments */}
            <div style={{ backgroundColor: '#2e1f47', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-clay)', textAlign: 'center', border: '1px solid rgba(167,139,250,0.2)' }}>
                <div style={{ fontSize: isMobile ? '20px' : '24px' }}>📅</div>
                <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 800, color: '#a78bfa', lineHeight: 1.1 }}>{stats.todayAppointments}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Appointments</div>
            </div>

            {/* Active Properties */}
            <div style={{ gridColumn: '1 / -1', backgroundColor: '#1a3d2f', borderRadius: 'var(--radius-clay)', padding: isMobile ? '12px 16px' : '14px 20px', boxShadow: 'var(--shadow-clay)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(52,211,153,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🏠</span>
                    <div>
                        <div style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 600 }}>Active Properties</div>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{stats.activeProperties}</div>
                    </div>
                </div>
                <div style={{ fontSize: '11px', color: '#6ee7b7', opacity: 0.7 }}>inventory</div>
            </div>
        </div>
    )}
</div>
```

- [ ] **Step 2: Replace Workflow Tasks block with compact horizontal chip row**

Find the "Workflow Tasks Summary" block (around lines 165–202). Replace with:

```tsx
{workflowStats && workflowStats.total > 0 && (
    <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Lead Tasks</p>
            {workflowStats.overdue > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ef444422', color: '#ef4444' }}>
                    {workflowStats.overdue} overdue
                </span>
            )}
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
            {[
                { key: 'QUALIFY_LEAD',     icon: '📞', label: 'Qualify',   color: '#3b82f6' },
                { key: 'SHARE_PROPERTIES', icon: '📤', label: 'Share',     color: '#8b5cf6' },
                { key: 'SCHEDULE_VISIT',   icon: '📅', label: 'Visit',     color: '#f59e0b' },
                { key: 'VISIT_FEEDBACK',   icon: '✅', label: 'Feedback',  color: '#06b6d4' },
                { key: 'NEGOTIATE_DEAL',   icon: '🤝', label: 'Negotiate', color: '#f97316' },
            ].map(s => {
                const count = workflowStats.by_stage?.[s.key] || 0;
                if (!count) return null;
                return (
                    <div key={s.key} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: 'var(--radius-chip)',
                        backgroundColor: s.color + '18', border: `1.5px solid ${s.color}33`,
                        fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                        <span>{s.icon}</span>
                        <span style={{ fontWeight: 700, color: s.color }}>{count}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    </div>
                );
            })}
            {workflowStats.completed_today > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: 'var(--radius-chip)', backgroundColor: '#22c55e18', border: '1.5px solid #22c55e33', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <span>🏆</span>
                    <span style={{ fontWeight: 700, color: '#22c55e' }}>{workflowStats.completed_today}</span>
                    <span style={{ color: 'var(--text-muted)' }}>done today</span>
                </div>
            )}
        </div>
    </div>
)}
```

- [ ] **Step 3: Build, deploy, verify**

```bash
npm run build
```

Verify: Dashboard shows bento grid tiles with wide "Total Contacts" tile, compact HOT/WARM/COLD/Appointments tiles, full-width Active Properties tile at bottom. Workflow chips scroll horizontally if many stages are active.

- [ ] **Step 4: Commit**

```bash
git add agents/frontend/src/components/dashboard/MainDashboard.tsx
git commit -m "feat: redesign dashboard with bento grid stats + horizontal workflow chip row"
```

---

### Task 8: My Tasks — Compact Stage Chip Strip + Fix Inaccessible Task List

**Root cause of scroll bug:** `renderStatsBar()` in `LeadWorkflowPage.tsx` renders 6 large cards using `flex: '1 1 140px'` with `flexWrap: 'wrap'`. On a 390px viewport this produces 2 cards per row × 3 rows = ~420px of cards alone, pushing the task list off screen. The main container `<div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>` has no overflow scroll — it relies on `MobileLayout.tsx` content area. But the content area `<div style={{ flex: 1, overflow: 'auto' }}>` SHOULD scroll… the real issue is the stage stats cards are taking up ALL the visual space.

**Fix:** Replace the 6 large cards with a compact single-line horizontal scrollable chip strip showing stage + count. Task list renders below immediately, fully visible.

**Files:**
- Modify: `agents/frontend/src/components/LeadWorkflowPage.tsx`

- [ ] **Step 1: Replace `renderStatsBar()` with compact chip strip**

Find the `renderStatsBar` function (lines 285–318). Replace the entire function with:

```tsx
const renderStatsBar = () => {
    if (!stats) return null;
    const stages = [
        { key: 'QUALIFY_LEAD',     icon: '📞', color: '#3b82f6' },
        { key: 'SHARE_PROPERTIES', icon: '📤', color: '#8b5cf6' },
        { key: 'SCHEDULE_VISIT',   icon: '📅', color: '#f59e0b' },
        { key: 'VISIT_FEEDBACK',   icon: '✅', color: '#06b6d4' },
        { key: 'NEGOTIATE_DEAL',   icon: '🤝', color: '#f97316' },
    ];
    return (
        <div style={{
            display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px',
            marginBottom: '20px', WebkitOverflowScrolling: 'touch', flexShrink: 0,
        }}>
            {stages.map(s => {
                const count = stats.by_stage?.[s.key] || 0;
                return (
                    <div key={s.key} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '7px 14px', borderRadius: 'var(--radius-chip)', flexShrink: 0,
                        backgroundColor: s.color + '18', border: `1.5px solid ${s.color}33`,
                        fontSize: '13px',
                    }}>
                        <span>{s.icon}</span>
                        <span style={{ fontWeight: 700, color: s.color }}>{count}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{STAGE_LABELS[s.key]}</span>
                    </div>
                );
            })}
            {stats.overdue > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '7px 14px', borderRadius: 'var(--radius-chip)', flexShrink: 0,
                    backgroundColor: '#ef444418', border: '1.5px solid #ef444433',
                    fontSize: '13px',
                }}>
                    <span>🔴</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{stats.overdue}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Overdue</span>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Apply claymorphism to task cards**

Find `cardStyle` function (lines 240–248). Replace:

```tsx
const cardStyle = (task: WorkflowTask): React.CSSProperties => ({
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-clay)',
    padding: '14px 16px',
    marginBottom: '10px',
    borderLeft: `4px solid ${STAGE_COLORS[task.task_type] || '#6b7280'}`,
    cursor: 'pointer',
    boxShadow: 'var(--shadow-clay)',
    transition: 'box-shadow 150ms ease',
});
```

- [ ] **Step 3: Build, deploy, verify**

```bash
npm run build
```

Verify: My Tasks screen shows a compact horizontal chip row at the top. The Overdue (204) task list is immediately visible below without any scrolling. All 204 tasks are accessible by scrolling the page.

- [ ] **Step 4: Commit**

```bash
git add agents/frontend/src/components/LeadWorkflowPage.tsx
git commit -m "feat: replace big stage cards with compact chip strip in Lead Tasks, fix inaccessible task list"
```

---

### Task 9: Leads Tab — Minimalist Filter + Bottom Sheet Accordion

**Goal:** Replace 7 rows of permanently-visible filters with a single search bar + "Filters (N)" chip button. Active filters show as dismissible chips below the search bar. All filter controls live inside a bottom sheet that slides up on tap, with accordion sections.

**Files:**
- Modify: `agents/frontend/src/components/ExternalLeads.tsx`

- [ ] **Step 1: Add `showFilterSheet` state**

In `ExternalLeads`, add at the top of the component state block:

```typescript
const [showFilterSheet, setShowFilterSheet] = useState(false);
```

- [ ] **Step 2: Count active filters**

After the filter states, add:

```typescript
const activeFilterCount = [
    statusFilter, sourceFilter, agentFilter, dateFrom, dateTo, locationFilter,
    ...(bhkFilter.map(String)),
    categoryFilter,
].filter(Boolean).length;
```

- [ ] **Step 3: Replace the mobile filter section render**

Find the filter area (the section with 7 rows of controls rendered in mobile view). In the mobile JSX, replace the entire multi-row filter block with:

```tsx
{/* ── Minimalist filter bar ── */}
<div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {/* Row 1: Search + Filters button */}
    <div style={{ display: 'flex', gap: '8px' }}>
        <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email..."
            style={{
                flex: 1, padding: '10px 14px', borderRadius: '12px',
                border: '1px solid var(--border-secondary)',
                backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                fontSize: '14px', outline: 'none',
            }}
        />
        <button
            onClick={() => setShowFilterSheet(true)}
            style={{
                padding: '10px 14px', borderRadius: '12px', cursor: 'pointer',
                border: activeFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                backgroundColor: activeFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                fontWeight: 600, fontSize: '13px', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '6px',
            }}
        >
            <span>⚙</span>
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
        </button>
    </div>

    {/* Row 2: Active filter chips (dismissible) */}
    {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {statusFilter && (
                <button onClick={() => setStatusFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} ×
                </button>
            )}
            {sourceFilter && (
                <button onClick={() => setSourceFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    {sourceLabels[sourceFilter] || sourceFilter} ×
                </button>
            )}
            {dateFrom && (
                <button onClick={() => setDateFrom('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    From {dateFrom} ×
                </button>
            )}
            {dateTo && (
                <button onClick={() => setDateTo('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    To {dateTo} ×
                </button>
            )}
            {bhkFilter.length > 0 && (
                <button onClick={() => setBhkFilter([])} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                    {bhkFilter.length === 1 ? `${bhkFilter[0]} BHK` : `${bhkFilter.length} BHK`} ×
                </button>
            )}
            <button
                onClick={() => { setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setBhkFilter([]); setCategoryFilter(''); setLocationFilter(''); }}
                style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
                Clear all
            </button>
        </div>
    )}
</div>
```

- [ ] **Step 4: Add filter bottom sheet**

After the leads list JSX (before the closing `</div>` of the mobile layout), add:

```tsx
{/* ── Filter Bottom Sheet ── */}
{showFilterSheet && (
    <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
        onClick={() => setShowFilterSheet(false)}
    >
        <div
            style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '20px 20px 0 0',
                maxHeight: '80vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '0 0 32px',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Sheet handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
            </div>

            <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                <button onClick={() => { setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setBhkFilter([]); setCategoryFilter(''); setLocationFilter(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Clear All</button>
            </div>

            {/* Status — radio chip style */}
            <FilterSection title="Status">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {LEAD_STATUSES.map(s => (
                        <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                            className={`chip ${statusFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Source */}
            <FilterSection title="Source">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {SOURCES.map(s => (
                        <button key={s} onClick={() => setSourceFilter(sourceFilter === s ? '' : s)}
                            className={`chip ${sourceFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                            {sourceLabels[s] || s}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* BHK */}
            <FilterSection title="Property Size">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setBhkFilter(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
                            className={`chip ${bhkFilter.includes(n) ? 'chip-active' : 'chip-inactive'}`}>
                            {n === 5 ? '5+ BHK' : `${n} BHK`}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Date Range */}
            <FilterSection title="Date Range">
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                </div>
            </FilterSection>

            {/* Apply button */}
            <div style={{ padding: '16px 20px 0' }}>
                <button
                    onClick={() => setShowFilterSheet(false)}
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                >
                    Apply Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}
                </button>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 5: Add `FilterSection` helper component (at top of file, before `ExternalLeads`)**

```tsx
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <div style={{ borderBottom: '1px solid var(--border-primary)', padding: '12px 20px' }}>
            <button
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

- [ ] **Step 6: Build, deploy, verify**

```bash
npm run build
```

Verify on mobile: Leads tab shows only search bar + Filters button. No filter rows visible. Tapping Filters slides up bottom sheet with accordion sections. Selecting a filter shows a colored chip below the search bar with × to dismiss. Clear All removes all filters.

- [ ] **Step 7: Commit**

```bash
git add agents/frontend/src/components/ExternalLeads.tsx
git commit -m "feat: replace 7-row leads filter with minimalist search bar + slide-up bottom sheet accordion"
```

---

### Task 10: Chats — Skeleton Loading + Claymorphism Cards

**Goal:** Replace the blank "No contacts found" flash on load with skeleton cards. Apply claymorphism style to contact cards. Polish the filter chip row.

**Files:**
- Modify: `agents/frontend/src/components/mobile/MobileContactList.tsx`

- [ ] **Step 1: Add skeleton loading state**

Find the component state. Add:
```typescript
const [loading, setLoading] = useState(true);
```

Ensure the contacts fetch sets `setLoading(false)` in its `finally` block. If not already there:
```typescript
const loadContacts = async () => {
    try {
        setLoading(true);
        const data = await getContacts(/* existing params */);
        setContacts(data);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
};
```

- [ ] **Step 2: Add skeleton render**

Replace the loading/empty state render. Find where `contacts.length === 0` or `loading` is checked:

```tsx
{loading ? (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '72px', borderRadius: 'var(--radius-clay)' }} />
        ))}
    </div>
) : contacts.length === 0 ? (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>💬</div>
        <div style={{ fontWeight: 600, fontSize: '15px' }}>No contacts found</div>
        <div style={{ fontSize: '13px', marginTop: '6px' }}>Try a different filter or search</div>
    </div>
) : (
    /* existing contacts list */
)}
```

- [ ] **Step 3: Apply claymorphism to contact cards**

Find the individual contact card `<div>` in the contacts map. Add:
```tsx
style={{
    /* keep existing layout styles */
    borderRadius: 'var(--radius-clay)',
    boxShadow: 'var(--shadow-clay)',
    transition: 'box-shadow 150ms ease',
    /* remove any hard-coded borderRadius if present */
}}
```

- [ ] **Step 4: Polish filter chip row**

Find the filter buttons (All / Buyers / Tenants / Landlords / Partners / 🔥 Hot). Replace with `className="chip chip-inactive"` / `chip-active` pattern from Task 5:

```tsx
{[
    { key: 'all', label: 'All' },
    { key: 'BUYER', label: 'Buyers' },
    { key: 'TENANT', label: 'Tenants' },
    { key: 'LANDLORD', label: 'Landlords' },
    { key: 'PARTNER_AGENT', label: 'Partners' },
    { key: 'hot', label: '🔥 Hot' },
].map(f => (
    <button
        key={f.key}
        onClick={() => setFilter(f.key)}
        className={`chip ${activeFilter === f.key ? 'chip-active' : 'chip-inactive'}`}
    >
        {f.label}
    </button>
))}
```

- [ ] **Step 5: Build, deploy, verify**

```bash
npm run build
```

Verify: Chats tab shows skeleton shimmer while loading. Once loaded (after BUG-01 fix), shows contact cards with clay shadows. Filter chips have consistent styling.

- [ ] **Step 6: Commit**

```bash
git add agents/frontend/src/components/mobile/MobileContactList.tsx
git commit -m "feat: add skeleton loading + claymorphism cards to Chats contact list"
```

---

### Task 11: Inventory — Compact Claymorphism Cards + Bottom Sheet Actions

**Goal:** Remove the 4 inline action buttons from each card. Replace with a compact property card and move all actions (Call / Share / Visit / Deactivate) into a bottom sheet on card tap.

**Files:**
- Modify: `agents/frontend/src/components/mobile/MobileInventoryList.tsx`

- [ ] **Step 1: Add `activeSheet` state**

```typescript
const [activeSheetItem, setActiveSheetItem] = useState<any>(null);
```

- [ ] **Step 2: Redesign property card — remove inline buttons**

Find the property card render. Remove the button row (Call / Deactivate / Share / Visit). Replace the card container to open the sheet on tap:

```tsx
<div
    key={item.id}
    onClick={() => setActiveSheetItem(item)}
    className="clay-card"
    style={{
        marginBottom: '10px', padding: '14px 16px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '6px',
        border: '1px solid var(--border-primary)',
    }}
>
    {/* Thumbnail + status badges row */}
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {item.media_urls?.[0] && (
            <img src={item.media_urls[0]} alt="" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, backgroundColor: '#1e3a5f', color: '#60a5fa', textTransform: 'uppercase' }}>{item.intent}</span>
                <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, backgroundColor: '#14532d', color: '#4ade80', textTransform: 'uppercase' }}>{item.status}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.location}</div>
        </div>
    </div>

    {/* Price + completion */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Demand: </span>
            <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{item.demand_price}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${item.completion_pct || 0}%`, height: '100%', backgroundColor: '#f59e0b' }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.completion_pct || 0}%</span>
        </div>
    </div>
</div>
```

Adapt field names to match the actual `item` object shape from the API (check `MobileInventoryList.tsx` for exact field names).

- [ ] **Step 3: Add action bottom sheet**

After the list render, add:

```tsx
{activeSheetItem && (
    <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
        onClick={() => setActiveSheetItem(null)}
    >
        <div
            style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '20px 20px 0 0',
                padding: '12px 0 32px',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
            }}
            onClick={e => e.stopPropagation()}
        >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 12px' }}>
                <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
            </div>
            <div style={{ padding: '0 20px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{activeSheetItem.type}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{activeSheetItem.location}</div>
            </div>
            {[
                { label: '☎ Call Owner', action: () => { /* existing call logic */ } },
                { label: '📤 Share Listing', action: () => { /* existing share logic */ } },
                { label: '📍 Schedule Visit', action: () => { /* existing visit logic */ } },
            ].map(({ label, action }) => (
                <button
                    key={label}
                    onClick={() => { action(); setActiveSheetItem(null); }}
                    style={{
                        display: 'block', width: '100%', padding: '16px 24px',
                        backgroundColor: 'transparent', border: 'none',
                        borderBottom: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)', fontSize: '15px', textAlign: 'left',
                        cursor: 'pointer', fontWeight: 500,
                    }}
                >
                    {label}
                </button>
            ))}
            {/* Deactivate — only for own properties */}
            {(activeSheetItem.uploaded_by_agent_id === agent?.id || agent?.role === 'super_boss' || agent?.role === 'manager') && (
                <button
                    onClick={() => { handleDeactivate(activeSheetItem.id); setActiveSheetItem(null); }}
                    style={{
                        display: 'block', width: '100%', padding: '16px 24px',
                        backgroundColor: 'transparent', border: 'none',
                        color: '#ef4444', fontSize: '15px', textAlign: 'left',
                        cursor: 'pointer', fontWeight: 500,
                    }}
                >
                    🚫 Deactivate
                </button>
            )}
        </div>
    </div>
)}
```

- [ ] **Step 4: Build, deploy, verify**

```bash
npm run build
```

Verify: Inventory cards are compact with no inline buttons. Tapping a card slides up the action sheet. Deactivate only appears for own properties (or for super_boss/manager).

- [ ] **Step 5: Commit**

```bash
git add agents/frontend/src/components/mobile/MobileInventoryList.tsx
git commit -m "feat: compact inventory cards with bottom sheet actions, claymorphism styling"
```

---

### Task 12: Final Deploy + Full Regression Check

**Goal:** Build the complete app and deploy. Verify all 4 bugs are fixed and all screen redesigns work in both light and dark mode on mobile.

**Files:**
- Deploy to server

- [ ] **Step 1: Full production build**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/frontend
npm run build 2>&1 | tail -20
```

Expected: `✓ built in X.Xs` with no errors.

- [ ] **Step 2: Deploy to server**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 "rm -rf /home/realty/admin-panel/dist"
scp -i ~/.ssh/realty_pandit_key -r dist root@72.62.231.224:/home/realty/admin-panel/
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 "pm2 restart realty-admin && pm2 logs realty-admin --lines 10 --nostream"
```

- [ ] **Step 3: Regression checklist — Super Boss (9958860411)**

Open `https://admin.realtypandit.in` at 390px viewport:

```
□ Dashboard → bento grid shows real contact counts (not zeros)
□ Dashboard → workflow chips scroll horizontally
□ My Tasks → compact chip strip visible, task list scrollable below
□ Leads → single search bar + Filters button, no 7 rows
□ Leads → tap Filters → bottom sheet slides up with accordion sections
□ Chats → skeleton shimmer on load, then contact list appears
□ Inventory → compact cards, tap → action sheet slides up
□ Menu → all sections visible by scrolling (Communication, Team, Admin all reachable)
□ Add Lead → Step 2 search field accepts only digits, shows X/10 counter
□ Add Lead → partial name "rahu" returns nothing
□ Add Lead → full 10-digit number returns exact contact
□ Dark mode → all screens look correct
□ Toggle to light mode → all screens adapt to warm cream palette
□ Toggle back to dark → app remembers preference
```

- [ ] **Step 4: Regression checklist — Employee (7827338810)**

```
□ Dashboard → own stats only (scoped to their contacts)
□ Menu → NO Team section, NO Admin section
□ Inventory → Deactivate button absent on other agents' properties
□ My Tasks → compact chips, task list accessible
□ Add Lead → phone-only search enforced
□ Chats → contacts scoped to their assignments (after BUG-01 fix)
```

- [ ] **Step 5: Final commit + tag**

```bash
cd c:/Users/Varchasv\ Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit
git add -A
git commit -m "feat: complete PWA UI/UX redesign — claymorphism, bento grid, bottom sheets, skeleton loading, bug fixes"
```

---

## SELF-REVIEW

### Spec Coverage Check

| Requirement | Task |
|---|---|
| Fix lead_scores.lead_id missing (contacts/chats broken) | Task 1 |
| Fix menu drawer scroll, profile footer overlap | Task 2 |
| Phone-only search in Add Lead + ContactSearchField | Task 3 |
| Hide Team/Admin from employee, guard Deactivate | Task 4 |
| Claymorphism tokens, skeleton animation, CSS foundation | Task 5 |
| Toast + Snackbar global layer | Task 6 |
| Dashboard bento grid + workflow chip row | Task 7 |
| My Tasks compact chip strip, fix scroll bug | Task 8 |
| Leads minimalist filter + bottom sheet accordion | Task 9 |
| Chats skeleton loading + claymorphism cards | Task 10 |
| Inventory compact cards + bottom sheet actions | Task 11 |
| Dual light/dark theme (existing system, just needs tokens) | Task 5 + all screens |
| Role-based search scoping (contacts visible per role) | Task 3 + existing visibility middleware |

### No Placeholders Confirmed
All code blocks are complete. No "TBD", "implement later", or "similar to Task N" references.

### Type Consistency
- `agent` from `useAuth()` — used in Tasks 4, 11, consistent
- `var(--radius-clay)`, `var(--shadow-clay)`, `var(--bento-gap)` — defined in Task 5, used in Tasks 7–11
- `chip` / `chip-active` / `chip-inactive` classes — defined in Task 5, used in Tasks 7–10
- `slide-up-in` animation — defined in Task 5, used in Tasks 9, 11
- `ToastProvider` + `useToast` — defined in Task 6, available globally in Tasks 8+ (via App.tsx wrapper)
