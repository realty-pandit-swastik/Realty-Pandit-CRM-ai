/**
 * Inventory share PDF generator.
 *
 * Two variants:
 *  - branded   → full data, Realty Pandit logo + footer, agent contact details
 *  - brandless → partner-share mode. Redacts owner_phone, owner_name, exact
 *                address (flat_no / plot_no / full_address). Shows locality +
 *                city only. No RP branding. Optionally watermarked with the
 *                partner's name/phone so they can present as their own.
 *
 * Why brandless: partner agents need to share inventory with their downstream
 * buyers without revealing RP — otherwise buyers contact us directly and the
 * partner loses commission.
 */

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../utils/logger';
import { getDisplayFloor } from '../utils/floor';

export type PdfVariant = 'branded' | 'brandless';

interface InventoryForPdf {
    id: string;
    display_id: string | null;
    type: string | null;
    category: string | null;
    intent: string | null;
    specs: any;
    features: any;
    furnishing: string | null;
    floor_number: number | null;
    floor_label?: string | null;
    display_floor?: string | null;
    total_floors: number | null;
    facing: string | null;
    property_age: string | null;
    flat_no: string | null;
    plot_no: string | null;
    apartment_name: string | null;
    full_address: string | null;
    location: string | null;
    locality: string | null;
    sub_locality: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    price: any;
    display_price: any;
    customer_price: any;
    price_unit: string | null;
    description: string | null;
    media_urls: string[];
    owner_phone: string | null;
    owner_name?: string | null;
}

interface PdfOptions {
    variant: PdfVariant;
    // Brandless watermark — shown as partner name footer
    partnerName?: string;
    partnerPhone?: string;
    // For branded variant — agent contact line at bottom
    agentName?: string;
    agentPhone?: string;
}

const PRIMARY = '#1e40af';
const ACCENT = '#0ea5e9';
const TEXT = '#1f2937';
const MUTED = '#6b7280';

// ── Fonts ───────────────────────────────────────────────────────────────────
// pdfkit's built-in Helvetica is WinAnsi-encoded and CANNOT render ₹ (U+20B9) or
// emoji — they mojibake (₹→"¹", 📍→"Ø=ÜÍ"). Embed DejaVu Sans (bundled in
// assets/fonts, includes ₹). Emoji are dropped entirely (no color-emoji support).
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
const FONT = BODY_TTF ? 'RP' : 'Helvetica';
const FONT_BOLD = BOLD_TTF ? 'RP-Bold' : 'Helvetica-Bold';

function registerFonts(doc: typeof PDFDocument.prototype) {
    if (BODY_TTF) doc.registerFont('RP', BODY_TTF);
    if (BOLD_TTF) doc.registerFont('RP-Bold', BOLD_TTF);
}

function formatPrice(p: number | null | undefined): string {
    if (!p) return 'Price on request';
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
}

export function resolveMediaPath(mediaUrl: string): string | null {
    if (!mediaUrl) return null;
    // Strip leading slash for relative
    let rel = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;
    // Absolute URLs not supported in PDF embed — would need to be downloaded first.
    if (rel.startsWith('http://') || rel.startsWith('https://')) return null;
    // Resolve under /var/www/realty-pandit/backend/<rel> on prod or local cwd
    const candidates = [
        path.resolve(process.cwd(), rel),
        path.resolve('/var/www/realty-pandit/backend', rel),
        path.resolve(__dirname, '../../', rel),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

/**
 * Resize + compress a photo for PDF embedding. The originals are 2–3MB each; embedding
 * them verbatim made brochures ~16MB, which WhatsApp/Meta failed to fetch+re-host as a
 * document (recipient got a corrupt/empty PDF). Cap at 1400px, JPEG q72 → ~150–300KB,
 * so a 6-photo brochure lands ~1–2MB. Falls back to the original path on any sharp
 * failure (doc.image accepts a path too). (2026-06-28)
 */
export async function resizeImageForPdf(absPath: string): Promise<Buffer | string> {
    try {
        // require lazily — keeps the module loadable in environments without sharp.
        const sharp = require('sharp');
        return await sharp(absPath)
            .rotate() // honour EXIF orientation so portrait phone photos aren't sideways
            .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 72 })
            .toBuffer();
    } catch (e) {
        logger.warn(`[PdfGen] image resize failed (${absPath}); embedding original: ${(e as Error).message}`);
        return absPath;
    }
}

/**
 * Build the brandless redacted view of an inventory record.
 * Partner-share privacy rule: the building + locality + city stay VISIBLE (the
 * buyer must know roughly where it is), but the exact unit (flat_no / plot_no),
 * the literal full-address line, and the owner contact are hidden.
 */
export function redactForBrandless(inv: InventoryForPdf): InventoryForPdf {
    return {
        ...inv,
        owner_phone: null,
        owner_name: null,
        flat_no: null,        // exact unit — hidden
        plot_no: null,        // exact unit — hidden
        full_address: null,   // literal line may embed the unit number — hidden
        sub_locality: null,   // too granular
        // KEEP: apartment_name (building), locality, city, district, state, specs, features, price, images, type
    };
}

