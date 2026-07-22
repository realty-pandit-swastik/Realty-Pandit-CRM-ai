# Dealer Brochure PDF + Own-WhatsApp Share Implementation Plan

> **For agentic workers:** Execute with **superpowers:executing-plans** (INLINE, phase-boundary checkpoints — per `feedback_subagent_overhead`, NOT subagent-driven for this mechanical/integration work). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a team member shares inventories via company WhatsApp, the system recognizes the recipient — **direct customers keep the existing v5 property-card (untouched); dealers/partners receive a brand-free single-property PDF brochure delivered as a MakeMyTrip-style document template (one message per property, "1 of N")**. After the company send, the system offers a "share from your own WhatsApp" deep-link into the client's chat. Every share is stamped with `deal_id` so it surfaces in the deal-pipeline timeline.

**Architecture:** A new `resolveShareMode(phone)` recognizer (active `PartnerAgent` → dealer, else direct) routes the existing `POST /inventory/:id/share-to-client` surface. The dealer branch builds a **brandless** single-property PDF (existing `pdf_generator.ts`, polished), serves it from a new **public token-signed** `GET /inventory/:id/brochure.pdf`, and delivers it through a new `sendDocumentTemplate()` + a new Meta **DOCUMENT-header UTILITY template** (`rp_property_brochure_v1`). The direct branch calls the existing `shareInventoryCard` (v5 card) **unchanged**. A shared frontend helper builds the numbered own-WhatsApp text. The `deal_id` stamp on each `property_shared` interaction closes the timeline gap.

**Tech Stack:** Node/TS (ts-node), Prisma/Postgres, `pdfkit`, WhatsApp Cloud API (Graph v25.0, document templates), Vite+React (admin), BullMQ unaffected.

**Hard constraints (do NOT violate):**
- ❌ **Do not touch the v5/v4 property-card templates** (`rp_property_card_*_v5`, the v4 fallback) or `buildV5Card`/`shareInventoryCard`'s direct-client path. Direct customers must keep receiving exactly what they get today.
- ❌ Redaction is **server-side only** — never a frontend toggle (mirrors the existing `share-pdf` security note).
- ❌ Do not `npm install` inside a worktree (node_modules are junctioned). `pdfkit` is already installed on prod.
- 🔒 The brandless PDF is the only variant a dealer recipient can ever receive, regardless of request body.
- 📵 **Exclude developer number** `+919958860411` from any auto-recognition test sends.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `agents/backend/src/services/share_recognition.ts` | **Create** | `resolveShareMode(phone)` → `{ mode:'direct'|'dealer', partner }` |
| `agents/backend/src/utils/pdf_token.ts` | **Create** | HMAC sign/verify for the public PDF link (`{inventory_id, variant, exp}`) |
| `agents/backend/src/services/pdf_generator.ts` | **Modify** | Redaction (keep building+locality+city; strip only flat/plot); inventory-ID corner on brandless; readable filename; multi-photo |
| `agents/backend/src/services/whatsapp.ts` | **Modify** | `sendDocumentTemplate(to, template, { pdfUrl, filename, bodyParams })` |
| `agents/backend/src/services/property_sharing.ts` | **Modify** | `shareInventoryBrochure(phone, inv, opts)` — dealer document path (parallel to `shareInventoryCard`, which stays unchanged) |
| `agents/backend/src/routes/inventory.ts` | **Modify** | Public `GET /:id/brochure.pdf` (token-gated); recipient-aware batch share `POST /share-batch-to-client` with seq/total + `deal_id` stamp |
| `agents/backend/src/scripts/submit_brochure_template.js` | **Create** | Submit `rp_property_brochure_v1` (DOCUMENT/UTILITY) to Meta |
| `agents/backend/src/config/whatsapp_templates.ts` | **Modify** | Register `rp_property_brochure` logical key → Meta name |
| `agents/frontend/src/lib/buildWhatsAppShareText.ts` | **Create** | Numbered text builder (reuses the `MatchShareTab` formatter), recipient-aware |
| `agents/frontend/src/components/ShareToClientModal.tsx` | **Modify** | Post-send success → "Share from your own WhatsApp" deep-link button |
| `agents/backend/src/__tests__/share_recognition.test.ts` | **Create** | unit: dealer vs direct |
| `agents/backend/src/__tests__/pdf_brochure.test.ts` | **Create** | unit: redaction + filename + token |

