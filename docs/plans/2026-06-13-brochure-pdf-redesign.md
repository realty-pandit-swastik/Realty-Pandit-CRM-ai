# Brochure PDF Redesign Implementation Plan

> **For agentic workers:** Execute with **superpowers:executing-plans** (INLINE, phase-boundary checkpoints — per `feedback_subagent_overhead`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the dealer/partner brochure PDF so it renders correctly and looks professional: embed a Unicode font so `₹` prints (today it shows `¹`) and the emoji mojibake (`Ø=ÜÍ`, `Ø=ÜÞ`) is gone; lay photos out **one per near-full page at uniform size** (today: hero + cramped thumbnail strip); and render **residential- and commercial-aware** spec sections.

**Architecture:** All in `services/pdf_generator.ts`. Register a bundled DejaVu Sans TTF (which contains `₹` U+20B9) as the doc font and drop emoji glyphs (pdfkit has no color-emoji support). Restructure `renderOneProperty` into a **details page** (header, title, location, price, type-aware spec grid, amenities, description, footer) followed by **one page per photo** (uniform near-full-page image). Extract a pure `buildSpecRows(inv)` for residential/commercial/plot.

**Tech Stack:** Node/TS, `pdfkit` (already installed), DejaVu Sans TTF (bundled). No new npm deps.

**Root cause (proven by the live brochure `Office-Ghaziabad-RP-MEE-COM-20427.pdf`):** pdfkit's built-in Helvetica is WinAnsi-encoded — it can't render `₹` (→ `¹`) or emoji (→ mojibake). Fix = embed a Unicode TTF + remove emoji. The server has `DejaVuSans.ttf` + `DejaVuSans-Bold.ttf` at `/usr/share/fonts/truetype/dejavu/`.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `agents/backend/assets/fonts/DejaVuSans.ttf` | **Create** (binary, scp'd from server) | Unicode body font (has `₹`) |
| `agents/backend/assets/fonts/DejaVuSans-Bold.ttf` | **Create** (binary) | Unicode bold font |
| `agents/backend/src/services/pdf_generator.ts` | **Modify** | font registration, drop emoji, `buildSpecRows`, one-photo-per-page layout |
| `agents/backend/src/__tests__/pdf_brochure.test.ts` | **Modify** | `buildSpecRows` res/com/plot unit tests; multi-page render smoke test |

---

## Phase 1 — Bundle the font (binary asset)

- [ ] **Step 1: Create the fonts dir + copy the two TTFs from the server into the repo.**

```bash
mkdir -p "clients/sunny-sharma/projects/reality-pandit/agents/backend/assets/fonts"
KEY="C:/Users/VARCHA~1/AppData/Local/Temp/rp_key"
scp -F /dev/null -i "$KEY" -o StrictHostKeyChecking=no \
  root@72.62.231.224:/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  "clients/sunny-sharma/projects/reality-pandit/agents/backend/assets/fonts/DejaVuSans.ttf"
scp -F /dev/null -i "$KEY" -o StrictHostKeyChecking=no \
  root@72.62.231.224:/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
  "clients/sunny-sharma/projects/reality-pandit/agents/backend/assets/fonts/DejaVuSans-Bold.ttf"
```
> DejaVu is a permissive free license — OK to commit + redistribute. The deploy tars `backend/` (excludes node_modules/.git only), so `assets/fonts/*.ttf` ships to `/var/www/realty-pandit/backend/assets/fonts/`. `tsc` does not touch non-`.ts` files, so they stay put.

- [ ] **Step 2: Confirm the files exist + are non-trivial size** (`ls -la assets/fonts` → each ~300–700 KB). Commit in Phase 5 with the code (binary + code together).

---

## Phase 2 — Font registration + drop emoji

**File:** `services/pdf_generator.ts` (top-of-file additions + replace font names).

- [ ] **Step 1: Add a robust font-path resolver + names** near the top (after the imports):

```ts
function resolveFontPath(file: string): string | null {
    const candidates = [
        path.resolve(process.cwd(), 'assets/fonts', file),
        path.resolve('/var/www/realty-pandit/backend/assets/fonts', file),
        path.resolve(__dirname, '../../assets/fonts', file),
        path.resolve('/usr/share/fonts/truetype/dejavu', file), // system fallback (prod has it)
    ];
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
    return null;
}
const BODY_TTF = resolveFontPath('DejaVuSans.ttf');
const BOLD_TTF = resolveFontPath('DejaVuSans-Bold.ttf');
// Font names used throughout; fall back to Helvetica only if the TTF is missing (₹ won't render then).
const FONT = BODY_TTF ? 'RP' : 'Helvetica';
const FONT_BOLD = BOLD_TTF ? 'RP-Bold' : 'Helvetica-Bold';

function registerFonts(doc: typeof PDFDocument.prototype) {
    if (BODY_TTF) doc.registerFont('RP', BODY_TTF);
    if (BOLD_TTF) doc.registerFont('RP-Bold', BOLD_TTF);
}
```

- [ ] **Step 2: Call `registerFonts(doc)`** in `generateInventoryPdfStream`, immediately after `const doc = new PDFDocument(...)` and before any rendering.

- [ ] **Step 3: Replace every `'Helvetica'` → `FONT` and `'Helvetica-Bold'` → `FONT_BOLD`** in `renderOneProperty` and the empty-doc branch (`.font('Helvetica')` calls). Leave color/size calls unchanged.

- [ ] **Step 4: Remove emoji glyphs:**
  - Location line: `doc.text(\`📍 ${locationLine(inv)}\`, ...)` → `doc.text(locationLine(inv), ...)`.
  - Brandless footer phone: `\`📞 ${options.partnerPhone}\`` → `\`Tel: ${options.partnerPhone}\``.
  - Branded footer phone (if present): same `📞` → `Tel:` treatment.
  - Keep `₹` (now renders via DejaVu).

- [ ] **Step 5: tsc diff = 381 baseline** (`npx tsc --noEmit 2>&1 | grep -c "error TS"`). No commit yet (continues into Phase 3/4).

---

## Phase 3 — Type-aware spec rows (residential / commercial / plot)

**File:** `services/pdf_generator.ts` + test.

- [ ] **Step 1: Write the failing test** (append to `pdf_brochure.test.ts`):

```ts
import { buildSpecRows } from '../services/pdf_generator';

describe('buildSpecRows — type-aware', () => {
  it('residential shows Bedrooms + Bathrooms', () => {
    const rows = buildSpecRows({ category: 'residential', type: 'flat', specs: { bhk: 3, bathrooms: 2, area: 1200 }, floor_number: 2 } as any);
    const labels = rows.map(r => r[0]);
    expect(labels).toContain('Bedrooms');
    expect(labels).toContain('Bathrooms');
    expect(labels).not.toContain('Washrooms');
  });
  it('commercial shows Washrooms/Floors, NOT Bedrooms', () => {
    const rows = buildSpecRows({ category: 'commercial', type: 'office', specs: { area: 1050, area_unit: 'sqft', floors: 2, washrooms: 1 } } as any);
    const labels = rows.map(r => r[0]);
    expect(labels).not.toContain('Bedrooms');
    expect(labels).toContain('Washrooms');
  });
  it('plot shows Plot Area + Facing, no BHK/bath', () => {
    const rows = buildSpecRows({ category: 'residential', type: 'residential_plot', specs: { area: 200, area_unit: 'Sq Yard', facing: 'East' } } as any);
    const labels = rows.map(r => r[0]);
    expect(labels).toContain('Plot Area');
    expect(labels).not.toContain('Bedrooms');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`buildSpecRows` not exported).

- [ ] **Step 3: Implement + export `buildSpecRows`** (replaces the inline `specs2col` block in `renderOneProperty`):

```ts
export function buildSpecRows(inv: InventoryForPdf): [string, string][] {
    const s = (inv.specs || {}) as Record<string, any>;
    const cat = (inv.category || '').toLowerCase();
    const type = (inv.type || '').toLowerCase();
    const isPlot = /plot|land/.test(type);
    const isCommercial = cat === 'commercial';
    const area = s.area ? `${s.area} ${s.area_unit || 'sqft'}` : null;
    const age = s['age-of-construction'] ? String(s['age-of-construction']).replace(/_/g, ' ') : null;
    const rows: [string, string][] = [];

    if (isPlot) {
        if (area) rows.push(['Plot Area', area]);
        if (s.facing) rows.push(['Facing', s.facing]);
        if (s.ownership) rows.push(['Ownership', String(s.ownership)]);
        if (inv.category) rows.push(['Category', inv.category]);
        return rows;
    }
    if (isCommercial) {
        if (area) rows.push(['Carpet / Built-up Area', area]);
        if (s.floors) rows.push(['Floors', String(s.floors)]);
        if (s.washrooms ?? s.bathrooms) rows.push(['Washrooms', String(s.washrooms ?? s.bathrooms)]);
        if (s.furnishing) rows.push(['Furnishing', s.furnishing]);
        if (age) rows.push(['Property Age', age]);
        return rows;
    }
    // residential
    const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
    if (room) rows.push(['Bedrooms', `${room} BHK`]);
    if (s.bathrooms) rows.push(['Bathrooms', String(s.bathrooms)]);
    if (area) rows.push(['Carpet Area', area]);
    if (s.furnishing) rows.push(['Furnishing', s.furnishing]);
    if (inv.floor_number != null) rows.push(['Floor', s.floors ? `${inv.floor_number} of ${s.floors}` : `${inv.floor_number}`]);
    if (s.facing) rows.push(['Facing', s.facing]);
    if (age) rows.push(['Property Age', age]);
    return rows;
}
```

- [ ] **Step 4: Run tests → PASS.**

---

## Phase 4 — One-photo-per-page layout

**File:** `services/pdf_generator.ts` — restructure `renderOneProperty`.

- [ ] **Step 1: Split into a details page + photo pages.** Replace the current single-page body with:
  - **Details page** (`doc.addPage()`): header bar (`FONT_BOLD`, "Property Details" brandless / "Realty Pandit" branded — unchanged), title (`${bhk}${typeName} ${intentLabel}`), location line (no emoji), price band (`₹`, now renders), the `buildSpecRows(inv)` two-column grid, amenities chips, description, footer (partner watermark `Tel:`/agent contact + **inventory `display_id` in the corner for both variants**). **No photo on this page.**
  - **Photo pages:** for each resolvable image in `mediaPaths`, `doc.addPage()` then a header bar + the image scaled to fit a uniform box (e.g. `fit: [doc.page.width - 80, doc.page.height - 160]`, centered at `x=40, y=90`) + a small footer caption `Photo k of N` + the inventory ID. Uniform size for every photo.

```ts
// inside renderOneProperty, after building `inv` (redacted if brandless):
const mediaPaths = (inv.media_urls || []).map((u) => resolveMediaPath(u)).filter(Boolean) as string[];

// ---- DETAILS PAGE ----
doc.addPage();
drawHeaderBar(doc, options);                 // extract the existing header-bar code into a helper
// title, location (no emoji), price band, spec grid via buildSpecRows, amenities, description, footer
// (reuse existing drawing code; swap specs2col construction for buildSpecRows(inv))

// ---- PHOTO PAGES (one per page, uniform) ----
mediaPaths.forEach((p, i) => {
    doc.addPage();
    drawHeaderBar(doc, options);
    try {
        doc.image(p, 40, 90, { fit: [doc.page.width - 80, doc.page.height - 180], align: 'center', valign: 'center' });
    } catch (err) {
        logger.warn(`[PdfGen] photo embed failed: ${(err as Error).message}`);
    }
    const fY = doc.page.height - 50;
    doc.rect(0, fY, doc.page.width, 50).fill('#f9fafb');
    doc.fillColor(MUTED).font(FONT).fontSize(9).text(`Photo ${i + 1} of ${mediaPaths.length}`, 40, fY + 18);
    if (inv.display_id) doc.fillColor(MUTED).fontSize(7).text(inv.display_id, doc.page.width - 120, fY + 20, { width: 100, align: 'right' });
});

if (mediaPaths.length === 0) { /* on the details page, show the existing 'No photo available' box */ }
```
> Extract the repeated header-bar drawing into `drawHeaderBar(doc, options)` to avoid duplication (DRY). Remove the old hero+thumbnail-strip block and the `index/total` "1 of N" counter in the header (each PDF is one property; the WhatsApp body already carries "k of N").

- [ ] **Step 2: Update the render smoke test** — assert a multi-photo inventory yields a valid `%PDF` with **>1 page**. Since unit-test media URLs don't resolve to real files, add a tiny real image fixture OR assert the no-photo path produces a 1-page details PDF (≥800 bytes, `%PDF`). Keep it green without real photos:

```ts
it('renders a valid PDF (details page) for a property with no resolvable photos', async () => {
  const buf = await streamToBuffer(generateInventoryPdfStream([inv], { variant: 'brandless', partnerName: 'X' }));
  expect(buf.slice(0,4).toString()).toBe('%PDF');
  expect(buf.length).toBeGreaterThan(800);
});
```

- [ ] **Step 3: tsc diff = 381; vitest baseline preserved + new tests green.**

---

## Phase 5 — Commit, deploy, visually verify

- [ ] **Step 1: Commit** on `wt/backend` (binary fonts + code + tests together):
  `feat(pdf): unicode font (₹ + no mojibake), one-photo-per-page, residential/commercial-aware specs`
- [ ] **Step 2:** merge `wt/backend` → `feature/contact-system-refactor` (`--no-ff`); `node deployment/deploy-agent.js backend --skip-verify`.
- [ ] **Step 3: VISUAL VERIFY (the whole point)** — generate a fresh brochure for a **residential** inventory AND a **commercial** one via the live token-signed endpoint (reuse the `verify_brochure.js` pattern: sign a token, fetch the PDF, save it), then **open both PDFs**:
  - `₹` renders (no `¹`); **no `Ø=…` mojibake**; no stray emoji.
  - **one photo per near-full page, uniform size.**
  - residential shows Bedrooms/Bath; commercial shows Washrooms/Floors (no Bedrooms).
  - inventory ID present in the corner.
  Use the **verify** skill; attach the rendered PDFs as evidence.

---

## Skills used while executing
- **superpowers:executing-plans** — inline, phase checkpoints (per `feedback_subagent_overhead`).
- **superpowers:test-driven-development** — vitest first for `buildSpecRows` + the render smoke test (diff vs the `reference_test_tsc_baseline`).
- **verify** — open the actual generated PDFs (residential + commercial) and confirm glyphs + layout; PDFs are the evidence.
- **verification-before-completion** — both rendered PDFs reviewed before declaring done.
- **Project runbooks** — `deploy.md` (deploy-agent + worktree), GlitchTip via existing `captureRouteError` on the brochure route (`feedback_glitchtip_instrumentation`).

## Verification
- Open a residential and a commercial brochure: ₹ correct, zero mojibake/emoji, one uniform photo per page, type-correct specs, inventory ID in corner. Re-share to a partner test number if desired and confirm receipt.

## Self-review
- **Coverage:** glyph fix (font embed + emoji drop) ✅; image layout (one-per-page uniform) ✅; residential+commercial (buildSpecRows) ✅. All in `pdf_generator.ts` + bundled font.
- **Reuse:** existing `resolveMediaPath`, `formatPrice`, `redactForBrandless`, header/footer drawing (extracted to `drawHeaderBar`). Only new: font registration, `buildSpecRows`, page-per-photo loop.
- **Type consistency:** `buildSpecRows(inv: InventoryForPdf): [string,string][]` used in the details page; `FONT`/`FONT_BOLD` constants used everywhere a font is set.
- **Risk:** if the TTF is somehow missing at runtime it falls back to Helvetica (₹ breaks again) — mitigated by bundling in-repo **and** the system-path fallback; the visual verify catches it.

## On completion
Update `reference_inventory_share_pdf.md`: mark the glyph/layout issue RESOLVED, note the bundled DejaVu font + one-photo-per-page layout + `buildSpecRows`.
