import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Properties for Sale & Rent in India',
    description: 'Browse properties for sale, rent, and lease across India. Flats, houses, plots, and commercial spaces in Noida, Gurgaon, Delhi, Mumbai, Bangalore, Pune, Hyderabad, Chennai. AI-powered search by Realty Pandit.',
    alternates: {
        canonical: '/properties',
    },
    openGraph: {
        title: 'Properties for Sale & Rent in India | Realty Pandit',
        description: 'Browse properties for sale, rent, and lease across India. AI-powered real estate search.',
        type: 'website',
        url: 'https://www.realtypandit.in/properties',
        siteName: 'Realty Pandit',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Properties for Sale & Rent in India | Realty Pandit',
        description: 'Browse properties for sale, rent, and lease across India. AI-powered real estate search.',
    },
};

export default function PropertiesLayout({ children }: { children: React.ReactNode }) {
    return children;
}
