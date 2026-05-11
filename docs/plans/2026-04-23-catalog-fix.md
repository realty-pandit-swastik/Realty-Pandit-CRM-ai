# Meta Catalog Fix — Images & Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 235 catalog products that show a placeholder image and 174 with generic names, then re-sync all 258 products so Meta can review and approve them for WhatsApp product messages.

**Architecture:** Two code fixes to a single file (`catalog_sync.ts`) — restore the correct image base URL and fix the name fallback to drop "NA". Then deploy, run a full reconcile, and confirm on Meta's Graph API that products have real images and proper names.

**Tech Stack:** TypeScript, ts-node, Meta Graph API v25.0, SSH + SCP deploy, PM2

---

## Files Modified

| File | Change |
|------|--------|
| `agents/backend/src/services/catalog_sync.ts` | Two fixes: `toAbsoluteUrl()` base URL + `mapInventoryToProduct()` name fallback |

---

## Task 1 — Fix `toAbsoluteUrl()`: Use `api.realtypandit.in` for relative paths

**Problem:** A previous patch changed the base URL for relative image paths from `api.realtypandit.in` to `www.realtypandit.in` and added a block that replaces any `/pending/` path with the placeholder image. But Facebook's own crawler confirmed `https://api.realtypandit.in/uploads/pending/xxx.jpg` returns HTTP 200 — the images ARE publicly accessible. The patch is causing 235 products to show the generic og-image instead of the real property photo.

**File:** `c:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\agents\backend\src\services\catalog_sync.ts` lines 8–19

- [ ] **Step 1: Read current state of lines 8–19**

Confirm the file currently reads:

```typescript
const WWW_BASE = 'https://www.realtypandit.in';
const PLACEHOLDER_IMG = `${WWW_BASE}/og-image.jpg`;

function toAbsoluteUrl(url: string | undefined | null): string {
    if (!url) return PLACEHOLDER_IMG;
    if (url.startsWith('http')) return url;
    // Relative paths: serve from www (public) not api (internal)
    const absolute = `${WWW_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    // Pending uploads are not yet publicly indexed — use placeholder so Meta accepts the product
    if (url.includes('/pending/')) return PLACEHOLDER_IMG;
    return absolute;
}
```

- [ ] **Step 2: Replace lines 8–19 with the corrected version**

```typescript
const API_BASE = 'https://api.realtypandit.in';
const PLACEHOLDER_IMG = 'https://www.realtypandit.in/og-image.jpg';

