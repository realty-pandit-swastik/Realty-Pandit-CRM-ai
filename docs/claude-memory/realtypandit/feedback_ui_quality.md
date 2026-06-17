---
name: UI Must Look Human-Designed, Never AI-Generated
description: CRITICAL feedback — all UI/UX output must look like a professional human designer made it, not an AI. Use design skills EVERY time. No generic gradients, no AI purple/pink, no cookie-cutter layouts.
type: feedback
---

# UI Must Look Human-Designed — NEVER AI-Generated

User has repeatedly flagged that the website UI/UX still looks AI-generated. This is a top-priority complaint.

**Why:** The current layouts, color choices, and component designs feel like default AI output — generic gradients, predictable card grids, no personality, no brand consistency. A real estate platform needs to feel premium, trustworthy, and unique — not like a template.

**How to apply:**
1. **ALWAYS invoke `frontend-design` skill** before writing ANY UI code — pages, components, sections
2. **ALWAYS invoke `ui-ux-pro-max` skill** for design system generation — it has 161 reasoning rules, 67 UI styles, real-estate-specific patterns, and anti-AI-aesthetic checks
3. **ALWAYS invoke `theme-factory` or `brand-guidelines`** when establishing or enforcing visual consistency
4. **NEVER** use generic AI patterns: purple/pink gradients, symmetric card grids, oversized hero sections with stock-photo vibes, rounded-everything, gradient text
5. **DO** use: asymmetric layouts, real typography pairing (from Google Fonts), purposeful whitespace, brand-consistent colors, subtle micro-interactions, content-first design
6. **framer-motion** is available for animations but MUST use `"use client"` directive in Next.js — never import in Server Components (bug was fixed 2026-03-19)
7. Before deploying any UI change, visually verify it doesn't look AI-generated
8. Study competitor real estate sites (99acres, MagicBricks, Housing.com) for design benchmarks — Realty Pandit should match or exceed their design quality

## Admin analytics / dashboards (2026-06-15)

User rejected the analytics tabs as "the boring old pie chart and the graph" — stock recharts defaults are NOT acceptable. For ANY Realty Pandit dashboard/analytics work:
- Build on the reusable **clay analytics kit** at `agents/frontend/src/components/dashboard/analytics/` — `clay.tsx` (ClayCard, KpiCard w/ delta+sparkline), `charts.tsx` (SourceDonut, Funnel, HealthBar, AgeingBars, Leaderboard w/ score-ring, CategoryDonut, ValueBars), `FilterBar.tsx` (sticky FilterBar + date-only RangeBar + agent/source multiselects), `leadData.ts` (client-side narrowing over role-scoped `/api/contacts`). A **distinct treatment per function** — never a generic pie+table.
- Reuse the home-tab clay+bento language (`--shadow-clay`, `--radius-clay`); **light AND dark must both work** (charts recolor via `useTheme`).
- User judges UI by the **DEPLOYED browser result, not editor code** — must deploy so they can see it (don't expect them to trust the diff).
- Gotcha fixed 2026-06-15: components referenced **undefined** CSS tokens `--border-color`/`--primary` (borders/accents rendered transparent → "unfinished" look); real tokens are `--border-secondary`/`--accent-primary` (now aliased in index.css).
