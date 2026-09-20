// Builds the numbered "1, 2, 3" property text for sharing from the team member's
// OWN WhatsApp (wa.me deep link), after the company-WhatsApp send completes.
//
// - direct customer: branded wording + website/property links
// - dealer/partner:  brand-free wording + brandless brochure PDF download links
// The link per item comes from the batch-share response (website link for direct,
// signed brochure-PDF link for dealer), so this helper just formats — it never
// decides branding by itself.

export interface ShareTextItem {
    inv: any;
    link: string;
}

function fmtPrice(p: any): string {
    const n = Number(p);
    if (!n || !isFinite(n) || n <= 0) return 'Price on request';
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
}

function humanize(value: unknown): string {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function buildWhatsAppShareText(items: ShareTextItem[], mode: 'direct' | 'dealer'): string {
    const blocks = items.map(({ inv, link }, i) => {
        const s = (inv?.specs || {}) as Record<string, any>;
        const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
        const bhk = room ? `${room} BHK ` : '';
        const typeName = inv?.flat_property_type?.name
            || (inv?.type ? String(inv.type).replace(/_/g, ' ') : 'Property');
        const intent = inv?.intent === 'rent' ? 'for Rent'
            : (inv?.intent === 'sell' || inv?.intent === 'sale') ? 'for Sale' : '';
        const loc = [inv?.apartment_name, inv?.locality, inv?.city].filter(Boolean).join(', ');
        const area = s['plot-area'] ?? s.area;
        const areaUnit = s['plot-area-unit'] || s.area_unit || 'sqft';
        const floor = inv?.display_floor || inv?.floor_label
            || (inv?.floor_number != null ? String(inv.floor_number) : s.floors);
        const baths = s.bathrooms;
        const amenityList: string[] = Array.isArray(s.amenities)
            ? s.amenities
            : Object.keys(s.amenities || {}).filter(k => s.amenities[k]);

        const lines = [`*${i + 1}.* 🏡 ${bhk}${typeName}${intent ? ' — ' + intent : ''}`.trim()];
        if (loc) lines.push(`📍 ${loc}`);
        lines.push(`💰 ${fmtPrice(inv?.display_price ?? inv?.price)}`);
        if (area) lines.push(`📐 ${area} ${areaUnit}`);
        if (s.furnishing) lines.push(`🛋️ ${humanize(s.furnishing)}`);
        if (baths) lines.push(`🚿 ${baths} Bathroom${Number(baths) > 1 ? 's' : ''}`);
        if (floor) lines.push(`🏢 Floor: ${floor}`);
        if (s.facing) lines.push(`🧭 ${humanize(s.facing)} Facing`);
        if (s['ownership-tenure']) lines.push(`📜 ${humanize(s['ownership-tenure'])}`);
        if (amenityList.length) lines.push(`✨ ${amenityList.slice(0, 5).map(humanize).join(' · ')}`);
        if (link) lines.push(`🔗 ${link}`);
        return lines.join('\n');
    });
    const body = blocks.join('\n\n');
    return mode === 'dealer'
        ? `Property details:\n\n${body}`
        : `Hi! Here are some properties for you:\n\n${body}\n\n— Realty Pandit Team`;
}
