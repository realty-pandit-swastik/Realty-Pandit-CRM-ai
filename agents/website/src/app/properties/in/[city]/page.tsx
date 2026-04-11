import { Metadata } from 'next';
import CityPageClient from './CityPageClient';
import { breadcrumbJsonLd } from '@/lib/seo';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';

function formatCityName(slug: string): string {
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
    const { city } = await params;
    const cityName = formatCityName(city);

    const title = `Properties in ${cityName} - Buy, Rent Flats, Houses & Plots`;
    const description = `Explore ${cityName} real estate. Browse flats, houses, plots, and commercial spaces for sale and rent in ${cityName}. AI-powered property search by Realty Pandit.`;

    return {
        title,
        description,
        alternates: {
            canonical: `/properties/in/${city}`,
        },
        openGraph: {
            title: `${title} | Realty Pandit`,
            description,
            type: 'website',
            url: `${SITE_URL}/properties/in/${city}`,
            siteName: 'Realty Pandit',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${title} | Realty Pandit`,
            description,
        },
    };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
    const { city } = await params;
    const cityName = formatCityName(city);

    const breadcrumbs = breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Properties', url: `${SITE_URL}/properties` },
        { name: cityName, url: `${SITE_URL}/properties/in/${city}` },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <CityPageClient city={city} />
        </>
    );
}
