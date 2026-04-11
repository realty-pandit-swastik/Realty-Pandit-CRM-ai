import { getMediaUrl } from './api';
import { COMPANY_PHONE_DISPLAY } from './constants';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.realtypandit.in';

export function organizationJsonLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'RealEstateAgent',
        name: 'Realty Pandit',
        description: 'AI-powered real estate platform for buying, selling, and renting properties across India.',
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        contactPoint: {
            '@type': 'ContactPoint',
            telephone: COMPANY_PHONE_DISPLAY,
            contactType: 'customer service',
            availableLanguage: ['English', 'Hindi'],
        },
        sameAs: [
            'https://www.facebook.com/airealtypandit',
            'https://www.instagram.com/airealtypandit',
            'https://www.youtube.com/channel/UCQa1_h4333_Ke9RIKSx_Gow',
        ],
    };
}

export function propertyJsonLd(property: {
    id: string;
    slug?: string | null;
    type: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    specs: Record<string, any> | null;
    media_urls: string[];
    intent: string;
    description?: string | null;
}) {
    const specs = property.specs || {};
    const bhk = specs.bedrooms ? `${specs.bedrooms} BHK ` : '';
    const name = `${bhk}${property.type}${property.location ? ` in ${property.location}` : ''}`;
    const intentLabel = property.intent === 'sell' ? 'for Sale' : property.intent === 'rent' ? 'for Rent' : '';

    return {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name: `${name} ${intentLabel}`.trim(),
        description: property.description || `${name} ${intentLabel} - Realty Pandit`,
        url: `${SITE_URL}/properties/${property.slug || property.id}`,
        image: property.media_urls?.[0] ? getMediaUrl(property.media_urls[0]) : undefined,
        ...(specs.area && {
            floorSize: {
                '@type': 'QuantitativeValue',
                value: specs.area,
                unitCode: specs.unit || 'sqft',
            },
        }),
        ...(specs.bedrooms && {
            numberOfRooms: specs.bedrooms,
        }),
        offers: property.price ? {
            '@type': 'Offer',
            price: property.price_unit === 'Crore' || property.price_unit === 'Cr'
                ? property.price * 10000000
                : property.price_unit === 'Lakh'
                    ? property.price * 100000
                    : property.price,
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
        } : undefined,
    };
}

export function articleJsonLd(article: {
    title: string;
    description: string;
    slug: string;
    image?: string;
    author: string;
    datePublished: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        url: `${SITE_URL}/blog/${article.slug}`,
        image: article.image,
        author: { '@type': 'Person', name: article.author },
        publisher: {
            '@type': 'Organization',
            name: 'Realty Pandit',
            logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
        },
        datePublished: article.datePublished,
    };
}

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(faq => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
            },
        })),
    };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.name,
            item: item.url,
        })),
    };
}
