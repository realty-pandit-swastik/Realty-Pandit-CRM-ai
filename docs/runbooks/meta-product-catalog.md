---
name: Meta Product Catalog — Status & Architecture
description: WhatsApp catalog ID, sync mechanism, bugs fixed, verification commands, review status monitoring
type: project
---

## Catalog Identity

- **Catalog ID**: `1669209180880841`
- **Products**: 260 (all active inventory)
- **Graph API**: `https://graph.facebook.com/v25.0/1669209180880841/products`
- **Token source**: `WHATSAPP_TOKEN` env var on server
- **Purpose**: Powers WhatsApp MPM (Multi-Product Message) product cards in `search-and-show-properties` agent

## How Sync Works

**File**: `agents/backend/src/services/catalog_sync.ts`

- `upsertCatalogProduct(inv)` — POST to Graph API for one product
- `deleteCatalogProduct(id)` — DELETE from catalog when inventory goes inactive
- `syncInventoryById(id)` — fetch from DB then upsert/delete (used on inventory save)
- `reconcileCatalog()` — full scan: upsert all active inventory, delete stale remote products

**Nightly reconcile**: BullMQ job `catalog-reconcile` in `scheduled_worker.ts`, scheduled at 22:00 UTC (3:30 AM IST).

**Manual reconcile**:
```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -r ts-node/register/transpile-only -e "
const { reconcileCatalog } = require(\"./src/services/catalog_sync\");
reconcileCatalog().then(r => { console.log(\"Done:\", JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
"' 2>&1 | tail -5
```

## Image URL Logic (FIXED 2026-04-23)

`toAbsoluteUrl()` must use `api.realtypandit.in` as base for relative paths — NOT `www.realtypandit.in`. Facebook's crawler confirmed HTTP 200 on `https://api.realtypandit.in/uploads/pending/xxx.jpg`.

**Do NOT** add a `/pending/` → placeholder block. Those files are publicly accessible.

```typescript
const API_BASE = 'https://api.realtypandit.in';
const PLACEHOLDER_IMG = 'https://www.realtypandit.in/og-image.jpg';

function toAbsoluteUrl(url: string | undefined | null): string {
    if (!url || !url.trim()) return PLACEHOLDER_IMG;
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}
```

## Name Logic (FIXED 2026-04-23)

`mapInventoryToProduct()` must never produce "NA" in names. Use `filter(Boolean)` to omit BHK when bedrooms is null.

```typescript
const bhkLabel = bedrooms ? `${bedrooms} BHK` : '';
const parts = [bhkLabel, propertyType].filter(Boolean);
const generated = (parts.join(' ') + (locationStr ? ` in ${locationStr}` : '')).trim() || 'Property';
```

Results: "3 BHK flat in Vaishali", "builder_floor in Ghaziabad" (never "NA")

## Status After 2026-04-23 Fix

| Metric | Before fix | After reconcile |
|--------|-----------|-----------------|
| Real images | 23 (9%) | 114 (44%) |
| Placeholder images | 235 | 146 (properties with genuinely no photos) |
| "NA" names | 174 | 0 |
| review_status | "" (none reviewed) | "" (review pending — 24–48h) |

**Why 146 still have placeholder**: Those properties have empty `media_urls` in DB. Agents need to upload photos. Next nightly reconcile will push real images automatically once photos exist.

## Verify on Meta

```bash
# Count real vs placeholder images
TOKEN=$(ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'grep WHATSAPP_TOKEN /var/www/realty-pandit/backend/.env | cut -d= -f2')
curl -s "https://graph.facebook.com/v25.0/1669209180880841/products?fields=image_url&limit=300&access_token=${TOKEN}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
products = data.get('data', [])
placeholder = sum(1 for p in products if 'og-image' in p.get('image_url',''))
print(f'Total: {len(products)}, Real: {len(products)-placeholder}, Placeholder: {placeholder}')
"

# Check review status distribution
curl -s "https://graph.facebook.com/v25.0/1669209180880841/products?fields=review_status&limit=300&access_token=${TOKEN}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
counts = {}
for p in data.get('data', []):
    s = p.get('review_status') or 'no_review'
    counts[s] = counts.get(s, 0) + 1
print(json.dumps(counts, indent=2))
"
```

**Target**: `"approved": 260` (or majority). Check back 24–48h after any reconcile.

## WhatsApp MPM Dependency

Until products are `review_status: "approved"`, `sendMultiProductMessage()` returns 400. The `search-and-show-properties` agent has a text fallback that fires when MPM fails — users still get property links, just without the card UI.

**Why:** Products need to pass Meta's content review (image, title, price, URL all checked).
**How to apply:** Don't panic about MPM 400 errors until review has had 48h to complete.