---

## Phase 1 — Recipient recognition (foundation, no UI/DB writes)

**Files:** Create `services/share_recognition.ts`, `__tests__/share_recognition.test.ts`.

- [ ] **Step 1: Write the failing test** — `__tests__/share_recognition.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveShareMode } from '../services/share_recognition';
import { prisma } from '../db';

vi.mock('../db', () => ({ prisma: { partnerAgent: { findFirst: vi.fn() } } }));

describe('resolveShareMode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns dealer when an ACTIVE PartnerAgent matches the phone', async () => {
    (prisma.partnerAgent.findFirst as any).mockResolvedValue({ phone_number: '+919810721286', name: 'Shiv', status: 'ACTIVE' });
    const r = await resolveShareMode('9810721286');
    expect(r.mode).toBe('dealer');
    expect(r.partner?.name).toBe('Shiv');
  });

  it('returns direct when no PartnerAgent matches', async () => {
    (prisma.partnerAgent.findFirst as any).mockResolvedValue(null);
    const r = await resolveShareMode('+919958804559');
    expect(r.mode).toBe('direct');
    expect(r.partner).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/__tests__/share_recognition.test.ts` → "Cannot find module '../services/share_recognition'".

- [ ] **Step 3: Implement** — `services/share_recognition.ts`

```ts
import { prisma } from '../db';
import { phoneVariants } from '../utils/phone';

export type ShareMode = 'direct' | 'dealer';
export interface ShareModeResult {
  mode: ShareMode;
  partner: { phone_number: string; name: string } | null;
}

/**
 * Recognize a share recipient by phone. An ACTIVE PartnerAgent → dealer (brandless
 * brochure); otherwise → direct customer (existing v5 card). The signal is the
 * PartnerAgent table — every dealer we onboard is stored there (phone_number @unique).
 */
export async function resolveShareMode(phone: string): Promise<ShareModeResult> {
  const variants = phoneVariants(phone);
  const partner = await prisma.partnerAgent.findFirst({
    where: { phone_number: { in: variants }, status: 'ACTIVE' },
    select: { phone_number: true, name: true },
  });
  return partner ? { mode: 'dealer', partner } : { mode: 'direct', partner: null };
}
```

- [ ] **Step 4: Run tests, expect PASS.** Confirm `prisma` import path matches the repo (`../db` — verify against a neighbor service; adjust if the singleton is exported elsewhere).

- [ ] **Step 5: tsc diff** — `npx tsc --noEmit 2>&1 | wc -l` must equal the ~381 baseline (no new errors). Commit: `feat(share): recipient recognition (dealer vs direct) for inventory sharing`.

---

## Phase 2 — Brandless brochure PDF polish (single-property, building+locality+city, ID corner, readable name)

**Files:** Modify `services/pdf_generator.ts`; Create `__tests__/pdf_brochure.test.ts`.

