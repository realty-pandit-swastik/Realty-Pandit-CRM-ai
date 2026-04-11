import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'About Us - AI Real Estate Platform',
    description: 'Realty Pandit is India\'s AI-powered real estate platform with 15+ years of expertise. Meet Panditji, your 24/7 property assistant on WhatsApp. Serving Noida, Gurgaon, Delhi, Mumbai & more.',
    alternates: {
        canonical: '/about',
    },
    openGraph: {
        title: 'About Realty Pandit - AI-Powered Real Estate Platform',
        description: 'AI-powered real estate platform with 15+ years of expertise. 24/7 WhatsApp property assistant.',
        type: 'website',
        url: 'https://www.realtypandit.in/about',
        siteName: 'Realty Pandit',
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