const TITLECASE = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Human-readable, brand-free PDF filename tied to the inventory.
 * e.g. "3BHK-Flat-Whitefield-RP-GZB-RES-20471.pdf"
 */
export function brochureFilename(inv: InventoryForPdf): string {
    const s = (inv.specs || {}) as Record<string, any>;
    const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
    const bhk = room ? `${room}BHK-` : '';
    const type = TITLECASE(inv.type || 'Property').replace(/\s+/g, '');
    const loc = (inv.locality || inv.city || '').replace(/\s+/g, '');
    const id = inv.display_id || inv.id;
    return `${bhk}${type}${loc ? '-' + loc : ''}-${id}.pdf`.replace(/[^\w.-]/g, '');
}

function locationLine(inv: InventoryForPdf): string {
    const parts = [inv.apartment_name, inv.locality, inv.city || inv.district].filter(Boolean);
    return parts.join(', ') || inv.location || 'Location available on request';
}

/**
 * Type-aware spec rows for the details page. Residential shows BHK/Bath/Floor;
 * commercial shows Floors/Washrooms (no BHK); plot/land shows Plot Area/Facing.
 */
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
    { const fl = getDisplayFloor(inv); if (fl) rows.push(['Floor', s.floors ? `${fl} of ${s.floors}` : fl]); }
    if (s.facing) rows.push(['Facing', s.facing]);
    if (age) rows.push(['Property Age', age]);
    return rows;
}

/** Draw the top header bar on the current page. */
function drawHeaderBar(doc: typeof PDFDocument.prototype, options: PdfOptions) {
    doc.rect(0, 0, doc.page.width, 70).fill(options.variant === 'brandless' ? '#334155' : PRIMARY);
    doc.fillColor('#ffffff').fontSize(20).font(FONT_BOLD)
        .text(options.variant === 'brandless' ? 'Property Details' : 'Realty Pandit', 40, 24);
    doc.fillColor(TEXT).font(FONT);
}

/** Footer with inventory ID in the corner; partner watermark (brandless) or RP/agent (branded). */
function drawFooter(doc: typeof PDFDocument.prototype, inv: InventoryForPdf, options: PdfOptions) {
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY, doc.page.width, 50).fill('#f9fafb');
    doc.fillColor(MUTED).fontSize(9).font(FONT);

    if (options.variant === 'brandless') {
        if (options.partnerName) {
            doc.fillColor(TEXT).fontSize(11).font(FONT_BOLD).text(options.partnerName, 40, footerY + 12);
            if (options.partnerPhone) {
                doc.fillColor(MUTED).fontSize(10).font(FONT).text(`Tel: ${options.partnerPhone}`, 40, footerY + 28);
            }
        } else {
            doc.text('Contact your agent for more details', 40, footerY + 20, { width: doc.page.width - 80, align: 'center' });
        }
    } else {
        doc.fillColor(PRIMARY).fontSize(11).font(FONT_BOLD).text('Realty Pandit', 40, footerY + 10);
        doc.fillColor(MUTED).fontSize(9).font(FONT).text('realtypandit.in', 40, footerY + 26);
        if (options.agentName) {
            doc.fillColor(TEXT).fontSize(10).font(FONT_BOLD).text(options.agentName, doc.page.width - 240, footerY + 12, { align: 'right', width: 200 });
            if (options.agentPhone) {
                doc.fillColor(MUTED).fontSize(9).font(FONT).text(`Tel: ${options.agentPhone}`, doc.page.width - 240, footerY + 28, { align: 'right', width: 200 });
            }
        }
    }
    // Inventory ID in the corner — identifies which listing a forwarded brochure is.
    if (inv.display_id) {
        doc.fillColor(MUTED).fontSize(7).font(FONT).text(inv.display_id, doc.page.width - 130, footerY + 36, { width: 110, align: 'right' });
    }
}

