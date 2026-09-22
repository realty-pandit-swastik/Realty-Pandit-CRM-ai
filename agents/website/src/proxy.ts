import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Canonical property-URL redirect (privacy + SEO).
 *
 * Property slugs were re-generated to drop the flat/plot number. Any old, shared, or
 * indexed URL (a leaky old slug, a bare UUID, or an RP-* display_id) is 308-redirected
 * to the clean canonical /properties/<slug>. The proxy runs before render so it can
 * issue a true HTTP redirect rather than rendering a page shell first.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.realtypandit.in';

export async function proxy(req: NextRequest) {
    const m = req.nextUrl.pathname.match(/^\/properties\/([^/]+)\/?$/);
    if (!m) return NextResponse.next();

    const id = decodeURIComponent(m[1]);
    try {
        const res = await fetch(`${API_URL}/public/properties/${encodeURIComponent(id)}`, {
            next: { revalidate: 3600 },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return NextResponse.next();
        const property = await res.json();
        if (property?.slug && id !== property.slug) {
            const url = req.nextUrl.clone();
            url.pathname = `/properties/${property.slug}`;
            return NextResponse.redirect(url, 308);
        }
    } catch {
        // Network/timeout — let the request through; the page's canonical tag stays correct.
    }
    return NextResponse.next();
}

// Single-segment property detail routes only (not /properties, not /properties/in/<city>/...).
export const config = {
    matcher: '/properties/:slug',
};
