'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Building2, Home, TrendingUp, MapPin, Search, ArrowRight, Building, LandPlot, Store } from 'lucide-react';
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

function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
}

export default function CityPageClient({ city }: { city: string }) {
    const [activeType, setActiveType] = useState('all');

    const cityName = formatCityName(city);
    const data = cityData[city.toLowerCase()];

    // Unknown city
    if (!data) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                    <div className="max-w-7xl mx-auto px-4 py-10">
                        <nav className="flex items-center gap-2 text-sm text-blue-100 mb-4">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/properties" className="hover:text-white transition-colors">Properties</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white font-medium">{cityName}</span>
                        </nav>
                        <h1 className="text-3xl md:text-4xl font-bold">
                            Explore Properties in {cityName}
                        </h1>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 py-20 text-center">
                    <div className="mx-auto w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                        <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-3">
                        We&apos;re expanding to {cityName}!
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
                        Properties coming soon in {cityName}. Browse all properties instead.
                    </p>
                    <Link
                        href="/properties"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                    >
                        Browse All Properties <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        );
    }

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
                        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/properties" className="hover:text-white transition-colors">Properties</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white font-medium">{cityName}</span>
                        </nav>

                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Properties in <span className="text-blue-400">{cityName}</span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Discover your dream property in {cityName}. Browse flats, houses, plots, and commercial spaces across top localities.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Stats Bar */}
            <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="grid grid-cols-2 md:grid-cols-4 gap-6"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{data.propertyCount}+</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Properties</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{data.avgPrice}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Avg. Price</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                                <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{data.localities.length}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Popular Localities</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex items-center justify-center">
                                <Search className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">24/7</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">AI Assistance</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {/* Property Type Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
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

                {/* Placeholder Property Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    className="mb-16"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {[...Array(6)].map((_, i) => (
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
                    <div className="text-center">
                        <p className="text-slate-500 dark:text-slate-400 mb-4">
                            Properties coming soon in {cityName}. Browse all properties instead.
                        </p>
                        <Link
                            href="/properties"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                        >
                            Browse All Properties <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </motion.div>

                {/* Popular Localities Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Popular Localities in {cityName}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">
                        Explore properties in the most sought-after neighborhoods
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.localities.map((locality, i) => (
                            <motion.div
                                key={locality}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.3, delay: i * 0.05 }}
                            >
                                <Link
                                    href={`/properties/in/${city}/${toSlug(locality)}`}
                                    className="group flex items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                            <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {locality}
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

                {/* Internal Links for SEO */}
                <div className="mt-12">
                    <InternalLinks city={city} cityName={cityName} showLocalities={false} />
                </div>

                {/* SEO Content */}
                <motion.section
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="mt-16 py-10 border-t border-slate-200 dark:border-slate-800"
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                        Real Estate in {cityName}
                    </h2>
                    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                        <p>
                            {cityName} is one of India&apos;s most dynamic real estate markets, offering a diverse range of properties
                            from affordable flats to luxury villas. Whether you&apos;re looking to buy your first home, invest in
                            commercial real estate, or find the perfect rental, {cityName} has something for every budget and preference.
                        </p>
                        <p>
                            With {data.propertyCount}+ listings across {data.localities.length} popular localities, Realty Pandit
                            helps you navigate the {cityName} property market with AI-powered recommendations. Our average property
                            price in {cityName} is around {data.avgPrice}, though prices vary significantly by locality and property type.
                        </p>
                        <p>
                            Top localities like {data.localities.slice(0, 3).join(', ')} are among the most sought-after areas
                            in {cityName}, known for excellent connectivity, modern infrastructure, and strong appreciation potential.
                            Use Panditji, our AI property assistant on WhatsApp, to get personalized property recommendations in {cityName}.
                        </p>
                    </div>
                </motion.section>
            </div>
        </div>
    );
}
