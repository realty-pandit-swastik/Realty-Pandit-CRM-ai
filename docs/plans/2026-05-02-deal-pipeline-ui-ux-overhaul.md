# Deal Pipeline UI/UX Overhaul — Light & Dark Mode (Web + PWA)

## Context

The Deal Pipeline at admin.realtypandit.in has critical visibility and usability issues in **light mode** (the default for many users). Issues confirmed via screenshot review and full code audit:

1. Lead source (99acres / MagicBricks / Housing / Facebook / Website) is **completely missing** from deal cards — team cannot tell where a lead came from at a glance
2. Stage info line ("🤖 AI calling... 4m ago") uses hardcoded `#9ca3af` — contrast ratio **2.85:1** (WCAG AA minimum is 4.5:1) — nearly invisible on white
3. Action buttons ("Log My Call", "Share Property") use 10% opacity backgrounds — invisible in light mode
4. Deal scenario + coordinator tags use hardcoded light-mode hex colors that break in dark mode and wash out in bright light
5. Tag font is 9px — below readable threshold
6. Kanban columns have **no border** — bleed into page background in light mode
7. Deal cards barely stand out from column background in light mode (white on off-white)
8. PWA `theme-color` meta tag is hardcoded dark — browser chrome colour never adapts to light mode
9. PWA manifest `theme_color` doesn't reflect the actual dark background colour

Both kanban (web/desktop) and mobile card list (PWA) share the same component code and are both affected.

---

## Architecture Notes

- **No Tailwind** — pure CSS custom properties (`:root` / `.dark` on `<html>`)
- **Theme toggle** — `ThemeContext.tsx` adds/removes `.dark` class on `<html>`, persisted to `localStorage('rp-theme')`
- **All components** use inline styles referencing `var(--css-var)` — no Tailwind class names
- **PWA** — Vite Plugin PWA, manifest defined in `vite.config.ts`, single `theme-color` in `index.html`
- **`source` field** — exists on Transaction in DB, returned from `GET /api/deals` (Prisma returns all fields), but **not typed** in frontend Deal interface and never rendered

---

## Files to Modify

| File | Changes |
|---|---|
| `frontend/src/index.css` | Add source badge + tag + card/column CSS variables for light + dark |
| `frontend/src/components/DealPipeline.tsx` | All card, tag, button, column, source badge fixes |
| `frontend/src/api/client.ts` | Add `source?: string` to Deal interface |
| `frontend/index.html` | Replace single `theme-color` with two media-query variants |
| `frontend/vite.config.ts` | Update PWA manifest `theme_color` and `background_color` |

---

## Step-by-Step Implementation Plan

---

### Step 1 — index.css: Add Themed CSS Variables

**Location:** `frontend/src/index.css`

Add to `:root` (light mode section, after existing variables):

```css
/* ── Source badge colours (light) ── */
--tag-99acres-bg:       #fef3c7; --tag-99acres-text:       #92400e;
--tag-magicbricks-bg:   #ffedd5; --tag-magicbricks-text:   #9a3412;
--tag-housing-bg:       #dcfce7; --tag-housing-text:       #166534;
--tag-facebook-bg:      #ede9fe; --tag-facebook-text:      #5b21b6;
--tag-website-bg:       #dbeafe; --tag-website-text:       #1e40af;
--tag-whatsapp-bg:      #dcfce7; --tag-whatsapp-text:      #166534;
--tag-source-default-bg:#f1f5f9; --tag-source-default-text:#475569;

/* ── Scenario / coordinator tag colours (light) ── */
--tag-blue-bg:   #dbeafe; --tag-blue-text:   #1d4ed8;
--tag-green-bg:  #dcfce7; --tag-green-text:  #166534;

/* ── Column + card improvements (light) ── */
--column-border: #e2e8f0;
--card-shadow:   0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05);
--card-shadow-hover: 0 3px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.07);

/* ── Action button improvements (light) ── */
--btn-blue-bg:    rgba(59,130,246,0.10); --btn-blue-border:  rgba(59,130,246,0.45); --btn-blue-text:   #1d4ed8;
--btn-purple-bg:  rgba(79,70,229,0.10);  --btn-purple-border:rgba(79,70,229,0.45);  --btn-purple-text: #4338ca;
--btn-amber-bg:   rgba(245,158,11,0.10); --btn-amber-border: rgba(245,158,11,0.50); --btn-amber-text:  #92400e;
--btn-cyan-bg:    rgba(6,182,212,0.10);  --btn-cyan-border:  rgba(6,182,212,0.45);  --btn-cyan-text:   #0e7490;
--btn-green-bg:   rgba(34,197,94,0.10);  --btn-green-border: rgba(34,197,94,0.45);  --btn-green-text:  #166534;
--btn-orange-bg:  rgba(249,115,22,0.10); --btn-orange-border:rgba(249,115,22,0.45); --btn-orange-text: #9a3412;
--btn-gray-bg:    rgba(107,114,128,0.10);--btn-gray-border:  rgba(107,114,128,0.40);--btn-gray-text:   #374151;
```

