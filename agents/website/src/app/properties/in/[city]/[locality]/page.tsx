import { Metadata } from 'next';
import LocalityPageClient from './LocalityPageClient';
import { breadcrumbJsonLd } from '@/lib/seo';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';

function formatCityName(slug: string): string {
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatLocalityName(slug: string): string {
    return slug
        .split('-')
        .map(word => {
            const upper = word.toUpperCase();
            if (['DLF', 'MG', 'OMR', 'HSR', 'HITEC'].includes(upper)) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

export async function generateMetadata({ params }: { params: Promise<{ city: string; locality: string }> }): Promise<Metadata> {
    const { city, locality } = await params;
    const cityName = formatCityName(city);
    const localityName = formatLocalityName(locality);

    const title = `Properties in ${localityName}, ${cityName} - Flats, Houses & Plots`;
    const description = `Find properties in ${localityName}, ${cityName}. Browse flats, houses, plots for sale and rent. AI-powered search by Realty Pandit.`;

    return {
        title,
        description,
        alternates: {
            canonical: `/properties/in/${city}/${locality}`,
        },
        openGraph: {
            title: `${title} | Realty Pandit`,
            description,
            type: 'website',
            url: `${SITE_URL}/properties/in/${city}/${locality}`,
            siteName: 'Realty Pandit',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${title} | Realty Pandit`,
            description,
        },
    };
}

export default async function LocalityPage({ params }: { params: Promise<{ city: string; locality: string }> }) {
    const { city, locality } = await params;
    const cityName = formatCityName(city);
    const localityName = formatLocalityName(locality);

    const breadcrumbs = breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Properties', url: `${SITE_URL}/properties` },
        { name: cityName, url: `${SITE_URL}/properties/in/${city}` },
        { name: localityName, url: `${SITE_URL}/properties/in/${city}/${locality}` },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <LocalityPageClient city={city} locality={locality} />
        </>
    );
}