- [ ] **Step 1: Write failing tests** — `__tests__/pdf_brochure.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { brochureFilename, redactForBrandless } from '../services/pdf_generator';

const inv: any = {
  id: 'x', display_id: 'RP-GZB-RES-20471', type: 'flat', specs: { bhk: 3 },
  apartment_name: 'Prestige Tower', flat_no: '302', plot_no: null,
  full_address: 'Flat 302, Prestige Tower, Whitefield', sub_locality: 'Block C',
  locality: 'Whitefield', city: 'Bengaluru', owner_phone: '+9199...', owner_name: 'Owner',
};

describe('brandless redaction (building+locality+city visible, unit hidden)', () => {
  const r = redactForBrandless(inv);
  it('hides flat/plot + owner + literal full address', () => {
    expect(r.flat_no).toBeNull();
    expect(r.plot_no).toBeNull();
    expect(r.owner_phone).toBeNull();
    expect(r.owner_name).toBeNull();
    expect(r.full_address).toBeNull();        // may contain the unit number → strip
  });
  it('KEEPS building name + locality + city', () => {
    expect(r.apartment_name).toBe('Prestige Tower');
    expect(r.locality).toBe('Whitefield');
    expect(r.city).toBe('Bengaluru');
  });
});

describe('brochureFilename', () => {
  it('is human-readable, inventory-related, and carries NO brand', () => {
    const f = brochureFilename(inv);
    expect(f).toMatch(/RP-GZB-RES-20471\.pdf$/);
    expect(f.toLowerCase()).not.toContain('realtypandit');
    expect(f).toMatch(/^[\w.-]+$/); // safe charset
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`brochureFilename` not exported).

- [ ] **Step 3a: Change `redactForBrandless`** ([pdf_generator.ts:102-114](../../agents/backend/src/services/pdf_generator.ts)) — keep the building name, strip only the unit + literal address:

```ts
function redactForBrandless(inv: InventoryForPdf): InventoryForPdf {
    return {
        ...inv,
        owner_phone: null,
        owner_name: null,
        flat_no: null,          // unit — hidden
        plot_no: null,          // unit — hidden
        full_address: null,     // literal line may embed the unit → hidden
        sub_locality: null,     // too granular
        // KEEP: apartment_name (building), locality, city, district, state, specs, features, price, images, type
    };
}
```

- [ ] **Step 3b: Update `locationLine`** so the brandless address reads building → locality → city:

```ts
function locationLine(inv: InventoryForPdf): string {
    const parts = [inv.apartment_name, inv.locality, inv.city || inv.district].filter(Boolean);
    return parts.join(', ') || inv.location || 'Location available on request';
}
```

- [ ] **Step 3c: Add `brochureFilename` (exported)** near the top of the file:

```ts
const TITLECASE = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Human-readable, brand-free PDF filename tied to the inventory. e.g. 3BHK-Flat-Whitefield-RP-GZB-RES-20471.pdf */
export function brochureFilename(inv: InventoryForPdf): string {
    const s = (inv.specs || {}) as Record<string, any>;
    const bhk = (s.bhk ?? s.rooms ?? s.bedrooms) ? `${s.bhk ?? s.rooms ?? s.bedrooms}BHK-` : '';
    const type = TITLECASE(inv.type || 'Property').replace(/\s+/g, '');
    const loc = (inv.locality || inv.city || '').replace(/\s+/g, '');
    const id = inv.display_id || inv.id;
    return `${bhk}${type}${loc ? '-' + loc : ''}-${id}.pdf`.replace(/[^\w.-]/g, '');
}
```

- [ ] **Step 3d: Inventory ID in the brandless corner** — in the brandless footer branch ([pdf_generator.ts:230-240](../../agents/backend/src/services/pdf_generator.ts)), add after the partner block:

```ts
        if (inv.display_id) {
            doc.fillColor(MUTED).fontSize(7)
                .text(inv.display_id, doc.page.width - 120, footerY + 34, { width: 100, align: 'right' });
        }