function renderOneProperty(doc: typeof PDFDocument.prototype, inv: InventoryForPdf, imageBuffers: (Buffer | string)[], options: PdfOptions) {
    const specs = inv.specs || {};

    // ── DETAILS PAGE (no photo — keeps it clean; photos get their own pages) ────
    doc.addPage();
    drawHeaderBar(doc, options);
    let cursorY = 92;

    // Title
    const roomCount = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
    const bhk = roomCount ? `${roomCount} BHK ` : '';
    const typeName = (inv.type || 'Property').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const intentLabel = inv.intent === 'sell' ? 'for Sale' : inv.intent === 'rent' ? 'for Rent' : '';
    doc.fontSize(20).font(FONT_BOLD).fillColor(PRIMARY)
        .text(`${bhk}${typeName} ${intentLabel}`.trim(), 40, cursorY, { width: 515 });
    cursorY = doc.y + 6;

    // Location (no emoji)
    doc.fontSize(12).font(FONT).fillColor(TEXT).text(locationLine(inv), 40, cursorY, { width: 515 });
    cursorY = doc.y + 12;

    // Price band — large (₹ renders via DejaVu)
    const price = inv.display_price || inv.customer_price || inv.price;
    doc.fontSize(24).font(FONT_BOLD).fillColor(ACCENT).text(formatPrice(price), 40, cursorY);
    cursorY = doc.y + 18;

    // Spec grid — type-aware (residential / commercial / plot)
    const rows = buildSpecRows(inv);
    const colWidth = 250;
    let gridRow = 0;
    for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        const col = i % 2;
        const x = 40 + col * (colWidth + 15);
        const y = cursorY + gridRow * 38;
        doc.fillColor(MUTED).font(FONT).fontSize(9).text(label.toUpperCase(), x, y, { width: colWidth });
        doc.fillColor(TEXT).font(FONT_BOLD).fontSize(13).text(value, x, y + 13, { width: colWidth });
        if (col === 1) gridRow++;
    }
    cursorY += Math.ceil(rows.length / 2) * 38 + 16;

    // Amenities
    const amenities: string[] = Array.isArray(specs.amenities)
        ? specs.amenities.map((s: string) => String(s).replace(/_/g, ' ')) : [];
    if (amenities.length > 0 && cursorY < 680) {
        doc.fontSize(10).font(FONT_BOLD).fillColor(MUTED).text('AMENITIES', 40, cursorY);
        cursorY += 16;
        doc.fontSize(11).font(FONT).fillColor(TEXT).text(amenities.slice(0, 16).join('   ·   '), 40, cursorY, { width: 515 });
        cursorY = doc.y + 12;
    }

    // Description
    if (inv.description && cursorY < 700) {
        doc.fontSize(10).font(FONT_BOLD).fillColor(MUTED).text('DESCRIPTION', 40, cursorY);
        cursorY += 14;
        doc.fontSize(11).font(FONT).fillColor(TEXT).text(inv.description.substring(0, 700), 40, cursorY, { width: 515 });
    }

    drawFooter(doc, inv, options);

    // ── PHOTO PAGES — one photo per near-full page, uniform size ────────────────
    // Photos are pre-resized to compressed JPEG buffers by generateInventoryPdfStream
    // (originals embedded verbatim produced ~16MB brochures that WhatsApp/Meta could not
    // fetch+re-host as a document). doc.image() accepts a Buffer or a fallback path.
    imageBuffers.forEach((img, i) => {
        doc.addPage();
        drawHeaderBar(doc, options);
        try {
            doc.image(img, 40, 90, { fit: [doc.page.width - 80, doc.page.height - 180], align: 'center', valign: 'center' });
        } catch (err) {
            logger.warn(`[PdfGen] photo embed failed: ${(err as Error).message}`);
        }
        const fY = doc.page.height - 50;
        doc.rect(0, fY, doc.page.width, 50).fill('#f9fafb');
        doc.fillColor(MUTED).font(FONT).fontSize(9).text(`Photo ${i + 1} of ${imageBuffers.length}`, 40, fY + 18);
        if (inv.display_id) {
            doc.fillColor(MUTED).fontSize(7).font(FONT).text(inv.display_id, doc.page.width - 130, fY + 20, { width: 110, align: 'right' });
        }
    });
}

/**
 * Generate a PDF for one or more inventories.
 * Returns a Readable stream the caller can pipe to the HTTP response.
 */
export async function generateInventoryPdfStream(
    inventories: InventoryForPdf[],
    options: PdfOptions,
): Promise<NodeJS.ReadableStream> {
    // Pre-resize every photo to a compressed JPEG buffer BEFORE building the doc — pdfkit
    // renders synchronously, so the (async) sharp work has to finish first. This is what
    // shrinks the brochure from ~16MB to ~1–2MB. Redaction also happens here so each
    // inventory is prepared once. (2026-06-28)
    const prepared = await Promise.all(inventories.map(async (raw) => {
        const inv = options.variant === 'brandless' ? redactForBrandless(raw) : raw;
        const paths = (inv.media_urls || []).map((u) => resolveMediaPath(u)).filter(Boolean) as string[];
        const buffers = await Promise.all(paths.map(resizeImageForPdf));
        return { inv, buffers };
    }));

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    registerFonts(doc);
    const stream = doc as unknown as NodeJS.ReadableStream;

    if (inventories.length === 0) {
        doc.addPage();
        doc.font(FONT).fontSize(14).text('No properties selected', 40, 100);
        doc.end();
        return stream;
    }

    doc.on('error', (err) => {
        logger.error('[PdfGen] PDFDocument error:', err);
    });

    prepared.forEach(({ inv, buffers }) => renderOneProperty(doc, inv, buffers, options));

    doc.end();
    return stream;
}
