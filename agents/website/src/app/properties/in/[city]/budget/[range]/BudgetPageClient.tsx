'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Building2, TrendingUp, MapPin, ArrowRight, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { getProperties, type Property } from '@/lib/api';
import PropertyCard from '@/components/PropertyCard';
import InternalLinks from '@/components/InternalLinks';

const budgetRanges: Record<string, { label: string; min: number; max: number; display: string }> = {
    'below-10-lakhs': { label: 'Below 10 Lakhs', min: 0, max: 1000000, display: '₹10 Lakh' },
    'below-20-lakhs': { label: 'Below 20 Lakhs', min: 0, max: 2000000, display: '₹20 Lakh' },
    'below-30-lakhs': { label: 'Below 30 Lakhs', min: 0, max: 3000000, display: '₹30 Lakh' },
    'below-50-lakhs': { label: 'Below 50 Lakhs', min: 0, max: 5000000, display: '₹50 Lakh' },
    '50-75-lakhs': { label: '50-75 Lakhs', min: 5000000, max: 7500000, display: '₹50-75 Lakh' },
    '75-lakhs-1-crore': { label: '75 Lakhs - 1 Crore', min: 7500000, max: 10000000, display: '₹75L-1Cr' },
    '1-2-crore': { label: '1-2 Crore', min: 10000000, max: 20000000, display: '₹1-2 Cr' },
    '2-5-crore': { label: '2-5 Crore', min: 20000000, max: 50000000, display: '₹2-5 Cr' },
    'above-5-crore': { label: 'Above 5 Crore', min: 50000000, max: 999999999, display: '₹5 Cr+' },
};

function formatCityName(slug: string): string {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function BudgetPageClient({ city, range }: { city: string; range: string }) {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    const cityName = formatCityName(city);
    const budget = budgetRanges[range];

    useEffect(() => {
        if (!budget) return;
        setLoading(true);
        getProperties({
            location: cityName,
            price_min: budget.min || undefined,
            price_max: budget.max,
            limit: 24,
        }).then(data => {
            setProperties(data.properties || []);
            setTotal(data.pagination?.total || 0);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [city, range, budget, cityName]);

    if (!budget) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
                <div className="max-w-7xl mx-auto px-4 py-20 text-center">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Budget Range Not Found</h1>
                    <Link href={`/properties/in/${city}`} className="text-blue-600 hover:underline">
                        Browse all properties in {cityName}
                    </Link>
                </div>
            </div>
        );
    }

    // Other budget ranges for cross-linking
    const otherBudgets = Object.entries(budgetRanges).filter(([key]) => key !== range);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
                <div className="absolute inset-0 bg-[url(/grid.svg)] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 py-12 md:py-16 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6 flex-wrap">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/properties" className="hover:text-white transition-colors">Properties</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href={`/properties/in/${city}`} className="hover:text-white transition-colors">{cityName}</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white font-medium">{budget.label}</span>
                        </nav>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                            Properties <span className="text-blue-400">{budget.label}</span> in {cityName}
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Find affordable properties priced {budget.label} in {cityName}. Browse flats, houses, and plots within your budget.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Stats */}
            <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{total}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Properties Found</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
                                <IndianRupee className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{budget.display}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Budget Range</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                                <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{cityName}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Location</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {/* Property Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                <div className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                <div className="p-5 space-y-3">
                                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-3/4" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : properties.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {properties.map((property, index) => (
                            <PropertyCard key={property.id} property={property} index={index} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 mb-12">
                        <div className="mx-auto w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5">
                            <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-3">
                            No properties found in this budget
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            Try a different budget range or browse all properties in {cityName}.
                        </p>
                        <Link href={`/properties/in/${city}`} className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                            All {cityName} Properties <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                )}

                {/* Other Budget Ranges */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="mb-12"
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Other Budget Ranges in {cityName}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Explore properties in different price ranges</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {otherBudgets.map(([key, b]) => (
                            <Link
                                key={key}
                                href={`/properties/in/${city}/budget/${key}`}
                                className="group flex items-center gap-2 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
                            >
                                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {b.label}
                                </span>
                            </Link>
                        ))}
                    </div>
                </motion.div>

                {/* Internal Links */}
                <InternalLinks city={city} cityName={cityName} />

                {/* SEO Content */}
                <section className="py-10 border-t border-slate-200 dark:border-slate-800">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                        Properties {budget.label} in {cityName}
                    </h2>
                    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                        <p>
                            Looking for affordable properties priced {budget.label} in {cityName}? Realty Pandit helps you find the best
                            deals in your budget range. Browse through verified flats, houses, plots, and commercial spaces across
                            popular localities in {cityName}.
                        </p>
                        <p>
                            Our AI-powered assistant Panditji can help you narrow down the perfect property within your budget of {budget.display}
                            in {cityName}. Get personalized recommendations, schedule visits, and receive expert guidance throughout
                            your property buying journey.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