```

- [ ] **Step 3e: Multi-photo (hero + up-to-3 strip)** — after the hero image block, if `inv.media_urls.length > 1` render a thumbnail row of the next up-to-3 resolvable images at `[40, cursorY, ~165w x 90h]` spaced; advance `cursorY` by ~100. (Guard each `doc.image` in try/catch like the hero; skip non-resolvable/`http` urls via existing `resolveMediaPath`.)

- [ ] **Step 4: Run tests, expect PASS.**

- [ ] **Step 5: tsc diff = baseline.** Commit: `feat(pdf): brandless brochure polish — building/locality/city, ID corner, readable filename, multi-photo`.

---

## Phase 3 — Public token-signed per-inventory PDF endpoint

**Files:** Create `utils/pdf_token.ts`; Modify `routes/inventory.ts`.

- [ ] **Step 1: Write failing test** (append to `pdf_brochure.test.ts`)

```ts
import { signPdfToken, verifyPdfToken } from '../utils/pdf_token';
describe('pdf_token', () => {
  it('round-trips and rejects tampering', () => {
    const tok = signPdfToken('inv1', 'brandless', 9999999999);
    expect(verifyPdfToken('inv1', 'brandless', tok)).toBe(true);
    expect(verifyPdfToken('inv1', 'branded', tok)).toBe(false);  // variant bound
    expect(verifyPdfToken('inv2', 'brandless', tok)).toBe(false); // id bound
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3a: Implement `utils/pdf_token.ts`** (HMAC over `id|variant|exp`, secret from `PDF_LINK_SECRET` || `JWT_SECRET` fallback):

```ts
import { createHmac } from 'crypto';
const SECRET = process.env.PDF_LINK_SECRET || process.env.JWT_SECRET || 'rp-pdf-dev-secret';

export function signPdfToken(id: string, variant: string, exp: number): string {
  const payload = `${id}|${variant}|${exp}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
  return `${exp}.${sig}`;
}
export function verifyPdfToken(id: string, variant: string, token: string): boolean {
  const [expStr, sig] = (token || '').split('.');
  const exp = Number(expStr);
  if (!exp || !sig || exp < Math.floor(Date.now() / 1000)) return false;
  return signPdfToken(id, variant, exp).endsWith(`.${sig}`);
}
```
> Note: `Date.now()` is fine in app code (it is forbidden only inside Workflow scripts).

- [ ] **Step 3b: Add the public route** in `routes/inventory.ts` — **before** any `authMiddleware`-mounted block, mirroring the unauthenticated `GET /:id/media` (line ~1717):

```ts
// GET /inventory/:id/brochure.pdf?variant=brandless&token=... — PUBLIC, token-gated.
// The recipient (or a forwarded dealer-client) opens this directly; no admin login.
router.get('/:id/brochure.pdf', async (req: any, res) => {
    try {
        const { id } = req.params;
        const variant = req.query.variant === 'branded' ? 'branded' : 'brandless';
        if (!verifyPdfToken(id, variant, String(req.query.token || ''))) {
            return res.status(403).send('Invalid or expired link');
        }
        const inv = await prisma.inventory.findUnique({ where: { id }, /* select the InventoryForPdf fields incl. specs, media_urls, apartment_name, locality, city, display_id, owner_* */ });
        if (!inv) return res.status(404).send('Not found');

        const { generateInventoryPdfStream, brochureFilename } = await import('../services/pdf_generator');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${brochureFilename(inv as any)}"`);
        generateInventoryPdfStream([inv as any], {
            variant,
            partnerName: req.query.pn ? String(req.query.pn) : undefined,
            partnerPhone: req.query.pp ? String(req.query.pp) : undefined,
        }).pipe(res);
    } catch (err) {
        captureRouteError(err, req, { route: 'inventory#brochure-pdf' });
        res.status(500).send('Could not generate brochure');
    }
});
```

- [ ] **Step 4: tsc diff = baseline.** Commit: `feat(inventory): public token-signed per-inventory brochure PDF endpoint`.

- [ ] **Step 5: Runtime verify after deploy** — `curl -sI "https://<api>/api/inventory/<realID>/brochure.pdf?variant=brandless&token=<signed>"` → `200 application/pdf`; tampered token → `403`. (Use the **verify** skill; capture the headers.)

---

## Phase 4 — `sendDocumentTemplate` + submit the Meta document template

**Files:** Modify `services/whatsapp.ts`; Create `scripts/submit_brochure_template.js`; Modify `config/whatsapp_templates.ts`.

- [ ] **Step 1: Add `sendDocumentTemplate`** to `WhatsAppService` (mirror `sendTemplate`'s strict call path; header = document by link):

```ts
public async sendDocumentTemplate(
  to: string, templateName: string,
  opts: { pdfUrl: string; filename: string; bodyParams: string[] },
): Promise<void> {
  const components = [
    { type: 'header', parameters: [{ type: 'document', document: { link: opts.pdfUrl, filename: opts.filename } }] },
    { type: 'body', parameters: opts.bodyParams.map((t) => ({ type: 'text', text: t })) },
  ];
  await this.callWhatsAppAPIStrict({
    messaging_product: 'whatsapp', to: this.normalize(to), type: 'template',
    template: { name: templateName, language: { code: 'en' }, components },
  });
}
```
> Reuse the exact strict-send/normalize helpers `sendTemplate` uses (read it first; match signatures). No new error handling pattern.

- [ ] **Step 2: Write the submission script** `scripts/submit_brochure_template.js` — clone of `submit_property_templates_v5.js` but **DOCUMENT** header. Generate a one-page **sample** brandless PDF buffer (call `generateInventoryPdfStream` with a stub inventory, collect to Buffer), upload via the resumable upload API to get `header_handle`, then submit:

```js
const tpl = {
  name: 'rp_property_brochure_v1', language: 'en', category: 'UTILITY',
  components: [
    { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [docHandle] } },
    { type: 'BODY',
      text: 'Namaste 🙏 Here are the complete details of the {{1}} (Property {{2}}).\n\n'
          + 'Please find the attached brochure with photos, specifications & pricing.\n\n'
          + 'Reply here or call us to schedule a visit.',
      example: { body_text: [['2 BHK Flat in Vaishali, Ghaziabad', '1 of 3']] } },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Schedule Visit' }] },
  ],
};
// POST `${BASE}/${WABA}/message_templates` with Bearer token (reuse submit() from v5 script)
```

- [ ] **Step 3: Submit to Meta** (server, **authorized action — follow `runbooks/meta-template-approval.md`**): `cd /var/www/realty-pandit/backend && node src/scripts/submit_brochure_template.js`. Category **UTILITY** (the 4-week category-lock trap applies — get it right the first time). Record the returned id/status.

- [ ] **Step 4: Poll for APPROVED** — `GET /v25.0/<WABA>/message_templates?fields=name,status,category&access_token=$WHATSAPP_TOKEN` until `rp_property_brochure_v1 = UTILITY / APPROVED`.

- [ ] **Step 5: Register** in `config/whatsapp_templates.ts` (logical key `rp_property_brochure` → `rp_property_brochure_v1`). Commit code (script + service + registry): `feat(whatsapp): document-template send + rp_property_brochure_v1 (dealer brochure)`.

---

## Phase 5 — Recipient-aware company-WhatsApp batch share + `deal_id` stamp (fixes timeline)

**Files:** Modify `services/property_sharing.ts`, `routes/inventory.ts`, frontend `ShareToClientModal.tsx`/`InventoryList.tsx`.

- [ ] **Step 1: Add `shareInventoryBrochure`** to `property_sharing.ts` — the dealer document path (does NOT alter `shareInventoryCard`):

```ts
// Dealer/partner brochure send: brandless single-property PDF via document template.
// Returns true only if Meta accepted (sendDocumentTemplate throws strictly).
export async function shareInventoryBrochure(
  phone: string, inv: any, seq: { index: number; total: number }, partner?: { name?: string; phone_number?: string },
): Promise<boolean> {
  const { signPdfToken } = await import('../utils/pdf_token');
  const { brochureFilename } = await import('./pdf_generator');
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30-day link
  const token = signPdfToken(inv.id, 'brandless', exp);
  const base = process.env.PUBLIC_API_BASE || 'https://realtypandit.in/api';
  const pdfUrl = `${base}/inventory/${inv.id}/brochure.pdf?variant=brandless&token=${token}`
    + (partner?.name ? `&pn=${encodeURIComponent(partner.name)}&pp=${encodeURIComponent(partner.phone_number || '')}` : '');
  const summary = buildPropertySummary(inv); // "2 BHK Flat in Vaishali, Ghaziabad" — small local helper
  const wa = new WhatsAppService();
  await wa.sendDocumentTemplate(phone, 'rp_property_brochure_v1', {
    pdfUrl, filename: brochureFilename(inv), bodyParams: [summary, `${seq.index + 1} of ${seq.total}`],
  });
  return true;
}
```

- [ ] **Step 2: Add a `resolveActiveDealId(phone)` helper** (resolve the recipient's open `Transaction` via `demand_contact_id` = phone) so shares can be tagged. Return the most-recent active deal id or `null`.

- [ ] **Step 3: New batch endpoint** `POST /inventory/share-batch-to-client` (`authMiddleware` + `share_inventory`), body `{ inventory_ids: string[], client_phone, client_name }`:
  1. normalize phone; upsert BUYER contact (reuse existing block).
  2. `const { mode, partner } = await resolveShareMode(normalized)`.
  3. `const dealId = await resolveActiveDealId(normalized)`.
  4. load the inventories (authorized subset, same auth checks as `/share-to-client`).
  5. loop `inventories` with index/total:
     - **dealer:** `whatsappSent = await shareInventoryBrochure(normalized, inv, { index, total }, partner)`.
     - **direct:** `whatsappSent = await shareInventoryCard(normalized, inv)` (**unchanged path**).
  6. for each, create `PropertyShare` (+ `channel` = `mode==='dealer'?'whatsapp_brochure':'whatsapp_api'`) and the `property_shared` **interaction with `metadata.deal_id = dealId`** (the fix), plus `inventory_id`, `share_id`, `property_link`, `variant: mode`.
  7. respond `{ success, mode, results: [{ inventory_id, whatsapp_sent }] }`.

```ts
metadata: { inventory_id: inv.id, share_id: share.id, property_link: pdfUrlOrWebLink, deal_id: dealId, variant: mode }
```

- [ ] **Step 4: Point the frontend batch share at the new endpoint** — `InventoryList.tsx` `handleBatchShare` (and the mobile list) call `POST /inventory/share-batch-to-client` once with `inventory_ids[]` instead of looping `/share-to-client`. `ShareToClientModal` shows the per-property results + the `mode` ("Sent as brochure to partner" vs "Sent property card").

- [ ] **Step 5: tsc diff = baseline; vitest baseline 162/172 preserved.** Commit (backend): `feat(inventory): recipient-aware batch share (dealer brochure vs direct card) + deal_id stamp`. Commit (frontend) separately.

- [ ] **Step 6: Runtime verify** (test number you control, NOT the dev number): share 3 inventories to (a) a number stored as an ACTIVE PartnerAgent → 3 document messages arrive, each a brand-free PDF card "1 of 3 / 2 of 3 / 3 of 3", filenames readable, **PDF shows building+locality+city, no flat/plot, ID in corner**; (b) a normal number → unchanged v5 cards. Then open the deal → the shares now appear in the **timeline** and as **already-shared** badges. Screenshots of WhatsApp + the deal timeline (per `user-preferences` visual proof).

---

## Phase 6 — Own-WhatsApp sequential suggestion (after company send)

**Files:** Create `lib/buildWhatsAppShareText.ts`; Modify `ShareToClientModal.tsx`.

- [ ] **Step 1: Extract the numbered-text builder** to `lib/buildWhatsAppShareText.ts` — lift the formatter from `MatchShareTab.tsx:468-506` (numbered `*1.*` blocks: title, price, specs, location, link). Signature: `buildWhatsAppShareText(items, mode)`:
  - `mode==='direct'` → website links `realtypandit.in/properties/<slug>`, branded "— Realty Pandit Team".
  - `mode==='dealer'` → brand-free wording + the **brochure PDF links** (same signed URL the backend builds; backend returns each `property_link` in the batch response so the frontend reuses it).

- [ ] **Step 2: Add the suggestion to the success state** of `ShareToClientModal` — after the batch send resolves, render:

```tsx
{sent && customerTel && (
  <button className="..." onClick={() => {
    const text = buildWhatsAppShareText(results, mode);
    window.open(`https://wa.me/${customerTel.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`, '_blank');
  }}>📱 Also share from your own WhatsApp</button>
)}
```
  → lands the member directly in **that client's** chat with the numbered content pre-filled. (No template, no 24h-window limit — wa.me carries text + links only.)

- [ ] **Step 3: Verify (UI, Playwright)** — complete a company send, click the new button, confirm `wa.me/<client>` opens with the numbered text + correct links (brochure links for a dealer recipient, website links for a direct one). Before/after screenshots.

- [ ] **Step 4: Commit (frontend):** `feat(share): own-WhatsApp deep-link suggestion after company send`.

---

## Deploy sequence (per `runbooks/deploy.md`)

1. Backend: commit on `wt/backend` → merge `--no-ff` into `reality-pandit` → `cd agents && node deployment/deploy-agent.js backend --skip-verify`.
2. Run the Meta submission script on the server (Phase 4 Step 3); wait for APPROVED before relying on the dealer path.
3. Frontend: commit on `wt/frontend` → merge → `node deployment/deploy-agent.js frontend --skip-verify`.
4. Set `PDF_LINK_SECRET` and `PUBLIC_API_BASE` in the server `.env` if not already present (Phase 3/5 depend on them).

---

## Skills used while executing (as requested)

- **superpowers:executing-plans** — INLINE execution with phase-boundary checkpoints (NOT subagent-driven; honors `feedback_subagent_overhead`).
- **superpowers:test-driven-development** — vitest first for `resolveShareMode`, `redactForBrandless`, `brochureFilename`, `pdf_token` (diff vs the 162/172 + ~381 tsc baselines per `reference_test_tsc_baseline`).
- **superpowers:systematic-debugging** — only if the document-template send or the timeline stamp misbehaves (reproduce → trace → fix before editing).
- **verify** + **playwright-pro / webapp-testing** — runtime-verify the public PDF endpoint (curl), the live WhatsApp sends on a controlled number, and the deal-timeline appearance + the own-WhatsApp deep-link (screenshots).
- **verification-before-completion** — WhatsApp captures + deal-timeline screenshots + Meta `APPROVED` status before declaring done.
- **writing-plans** — this document.
- **Project runbooks** — `meta-template-approval.md` (the Phase-4 submission + category-lock care), `deploy.md` (deploy-agent + worktree fan-out), GlitchTip instrumentation (`captureRouteError` on the new route per `feedback_glitchtip_instrumentation`), prod-DB-backup (only if we later backfill old shares — out of scope here, fix-forward).

---

## Verification (program-level)

- **Dealer path:** an ACTIVE-PartnerAgent recipient → N document messages, each a **brand-free** single-property PDF (building+locality+city, no flat/plot, no owner contact, **inventory ID in corner**, readable filename), tagged "k of N". Forwardable by the dealer with zero RP trace.
- **Direct path:** a normal recipient → the **exact same v5 cards as today** (regression check — nothing changed).
- **Timeline:** every share (both paths) now appears in `getDealTimeline` + the deal "already-shared" badges (because `metadata.deal_id` is stamped).
- **Own WhatsApp:** the post-send button opens the client's chat with the numbered text + correct links.
- **Meta:** `rp_property_brochure_v1` = UTILITY / APPROVED, quality GREEN after first sends.

## Self-review

- **Coverage:** recognition (P1) · brandless brochure spec — building/locality/city, ID corner, filename (P2) · public PDF link, no separate server (P3) · MakeMyTrip-style document delivery (P4) · per-property "1 of N" loop + direct-card-untouched + timeline fix (P5) · own-WhatsApp suggestion (P6). ✅
- **Constraint honored:** v5/v4 card templates and `shareInventoryCard`'s direct path are never modified — the dealer path is purely additive (`shareInventoryBrochure`, new endpoint). ✅
- **Reuse over rebuild:** `pdf_generator.ts`, `redactForBrandless`, `phoneVariants`, `resolveMediaPath`, the v5 submission-script pattern, the `MatchShareTab` formatter, public-media precedent (`GET /:id/media`). Only genuinely new: recognizer, token util, document-send method, document template, batch endpoint. ✅
- **Type consistency:** `resolveShareMode` returns `{mode,partner}` used identically in P5; `brochureFilename`/`signPdfToken` signatures match across P2/P3/P5. ✅
- **Deferred (explicit):** open/forward **tracking** ("leave it for now"); company-WhatsApp dealer send **outside 24h** relies on the approved UTILITY template (covered); **backfill** of historical shares into timelines (fix-forward only).

## On completion

Update memory: extend `reference_inventory_share_pdf.md` (recipient-aware routing, building/locality/city redaction change, brochure endpoint, `rp_property_brochure_v1`) and add a pointer in the deal-timeline note that the `property_shared` interaction now carries `deal_id`. Append the live-verified outcome to `PROJECT_STATUS.md`.
