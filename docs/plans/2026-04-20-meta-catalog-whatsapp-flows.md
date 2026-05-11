# Meta Catalog + WhatsApp Flows + Voice Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Realty Pandit inventory to Meta catalog; enable Panditji (text + voice) to send filtered property cards via multi-product messages; add a WhatsApp Flow filter form (Way 3); add a booking Flow on property cards (Option B); connect the Pipecat voice bot so callers receive catalog results on their WhatsApp during the call.

**Architecture:** Four components deployed in order: (1) real-time + nightly catalog sync to Meta; (2) sendMultiProductMessage + internal search endpoint; (3) voice tool wiring so Panditji can call the search endpoint during a call; (4) WhatsApp Flows for filter form and site visit booking.

**Tech Stack:** Node.js/TypeScript, Express, Prisma, Meta Graph API **v22.0** (upgrade from v17 in existing codebase), WhatsApp Cloud API, BullMQ, Python 3.11, Pipecat 1.0.0

**Key IDs:**
- Catalog: `1669209180880841`
- WABA: `2124684824933246`
- Phone ID: `1021151161081768`
- Token env var: `WHATSAPP_TOKEN`
- Server: `root@72.62.231.224`

---

## Pre-flight: Upgrade API version from v17 to v22

- [ ] **Find all v17 references in backend**

```bash
grep -rn "v17.0" clients/sunny-sharma/projects/reality-pandit/backend/src/
```

- [ ] **Replace all with v22.0**

```bash
sed -i 's/v17\.0/v22.0/g' \
  clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp.ts
```

Verify: `grep -n "v17\|v22" clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp.ts | head -5`

---

## Component 1 — Catalog Sync Service

**Files:**
- Create: `backend/src/services/catalog_sync.ts`
- Modify: `backend/src/routes/inventory.ts`
- Modify: `backend/src/queues/workers/scheduled_worker.ts`

### Task 1.1 — catalog_sync.ts

- [ ] **Step 1: Create the file**

Path: `clients/sunny-sharma/projects/reality-pandit/backend/src/services/catalog_sync.ts`

```typescript
import axios from 'axios';
import { logger } from '../utils/logger';
import { prisma } from '../db';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';
const CATALOG_ID = process.env.META_CATALOG_ID!;
const token = () => process.env.WHATSAPP_TOKEN!;

export function mapInventoryToProduct(inv: any): Record<string, string> {
  const pricePaise = Math.round((Number(inv.asking_price) || 0) * 100);
  const bhk = inv.bedrooms ? `${inv.bedrooms}BHK` : 'NA';
  const intent = inv.intent === 'RENT' ? 'rent' : 'buy';
  const category = (inv.category ?? 'residential').toLowerCase();

  return {
    retailer_id: String(inv.id),
    name: inv.title ?? `${bhk} ${inv.property_type ?? 'Property'} in ${inv.city ?? ''}`.trim(),
    description: inv.description ?? `${bhk} ${inv.property_type ?? 'property'} in ${inv.locality ?? inv.city ?? ''}`,
    price: String(pricePaise),
    currency: 'INR',
    availability: 'in stock',
    condition: 'new',
    url: `https://www.realtypandit.in/properties/${inv.id}`,
    image_url: inv.media_urls?.[0] ?? 'https://www.realtypandit.in/og-image.jpg',
    custom_label_0: inv.city ?? '',
    custom_label_1: bhk,
    custom_label_2: inv.property_type ?? '',
    custom_label_3: intent,
    custom_label_4: category,
  };
}

export async function upsertCatalogProduct(inv: any): Promise<void> {
  const product = mapInventoryToProduct(inv);
  try {
    await axios.post(
      `${GRAPH_BASE}/${CATALOG_ID}/products`,
      product,
      { headers: { Authorization: `Bearer ${token()}` } }
    );
    logger.info(`[CatalogSync] Upserted product ${inv.id}`);
  } catch (err: any) {
    logger.error(`[CatalogSync] Upsert failed ${inv.id}: ${err.response?.data?.error?.message ?? err.message}`);
    throw err;
  }
}

export async function deleteCatalogProduct(inventoryId: number): Promise<void> {
  try {
    await axios.delete(`${GRAPH_BASE}/${CATALOG_ID}/products`, {
      headers: { Authorization: `Bearer ${token()}` },
      data: { retailer_id: String(inventoryId) },
    });
    logger.info(`[CatalogSync] Deleted product ${inventoryId}`);
  } catch (err: any) {
    logger.error(`[CatalogSync] Delete failed ${inventoryId}: ${err.response?.data?.error?.message ?? err.message}`);
  }
}

async function fetchCatalogRetailerIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let url: string | null =
    `${GRAPH_BASE}/${CATALOG_ID}/products?fields=retailer_id&limit=200&access_token=${token()}`;
  while (url) {
    const resp = await axios.get(url);
    for (const p of resp.data.data ?? []) ids.add(p.retailer_id);
    url = resp.data.paging?.next ?? null;
  }
  return ids;
}

