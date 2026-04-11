import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'FAQ - Property Buying & Selling Guide',
    description: 'Find answers to common questions about buying, selling, renting properties in India. Learn about RERA, home loans, stamp duty, and Panditji AI assistant. Realty Pandit FAQ.',
    alternates: {
        canonical: '/faq',
    },
    openGraph: {
        title: 'FAQ - Property Buying, Selling & Renting Guide | Realty Pandit',
        description: 'Answers to common real estate questions - RERA, home loans, stamp duty, rental agreements, and more.',
        type: 'website',
        url: 'https://www.realtypandit.in/faq',
        siteName: 'Realty Pandit',
    },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
    return children;
}
