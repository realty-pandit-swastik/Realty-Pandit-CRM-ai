import { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import PropertyDetailClient from './PropertyDetailClient';
import { propertyJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import { formatType, formatAddress } from '@/lib/propertyUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';

function formatPrice(price: number | null, unit: string | null): string {
    if (!price) return 'Price on Request';
    if (unit === 'Crore' || unit === 'Cr') return `₹${price} Cr`;
    if (unit === 'Lakh') return `₹${price} Lakh`;
    // Auto-detect from raw rupee value
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
    if (price >= 100000) return `₹${(price / 100000).toFixed(2)} Lakh`;
    return `₹${price.toLocaleString('en-IN')}`;
}

function getMediaUrl(path: string | undefined | null): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${API_URL}${clean}`;
}

async function fetchProperty(id: string) {
    try {
        const res = await fetch(`${API_URL}/public/properties/${id}`, {
            next: { revalidate: 300 },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const property = await fetchProperty(id);

    if (!property) {
        return {
            title: 'Property Not Found',
            description: 'The property you are looking for could not be found.',
        };
    }

    const specs = property.specs || {};
    const bhk = specs.bedrooms && Number(specs.bedrooms) > 0 ? `${specs.bedrooms} BHK ` : '';
    const type = formatType(property.type);
    const address = formatAddress(property) || property.location || '';
    const intentLabel = property.intent === 'sell' || property.intent === 'buy' ? 'for Sale' : property.intent === 'rent' ? 'for Rent' : '';
    const price = formatPrice(property.price, property.price_unit);

    const title = address
        ? `${bhk}${type} ${intentLabel} in ${address} — ${price}`.trim()
        : `${bhk}${type} ${intentLabel} — ${price}`.trim();
    const description = property.description
        ? property.description.slice(0, 160)
        : `${bhk}${type} ${intentLabel} in ${address}. ${price}. ${specs.area ? `Area: ${specs.area} ${specs.unit || 'sqft'}.` : ''} Browse on Realty Pandit.`;

    const imageUrl = property.media_urls?.[0] ? getMediaUrl(property.media_urls[0]) : `${SITE_URL}/og-default.png`;
    const canonicalSlug = property.slug || id;

    return {
        title,
        description,
        alternates: {
            canonical: `/properties/${canonicalSlug}`,
        },
        openGraph: {
            title: `${title} | Realty Pandit`,
            description,
            type: 'website',
            url: `${SITE_URL}/properties/${canonicalSlug}`,
            images: imageUrl ? [{ url: imageUrl, width: 800, height: 600, alt: title }] : [],
            siteName: 'Realty Pandit',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${title} | Realty Pandit`,
            description,
            images: imageUrl ? [imageUrl] : [],
        },
    };
}

function PropertyDetailLoading() {
    return (
        <div className="min-h-screen pt-20 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse mb-6" />
                <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse mb-8" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    </div>
                    <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
                </div>
            </div>
        </div>
    );
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const property = await fetchProperty(id);

    if (!property) notFound();

    // Schema JSON-LD for this property
    const schemaData = property ? propertyJsonLd({
        id: property.id,
        slug: property.slug,
        type: property.property_configuration?.name || property.type || 'Property',
        location: property.location,
        price: property.price,
        price_unit: property.price_unit,
        specs: property.specs,
        media_urls: property.media_urls || [],
        intent: property.intent,
        description: property.description,
    }) : null;

    // Breadcrumb schema
    const breadcrumbs = breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Properties', url: `${SITE_URL}/properties` },
        ...(property?.location ? [{ name: property.location, url: `${SITE_URL}/properties?location=${encodeURIComponent(property.location)}` }] : []),
        { name: property ? formatType(property.type) : 'Property', url: `${SITE_URL}/properties/${property?.slug || id}` },
    ]);

    return (
        <>
            {schemaData && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
                />
            )}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <Suspense fallback={<PropertyDetailLoading />}>
                <PropertyDetailClient id={id} />
            </Suspense>
        </>
    );
}