export async function reconcileCatalog(): Promise<{ upserted: number; deleted: number }> {
  const inventory = await prisma.inventory.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, title: true, description: true, asking_price: true,
      bedrooms: true, property_type: true, locality: true, city: true,
      intent: true, category: true, media_urls: true,
    },
  });

  const remoteIds = await fetchCatalogRetailerIds();
  const localIds = new Set(inventory.map((i: any) => String(i.id)));

  let upserted = 0;
  for (const inv of inventory) {
    await upsertCatalogProduct(inv).catch(() => null);
    upserted++;
  }

  let deleted = 0;
  for (const rid of remoteIds) {
    if (!localIds.has(rid)) {
      await deleteCatalogProduct(Number(rid));
      deleted++;
    }
  }
  logger.info(`[CatalogSync] Reconcile done: ${upserted} upserted, ${deleted} deleted`);
  return { upserted, deleted };
}
```

- [ ] **Step 2: Add META_CATALOG_ID to server .env**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'grep -q META_CATALOG_ID /var/www/realty-pandit/backend/.env || \
   echo "META_CATALOG_ID=1669209180880841" >> /var/www/realty-pandit/backend/.env'
```

- [ ] **Step 3: Verify catalog API responds with v22**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'TOKEN=$(grep "^WHATSAPP_TOKEN=" /var/www/realty-pandit/backend/.env | cut -d= -f2-); \
   curl -s "https://graph.facebook.com/v22.0/1669209180880841/products?fields=retailer_id,name&limit=3&access_token=$TOKEN"'
```

Expected: `{"data":[...]}` or `{"data":[]}`. No `error` field.

### Task 1.2 — Wire sync triggers in inventory route

- [ ] **Step 1: Find create/update/delete handlers in inventory.ts**

```bash
grep -n "prisma.inventory.create\|prisma.inventory.update\|prisma.inventory.delete\|\.upsert" \
  clients/sunny-sharma/projects/reality-pandit/backend/src/routes/inventory.ts | head -20
```

- [ ] **Step 2: Add fire-and-forget hooks after each mutation**

At top of the file, add import:
```typescript
import { upsertCatalogProduct, deleteCatalogProduct } from '../services/catalog_sync';
```

After each successful `prisma.inventory.create`:
```typescript
upsertCatalogProduct(result).catch(e => logger.warn('[Catalog] post-create upsert failed:', e.message));
```

After each successful `prisma.inventory.update`:
```typescript
upsertCatalogProduct(result).catch(e => logger.warn('[Catalog] post-update upsert failed:', e.message));
```

After each successful delete (soft `status: 'INACTIVE'` update OR hard delete):
```typescript
deleteCatalogProduct(result.id).catch(e => logger.warn('[Catalog] post-delete remove failed:', e.message));
```

### Task 1.3 — Nightly reconcile BullMQ job

- [ ] **Step 1: Read top of scheduled_worker.ts to understand job pattern**

```bash
head -80 clients/sunny-sharma/projects/reality-pandit/backend/src/queues/workers/scheduled_worker.ts
```

- [ ] **Step 2: Add catalog-reconcile to worker switch + cron schedule**

In the job processor (wherever existing jobs are handled), add:
```typescript
import { reconcileCatalog } from '../services/catalog_sync';

// in the processor:
case 'catalog-reconcile':
  return reconcileCatalog();
```

In the cron scheduler section (where other repeating jobs are defined):
```typescript
await scheduledQueue.add('catalog-reconcile', {}, {
  repeat: { cron: '0 3 * * *' },  // 3 AM daily
  jobId: 'catalog-reconcile-daily',
  removeOnComplete: 10,
});
```

- [ ] **Step 3: Deploy Component 1 and verify**

```bash
rsync -av -e "ssh -i ~/.ssh/realty_pandit_key -F /dev/null" \
  clients/sunny-sharma/projects/reality-pandit/backend/src/ \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/

ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'pm2 restart realty-backend --update-env && sleep 3 && \
   pm2 logs realty-backend --lines 20 --nostream 2>&1 | grep -i catalog'
```

Create one inventory item in admin panel. Check logs for `[CatalogSync] Upserted product`.

- [ ] **Step 4: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/backend/src/services/catalog_sync.ts \
        clients/sunny-sharma/projects/reality-pandit/backend/src/routes/inventory.ts \
        clients/sunny-sharma/projects/reality-pandit/backend/src/queues/workers/scheduled_worker.ts
git commit -m "feat(catalog): real-time inventory sync to Meta catalog v22

POST+DELETE /{catalog_id}/products on inventory create/update/delete.
Nightly 3AM reconcile removes orphaned catalog products.
custom_label_0-4: city, BHK, type, intent, category."
```

---

## Component 2 — Multi-Product Message (Way 2)

**Files:**
- Modify: `backend/src/services/whatsapp.ts`
- Modify: `backend/src/routes/internal_tools.ts`

### Task 2.1 — Add sendMultiProductMessage + sendSingleProductMessage

- [ ] **Step 1: Read whatsapp.ts to understand existing send pattern**

