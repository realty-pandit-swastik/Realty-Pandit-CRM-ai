import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Compare Properties Side by Side',
    description: 'Compare up to 3 properties side by side. See price, area, BHK, amenities, furnishing, and more at a glance to make the best property decision.',
    alternates: {
        canonical: '/compare',
    },
    openGraph: {
        title: 'Compare Properties | Realty Pandit',
        description: 'Compare properties side by side - price, area, amenities & more.',
        type: 'website',
        url: 'https://www.realtypandit.in/compare',
        siteName: 'Realty Pandit',
    },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
    return children;
}