Add to `.dark` (dark mode section, after existing variables):

```css
/* ── Source badge colours (dark) ── */
--tag-99acres-bg:       #78350f; --tag-99acres-text:       #fde68a;
--tag-magicbricks-bg:   #7c2d12; --tag-magicbricks-text:   #fed7aa;
--tag-housing-bg:       #14532d; --tag-housing-text:       #86efac;
--tag-facebook-bg:      #2e1065; --tag-facebook-text:      #c4b5fd;
--tag-website-bg:       #1e3a5f; --tag-website-text:       #93c5fd;
--tag-whatsapp-bg:      #14532d; --tag-whatsapp-text:      #86efac;
--tag-source-default-bg:#1e293b; --tag-source-default-text:#94a3b8;

/* ── Scenario / coordinator tag colours (dark) ── */
--tag-blue-bg:   #1e3a5f; --tag-blue-text:   #93c5fd;
--tag-green-bg:  #14532d; --tag-green-text:  #86efac;

/* ── Column + card improvements (dark) ── */
--column-border: #334155;
--card-shadow:   0 1px 4px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04);
--card-shadow-hover: 0 3px 12px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.07);

/* ── Action button improvements (dark) ── */
--btn-blue-bg:    rgba(59,130,246,0.18); --btn-blue-border:  rgba(59,130,246,0.60); --btn-blue-text:   #93c5fd;
--btn-purple-bg:  rgba(79,70,229,0.18);  --btn-purple-border:rgba(79,70,229,0.60);  --btn-purple-text: #a5b4fc;
--btn-amber-bg:   rgba(245,158,11,0.18); --btn-amber-border: rgba(245,158,11,0.60); --btn-amber-text:  #fde68a;
--btn-cyan-bg:    rgba(6,182,212,0.18);  --btn-cyan-border:  rgba(6,182,212,0.60);  --btn-cyan-text:   #67e8f9;
--btn-green-bg:   rgba(34,197,94,0.18);  --btn-green-border: rgba(34,197,94,0.60);  --btn-green-text:  #86efac;
--btn-orange-bg:  rgba(249,115,22,0.18); --btn-orange-border:rgba(249,115,22,0.60); --btn-orange-text: #fed7aa;
--btn-gray-bg:    rgba(107,114,128,0.18);--btn-gray-border:  rgba(107,114,128,0.55);--btn-gray-text:   #d1d5db;
```

---

### Step 2 — api/client.ts: Expose source Field

**Location:** `frontend/src/api/client.ts` — Deal interface

Add `source?: string;` to the Deal interface alongside `deal_scenario`. The field is already returned by the API (Prisma returns all Transaction fields).

---

### Step 3 — DealPipeline.tsx: All Card Fixes

**Location:** `frontend/src/components/DealPipeline.tsx`

#### 3A — Import useTheme

```tsx
import { useTheme } from '../contexts/ThemeContext';
// inside component:
const { theme } = useTheme();
```

#### 3B — Replace actionBtnStyle with theme-aware version

Replace the current function at line ~211 with:

```tsx
const actionBtnStyle = (variant: 'blue'|'purple'|'amber'|'cyan'|'green'|'orange'|'gray'): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '7px',
    fontSize: '12px',
    fontWeight: 700,
    backgroundColor: `var(--btn-${variant}-bg)`,
    border: `1.5px solid var(--btn-${variant}-border)`,
    color: `var(--btn-${variant}-text)`,
    cursor: 'pointer',
    flex: 1,
    transition: 'background-color 150ms ease, border-color 150ms ease',
});
```

Update all 14 action button call sites (both kanban and mobile view) to use variants:
- "Log My Call" → `actionBtnStyle('blue')`
- "Share Property" → `actionBtnStyle('purple')`
- "Schedule Visit" → `actionBtnStyle('amber')`
- "Confirm Appointment" → `actionBtnStyle('green')`
- "Outcome" → `actionBtnStyle('amber')`
- "I Reminded" → `actionBtnStyle('cyan')`
- "Log Update" → `actionBtnStyle('orange')`
- "Review / Revive" → `actionBtnStyle('gray')`
- "Transfer" → `actionBtnStyle('green')`
- "Commissions" → `actionBtnStyle('amber')`

#### 3C — Add Source Badge Helper (above component return)