```bash
grep -n "async send\|sendRaw\|sendMessage\|POST.*messages\|PHONE_ID\|phone_id" \
  clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp.ts | head -25
```

- [ ] **Step 2: Add multi-product and single-product methods**

Add after existing send methods (adapt `sendRaw` / the HTTP call pattern to match how existing methods post to the messages endpoint):

```typescript
async sendMultiProductMessage(
  to: string,
  headerText: string,
  bodyText: string,
  footerText: string,
  sections: Array<{ title: string; productRetailerIds: string[] }>
): Promise<void> {
  await this.sendRaw(to, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      footer: { text: footerText },
      action: {
        catalog_id: process.env.META_CATALOG_ID,
        sections: sections.map(s => ({
          title: s.title,
          product_items: s.productRetailerIds.map(id => ({ product_retailer_id: id })),
        })),
      },
    },
  });
}

async sendSingleProductMessage(
  to: string,
  bodyText: string,
  footerText: string,
  productRetailerId: string
): Promise<void> {
  await this.sendRaw(to, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'product',
      body: { text: bodyText },
      footer: { text: footerText },
      action: {
        catalog_id: process.env.META_CATALOG_ID,
        product_retailer_id: productRetailerId,
      },
    },
  });
}

async sendFlow(
  to: string,
  flowId: string,
  bodyText: string,
  initialScreenId: string = 'SEARCH_SCREEN',
  screenData: Record<string, any> = {},
  mode: 'draft' | 'published' = 'published'
): Promise<void> {
  await this.sendRaw(to, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: 'unused',
          flow_id: flowId,
          flow_cta: 'Open',
          flow_action: 'navigate',
          flow_action_payload: { screen: initialScreenId, data: screenData },
          mode,
        },
      },
    },
  });
}
```

### Task 2.2 — Internal tool endpoints for search + booking

- [ ] **Step 1: Add search-and-show-properties endpoint to internal_tools.ts**

```typescript
import { upsertCatalogProduct } from '../services/catalog_sync';

// POST /webhooks/internal/tools/search-and-show-properties
router.post('/search-and-show-properties', async (req, res) => {
  const { caller, city, intent, property_type, category, bhk, budget_min, budget_max, limit = 10 } = req.body;
  if (!caller) return res.json({ ok: false, error: 'caller required' });

  try {
    const where: any = { status: 'ACTIVE' };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (intent) where.intent = intent.toUpperCase();
    if (property_type) where.property_type = { contains: property_type, mode: 'insensitive' };
    if (category) where.category = { contains: category, mode: 'insensitive' };
    if (bhk) where.bedrooms = Number(bhk);
    if (budget_min || budget_max) {
      where.asking_price = {};
      if (budget_min) where.asking_price.gte = Number(budget_min);
      if (budget_max) where.asking_price.lte = Number(budget_max);
    }

    const properties = await prisma.inventory.findMany({
      where,
      take: Math.min(Number(limit), 30),
      orderBy: { created_at: 'desc' },
      select: {
        id: true, title: true, asking_price: true, bedrooms: true,
        property_type: true, city: true, locality: true, media_urls: true,
        description: true, intent: true, category: true,
      },
    });

    if (properties.length === 0) {
      return res.json({ ok: true, count: 0, message: 'Koi property nahi mili aapke criteria se. Filters change karke try karein.' });
    }

    // Ensure all properties are in catalog
    await Promise.all(properties.map(p => upsertCatalogProduct(p).catch(() => null)));

    const wa = WhatsAppService.getInstance();
    const ids = properties.map((p: any) => String(p.id));

    if (ids.length === 1) {
      await wa.sendSingleProductMessage(caller, 'Yeh property match karti hai.', 'Realty Pandit', ids[0]);
    } else {
      await wa.sendMultiProductMessage(
        caller,
        'Matching Properties',
        `${properties.length} properties aapke criteria se match karti hain.`,
        'Realty Pandit',
        [{ title: 'Properties', productRetailerIds: ids }]
      );
    }

    return res.json({ ok: true, count: properties.length, message: `Maine aapke WhatsApp pe ${properties.length} properties bhej di hain.` });
  } catch (err: any) {
    logger.error('[search-and-show-properties]', err.message);
    return res.json({ ok: false, error: err.message });
  }
});

// POST /webhooks/internal/tools/send-booking-flow
router.post('/send-booking-flow', async (req, res) => {
  const { caller, property_id } = req.body;
  if (!caller || !property_id) return res.json({ ok: false, error: 'caller and property_id required' });

  try {
    const property = await prisma.inventory.findUnique({
      where: { id: Number(property_id) },
      select: { id: true, title: true, city: true },
    });
    if (!property) return res.json({ ok: false, error: 'property not found' });

    const flowId = process.env.BOOKING_FLOW_ID;
    if (!flowId) return res.json({ ok: false, error: 'BOOKING_FLOW_ID not configured' });

    const wa = WhatsAppService.getInstance();
    await wa.sendFlow(
      caller,
      flowId,
      `Book a site visit for: ${property.title ?? `Property #${property.id}`}`,
      'DATE_SCREEN',
      { property_id: String(property.id), property_name: property.title ?? `Property #${property.id}` }
    );

    return res.json({ ok: true, message: 'Booking form aapke WhatsApp pe bhej diya.' });
  } catch (err: any) {
    logger.error('[send-booking-flow]', err.message);
    return res.json({ ok: false, error: err.message });
  }
});
```

- [ ] **Step 2: Deploy Component 2**

```bash
rsync -av -e "ssh -i ~/.ssh/realty_pandit_key -F /dev/null" \
  clients/sunny-sharma/projects/reality-pandit/backend/src/ \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 'pm2 restart realty-backend'
