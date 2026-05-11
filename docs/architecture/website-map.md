# Realty Pandit Website — Full Map (Verified 2026-04-06)

## Stack
- **Next.js 16.1.6** (App Router) + **React 19.2.3** + **TypeScript 5**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`) + **Framer Motion 12.34**
- **Axios** for API calls, **Lucide React** icons, **class-variance-authority** + **clsx/twMerge**
- **Geist Sans + Geist Mono** fonts via `next/font`
- **No state management library** — React Context + custom hooks
- **PWA** with service worker (network-first caching)

## Pages (46 total)

### Public (24 pages)
| Route | File | Description |
|-------|------|-------------|
| `/` | page.tsx | Homepage (Hero, ValuePropositions, PropertyCategories, ServiceTiles, FeaturedProperties, NewProjects, StatsCounter, Testimonials, TrustBadges, CTASection) |
| `/properties` | properties/page.tsx | 3 tabs (Rent/Resale/Projects), sidebar filters, grid/list views |
| `/properties/[id]` | properties/[id]/page.tsx | SSR detail with PropertyDetailClient |
| `/properties/in/[city]` | properties/in/[city]/page.tsx | City SEO page |
| `/properties/in/[city]/[locality]` | properties/in/[city]/[locality]/page.tsx | Locality SEO page |
| `/properties/in/[city]/budget/[range]` | properties/in/[city]/budget/[range]/page.tsx | Budget SEO page |
| `/projects/[id]` | projects/[id]/page.tsx | Builder project detail |
| `/agents` | agents/page.tsx | Agent listing (public directory) |
| `/agents/[id]` | agents/[id]/page.tsx | Agent profile |
| `/post-property` | post-property/page.tsx | Post property wizard |
| `/post-project` | post-project/page.tsx | Post builder project |
| `/compare` | compare/page.tsx | Property comparison tool |
| `/blog` | blog/page.tsx | Blog listing (6 hardcoded posts in `blog-data.ts`, NOT CMS) |
| `/blog/[slug]` | blog/[slug]/page.tsx | Blog post detail + BlogShareButtons |
| `/tools` | tools/page.tsx | Tools index |
| `/tools/emi-calculator` | tools/emi-calculator/page.tsx | EMI calculator |
| `/tools/area-converter` | tools/area-converter/page.tsx | Area unit converter |
| `/about` | about/page.tsx | About page |
| `/services` | services/page.tsx | Services page |
| `/contact` | contact/page.tsx | Contact page |
| `/faq` | faq/page.tsx | FAQ page |
| `/privacy` | privacy/page.tsx | Privacy policy |
| `/terms` | terms/page.tsx | Terms of service |
| `/login` | login/page.tsx | Unified login portal (User/Agent/Builder/Admin cards) |
| `/wishlist` | wishlist/page.tsx | Saved properties |
| `/join` | join/page.tsx | Registration |
| `/join/agent` | join/agent/page.tsx | Agent registration |
| `/join/builder` | join/builder/page.tsx | Builder registration |

### Agent Dashboard (10 pages, protected by `agent_token`)
| Route | Description |
|-------|-------------|
| `/agent/login` | Agent login |
| `/agent/dashboard` | Dashboard |
| `/agent/inventory` | Property inventory |
| `/agent/leads` | Lead management |
| `/agent/deals` | Deal pipeline |
| `/agent/deals/[id]` | Deal detail |
| `/agent/deals/[id]/browse` | Browse properties for deal |
| `/agent/appointments` | Appointments |
| `/agent/team` | Team management |
| `/agent/subscription` | Subscription (FREE: 5, PRO: 25, ADVANCE_PRO: 100 listings) |

### Builder Dashboard (8 pages, protected by `builder_token`)
| Route | Description |
|-------|-------------|
| `/builder/login` | Builder login |
| `/builder/dashboard` | Dashboard |
| `/builder/projects` | Project list |
| `/builder/projects/new` | Create project |
| `/builder/projects/[id]` | Project detail |
| `/builder/leads` | Leads |
| `/builder/appointments` | Appointments |
| `/builder/subscription` | Subscription |

### Special Files
- `robots.ts` — disallows /agent/, /builder/, /login, /api/, /wishlist
- `sitemap.ts` — dynamic: static pages + blog + city/locality/budget + all property details
- `error.tsx`, `not-found.tsx`, `loading.tsx` — error handling
- `pwa-updater.tsx` — service worker update banner

## Components (78 files)

### UI Primitives (`components/ui/`)
Badge, Button, Card, Input, Select, Tabs, Accordion, Carousel, Skeleton, Container

### Layout
- **Navbar.tsx** — fixed top, transparent on homepage, dropdowns, "Talk to Panditji" button, dark mode toggle, auth state
- **Footer.tsx** — site footer
- **Hero.tsx** — homepage hero
- **WhatsAppButton.tsx** — floating WhatsApp button
- **LeadCapture.tsx** — lead capture popup
- **InternalLinks.tsx** — internal link sections

### Homepage (`components/home/`)
ValuePropositions, PropertyCategories, ServiceTiles, FeaturedProperties, NewProjects, StatsCounter, Testimonials, TrustBadges, CTASection

### Property Listings (`components/properties/`)
PropertySidebar, PropertySidebarMobile, PropertyToolbar, PropertyListCard, FilterChips, PropertyPagination, ScheduleVisitModal, ShareWhatsAppModal, ContactModal

### Property Detail (`components/property-detail/`)
KenBurnsGallery, AirbnbImageGrid, FullscreenLightbox, VirtualTourBadge, PropertyMap, NeighborhoodScores, AIDescription, PriceValueBadge, AnimatedSpecsGrid, StickyPriceBar, CompareButton, CompareBar, CompareModal, SmartBreadcrumb

### AI Chat (`components/chat/`)
AIChatModal, ChatHeader, ChatInput, ChatMessages, PropertyChatCard, PropertyMatchCard, PropertyViewerPanel, PropertyImageGallery, normalizeProperty.ts, usePropertyViewer.ts

### Chat Workflow — Property Posting (`components/chat-workflow/`)
ChatWorkflow, WorkflowChatInput, ChatBubble, TypingIndicator, QuickReplies, MultiSelectGrid, ChatProgress, ChatSummaryCard, InlineContactForm, ChatMediaUploader, ChatLocationPicker

### Form Workflow (`components/workflow/`)
StepRenderer, StepConfirmation, WorkflowProgress, GooglePlacesInput

### Other
PropertyCard, FeaturedProperties, ContactForm, RequirementCapture, JsonLd (SEO), UserLoginModal

## API Client (`lib/api.ts`) — All Endpoints

| Category | Endpoints |
|----------|-----------|
| Classification | GET /public/master/tree, /categories, /subcategories, /types, /configurations, /usage-types, /investment-types, /flat-property-types |
| Properties | GET /public/properties, /:id, /featured, /similar |
| Projects | GET /public/projects, /:id, /featured, /similar |
| Stats | GET /public/stats, /locations, /testimonials |
| Leads | POST /public/contact, /lead, /lead-requirements, /newsletter, /schedule-visit, /share-property-whatsapp, /save-property, /post-property, /project-enquiry |
| AI Chat | POST /public/ai-chat, /ai-chat/book-visit |
| User Auth | POST /user/login-otp, /verify-otp; GET /user/me; POST /user/logout |
| Geo | GET /public/geo/states, /districts, /cities |
| AI Description | GET /public/properties/:id/ai-description |
| Nearby | GET /public/nearby-landmarks/:id |
| Matches | GET /public/matches (unified resale + projects) |
| Form Workflow | GET /api/workflow/definition; POST next-step, previous-step, validate, options, visible-steps, summary, commit, upload-media, upload-video, upload-document |
| Chat Workflow | POST /api/chat/start, /message, /upload-media, /confirm; GET /session/:id |
| Buyer Chat | POST /api/chat/buyer/action, /buyer/book |

## State Management

| Pattern | File | Purpose |
|---------|------|---------|
| React Context | `contexts/ThemeContext.tsx` | Dark/light mode, persisted to `localStorage('rp-theme')` |
| Custom Hook | `lib/useMasterData.ts` | Fetches + caches classification tree |
| Custom Hook | `lib/useWorkflow.ts` | Property posting wizard (draft in localStorage, session in sessionStorage) |
| Custom Hook | `lib/useChatWorkflow.ts` | Chat-based workflow session |

## Auth (3 separate JWT systems)

| Role | Token Key | Login Flow | Protected Routes |
|------|-----------|------------|-----------------|
| User | `user_token` | OTP via phone → verify → JWT | Wishlist, profile |
| Agent | `agent_token` + `agent_info` | Login at /agent/login | /agent/* (layout redirects) |
| Builder | `builder_token` + `builder_info` | Login at /builder/login | /builder/* (layout redirects) |

401 interceptor auto-redirects to respective login with `?expired=1`.

## LocalStorage Keys
- `rp-theme` — dark/light
- `rp-chat-session` — AI chat (24h)
- `realty-pandit-workflow-draft-v2` — property upload draft
- `realty-pandit-workflow-session` — workflow session
- `realty-pandit-chat-session` — post-property chat
- `wishlist` — saved properties
- `agent_token` + `agent_info`, `builder_token` + `builder_info`, `user_token`

## SEO
- Title template: `%s | Realty Pandit`
- JSON-LD: RealEstateAgent schema, property schema, article schema, FAQ schema, breadcrumbs
- `robots.ts` + `sitemap.ts` (dynamic)
- Google Analytics: `G-WJF3Y3SXM3`
- Google Tag Manager: `GTM-TBFWLRD7`
- Facebook domain verification: `j0gel34v3mstljpgk43e77vnk74j3w`

## Configuration
- `next.config.ts` — cleanDistDir, image remote patterns for api.realtypandit.in + localhost:7071
- `tsconfig.json` — ES2017, strict, `@/*` → `./src/*`
- `.env.production` — NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

## Public Assets
logo.png, favicon.ico, manifest.json (PWA standalone), sw.js (network-first), icons (192x192, 512x512)

## Key Features
1. AI Chat "Panditji" — natural language property search + visit booking
2. Chat-based property posting — conversational workflow
3. Form-based property posting — step wizard with draft persistence
4. Property comparison — side-by-side
5. SEO landing pages — city, locality, budget
6. Agent dashboard — inventory, leads, deals, appointments, team, subscription
7. Builder dashboard — projects, leads, appointments, subscription
8. PWA — service worker, manifest, installable
9. Dark mode — full theme toggle with system preference
10. Google Maps integration
11. Blog — 6 hardcoded posts (not CMS)
12. EMI Calculator + Area Converter tools