```tsx
const SOURCE_BADGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    '99acres':       { label: '99acres',      bg: 'var(--tag-99acres-bg)',        text: 'var(--tag-99acres-text)' },
    'magicbricks':   { label: 'MagicBricks',  bg: 'var(--tag-magicbricks-bg)',    text: 'var(--tag-magicbricks-text)' },
    'housing':       { label: 'Housing.com',  bg: 'var(--tag-housing-bg)',         text: 'var(--tag-housing-text)' },
    'facebook':      { label: 'Facebook',     bg: 'var(--tag-facebook-bg)',        text: 'var(--tag-facebook-text)' },
    'website':       { label: 'Website',      bg: 'var(--tag-website-bg)',         text: 'var(--tag-website-text)' },
    'whatsapp':      { label: 'WhatsApp',     bg: 'var(--tag-whatsapp-bg)',        text: 'var(--tag-whatsapp-text)' },
    'manual':        { label: 'Manual',       bg: 'var(--tag-source-default-bg)', text: 'var(--tag-source-default-text)' },
    'partner_portal':{ label: 'Partner',      bg: 'var(--tag-facebook-bg)',        text: 'var(--tag-facebook-text)' },
};

const renderSourceBadge = (source?: string) => {
    if (!source) return null;
    const cfg = SOURCE_BADGE_CONFIG[source.toLowerCase()] ?? {
        label: source, bg: 'var(--tag-source-default-bg)', text: 'var(--tag-source-default-text)',
    };
    return (
        <span style={{
            fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
            backgroundColor: cfg.bg, color: cfg.text, whiteSpace: 'nowrap',
        }}>
            {cfg.label}
        </span>
    );
};
```

#### 3D — Fix Tags Row (both Kanban card ~L702 and Mobile card ~L513)

Replace hardcoded hex colors with CSS variables, bump font size, add source badge:

```tsx
{/* Tags Row */}
<div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
    {/* Source badge — NEW */}
    {renderSourceBadge((deal as any).source)}

    {deal.deal_scenario && (
        <span style={{
            fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
            backgroundColor: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)', fontWeight: 600,
        }}>
            {SCENARIO_LABELS[deal.deal_scenario] || deal.deal_scenario}
        </span>
    )}
    {deal.coordinator?.name && (
        <span style={{
            fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
            backgroundColor: 'var(--tag-green-bg)', color: 'var(--tag-green-text)', fontWeight: 600,
        }}>
            {deal.coordinator.name}
        </span>
    )}
</div>
```

Apply identical change in **both** the mobile card list section (~L513) and the kanban card section (~L702).

#### 3E — Fix Stage Info Line Color (lines 696 and 507)

Change both instances from hardcoded `color: '#9ca3af'` to `color: 'var(--text-muted)'`.

