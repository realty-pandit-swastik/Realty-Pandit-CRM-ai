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

function formatPrice(p: number | null | undefined): string {
    if (!p) return 'Price on request';
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
}

function resolveMediaPath(mediaUrl: string): string | null {
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
 * Build the brandless redacted view of an inventory record.
 */
function redactForBrandless(inv: InventoryForPdf): InventoryForPdf {
    return {
        ...inv,
        owner_phone: null,
        owner_name: null,
        full_address: null,
        flat_no: null,
        plot_no: null,
        apartment_name: null,
        sub_locality: null,
        // Keep: locality, city, district, state, specs, features, price, images, type
    };
}

function locationLine(inv: InventoryForPdf): string {
    const parts = [inv.locality, inv.city || inv.district, inv.state].filter(Boolean);
    return parts.join(', ') || inv.location || 'Location available on request';
}

function renderOneProperty(doc: typeof PDFDocument.prototype, raw: InventoryForPdf, options: PdfOptions, index: number, total: number) {
    const inv = options.variant === 'brandless' ? redactForBrandless(raw) : raw;

    // Always addPage at the top — we created the doc with autoFirstPage:false so
    // doc.page is null until we call addPage(). Without this, doc.page.width
    // crashes on the very first property.
    doc.addPage();

    // Header bar
    doc.rect(0, 0, doc.page.width, 70).fill(options.variant === 'brandless' ? '#334155' : PRIMARY);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
        .text(options.variant === 'brandless' ? 'Property Details' : 'Realty Pandit', 40, 24);
    doc.fontSize(10).font('Helvetica').fillColor('#dbeafe')
        .text(`${index + 1} of ${total}`, doc.page.width - 100, 32, { align: 'right', width: 60 });

    doc.fillColor(TEXT).font('Helvetica');

    let cursorY = 90;

    // Hero image (first media)
    const heroPath = inv.media_urls && inv.media_urls.length > 0 ? resolveMediaPath(inv.media_urls[0]) : null;
    if (heroPath) {
        try {
            doc.image(heroPath, 40, cursorY, { fit: [515, 240], align: 'center' });
            cursorY += 250;
        } catch (err) {
            logger.warn(`[PdfGen] image embed failed: ${(err as Error).message}`);
        }
    } else {
        doc.rect(40, cursorY, 515, 120).fill('#f3f4f6');
        doc.fillColor(MUTED).fontSize(11).text('No photo available', 40, cursorY + 50, { width: 515, align: 'center' });
        doc.fillColor(TEXT);
        cursorY += 130;
    }

    // Title — read room count from canonical taxonomy keys first (bhk for residential,
    // rooms for commercial), fall back to legacy specs.bedrooms / specs.bhk_count.
    const specs = inv.specs || {};
    const roomCount = specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count;
    const bhk = roomCount ? `${roomCount} BHK ` : '';
    const typeName = (inv.type || 'Property').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const intentLabel = inv.intent === 'sell' ? 'for Sale' : inv.intent === 'rent' ? 'for Rent' : '';

    doc.fontSize(18).font('Helvetica-Bold').fillColor(PRIMARY)
        .text(`${bhk}${typeName} ${intentLabel}`.trim(), 40, cursorY);
    cursorY += 24;

    // Location
    doc.fontSize(12).font('Helvetica').fillColor(TEXT)
        .text(`📍 ${locationLine(inv)}`, 40, cursorY);
    cursorY += 24;

    // Price band — large
    const price = inv.display_price || inv.customer_price || inv.price;
    doc.fontSize(22).font('Helvetica-Bold').fillColor(ACCENT)
        .text(formatPrice(price), 40, cursorY);
    cursorY += 30;

    // Spec grid — specs.* is SOLE SoT (Phase 3 dedup, 2026-05-28); column fallbacks dropped.
    const specs2col: [string, string][] = [];
    if (roomCount) specs2col.push(['Bedrooms', `${roomCount}`]);
    if (specs.bathrooms) specs2col.push(['Bathrooms', `${specs.bathrooms}`]);
    if (specs.area) specs2col.push(['Carpet area', `${specs.area} ${specs.area_unit || 'sqft'}`]);
    if (specs.furnishing) specs2col.push(['Furnishing', specs.furnishing]);
    if (inv.floor_number != null) specs2col.push(['Floor', specs.floors ? `${inv.floor_number} of ${specs.floors}` : `${inv.floor_number}`]);
    if (specs.facing) specs2col.push(['Facing', specs.facing]);
    if (specs['age-of-construction']) specs2col.push(['Property age', String(specs['age-of-construction']).replace(/_/g, ' ')]);
    if (inv.category) specs2col.push(['Category', inv.category]);

    doc.fontSize(11).font('Helvetica').fillColor(TEXT);
    const colWidth = 250;
    let row = 0;
    for (let i = 0; i < specs2col.length; i++) {
        const [label, value] = specs2col[i];
        const col = i % 2;
        const x = 40 + col * (colWidth + 15);
        const y = cursorY + row * 24;
        doc.fillColor(MUTED).fontSize(9).text(label.toUpperCase(), x, y);
        doc.fillColor(TEXT).fontSize(12).text(value, x, y + 10, { width: colWidth });
        if (col === 1) row++;
    }
    cursorY += (Math.ceil(specs2col.length / 2)) * 24 + 12;

    // Amenities chips — specs.amenities is SOLE SoT (Phase 3 dedup, 2026-05-28).
    const enabledFeatures: string[] = Array.isArray(specs.amenities)
        ? specs.amenities.map((s: string) => String(s).replace(/_/g, ' '))
        : [];
    if (enabledFeatures.length > 0 && cursorY < 700) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(MUTED).text('AMENITIES', 40, cursorY);
        cursorY += 16;
        doc.fontSize(11).font('Helvetica').fillColor(TEXT);
        const text = enabledFeatures.slice(0, 14).join(' · ');
        doc.text(text, 40, cursorY, { width: 515 });
        cursorY = doc.y + 8;
    }

    // Description
    if (inv.description && cursorY < 720) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(MUTED).text('DESCRIPTION', 40, cursorY);
        cursorY += 14;
        doc.fontSize(11).font('Helvetica').fillColor(TEXT).text(inv.description.substring(0, 600), 40, cursorY, { width: 515 });
        cursorY = doc.y + 6;
    }

    // Footer
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY, doc.page.width, 50).fill('#f9fafb');
    doc.fillColor(MUTED).fontSize(9).font('Helvetica');

    if (options.variant === 'brandless') {
        if (options.partnerName) {
            doc.fillColor(TEXT).fontSize(11).font('Helvetica-Bold')
                .text(options.partnerName, 40, footerY + 12);
            if (options.partnerPhone) {
                doc.fillColor(MUTED).fontSize(10).font('Helvetica')
                    .text(`📞 ${options.partnerPhone}`, 40, footerY + 28);
            }
        } else {
            doc.text('Contact your agent for more details', 40, footerY + 20, { width: doc.page.width - 80, align: 'center' });
        }
    } else {
        // Branded footer
        doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold')
            .text('Realty Pandit', 40, footerY + 10);
        doc.fillColor(MUTED).fontSize(9).font('Helvetica')
            .text('realtypandit.in', 40, footerY + 26);
        if (options.agentName) {
            doc.fillColor(TEXT).fontSize(10).font('Helvetica-Bold')
                .text(options.agentName, doc.page.width - 240, footerY + 12, { align: 'right', width: 200 });
            if (options.agentPhone) {
                doc.fillColor(MUTED).fontSize(9).font('Helvetica')
                    .text(`📞 ${options.agentPhone}`, doc.page.width - 240, footerY + 28, { align: 'right', width: 200 });
            }
        }
        if (inv.display_id) {
            doc.fillColor(MUTED).fontSize(8)
                .text(inv.display_id, doc.page.width / 2 - 50, footerY + 30, { width: 100, align: 'center' });
        }
    }
}

/**
 * Generate a PDF for one or more inventories.
 * Returns a Readable stream the caller can pipe to the HTTP response.
 */
export function generateInventoryPdfStream(
    inventories: InventoryForPdf[],
    options: PdfOptions,
): NodeJS.ReadableStream {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const stream = doc as unknown as NodeJS.ReadableStream;

    if (inventories.length === 0) {
        doc.addPage();
        doc.fontSize(14).text('No properties selected', 40, 100);
        doc.end();
        return stream;
    }

    doc.on('error', (err) => {
        logger.error('[PdfGen] PDFDocument error:', err);
    });

    inventories.forEach((inv, i) => renderOneProperty(doc, inv, options, i, inventories.length));

    doc.end();
    return stream;
}
