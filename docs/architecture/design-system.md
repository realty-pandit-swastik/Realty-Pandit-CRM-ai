---
name: Realty Pandit Design System & UI Guidelines
description: Design language, component patterns, and UI rules for website, admin panel, and PWA — applies to ALL platforms simultaneously
type: project
---

# Realty Pandit — Design System (Locked 2026-04-10)

## Core Principle
Match existing color theme. Layout can be changed and improved. Design should feel premium, human, not AI-generic.

## Platforms — ALL Must Be Updated Together
- **Website** → Next.js (`agents/website/`)
- **PWA** → Same codebase as website, but PWA-optimized (mobile-first, offline-ready)
- **Admin Panel** → React + Vite (`agents/frontend/`) — CSS custom properties, NO Tailwind

> RULE: If a UI change is made to the website, the PWA version of that component must also be reviewed and updated in the same task. They share code so often it's automatic — but always verify.

## Design Techniques to Use

### 1. Claymorphism
- Soft rounded shapes (border-radius: 20px–32px)
- Subtle drop shadows with color tint (not pure black)
- Creamy/pastel tones layered over white
- Slight 3D feel — inner glow + outer shadow
- Use on: cards, buttons, modals, feature tiles

### 2. Minimalism
- Lots of white space — don't crowd elements
- One primary action per section
- Remove anything decorative that doesn't add meaning
- Typography hierarchy: one big, one medium, one small — nothing else
- Use on: all pages as base principle

### 3. Skeleton Loading
- Show animated placeholder before content loads
- Match shape of actual content (card skeleton = same dimensions as card)
- Pulse animation (opacity 0.4 → 1 → 0.4)
- Use on: property tiles, dashboard stats, any async data

### 4. Radio Button Style (Segmented Control)
- Pill-shaped toggle group for mutually exclusive options
- Selected state: filled background + white text
- Use on: Buy/Rent toggle, filter type selectors, view switchers

### 5. Snackbar
- Thin horizontal bar, slides in from bottom or top
- Quick info bite — disappears after 3–4 seconds
- No close button needed for info; add X for warnings
- Use on: "Filter applied", "Property saved", "Copied link"

### 6. Chip / Chip Dev
- Small pill tags for filters, categories, tags
- Dismissible (X on chip) or selectable (highlight on click)
- Use on: active filters display, property tags (BHK, Furnished, etc.), search suggestions

### 7. Accordion
- Collapsible section with chevron indicator
- Smooth expand/collapse animation (200–300ms ease)
- Use on: filter sidebar sections, FAQ, property details

### 8. Toast Notification
- Pops up from bottom-right corner
- Contains icon + short message + optional action button
- Auto-dismiss after 4 seconds, stackable
- Use on: "Schedule visit confirmed", "Property shared", "Error saving"

### 9. Bento Grid
- Asymmetric grid layout — cards of different sizes
- Large feature card + smaller info cards around it
- Use on: Homepage hero stats, Admin dashboard, Property detail page

### 10. Additional Patterns to Apply
- **Glassmorphism** (subtle) — frosted glass effect on overlays, nav on scroll
- **Micro-animations** — hover lift (translateY -2px), button press (scale 0.97)
- **Progressive disclosure** — show minimal info, expand on demand
- **Empty states** — illustrated, not just text "No results found"
- **Floating labels** — form inputs with animated labels
- **Sticky filter** — filter sidebar stays fixed during scroll (`position: sticky; top: 80px`)

## Color Theme (existing — do not change)
- Primary: Realty Pandit red/brand color (from existing CSS)
- Match all new components to existing CSS custom properties
- Admin panel uses CSS custom properties (not Tailwind) — use `var(--color-*)` 

## What NOT to Do
- No AI-purple/pink generic gradients
- No cookie-cutter layouts that look like a template
- No cluttered cards with too much info
- No bare "No results" text without illustration
- No layout changes without mobile/PWA check

## Implementation Notes
- Website: Tailwind v4 classes + custom CSS where needed
- Admin: CSS custom properties only, no Tailwind
- PWA: Same as website — test on mobile viewport (375px)
- Always do skeleton loading for any component hitting an API
- Toast system: implement once, use globally via context/store

## Admin Panel PWA — IMPLEMENTED (2026-04-12)
All design techniques are now live in the admin PWA:
- **CSS tokens**: `--shadow-clay`, `--radius-clay`, `--radius-chip`, `--skeleton-base/shine`, `--sheet-backdrop`, `--bento-gap`, `--toast-bg/text`, `--theme-transition` in `index.css`
- **Keyframes**: `skeleton-shimmer`, `slide-up-in`, `slide-up-out`, `fade-stagger`, `toast-in`
- **Utility classes**: `.skeleton`, `.clay-card` (+ `:hover`), `.chip`, `.chip-active`, `.chip-inactive`
- **ToastContext**: `contexts/ToastContext.tsx` + `components/ui/Toast.tsx` — use `useToast()` anywhere
- **Bottom Sheet pattern**: fixed overlay (`var(--sheet-backdrop)`) + inner div with `animation: slide-up-in` + drag handle
- **FilterSection accordion**: defined in `ExternalLeads.tsx` — reusable pattern for any filter sheet
- See `memory/project_pwa_redesign.md` for full implementation details