`--text-muted` = `#64748b` in light (contrast 5.7:1 on white ✓ WCAG AA) and `#94a3b8` in dark (contrast 5.9:1 on #0f172a ✓ WCAG AA).

#### 3F — Kanban Column — Add Border

At line ~628 where the column div is defined, add:
```tsx
border: '1px solid var(--column-border)',
```
to the existing style object.

#### 3G — Kanban Deal Cards — Add Shadow

At line ~664 where deal cards are defined, replace the manual `onMouseEnter/onMouseLeave` shadow hack with:
```tsx
style={{
    ...existing styles,
    boxShadow: 'var(--card-shadow)',
}}
// Remove onMouseEnter and onMouseLeave handlers — replace with:
onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)')}
onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'var(--card-shadow)')}
```

#### 3H — Mobile Cards — Consistent Border

At line ~465 (mobile card div), the border is already `1px solid var(--border-secondary)` — add `boxShadow: 'var(--card-shadow)'` for parity with kanban.

#### 3I — Pipeline Stats Cards — Active State Indicator

Currently active stage highlights with `backgroundColor: STAGE_COLORS[stage] + '20'`. Add a bottom border stripe for clearer active/inactive differentiation:

```tsx
borderBottom: filterStatus === stage
    ? `3px solid ${STAGE_COLORS[stage]}`
    : '3px solid transparent',
```

---

### Step 4 — index.html: Light + Dark Theme Color

**Location:** `frontend/index.html` — replace line 10:

```html
<!-- BEFORE -->
<meta name="theme-color" content="#1a365d" />

<!-- AFTER -->
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
```

`#ffffff` = light mode page background (`--bg-primary` light)
`#0f172a` = dark mode page background (`--bg-primary` dark)

Also update the apple-mobile-web-app-status-bar-style from `"default"` to `"black-translucent"` for dark mode awareness on iOS Safari.

---

### Step 5 — vite.config.ts: PWA Manifest Colours

**Location:** `frontend/vite.config.ts` — inside VitePWA manifest object:

```ts
// BEFORE
background_color: '#ffffff',
theme_color: '#1a365d',

// AFTER
background_color: '#0f172a',   // splash screen bg — matches dark mode (default)
theme_color: '#0f172a',         // matches --bg-primary dark
```

> **Note:** PWA manifest only supports one theme_color. Since the app defaults to dark mode (`ThemeProvider` defaults to dark if no localStorage preference), using `#0f172a` gives the correct colour for the majority of fresh installs. Users who switch to light mode will get the correct colour from the `index.html` meta tag (which the browser uses live, vs manifest which is used for install).

---

## Scope: What Is NOT Changed

- `LogCallOverlay.tsx` — already uses CSS variables correctly throughout
- `DealDetailModal` — already uses `var(--bg-primary)`, `var(--text-primary)` etc.
- `AIStatusBadge.tsx` — uses inline rgba that works in both modes (green/amber/gray on transparent)
- `QuickCallStrip.tsx` — already uses rgba with reasonable contrast in both modes
- `LogActionModal.tsx` — already theme-aware

---

## Complete Impact Map

### Kanban View (Web/Desktop — Light Mode)
| Element | Before | After |
|---|---|---|
| Column boundary | Invisible (same bg as page) | Clear border (`--column-border`) |
| Deal cards | White on off-white, no depth | Shadow + hover elevation |
| Source badge | Missing | Color-coded badge (e.g. orange for 99acres) |
| Scenario tag | Light blue barely visible | Themed `--tag-blue-bg/text` |
| Coordinator tag | Light green barely visible | Themed `--tag-green-bg/text` |
| Tag font | 9px | 10px |
| Stage info line | #9ca3af (WCAG fail 2.85:1) | `--text-muted` (WCAG pass 5.7:1) |
| Action buttons | 10% opacity invisible bg | Themed `--btn-*-bg/border/text` (12%) |

### Kanban View (Web/Desktop — Dark Mode)
| Element | Before | After |
|---|---|---|
| Source badge | Missing | Color-coded badge (correct dark tones) |
| Action buttons | OK at 10% on dark bg | Better at 18% with stronger borders |
| Tags | Hardcoded light-mode blue/green | Themed dark equivalents |

### Mobile Card List (PWA — Light Mode)
All the same as Kanban above — shared code paths.

### Mobile Card List (PWA — Dark Mode)
Same as Kanban dark mode.

### PWA Browser Chrome
| Element | Before | After |
|---|---|---|
| Address bar colour (light) | Dark blue `#1a365d` (wrong) | White `#ffffff` (correct) |
| Address bar colour (dark) | Dark blue `#1a365d` | Near-black `#0f172a` (correct) |
| Splash screen bg | White (`#ffffff`) | Dark (`#0f172a`) to match app default |

---

## Verification Checklist

### Build
```bash
cd clients/sunny-sharma/projects/reality-pandit/agents/frontend
npm run build   # should complete with no TypeScript errors
npm run dev     # start dev server
```

### Manual Test — Light Mode
1. Toggle to light mode via sidebar button
2. Deal Pipeline kanban: column borders visible, cards have shadow depth
3. Source badge visible on cards (e.g. "99acres" in amber-toned badge)
4. "AI calling... X ago" text readable (not washed out)
5. "Log My Call" button has visible blue border and tinted background
6. Scenario tag ("Direct + Internal") readable in blue
7. Coordinator name tag readable in green

### Manual Test — Dark Mode
1. Toggle to dark mode
2. All badges render with dark-toned equivalents (not the light-mode colours)
3. Action buttons slightly more prominent (18% opacity bg vs 10%)
4. No colour bleed — no `#dbeafe` or `#f0fdf4` appearing (light-only hardcoded values gone)

### PWA / Mobile
1. Install PWA on Android: browser address bar should be white in light mode, dark in dark mode
2. iOS Safari: status bar adapts correctly
3. Mobile card list: source badge visible, info line readable, buttons have clear borders

### Accessibility
- Stage info line: run Lighthouse → contrast should pass WCAG AA (was failing before)
- Action button text: verify `--btn-*-text` colors pass 4.5:1 on their respective backgrounds

---

## Estimated Change Size

| File | Lines Changed |
|---|---|
| `index.css` | +60 new CSS variable lines |
| `DealPipeline.tsx` | ~80 lines modified (no new JSX structure, only style values) |
| `api/client.ts` | +1 line |
| `index.html` | 1 line → 2 lines |
| `vite.config.ts` | 2 lines |

**Total: ~145 lines changed, 0 new files.**