```

- [ ] **Step 3: Manual test the endpoint**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'curl -s -X POST http://127.0.0.1:7071/webhooks/internal/tools/search-and-show-properties \
   -H "Content-Type: application/json" \
   -d "{\"caller\":\"919958860411\",\"city\":\"Delhi\",\"limit\":3}"'
```

Expected: `{"ok":true,"count":N,"message":"..."}` and WhatsApp on Puneet's phone shows property cards.

- [ ] **Step 4: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp.ts \
        clients/sunny-sharma/projects/reality-pandit/backend/src/routes/internal_tools.ts
git commit -m "feat(catalog): sendMultiProductMessage + search-and-show-properties endpoint

sendMultiProductMessage(), sendSingleProductMessage(), sendFlow() added to WhatsAppService.
/search-and-show-properties: filter inventory → ensure in catalog → send MPM to caller.
/send-booking-flow: send WhatsApp Flow booking form for a specific property."
```

---

## Component 3 — Voice Tool Integration (Panditji → catalog during calls)

**Files:**
- Modify: `agents/pipecat/tools.py`
- Modify: `agents/pipecat/prompts/panditji_team_member.txt`
- Modify: `agents/pipecat/prompts/panditji.txt`

### Task 3.1 — Add tools to tools.py

- [ ] **Step 1: Add to _TOOL_PATHS dict (after last existing entry)**

```python
    # Catalog / property cards
    "search_and_show_properties": ("POST", "/search-and-show-properties"),
    "send_booking_flow":          ("POST", "/send-booking-flow"),
```

- [ ] **Step 2: Add Gemini function specs**

Find where `TEAM_MEMBER_TOOLS` list is defined. Add after last tool:

```python
{
    "name": "search_and_show_properties",
    "description": (
        "Search inventory and send matching property cards to the caller's WhatsApp. "
        "Use when caller asks to see properties, listings, or inventory. "
        "Always say 'Main aapke WhatsApp pe properties bhej raha/rahi hoon' before calling. "
        "The caller can browse and tap to book directly from those cards."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "city":          {"type": "string"},
            "intent":        {"type": "string", "enum": ["BUY", "RENT"]},
            "property_type": {"type": "string"},
            "category":      {"type": "string", "enum": ["residential", "commercial"]},
            "bhk":           {"type": "integer"},
            "budget_min":    {"type": "number"},
            "budget_max":    {"type": "number"},
            "limit":         {"type": "integer"},
        },
        "required": [],
    },
},
{
    "name": "send_booking_flow",
    "description": (
        "Send a WhatsApp site visit booking form for a specific property. "
        "Use after the caller expresses interest in visiting a property from search results. "
        "Say 'Main booking form bhej raha/rahi hoon' before calling."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "property_id": {"type": "string", "description": "Inventory ID from search results"},
        },
        "required": ["property_id"],
    },
},
```

If a `CUSTOMER_TOOLS` list exists separately, add both tools there too — customers should also be able to request property searches.

- [ ] **Step 3: Verify search_and_show_properties is NOT in _CACHEABLE_TOOLS**

```bash
grep -n "search_and_show\|send_booking" \
  clients/sunny-sharma/projects/reality-pandit/agents/pipecat/tools.py
```

These tools have side effects (send WhatsApp) — must never be cached.

- [ ] **Step 4: Update panditji_team_member.txt**

Append to the end of the file:
```
CATALOG TOOLS: When team member asks to see or send properties to a lead, use search_and_show_properties with filters (city, intent, BHK, budget). Cards arrive on their WhatsApp instantly. When they want to book a visit for a specific property, use send_booking_flow with the property_id.
```

- [ ] **Step 5: Update panditji.txt**

Append to the end of the file:
```
PROPERTY SEARCH: When caller wants to see properties (buy/rent, area, budget), use search_and_show_properties — cards will arrive on their WhatsApp. When they want to visit a property, use send_booking_flow with the property_id.
```

- [ ] **Step 6: Deploy and test voice catalog**

```bash
rsync -av -e "ssh -i ~/.ssh/realty_pandit_key -F /dev/null" \
  clients/sunny-sharma/projects/reality-pandit/agents/pipecat/ \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 'pm2 restart panditji-voice'
