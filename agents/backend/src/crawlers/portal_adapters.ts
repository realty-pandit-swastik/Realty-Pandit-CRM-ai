/** Conservative public JSON-LD adapters. No private APIs, cookies, login or CAPTCHA solving. */
export type PortalSource = '99acres' | 'magicbricks' | 'housing';
export const portalHosts: Record<PortalSource, string[]> = {
    '99acres': ['www.99acres.com', '99acres.com'],
    magicbricks: ['www.magicbricks.com', 'magicbricks.com'],
    housing: ['housing.com', 'www.housing.com'],
};
export function assertPortalUrl(source: PortalSource, raw: string): URL {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !portalHosts[source].includes(url.hostname)) throw new Error('URL outside approved public portal host');
    if (/login|signin|captcha|my-listings|user-profile/i.test(url.pathname)) throw new Error('Authenticated or challenge page is forbidden');
    return url;
}
function documents(html: string): any[] {
    const records: any[] = [];
    for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try { records.push(JSON.parse(script[1])); } catch { throw new Error('Malformed public listing structured data'); }
    }
    return records;
}
function walk(value: any, visit: (node: any) => void) {
    if (Array.isArray(value)) { for (const child of value) walk(child, visit); }
    else if (value && typeof value === 'object') { visit(value); for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, visit); }
}
const listingPath: Record<PortalSource, RegExp> = {
    '99acres': /npspid|property-detail|property-in/i,
    magicbricks: /propertyDetails\//i,
    housing: /\/in\/buy\/resale\/page|\/rent\/\d|\/commercial\/\d/i,
};
export function discoverListingUrls(source: PortalSource, html: string, searchUrl: string): string[] {
    const found = new Set<string>();
    const add = (raw: string) => { try { const url = assertPortalUrl(source, new URL(raw, searchUrl).href); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^utm_|^gclid$|^fbclid$/i.test(key)) url.searchParams.delete(key); if (listingPath[source].test(url.pathname)) found.add(url.href); } catch { /* ignore off-host/navigation links */ } };
    for (const record of documents(html)) walk(record, node => { if (typeof node.url === 'string') add(node.url); if (typeof node.item === 'string') add(node.item); });
    for (const link of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) add(link[1].replace(/&amp;/g, '&'));
    return [...found];
}
export function parseListing(source: PortalSource, html: string, listingUrl: string): Record<string, any> {
    const url = assertPortalUrl(source, listingUrl);
    let listing: any = null;
    for (const record of documents(html)) walk(record, node => {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        if (!listing && types.some((t: string) => ['RealEstateListing', 'Apartment', 'House', 'SingleFamilyResidence', 'Residence', 'Product', 'Accommodation'].includes(t)) && (node.name || node.address)) listing = node;
    });
    if (!listing) throw new Error('No supported public listing structured data; supervised adapter review required');
    const offer = Array.isArray(listing.offers) ? listing.offers[0] : listing.offers || {};
    if (offer.priceCurrency && offer.priceCurrency !== 'INR') throw new Error('Only INR prices are supported');
    const place = listing.about || listing.itemOffered || listing;
    const address = place.address || listing.address || {};
    const seller = offer.seller || listing.seller || offer.offeredBy || listing.offeredBy || {};
    // Public seller telephone only. No guessed numbers and no organization/support telephone harvesting.
    const sellerType = Array.isArray(seller['@type']) ? seller['@type'] : [seller['@type']];
    const sellerPhone = sellerType.includes('Person') && typeof seller.telephone === 'string' ? seller.telephone : undefined;
    const image = Array.isArray(listing.image) ? listing.image : listing.image ? [listing.image] : [];
    const media = image.map((i: any) => typeof i === 'string' ? i : i?.url).filter((i: any) => typeof i === 'string' && /^https:\/\//.test(i));
    const type = Array.isArray(place['@type']) ? place['@type'][0] : place['@type'];
    const types: Record<string, string> = { Apartment: 'flat', House: 'house', SingleFamilyResidence: 'house', Residence: 'house' };
    const price = offer.price ?? listing.price;
    if (price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('Invalid structured listing price');
    const intent = /lease|rent/i.test(String(offer.businessFunction || listing.category || '')) ? 'rent' : 'sell';
    const specs: Record<string, any> = {};
    const bedrooms = place.numberOfBedrooms;
    if (bedrooms != null && Number.isFinite(Number(bedrooms))) specs.bhk = Number(bedrooms);
    if (place.floorSize?.value != null) { specs.area = place.floorSize.value; if (place.floorSize.unitText) specs.area_unit = place.floorSize.unitText; }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^gclid$|^fbclid$/i.test(key)) url.searchParams.delete(key);
    const external = listing.identifier?.value || listing.identifier || url.href;
    return {
        source, source_ref: typeof external === 'string' || typeof external === 'number' ? String(external) : url.href,
        source_url: url.href, property_title: listing.name, description: listing.description,
        property_type: types[type], intent, price: price != null ? Number(price) : undefined, price_unit: 'INR',
        city: typeof address.addressLocality === 'string' ? address.addressLocality : undefined,
        locality: typeof address.streetAddress === 'string' ? address.streetAddress : undefined,
        full_address: typeof address === 'string' ? address : undefined,
        seller_name: sellerPhone && typeof seller.name === 'string' ? seller.name : undefined,
        seller_phone: sellerPhone, specs, media_urls: media,
    };
}

/** Robots groups, wildcard rules and longest matching rule (Allow wins ties). */
export function robotsAllows(text: string, url: URL, agent = 'RealtyPanditSourcing'): boolean {
    const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }> = [];
    let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; pattern: string }> };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim(); const at = line.indexOf(':'); if (at < 0) continue;
        const key = line.slice(0, at).toLowerCase(); const value = line.slice(at + 1).trim();
        if (key === 'user-agent') { if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; } group.agents.push(value.toLowerCase()); }
        else if ((key === 'allow' || key === 'disallow') && group.agents.length && value) group.rules.push({ allow: key === 'allow', pattern: value });
    }
    groups.push(group);
    const specific = groups.filter(g => g.agents.some(a => a !== '*' && agent.toLowerCase().includes(a)));
    const selected = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
    const path = url.pathname + url.search;
    let length = -1; let allowed = true;
    for (const g of selected) for (const rule of g.rules) {
        const end = rule.pattern.endsWith('$'); const pattern = (end ? rule.pattern.slice(0, -1) : rule.pattern).split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        if (new RegExp('^' + pattern + (end ? '$' : '')).test(path)) {
            const size = rule.pattern.replace(/[\*$]/g, '').length;
            if (size > length || (size === length && rule.allow)) { length = size; allowed = rule.allow; }
        }
    }
    return allowed;
}