function toAbsoluteUrl(url: string | undefined | null): string {
    if (!url || !url.trim()) return PLACEHOLDER_IMG;
    if (url.startsWith('http')) return url;
    // Relative paths are served by the backend API (confirmed: Facebook crawler gets 200)
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}
```

Key changes:
- `API_BASE` is `api.realtypandit.in` (not `www`)
- Empty string check added (`!url.trim()`) — guards against `media_urls: [""]`
- Removed the `/pending/` → placeholder block entirely

---

## Task 2 — Fix `mapInventoryToProduct()`: Drop "NA" from name and description

**Problem:** When `specs.bedrooms` is null, `bhk` is set to the string `'NA'`. The name fallback then builds `"NA builder_floor in Ghaziabad"` — visible on every WhatsApp product card. Fix: omit the BHK prefix entirely when bedroom count is unknown.

**File:** same file, lines 28–54

- [ ] **Step 1: Read current lines 28–54**

Confirm these lines:
```typescript
export function mapInventoryToProduct(inv: any): Record<string, string> {
    const pricePaise = Math.round((Number(inv.display_price) || 0) * 100);
    const bedrooms = (inv.specs as any)?.bedrooms;
    const bhk = bedrooms ? `${bedrooms}BHK` : 'NA';
    const intentStr = String(inv.intent ?? '').toLowerCase();
    const intent = (intentStr === 'rent' || intentStr === 'rent_lease' || intentStr === 'lease') ? 'rent' : 'buy';
    const category = String(inv.category ?? 'residential').toLowerCase();
    const propertyType = inv.type ?? '';
    const name = inv.apartment_name ?? `${bhk} ${propertyType} in ${inv.city ?? ''}`.trim() || 'Property';

    return {
        retailer_id: String(inv.id),
        name,
        description: inv.description ?? `${bhk} ${propertyType} in ${inv.locality ?? inv.city ?? ''}`.trim() || name,
        ...
        custom_label_1: bhk,
        ...
    };
}
```

- [ ] **Step 2: Replace `mapInventoryToProduct()` with the fixed version**

```typescript
export function mapInventoryToProduct(inv: any): Record<string, string> {
    const pricePaise = Math.round((Number(inv.display_price) || 0) * 100);
    const bedrooms = (inv.specs as any)?.bedrooms;
    const bhkLabel = bedrooms ? `${bedrooms} BHK ` : '';
    const intentStr = String(inv.intent ?? '').toLowerCase();
    const intent = (intentStr === 'rent' || intentStr === 'rent_lease' || intentStr === 'lease') ? 'rent' : 'buy';
    const category = String(inv.category ?? 'residential').toLowerCase();
    const propertyType = inv.type ?? '';
    const locationStr = inv.locality ?? inv.city ?? '';
    const generatedName = `${bhkLabel}${propertyType}${locationStr ? ` in ${locationStr}` : ''}`.trim() || 'Property';
    const name = (inv.apartment_name as string | null)?.trim() || generatedName;
    const generatedDesc = `${bhkLabel}${propertyType}${locationStr ? ` in ${locationStr}` : ''}`.trim() || name;

    return {
        retailer_id: String(inv.id),
        name,
        description: (inv.description as string | null)?.trim() || generatedDesc,
        price: String(pricePaise),
        currency: 'INR',
        availability: 'in stock',
        condition: 'new',
        url: `https://www.realtypandit.in/properties/${inv.id}`,
        image_url: toAbsoluteUrl((inv.media_urls as string[] | null)?.[0]),
        custom_label_0: inv.city ?? '',
        custom_label_1: bedrooms ? `${bedrooms} BHK` : '',
        custom_label_2: propertyType,
        custom_label_3: intent,
        custom_label_4: category,
    };
}
```

Key changes vs previous:
- `bhkLabel` is `"3 BHK "` (with trailing space) or `""` — never `"NA"`
- `generatedName` produces `"3 BHK flat in Vaishali"` or `"builder_floor in Ghaziabad"` (no "NA")
- `name` uses `.trim()` check — guards against `apartment_name: "  "` (whitespace)
- `custom_label_1` is `"3 BHK"` or `""` — never `"NA"`

- [ ] **Step 3: Verify the full file looks correct**

After both edits, lines 1–54 of `catalog_sync.ts` should read:

```typescript
import axios from 'axios';
import logger from '../utils/logger';
import prisma from '../db';

const GRAPH_BASE = 'https://graph.facebook.com/v25.0';
const CATALOG_ID = process.env.META_CATALOG_ID!;
const token = () => process.env.WHATSAPP_TOKEN!;
const API_BASE = 'https://api.realtypandit.in';
const PLACEHOLDER_IMG = 'https://www.realtypandit.in/og-image.jpg';