```

Make a voice call. Say: "Mujhe Delhi mein 2BHK dikhao." Verify in logs:
```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 50 --nostream 2>&1 | grep -E "Calling function|search_and_show|CatalogSync"'
```

Expected: `Calling function search_and_show_properties`, then `[CatalogSync] Upserted`, then property cards arrive on WhatsApp.

- [ ] **Step 7: Commit**

```bash
git add clients/sunny-sharma/projects/reality-pandit/agents/pipecat/tools.py \
        clients/sunny-sharma/projects/reality-pandit/agents/pipecat/prompts/
git commit -m "feat(voice): Panditji can show catalog properties during voice calls

search_and_show_properties and send_booking_flow added to voice tool dispatcher.
Available to both team members and customers.
Caller hears confirmation; property cards arrive on their WhatsApp in real time."
```

---

## Component 4 — WhatsApp Flows (Filter Form + Booking)

> **Note:** WhatsApp Flows require Meta app review for production. Build and test in draft mode first. Flows also require a registered data endpoint (HTTPS) and RSA key pair for encryption.

**Files:**
- Create: `backend/src/services/whatsapp_flows.ts`
- Create: `backend/src/services/flows/search_filter_flow.json`
- Create: `backend/src/services/flows/booking_flow.json`
- Modify: `backend/src/routes/webhooks.ts`

### Task 4.1 — RSA key pair for Flow encryption

- [ ] **Step 1: Generate key pair on server**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'openssl genrsa -out /var/www/realty-pandit/backend/flow_private.pem 2048 && \
   openssl rsa -in /var/www/realty-pandit/backend/flow_private.pem -pubout \
     -out /var/www/realty-pandit/backend/flow_public.pem && \
   cat /var/www/realty-pandit/backend/flow_public.pem'
```

Save the public key — needed when registering the Flow data endpoint URL with Meta.

- [ ] **Step 2: Add private key to .env**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'PKEY=$(cat /var/www/realty-pandit/backend/flow_private.pem | tr "\n" "|"); \
   echo "FLOW_PRIVATE_KEY=$PKEY" >> /var/www/realty-pandit/backend/.env'
```

The key is stored with `|` as newline separator; code must replace `|` back to `\n` when reading.

### Task 4.2 — whatsapp_flows.ts service

- [ ] **Step 1: Create the service file**

Path: `clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp_flows.ts`

```typescript
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';
const WABA_ID = process.env.WABA_ID ?? '2124684824933246';
const token = () => process.env.WHATSAPP_TOKEN!;
const privateKey = () => (process.env.FLOW_PRIVATE_KEY ?? '').replace(/\|/g, '\n');

export async function createFlow(name: string, categories: string[]): Promise<string> {
  const resp = await axios.post(
    `${GRAPH_BASE}/${WABA_ID}/flows`,
    { name, categories },
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  return resp.data.id;
}

export async function uploadFlowJson(flowId: string, flowJson: object): Promise<void> {
  // Use multipart/form-data to upload flow.json asset
  const boundary = `----FormBoundary${Date.now()}`;
  const jsonStr = JSON.stringify(flowJson);
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="flow.json"',
    'Content-Type: application/json',
    '',
    jsonStr,
    `--${boundary}`,
    'Content-Disposition: form-data; name="name"',
    '',
    'flow.json',
    `--${boundary}`,
    'Content-Disposition: form-data; name="asset_type"',
    '',
    'FLOW_JSON',
    `--${boundary}--`,
  ].join('\r\n');

  await axios.post(`${GRAPH_BASE}/${flowId}/assets`, body, {
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
  });
}

export async function publishFlow(flowId: string): Promise<void> {
  await axios.post(`${GRAPH_BASE}/${flowId}/publish`, {}, {
    headers: { Authorization: `Bearer ${token()}` },
  });
}

export interface DecryptedFlowRequest {
  screen: string;
  data: Record<string, any>;
  version: string;
  action: string;
  aesKey: Buffer;
  iv: Buffer;
}

