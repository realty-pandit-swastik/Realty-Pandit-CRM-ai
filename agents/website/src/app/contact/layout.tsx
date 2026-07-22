import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Contact Realty Pandit - Get in Touch',
    description: 'Contact Realty Pandit for property inquiries. Call +91-8178491914, email info@realtypandit.in, or chat with Panditji on WhatsApp. Available 24/7.',
    alternates: {
        canonical: '/contact',
    },
    openGraph: {
        title: 'Contact Realty Pandit | Get in Touch',
        description: 'Reach us at +91-8178491914 or chat with Panditji on WhatsApp. 24/7 property assistance.',
        type: 'website',
        url: 'https://www.realtypandit.in/contact',
        siteName: 'Realty Pandit',
    },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return children;
}
