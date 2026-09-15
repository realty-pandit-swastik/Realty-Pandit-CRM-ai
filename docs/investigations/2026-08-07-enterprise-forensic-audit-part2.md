# Enterprise Digital Forensic Audit — Part 2

**Frontend · Rendering · Performance · SEO / GEO / AEO · Accessibility**
**Date:** 2026-08-07 · **Method:** frontend source read on the live server + real-browser measurement of `https://www.realtypandit.in/` through the Cloudflare edge.

Part 1 (infrastructure, backend, API, data, security) is in `2026-08-07-enterprise-forensic-audit-part1.md`.

---

## 1. Frontend stack (verified)

| | Public website | Admin CRM |
|---|---|---|
| Path | `/var/www/realty-pandit/website` | `/var/www/realty-pandit/frontend` |
| Framework | **Next.js 16.1.6** (App Router) | **React 19.2 + Vite**, `react-router-dom` 7.13 |
| React | 19.2.3 | 19.2 |
| Styling | Tailwind (`clsx`, `tailwind-merge`, `cva`) | **Inline styles** — no Tailwind config |
| Animation | `framer-motion` 12.34 | — |
| Icons | `lucide-react` | `lucide-react` |
| Errors | `@sentry/nextjs` 10.48 | `@sentry/react` 10.48 |
| Notable | — | `recharts`, `@react-google-maps/api`, `jspdf`, `xlsx`, `papaparse` |
| Deps | 10 (very lean) | 12 |
| Source | 174 files, 84 components, **49 routes** | 136 files, **109 components** |
| Build | `.next` 42 MB, 72 chunks, **2.0 MB client JS** | `dist` 16 MB, built **2026-08-01** |

The website dependency list is admirably lean — 10 production dependencies for a 49-route property portal is disciplined.

**Admin build is 6 days behind the backend.** `dist/index.html` dates to 2026-08-01; the newest prod backend commit is 2026-08-03 (`6c08921`, social-bot lead capture). Any admin-visible part of those three August commits is not yet shipped to users.

---

## 2. Measured performance (real browser, through Cloudflare)

| Metric | Value | Assessment |
|---|---|---|
| **TTFB** | **62 ms** | Excellent — Cloudflare is doing its job |
| **First Contentful Paint** | **1,888 ms** | ⚠️ Just over Google's 1,800 ms "good" threshold |
| DOMContentLoaded | 2,000 ms | |
| Load complete | 2,349 ms | |
| Total transferred | 640 KB | Reasonable |
| **Scripts** | **27 files, 417 KB** | 65% of all bytes |
| Largest single chunk | **548 KB** | ⚠️ One chunk is a quarter of all client JS |
| **Network calls on homepage** | **43** (40 fetch + 3 XHR) | ⚠️ High for a landing page |
| DOM nodes | 1,069 | Healthy |

The gap between a 62 ms TTFB and a 1,888 ms first paint is the story: **the server responds almost instantly, then the browser spends ~1.8 s on JavaScript before showing anything.** This is a client-side execution problem, not a hosting problem — and it is the single highest-leverage performance fix available.

---

## 3. Findings

### 🔴 F9 — GlitchTip is blocked by CSP on the public site (HIGH)

Live console:
```
Connecting to 'https://errors.realtypandit.in/…' blocked
Fetch API cannot load https://errors.realtypandit.in/…
```

The site's `content-security-policy` `connect-src` lists `'self'`, `api.realtypandit.in`, Google Analytics and Maps — but **not `errors.realtypandit.in`**.

**Consequence: frontend errors on the public website are not reaching GlitchTip at all.** The observability that exists on paper does not exist in practice for the main site. Any user-facing JS failure has been invisible.

This is **trap #3 in the project's own `feedback_glitchtip_coverage_traps.md`**, recorded on 2026-06-23 after it cost a full session. It was never actually fixed on the live site.

### 🔴 F10 — CSP violation reports go nowhere (HIGH — masks F9, F11, F12)

The CSP ends `report-uri /csp-report`. That endpoint returns **404** — observed 3× in a single page load.

So every CSP violation both fails *and* fails to be reported, generating an extra 404 each time. This is precisely why F9, F11 and F12 have gone unnoticed: the channel designed to surface them is broken.