export function decryptFlowRequest(
  encryptedFlowData: string,
  encryptedAesKey: string,
  initialVector: string
): DecryptedFlowRequest {
  const aesKey = crypto.privateDecrypt(
    { key: privateKey(), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(encryptedAesKey, 'base64')
  );
  const iv = Buffer.from(initialVector, 'base64');
  const bodyBuf = Buffer.from(encryptedFlowData, 'base64');
  const TAG_LEN = 16;
  const tag = bodyBuf.subarray(-TAG_LEN);
  const ciphertext = bodyBuf.subarray(0, -TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const body = JSON.parse(decrypted.toString());
  return { ...body, aesKey, iv };
}

export function encryptFlowResponse(
  responseData: any,
  aesKey: Buffer,
  iv: Buffer
): string {
  const flippedIv = Buffer.from(iv.map(b => ~b & 0xff));
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(responseData), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString('base64');
}
```

### Task 4.3 — Flow JSON definitions

- [ ] **Step 1: Create search_filter_flow.json**

Path: `clients/sunny-sharma/projects/reality-pandit/backend/src/services/flows/search_filter_flow.json`

```json
{
  "version": "7.1",
  "screens": [
    {
      "id": "SEARCH_SCREEN",
      "title": "Find Properties",
      "terminal": false,
      "data": {
        "cities": { "type": "array", "__example__": ["Delhi", "Noida"] },
        "property_types": { "type": "array", "__example__": ["Flat", "Villa"] }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextHeading", "text": "Property Search" },
          {
            "type": "Dropdown",
            "name": "city",
            "label": "City",
            "required": true,
            "data-source": "${data.cities}"
          },
          {
            "type": "RadioButtonsGroup",
            "name": "intent",
            "label": "Purpose",
            "required": true,
            "data-source": [
              { "id": "BUY", "title": "Buy" },
              { "id": "RENT", "title": "Rent" }
            ]
          },
          {
            "type": "RadioButtonsGroup",
            "name": "category",
            "label": "Category",
            "required": true,
            "data-source": [
              { "id": "residential", "title": "Residential" },
              { "id": "commercial", "title": "Commercial" }
            ]
          },
          {
            "type": "Dropdown",
            "name": "property_type",
            "label": "Property Type",
            "data-source": "${data.property_types}"
          },
          {
            "type": "Dropdown",
            "name": "bhk",
            "label": "BHK",
            "data-source": [
              {"id": "1", "title": "1 BHK"},
              {"id": "2", "title": "2 BHK"},
              {"id": "3", "title": "3 BHK"},
              {"id": "4", "title": "4+ BHK"}
            ]
          },
          {
            "type": "Footer",
            "label": "Search",
            "on-click-action": {
              "name": "data_exchange",
              "payload": {
                "city": "${form.city}",
                "intent": "${form.intent}",
                "category": "${form.category}",
                "property_type": "${form.property_type}",
                "bhk": "${form.bhk}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "RESULT_SCREEN",
      "title": "Search Results",
      "terminal": true,
      "data": {
        "result_message": { "type": "string", "__example__": "5 properties found! Check your WhatsApp." }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextBody", "text": "${data.result_message}" },
          {
            "type": "Footer",
            "label": "Done",
            "on-click-action": { "name": "complete", "payload": {} }
          }
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Create booking_flow.json**

Path: `clients/sunny-sharma/projects/reality-pandit/backend/src/services/flows/booking_flow.json`

```json
{
  "version": "7.1",
  "screens": [
    {
      "id": "DATE_SCREEN",
      "title": "Book Site Visit",
      "terminal": false,
      "data": {
        "property_name": { "type": "string", "__example__": "2BHK Flat, Noida" },
        "property_id":   { "type": "string", "__example__": "123" },
        "available_dates": { "type": "array", "__example__": [{"id":"2026-04-21","title":"Mon, Apr 21"}] }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextHeading", "text": "${data.property_name}" },
          {
            "type": "Dropdown",
            "name": "visit_date",
            "label": "Select Date",
            "required": true,
            "data-source": "${data.available_dates}"
          },
          {
            "type": "Footer",
            "label": "Choose Time",
            "on-click-action": {
              "name": "data_exchange",
              "payload": {
                "visit_date": "${form.visit_date}",
                "property_id": "${data.property_id}",
                "property_name": "${data.property_name}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "TIME_SCREEN",
      "title": "Select Time",
      "terminal": false,
      "data": {
        "visit_date":    { "type": "string", "__example__": "2026-04-21" },
        "property_id":   { "type": "string", "__example__": "123" },
        "property_name": { "type": "string", "__example__": "2BHK Flat, Noida" },
        "available_slots": {
          "type": "array",
          "__example__": [{"id":"10:00","title":"10:00 AM"},{"id":"14:00","title":"2:00 PM"}]
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextBody", "text": "Available slots on ${data.visit_date}:" },
          {
            "type": "RadioButtonsGroup",
            "name": "visit_time",
            "label": "Time Slot",
            "required": true,
            "data-source": "${data.available_slots}"
          },
          {
            "type": "Footer",
            "label": "Confirm Booking",
            "on-click-action": {
              "name": "data_exchange",
              "payload": {
                "visit_date": "${data.visit_date}",
                "visit_time": "${form.visit_time}",
                "property_id": "${data.property_id}",
                "property_name": "${data.property_name}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "CONFIRM_SCREEN",
      "title": "Booking Confirmed",
      "terminal": true,
      "data": {
        "confirmation_message": { "type": "string", "__example__": "Visit booked for Mon Apr 21 at 10 AM!" }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextBody", "text": "${data.confirmation_message}" },
          {
            "type": "Footer",
            "label": "Done",
            "on-click-action": { "name": "complete", "payload": {} }
          }
        ]
      }
    }
  ]
}
```

### Task 4.4 — Flow data endpoint in webhooks.ts

- [ ] **Step 1: Read webhooks.ts to find existing router pattern**

```bash
grep -n "router\.\|export\|import" \
  clients/sunny-sharma/projects/reality-pandit/backend/src/routes/webhooks.ts | head -30
```

- [ ] **Step 2: Add Flow data endpoint**

```typescript
import { decryptFlowRequest, encryptFlowResponse } from '../services/whatsapp_flows';
import dayjs from 'dayjs';

// GET /webhooks/flows/data — Meta health check
// POST /webhooks/flows/data — Meta calls to get dynamic screen data
router.all('/flows/data', async (req, res) => {
  // Health check (no body)
  if (!req.body?.encrypted_flow_data) {
    return res.json({ data: { status: 'active' } });
  }

  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
    const { screen, data, action, aesKey, iv } = decryptFlowRequest(
      encrypted_flow_data, encrypted_aes_key, initial_vector
    );

    let responseData: any;

    if (screen === 'SEARCH_SCREEN' && action === 'INIT') {
      const [cityRows, typeRows] = await Promise.all([
        prisma.inventory.findMany({ where: { status: 'ACTIVE' }, select: { city: true }, distinct: ['city'] }),
        prisma.inventory.findMany({ where: { status: 'ACTIVE' }, select: { property_type: true }, distinct: ['property_type'] }),
      ]);
      responseData = {
        screen: 'SEARCH_SCREEN',
        data: {
          cities: cityRows.map((r: any) => ({ id: r.city, title: r.city })).filter((r: any) => r.id),
          property_types: typeRows.map((r: any) => ({ id: r.property_type, title: r.property_type })).filter((r: any) => r.id),
        },
      };

    } else if (screen === 'SEARCH_SCREEN' && action === 'data_exchange') {
      const { city, intent, category, property_type, bhk, phone } = data;
      const where: any = { status: 'ACTIVE' };
      if (city) where.city = { contains: city, mode: 'insensitive' };
      if (intent) where.intent = intent;
      if (category) where.category = { contains: category, mode: 'insensitive' };
      if (property_type) where.property_type = { contains: property_type, mode: 'insensitive' };
      if (bhk) where.bedrooms = Number(bhk);

      const properties = await prisma.inventory.findMany({ where, take: 20, orderBy: { created_at: 'desc' } });

      if (phone && properties.length > 0) {
        const { upsertCatalogProduct } = await import('../services/catalog_sync');
        const wa = WhatsAppService.getInstance();
        await Promise.all(properties.map((p: any) => upsertCatalogProduct(p).catch(() => null)));
        const ids = properties.map((p: any) => String(p.id));
        await wa.sendMultiProductMessage(phone, 'Matching Properties',
          `${properties.length} properties match your search.`, 'Realty Pandit',
          [{ title: 'Results', productRetailerIds: ids }]
        ).catch(e => logger.warn('[Flow] MPM send failed:', e.message));
      }

      responseData = {
        screen: 'RESULT_SCREEN',
        data: {
          result_message: properties.length > 0
            ? `${properties.length} properties mil gayi! Check karo apna WhatsApp.`
            : 'Koi property nahi mili. Filters change karke try karein.',
        },
      };

    } else if (screen === 'DATE_SCREEN' && action === 'INIT') {
      const next7 = Array.from({ length: 7 }, (_, i) => {
        const d = dayjs().add(i + 1, 'day');
        return { id: d.format('YYYY-MM-DD'), title: d.format('ddd, MMM D') };
      });
      responseData = {
        screen: 'DATE_SCREEN',
        data: { ...data, available_dates: next7 },
      };

    } else if (screen === 'DATE_SCREEN' && action === 'data_exchange') {
      const slots = ['10:00 AM','11:00 AM','12:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM']
        .map(t => ({ id: t, title: t }));
      responseData = { screen: 'TIME_SCREEN', data: { ...data, available_slots: slots } };

    } else if (screen === 'TIME_SCREEN' && action === 'data_exchange') {
      const { visit_date, visit_time, property_id, property_name } = data;
      // phone comes from the Flow token/context — Meta passes it via the webhook
      const phone = req.body?.from ?? data.phone;

      const scheduledAt = dayjs(`${visit_date} ${visit_time}`, 'YYYY-MM-DD h:mm A').toDate();
      const contact = phone ? await prisma.contact.findFirst({ where: { phone_number: phone } }) : null;

      await prisma.appointment.create({
        data: {
          scheduled_at: scheduledAt,
          type: 'SITE_VISIT',
          status: 'PENDING',
          notes: `WhatsApp Flow booking. Property: ${property_name} (ID: ${property_id})`,
          contact_id: contact?.id ?? null,
          inventory_id: property_id ? Number(property_id) : null,
          source: 'WHATSAPP_FLOW',
        },
      });

      // Notify assigned agent
      const inventory = property_id
        ? await prisma.inventory.findUnique({
            where: { id: Number(property_id) },
            include: { assigned_agent: true },
          })
        : null;

      if (inventory?.assigned_agent?.phone) {
        const wa = WhatsAppService.getInstance();
        await wa.sendTemplate(inventory.assigned_agent.phone, 'rp_visit_agent_notify_v3', [
          { type: 'text', text: contact?.name ?? phone ?? 'Customer' },
          { type: 'text', text: property_name ?? `Property #${property_id}` },
          { type: 'text', text: dayjs(scheduledAt).format('ddd, MMM D [at] h:mm A') },
        ]).catch(e => logger.warn('[Flow] Agent notify failed:', e.message));
      }

      responseData = {
        screen: 'CONFIRM_SCREEN',
        data: {
          confirmation_message: `Visit book ho gaya ${dayjs(scheduledAt).format('ddd, MMM D')} ko ${visit_time} pe. Hamari team contact karegi!`,
        },
      };

    } else {
      responseData = { screen, data };
    }

    return res.json({ encrypted_response: encryptFlowResponse(responseData, aesKey, iv) });
  } catch (err: any) {
    logger.error('[Flows Data Endpoint]', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
});
```

### Task 4.5 — Create Flows on Meta + register data endpoint

- [ ] **Step 1: Create search flow via API**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'TOKEN=$(grep "^WHATSAPP_TOKEN=" /var/www/realty-pandit/backend/.env | cut -d= -f2-); \
   curl -s -X POST "https://graph.facebook.com/v22.0/2124684824933246/flows" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d "{\"name\":\"Property Search\",\"categories\":[\"OTHER\"]}"'
```

Note the `id` from response → `SEARCH_FLOW_ID`

- [ ] **Step 2: Create booking flow**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'TOKEN=$(grep "^WHATSAPP_TOKEN=" /var/www/realty-pandit/backend/.env | cut -d= -f2-); \
   curl -s -X POST "https://graph.facebook.com/v22.0/2124684824933246/flows" \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d "{\"name\":\"Site Visit Booking\",\"categories\":[\"APPOINTMENT_BOOKING\"]}"'
```

Note the `id` → `BOOKING_FLOW_ID`

- [ ] **Step 3: Register data endpoint URL on both flows**

```bash
# Replace FLOW_ID with actual IDs from above
TOKEN=$(grep "^WHATSAPP_TOKEN=" /var/www/realty-pandit/backend/.env | cut -d= -f2-)

curl -s -X POST "https://graph.facebook.com/v22.0/<SEARCH_FLOW_ID>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_uri":"https://api.realtypandit.in/webhooks/flows/data"}'

curl -s -X POST "https://graph.facebook.com/v22.0/<BOOKING_FLOW_ID>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_uri":"https://api.realtypandit.in/webhooks/flows/data"}'
```

- [ ] **Step 4: Add Flow IDs to server .env**

```bash
ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224 \
  'echo "SEARCH_FLOW_ID=<id>" >> /var/www/realty-pandit/backend/.env && \
   echo "BOOKING_FLOW_ID=<id>" >> /var/www/realty-pandit/backend/.env'
```

- [ ] **Step 5: Upload Flow JSONs to Meta**

Write a one-off Node script:
```typescript
// run with: npx ts-node scripts/upload_flows.ts
import { uploadFlowJson, publishFlow } from '../src/services/whatsapp_flows';
import searchFlow from '../src/services/flows/search_filter_flow.json';
import bookingFlow from '../src/services/flows/booking_flow.json';

await uploadFlowJson(process.env.SEARCH_FLOW_ID!, searchFlow);
await uploadFlowJson(process.env.BOOKING_FLOW_ID!, bookingFlow);
// Test in draft mode first — only call publishFlow after testing
// await publishFlow(process.env.SEARCH_FLOW_ID!);
```

- [ ] **Step 6: Test Flow in draft mode**

Send a flow message to yourself using `sendFlow()` with `mode: 'draft'`. Verify the form opens in WhatsApp, submit it, verify appointment created in DB.

- [ ] **Step 7: Commit Component 4**

```bash
git add clients/sunny-sharma/projects/reality-pandit/backend/src/services/whatsapp_flows.ts \
        clients/sunny-sharma/projects/reality-pandit/backend/src/services/flows/ \
        clients/sunny-sharma/projects/reality-pandit/backend/src/routes/webhooks.ts
git commit -m "feat(flows): WhatsApp Flows for property search + site visit booking

Flow data endpoint /webhooks/flows/data with AES-128-GCM encryption.
Search Flow: city/intent/category/BHK → sends filtered MPM on submit.
Booking Flow: date + time picker → appointment in DB → agent WhatsApp notify."
```

---

## Deployment Order

```
Pre-flight (v17→v22) →
Component 1 (catalog_sync) →
Component 2 (MPM + internal endpoint) →
Component 3 (voice tools) →
Component 4 (Flows — draft test first, then publish)
```

---

## End-to-End Verification Checklist

| Test | How | Pass |
|------|-----|------|
| Catalog sync on create | Create inventory in admin | `[CatalogSync] Upserted` in logs |
| Nightly reconcile | Trigger job manually | All active inventory in Meta catalog, orphans removed |
| Text bot MPM | Text Panditji "Delhi 2BHK dikhao" | Property cards arrive in WhatsApp |
| Voice bot MPM | Call Panditji, say "Delhi mein flats dikhao" | Cards arrive on phone WhatsApp during call |
| Voice booking flow | Say "iss property ke liye visit book karo" after search | Booking form opens in WhatsApp |
| Filter Flow (Way 3) | Trigger search flow link | Form opens, submit → property cards arrive |
| Booking Flow (Option B) | Tap book button on property card | Date/time picker → appointment in DB → agent notified |
