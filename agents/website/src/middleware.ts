import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Canonical property-URL redirect (privacy + SEO).
 *
 * Property slugs were re-generated to drop the flat/plot number. Any old, shared, or
 * indexed URL (a leaky old slug, a bare UUID, or an RP-* display_id) is 308-redirected
 * to the clean canonical /properties/<slug>. This lives in middleware (not the page
 * component) because under Next 16 streaming an in-component redirect() renders the page
 * shell instead of emitting an HTTP redirect; middleware runs before any render.
 *
 * The backend resolver matches by the trailing 12-hex id, so the lookup below resolves
 * old slugs too, and the redirect target (the canonical slug) never loops.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.realtypandit.in';

export async function middleware(req: NextRequest) {
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
        // network/timeout — let the request through; the page still renders + canonical tag points clean
    }
    return NextResponse.next();
}

// Single-segment property detail routes only (not /properties, not /properties/in/<city>/...).
export const config = {
    matcher: '/properties/:slug',
};