### 🟠 F11 — `worker-src blob:` missing (MEDIUM)

```
Creating a worker from 'blob:https://www.realtypandit.in/…' has been blocked
```

The CSP has no `worker-src blob:` directive. This is the *second half* of the same memory note as F9 — also still unfixed. Blocks Sentry session replay and any web-worker offloading.

### 🟠 F12 — Cloudflare Insights blocked by CSP (MEDIUM)

```
Loading the script 'https://static.cloudflareinsights.com/…' has been blocked
```

Cloudflare Web Analytics is injected at the edge but rejected by the origin's own CSP. **Cloudflare analytics data is not being collected.** Google Analytics (GTM + GA4) *is* present and permitted.

> Note: project memory records "Google Analytics ID — NOT PROVIDED". That is now **out of date** — GTM and GA4 are live on the site.

### 🟠 F13 — React hydration failure on the homepage (MEDIUM)

```
Minified React error #418
```

React 19 error #418 is a **hydration mismatch** — server-rendered HTML differs from the client's first render. Consequences: React discards and re-renders the affected subtree, which inflates the 1,888 ms FCP, can cause visible content flashes, and makes UI state unreliable at the mismatch point.

Also observed in the rendered snapshot: a section reading **"Loading projects…"** that had not resolved. Given the documented `.catch(() => null)` silent-catch pattern elsewhere in this codebase, a failed fetch rendering as a permanent loading state is the likely cause and is worth confirming.

### 🟠 F14 — `og:image` is empty (MEDIUM — marketing impact)

`og:title` is set. **`og:image` is empty**, while `twitter:card` is `summary_large_image` — a card format that is defined by having a large image.

Every share of this site on WhatsApp, Facebook, LinkedIn or X renders as a bare text link. For a business whose primary acquisition channel is **Meta ads and WhatsApp**, this is a direct and continuous conversion loss on organic sharing.

> Memory records "Social media links — NOT PROVIDED". Also **out of date**: Facebook, Instagram and YouTube links are all live in the footer.

### 🟠 F15 — Duplicate `RealEstateAgent` schema (MEDIUM — GEO/AEO)

Two JSON-LD blocks, and **both declare `@type: RealEstateAgent`** (with `PostalAddress`, `Product`, `Offer`, `OfferCatalog`, `City` nested inside).

Declaring the same organisation entity twice on one page gives search and answer engines two competing definitions of who this business is. For **Knowledge Graph consolidation and AI citation (GEO/AEO)** — where a single unambiguous entity is exactly what gets cited — this actively works against the goal. Should be one `RealEstateAgent` (or `Organization`) with `@id`, plus separate `WebSite`/`BreadcrumbList` as needed.

### 🟠 F16 — No host canonicalisation (MEDIUM — SEO)

- `https://realtypandit.in/` → **200** (not a redirect)
- `https://www.realtypandit.in/` → **200**
- Both emit `canonical = https://www.realtypandit.in`
- **`robots.txt` points the sitemap at the non-www host**, contradicting the canonical

The canonical tag mitigates duplicate content, but the correct fix is a **301 from non-www to www** so link equity consolidates on one host. The sitemap directive should match.

### 🟡 F17 — Metadata coverage is thin (LOW–MEDIUM — SEO)

Across **49 routes**, only **4 files implement `generateMetadata`**, and **`generateStaticParams` is used 0 times**.

- Most routes therefore inherit generic metadata — including `/properties/[id]`, the pages that should carry unique, keyword-rich, property-specific titles and descriptions.
- With no `generateStaticParams`, every dynamic route is **server-rendered on each request**. Only three `revalidate` values exist (300 s ×1, 3600 s ×2). For 845 listings and 952 sitemap URLs, ISR would cut both latency and origin load substantially.

The sitemap does contain a genuine **programmatic-SEO surface** — `/properties/in/{city}` and `/properties/in/{city}/{locality}` across 8 cities — which is the right instinct. It is undermined by the thin metadata and absent static generation.

### 🟡 F18 — Admin maintainability (LOW — velocity risk)

| Signal | Value |
|---|---|
| `InventoryList.tsx` | **3,508 lines** |
| `ExternalLeads.tsx` | 2,482 lines |
| `DealPipeline.tsx` | 1,960 lines |
| `api/client.ts` | 1,483 lines |
| Inline `style={{` | **4,119** vs 950 `className` |
| State library | **none** — no Redux/Zustand/React Query/SWR |

