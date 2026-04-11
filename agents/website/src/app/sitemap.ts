import { MetadataRoute } from 'next';
import { blogPosts } from '@/lib/blog-data';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071';

const cities = ['noida', 'gurgaon', 'delhi', 'mumbai', 'bangalore', 'pune', 'hyderabad', 'chennai'];

const cityLocalities: Record<string, string[]> = {
    'noida': ['sector-150', 'sector-137', 'sector-62', 'sector-75', 'greater-noida-west'],
    'gurgaon': ['dlf-phase-1', 'dlf-phase-3', 'sohna-road', 'golf-course-road', 'sector-49'],
    'delhi': ['dwarka', 'rohini', 'vasant-kunj', 'saket', 'janakpuri'],
    'mumbai': ['andheri', 'powai', 'bandra', 'thane', 'navi-mumbai'],
    'bangalore': ['whitefield', 'indiranagar', 'koramangala', 'hsr-layout', 'electronic-city'],
    'pune': ['hinjewadi', 'kharadi', 'wakad', 'baner', 'viman-nagar'],
    'hyderabad': ['gachibowli', 'hitec-city', 'madhapur', 'kondapur', 'jubilee-hills'],
    'chennai': ['omr', 'adyar', 't-nagar', 'velachery', 'anna-nagar'],
};

async function fetchAllPropertyIds(): Promise<{ id: string; slug?: string; updated_at?: string }[]> {
    try {
        const allProperties: { id: string; slug?: string; updated_at?: string }[] = [];
        let page = 1;
        const limit = 50;
        let hasMore = true;

        while (hasMore) {
            const res = await fetch(`${API_URL}/public/properties?page=${page}&limit=${limit}`, {
                next: { revalidate: 3600 },
            });
            if (!res.ok) break;
            const data = await res.json();
            const properties = data.properties || [];
            allProperties.push(...properties.map((p: any) => ({ id: p.id, slug: p.slug, updated_at: p.updated_at || p.created_at })));
            hasMore = properties.length === limit;
            page++;
            if (page > 100) break; // safety limit: 5000 properties max
        }
        return allProperties;
    } catch {
        return [];
    }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages: MetadataRoute.Sitemap = [
        { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
        { url: `${BASE_URL}/properties`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        { url: `${BASE_URL}/post-property`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/services`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE_URL}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/tools`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/tools/emi-calculator`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/tools/area-converter`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/compare`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE_URL}/join`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/projects`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    ];

    const blogPages: MetadataRoute.Sitemap = blogPosts.map(post => ({
        url: `${BASE_URL}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
    }));

    const cityPages: MetadataRoute.Sitemap = cities.map(city => ({
        url: `${BASE_URL}/properties/in/${city}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    }));

    const localityPages: MetadataRoute.Sitemap = Object.entries(cityLocalities).flatMap(([city, localities]) =>
        localities.map(locality => ({
            url: `${BASE_URL}/properties/in/${city}/${locality}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        }))
    );

    // Budget range pages (city x budget combinations)
    const budgetSlugs = [
        'below-20-lakhs', 'below-30-lakhs', 'below-50-lakhs',
        '50-75-lakhs', '75-lakhs-1-crore', '1-2-crore', '2-5-crore', 'above-5-crore',
    ];
    const budgetPages: MetadataRoute.Sitemap = cities.flatMap(city =>
        budgetSlugs.map(budget => ({
            url: `${BASE_URL}/properties/in/${city}/budget/${budget}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }))
    );

    // Dynamic: individual property pages
    const properties = await fetchAllPropertyIds();
    const propertyPages: MetadataRoute.Sitemap = properties.map(p => ({
        url: `${BASE_URL}/properties/${p.slug || p.id}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
    }));

    return [...staticPages, ...blogPages, ...cityPages, ...localityPages, ...budgetPages, ...propertyPages];
}
