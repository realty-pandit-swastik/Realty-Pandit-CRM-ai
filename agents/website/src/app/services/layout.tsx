import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Real Estate Services - Buy, Sell & Rent',
    description: 'Complete real estate services: buy property, sell property, rent, property management, legal assistance, and home loan guidance. End-to-end support by Realty Pandit.',
    alternates: {
        canonical: '/services',
    },
    openGraph: {
        title: 'Real Estate Services | Realty Pandit',
        description: 'Complete real estate services: buy, sell, rent, property management, legal assistance, and home loans.',
        type: 'website',
        url: 'https://www.realtypandit.in/services',
        siteName: 'Realty Pandit',
    },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
    return children;
}