No server-state library means every list manages its own fetch, loading and cache state by hand. That is the structural cause of the documented 2026-07-15 filter race (a slow response overwriting a newer filter, fixed with a manual request-id guard) — a class of bug that a query library eliminates by design. With 466 backend endpoints and 109 components, this is the main brake on future development speed.

### 🟡 F19 — Anonymous visitors trigger an authenticated call (LOW)

`GET https://api.realtypandit.in/user/me` returns **401** on every anonymous homepage load — a guaranteed-to-fail round trip on the critical path, plus 401 noise in the API logs (which, per Part 1 F3, are unrotated).

---

## 4. Accessibility — genuinely good

Measured on the live homepage:

| Check | Result |
|---|---|
| Images without `alt` | **0 of 11** ✅ |
| Buttons without accessible name | **0** ✅ |
| Inputs without label/aria-label | **0** ✅ |
| `<html lang>` | `en` ✅ |
| Heading structure | 1 × `h1`, 7 × `h2` ✅ |
| Lazy-loaded images | 4 |

Carousel controls carry proper labels ("Previous testimonial", "Go to testimonial 1"). This is markedly better than typical for a site of this type and reflects real care. Full WCAG 2.1 AA conformance would still need keyboard-trap, focus-visible and contrast testing.

---

## 5. Content accuracy — worth a business decision

The homepage advertises **"500+ Properties", "50+ Locations", "1000+ Happy Clients"**, and category counts of 250+/120+/80+/50+ (summing to exactly 500).

The production database contains **845 inventory rows** in total. The round numbers and their exact sum indicate these are **hard-coded marketing figures, not live counts**. Testimonials are similarly attributed to named individuals with 5-star ratings.

This is a judgement call for the owner, not a technical defect — but for a RERA-adjacent business, unverifiable claims and unattributed testimonials carry regulatory and reputational exposure. Wiring the counters to live data would be trivial (the counts already exist) and would make the claims defensible.

---

## 6. Remediation order (Part 2)

| Priority | Fix | Effort | Why |
|---|---|---|---|
| 1 | Add `errors.realtypandit.in` to CSP `connect-src`; add `worker-src blob:` | 15 min | Restores all frontend error visibility |
| 2 | Implement or remove `/csp-report` | 20 min | Stops violations failing silently |
| 3 | Set `og:image` | 30 min | Direct, continuous conversion loss on every share |
| 4 | Add `static.cloudflareinsights.com` to `script-src` | 5 min | Restores edge analytics |
| 5 | Fix hydration mismatch (#418) | 1–3 h | Improves FCP and UI reliability |
| 6 | De-duplicate `RealEstateAgent` JSON-LD, add `@id` | 1 h | Entity clarity for AI citation |
| 7 | 301 non-www → www; align robots.txt sitemap | 30 min | Consolidates link equity |
| 8 | `generateMetadata` + `generateStaticParams` on `/properties/[id]` | 1 day | Largest organic-traffic lever |
| 9 | Code-split the 548 KB chunk; trim 43 homepage fetches | 1–2 days | Targets the 1.8 s FCP |
| 10 | Introduce React Query in the admin; split the 3,508-line component | 1–2 weeks | Removes a whole class of race bugs |

---

## 7. Two memory corrections

Both of these are recorded as outstanding client deliverables and are in fact **already done**:

1. **"Social media links — NOT PROVIDED"** → Facebook, Instagram and YouTube are live in the footer.
2. **"Google Analytics ID — NOT PROVIDED"** → GTM and GA4 are live on the site.

`project_pending_client_deliverables` content in memory should be updated so these stop being chased.

---

## 8. Still outstanding

**Part 3** — business-process reverse engineering (lead lifecycle, sales pipeline, approval flows, revenue model) and the **redevelopment blueprint** (target architecture, module estimates, team composition, timeline, risk matrix).

Method note: all measurements above are from a single cold load on a desktop viewport through the Cloudflare edge. Mobile-throttled Core Web Vitals and field (CrUX) data would refine the FCP picture, and are the natural next measurement.