function toAbsoluteUrl(url: string | undefined | null): string {
    if (!url || !url.trim()) return PLACEHOLDER_IMG;
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Actual Prisma field names (schema uses: type, display_price, specs JSON, media_urls, category, intent)
const INVENTORY_SELECT = {
    id: true, apartment_name: true, description: true, display_price: true,
    specs: true, type: true, locality: true, city: true,
    intent: true, category: true, media_urls: true, status: true,
} as const;

export function mapInventoryToProduct(inv: any): Record<string, string> {
    const pricePaise = Math.round((Number(inv.display_price) || 0) * 100);
    const bedrooms = (inv.specs as any)?.bedrooms;
    const bhkLabel = bedrooms ? `${bedrooms} BHK ` : '';
    const intentStr = String(inv.intent ?? '').toLowerCase();
    const intent = (intentStr === 'rent' || intentStr === 'rent_lease' || intentStr === 'lease') ? 'rent' : 'buy';
    const category = String(inv.category ?? 'residential').toLowerCase();
    const propertyType = inv.type ?? '';
    const locationStr = inv.locality ?? inv.city ?? '';
    const generatedName = `${bhkLabel}${propertyType}${locationStr ? ` in ${locationStr}` : ''}`.trim() || 'Property';
    const name = (inv.apartment_name as string | null)?.trim() || generatedName;
    const generatedDesc = `${bhkLabel}${propertyType}${locationStr ? ` in ${locationStr}` : ''}`.trim() || name;

    return {
        retailer_id: String(inv.id),
        name,
        description: (inv.description as string | null)?.trim() || generatedDesc,
        price: String(pricePaise),
        currency: 'INR',
        availability: 'in stock',
        condition: 'new',
        url: `https://www.realtypandit.in/properties/${inv.id}`,
        image_url: toAbsoluteUrl((inv.media_urls as string[] | null)?.[0]),
        custom_label_0: inv.city ?? '',
        custom_label_1: bedrooms ? `${bedrooms} BHK` : '',
        custom_label_2: propertyType,
        custom_label_3: intent,
        custom_label_4: category,
    };
}
```

---

## Task 3 — Deploy and Re-sync

- [ ] **Step 1: Copy the fixed file to the server**

```bash
scp -i ~/.ssh/realty_pandit_key \
  "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/catalog_sync.ts" \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/services/catalog_sync.ts
```

Expected: no output (success). If you see `Permission denied`, check the SSH key path.

- [ ] **Step 2: Restart the backend**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'pm2 restart realty-backend'
```

Expected output includes:
```
[PM2] [realty-backend](20) ✓
[PM2] [realty-backend](21) ✓
```

- [ ] **Step 3: Spot-check the fix before running full reconcile**

Pick one product that currently has a `/uploads/pending/` image and verify the URL is now built correctly:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -r ts-node/register/transpile-only -e "
const { mapInventoryToProduct } = require(\"./src/services/catalog_sync\");
const sample = {
  id: \"04e68092-9008-4f99-b4ed-d9a891c38fc7\",
  apartment_name: \"\",
  type: \"flat\",
  city: \"Vaishali\",
  locality: \"Sector 5\",
  display_price: 5000000,
  specs: null,
  media_urls: [\"/uploads/pending/78248565-1774011275717.jpg\"],
  intent: \"sell\",
  category: \"residential\",
  description: null,
};
console.log(JSON.stringify(mapInventoryToProduct(sample), null, 2));
"'
```

Expected output:
```json
{
  "retailer_id": "04e68092-9008-4f99-b4ed-d9a891c38fc7",
  "name": "flat in Sector 5",
  "image_url": "https://api.realtypandit.in/uploads/pending/78248565-1774011275717.jpg",
  "custom_label_1": "",
  ...
}
```

Confirm: `name` has NO "NA", `image_url` starts with `https://api.realtypandit.in`.

- [ ] **Step 4: Run the full catalog reconcile**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -r ts-node/register/transpile-only -e "
const { reconcileCatalog } = require(\"./src/services/catalog_sync\");
reconcileCatalog().then(r => { console.log(\"Done:\", JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(\"Error:\", e.message); process.exit(1); });
"' 2>&1 | tail -5
```

Expected (takes ~2–3 minutes for 258 products):
```
[CatalogSync] Reconcile done: 258 upserted, 0 deleted
Done: {"upserted":258,"deleted":0}
```

Any `[CatalogSync] Upsert failed` lines are worth noting — they indicate products with other data issues.

---

## Task 4 — Verify on Meta's Graph API

- [ ] **Step 1: Check a sample of products for correct images and names**

```bash
TOKEN=$(ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'grep WHATSAPP_TOKEN /var/www/realty-pandit/backend/.env | cut -d= -f2')
curl -s "https://graph.facebook.com/v25.0/1669209180880841/products?fields=retailer_id,name,image_url&limit=10&access_token=${TOKEN}" | python3 -m json.tool
```

Expected: products show names like `"flat in Sector 5"` or `"3 BHK apartment in Noida"` (no "NA"), and `image_url` values like `"https://api.realtypandit.in/uploads/pending/xxx.jpg"` (not `og-image.jpg`) for properties that had photos.

- [ ] **Step 2: Count how many still use the placeholder vs real images**

```bash
TOKEN=$(ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'grep WHATSAPP_TOKEN /var/www/realty-pandit/backend/.env | cut -d= -f2')
curl -s "https://graph.facebook.com/v25.0/1669209180880841/products?fields=image_url&limit=300&access_token=${TOKEN}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
products = data.get('data', [])
placeholder = sum(1 for p in products if 'og-image' in p.get('image_url',''))
real = len(products) - placeholder
print(f'Total: {len(products)}')
print(f'Real images: {real}')
print(f'Still using placeholder: {placeholder}')
"
```

Expected improvement: "Real images" count should jump from 23 to ~200+. Properties with truly no images will still show the placeholder — that's correct behaviour.

- [ ] **Step 3: Monitor Meta review progress (check back in 24h)**

Meta reviews catalog products asynchronously. Check `review_status` after 24–48h:

```bash
TOKEN=$(ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'grep WHATSAPP_TOKEN /var/www/realty-pandit/backend/.env | cut -d= -f2')
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

Target: `"approved": 258` (or majority approved). Once products are approved, WhatsApp MPM product card messages will work automatically — the text fallback in `search-and-show-properties` will stop firing.
