import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Real Estate Tools - EMI & Area',
    description: 'Free real estate tools: EMI Calculator for home loan planning and Area Converter for sq ft, sq m, acres, bigha, and more. Make informed property decisions.',
    alternates: {
        canonical: '/tools',
    },
    openGraph: {
        title: 'Real Estate Tools | Realty Pandit',
        description: 'Free EMI calculator and area converter tools for property buyers and sellers.',
        type: 'website',
        url: 'https://www.realtypandit.in/tools',
        siteName: 'Realty Pandit',
    },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
