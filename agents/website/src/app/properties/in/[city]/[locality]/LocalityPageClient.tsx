'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Building2, Home, MapPin, ArrowRight, Building, LandPlot, Store, Phone, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import InternalLinks from '@/components/InternalLinks';

const cityData: Record<string, { localities: string[]; avgPrice: string; propertyCount: number }> = {
    'noida': { localities: ['Sector 150', 'Sector 137', 'Sector 62', 'Sector 75', 'Sector 44', 'Greater Noida West'], avgPrice: '85 Lakh', propertyCount: 250 },
    'gurgaon': { localities: ['DLF Phase 1', 'DLF Phase 3', 'Sohna Road', 'Golf Course Road', 'Sector 49', 'MG Road'], avgPrice: '1.2 Cr', propertyCount: 380 },
    'delhi': { localities: ['Dwarka', 'Rohini', 'Vasant Kunj', 'Saket', 'Janakpuri', 'Lajpat Nagar'], avgPrice: '1.5 Cr', propertyCount: 520 },
    'mumbai': { localities: ['Andheri', 'Powai', 'Bandra', 'Thane', 'Navi Mumbai', 'Goregaon'], avgPrice: '2.1 Cr', propertyCount: 680 },
    'bangalore': { localities: ['Whitefield', 'Indiranagar', 'Koramangala', 'HSR Layout', 'Electronic City', 'Marathahalli'], avgPrice: '95 Lakh', propertyCount: 420 },
    'pune': { localities: ['Hinjewadi', 'Kharadi', 'Wakad', 'Baner', 'Viman Nagar', 'Hadapsar'], avgPrice: '72 Lakh', propertyCount: 310 },
    'hyderabad': { localities: ['Gachibowli', 'HITEC City', 'Madhapur', 'Kondapur', 'Jubilee Hills', 'Banjara Hills'], avgPrice: '80 Lakh', propertyCount: 290 },
    'chennai': { localities: ['OMR', 'Adyar', 'T Nagar', 'Velachery', 'Anna Nagar', 'Porur'], avgPrice: '70 Lakh', propertyCount: 260 },
};

const propertyTypes = [
    { key: 'all', label: 'All', icon: Building2 },
    { key: 'flats', label: 'Flats', icon: Building },
    { key: 'houses', label: 'Houses', icon: Home },
    { key: 'plots', label: 'Plots', icon: LandPlot },
    { key: 'commercial', label: 'Commercial', icon: Store },
];

function formatCityName(slug: string): string {
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatLocalityName(slug: string): string {
    return slug
        .split('-')
        .map(word => {
            // Keep common abbreviations uppercase
            const upper = word.toUpperCase();
            if (['DLF', 'MG', 'OMR', 'HSR', 'HITEC'].includes(upper)) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
}

export default function LocalityPageClient({ city, locality }: { city: string; locality: string }) {
    const [activeType, setActiveType] = useState('all');

    const cityName = formatCityName(city);
    const localityName = formatLocalityName(locality);
    const data = cityData[city.toLowerCase()];

    const nearbyLocalities = data
        ? data.localities.filter(l => toSlug(l) !== locality.toLowerCase())
        : [];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero Section */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 py-12 md:py-16 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Breadcrumb */}
                        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6 flex-wrap">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/properties" className="hover:text-white transition-colors">Properties</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href={`/properties/in/${city}`} className="hover:text-white transition-colors">{cityName}</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white font-medium">{localityName}</span>
                        </nav>

                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Properties in <span className="text-blue-400">{localityName}</span>, {cityName}
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Find your ideal property in {localityName}, {cityName}. Browse through flats, houses, plots, and commercial spaces in one of {cityName}&apos;s prime localities.
                        </p>
                    </motion.div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {/* Property Type Filter Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="mb-10"
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                        Browse by Property Type
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {propertyTypes.map(type => {
                            const Icon = type.icon;
                            return (
                                <button
                                    key={type.key}
                                    onClick={() => setActiveType(type.key)}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                        activeType === type.key
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {type.label}
                                </button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Placeholder Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    className="mb-16"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                <div className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                <div className="p-5 space-y-3">
                                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-1/2" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-2/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="text-center py-6">
                        <div className="mx-auto w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5">
                            <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 text-lg font-medium mb-2">
                            Properties coming soon in {localityName}, {cityName}.
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            Meanwhile, browse properties in {cityName}.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link
                                href={`/properties/in/${city}`}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                            >
                                Browse {cityName} Properties <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href="/properties"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                All Properties
                            </Link>
                        </div>
                    </div>
                </motion.div>

                {/* CTA: Contact Panditji */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 md:p-10 text-white mb-16"
                >
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h3 className="text-2xl font-bold mb-2">Looking for a property in {localityName}?</h3>
                            <p className="text-blue-100">
                                Chat with Panditji, our AI assistant, on WhatsApp for personalized property recommendations.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href="/contact"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors"
                            >
                                <Phone className="w-4 h-4" /> Contact Us
                            </Link>
                            <Link
                                href="https://wa.me/919999999999?text=Hi%20Panditji%2C%20I%20am%20looking%20for%20property%20in%20{localityName}"
                                target="_blank"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                            >
                                <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
                            </Link>
                        </div>
                    </div>
                </motion.div>

                {/* Nearby Localities */}
                {nearbyLocalities.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Nearby Localities in {cityName}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            Explore more areas near {localityName}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {nearbyLocalities.map((loc, i) => (
                                <motion.div
                                    key={loc}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.3, delay: i * 0.05 }}
                                >
                                    <Link
                                        href={`/properties/in/${city}/${toSlug(loc)}`}
                                        className="group flex items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                                <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {loc}
                                                </h3>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{cityName}</p>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Internal Links for SEO */}
                <div className="mb-12">
                    <InternalLinks
                        city={city}
                        cityName={cityName}
                        locality={locality}
                        localityName={localityName}
                        showLocalities={false}
                    />
                </div>

                {/* SEO Content Section */}
                <motion.section
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="py-10 border-t border-slate-200 dark:border-slate-800"
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                        About {localityName}, {cityName}
                    </h2>
                    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                        <p>
                            {localityName} is one of the most popular residential and commercial areas in {cityName},
                            known for its excellent infrastructure, connectivity, and quality of life. The area offers a wide
                            range of properties including apartments, independent houses, plots, and commercial spaces to suit
                            every budget and lifestyle.
                        </p>
                        <p>
                            The real estate market in {localityName} has shown consistent growth over the years, making it an
                            attractive destination for both homebuyers and investors. With proximity to key employment hubs,
                            schools, hospitals, and entertainment options, {localityName} remains a top choice for families
                            and professionals alike.
                        </p>
                        <p>
                            Whether you are looking to buy a flat, rent an apartment, or invest in a plot in {localityName},
                            Realty Pandit has you covered. Use Panditji, our AI-powered property assistant available 24/7 on
                            WhatsApp, to get instant property recommendations tailored to your needs in {localityName}, {cityName}.
                        </p>
                    </div>
                </motion.section>
            </div>
        </div>
    );
}
