import { Metadata } from 'next';
import { breadcrumbJsonLd } from '@/lib/seo';
import BudgetPageClient from './BudgetPageClient';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';

const budgetRanges: Record<string, { label: string; min: number; max: number; display: string }> = {
    'below-10-lakhs': { label: 'Below 10 Lakhs', min: 0, max: 1000000, display: '₹10 Lakh' },
    'below-20-lakhs': { label: 'Below 20 Lakhs', min: 0, max: 2000000, display: '₹20 Lakh' },
    'below-30-lakhs': { label: 'Below 30 Lakhs', min: 0, max: 3000000, display: '₹30 Lakh' },
    'below-50-lakhs': { label: 'Below 50 Lakhs', min: 0, max: 5000000, display: '₹50 Lakh' },
    '50-75-lakhs': { label: '50-75 Lakhs', min: 5000000, max: 7500000, display: '₹50-75 Lakh' },
    '75-lakhs-1-crore': { label: '75 Lakhs - 1 Crore', min: 7500000, max: 10000000, display: '₹75L-1Cr' },
    '1-2-crore': { label: '1-2 Crore', min: 10000000, max: 20000000, display: '₹1-2 Cr' },
    '2-5-crore': { label: '2-5 Crore', min: 20000000, max: 50000000, display: '₹2-5 Cr' },
    'above-5-crore': { label: 'Above 5 Crore', min: 50000000, max: 999999999, display: '₹5 Cr+' },
};

function formatCityName(slug: string): string {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function generateMetadata({ params }: { params: Promise<{ city: string; range: string }> }): Promise<Metadata> {
    const { city, range } = await params;
    const cityName = formatCityName(city);
    const budget = budgetRanges[range];

    if (!budget) {
        return { title: 'Budget Properties', description: 'Find properties in your budget.' };
    }

    const title = `Properties ${budget.label} in ${cityName}`;
    const description = `Find properties priced ${budget.label} in ${cityName}. Browse affordable flats, houses, plots for sale and rent. AI-powered search by Realty Pandit.`;

    return {
        title,
        description,
        alternates: { canonical: `/properties/in/${city}/budget/${range}` },
        openGraph: {
            title: `${title} | Realty Pandit`,
            description,
            type: 'website',
            url: `${SITE_URL}/properties/in/${city}/budget/${range}`,
            siteName: 'Realty Pandit',
        },
    };
}

export default async function BudgetPage({ params }: { params: Promise<{ city: string; range: string }> }) {
    const { city, range } = await params;
    const cityName = formatCityName(city);
    const budget = budgetRanges[range];

    const breadcrumbs = breadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Properties', url: `${SITE_URL}/properties` },
        { name: cityName, url: `${SITE_URL}/properties/in/${city}` },
        { name: budget?.label || 'Budget', url: `${SITE_URL}/properties/in/${city}/budget/${range}` },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
            />
            <BudgetPageClient city={city} range={range} />
        </>
    );
}
