'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Building2, Home, MapPin, Search, ArrowRight, Store } from 'lucide-react';
import Link from 'next/link';
import InternalLinks from '@/components/InternalLinks';
import PropertyCard from '@/components/PropertyCard';
import { getProperties, type Property } from '@/lib/api';

// Curated locality lists per city (used for SEO internal links). Stats are now fetched live.
const cityLocalities: Record<string, string[]> = {
    'noida': ['Sector 150', 'Sector 137', 'Sector 62', 'Sector 75', 'Sector 44', 'Greater Noida West'],
    'gurgaon': ['DLF Phase 1', 'DLF Phase 3', 'Sohna Road', 'Golf Course Road', 'Sector 49', 'MG Road'],
    'delhi': ['Dwarka', 'Rohini', 'Vasant Kunj', 'Saket', 'Janakpuri', 'Lajpat Nagar'],
    'ghaziabad': ['Vaishali', 'Indirapuram', 'Vasundhara', 'Kaushambi', 'Raj Nagar Extension', 'Crossing Republik'],
    'mumbai': ['Andheri', 'Powai', 'Bandra', 'Thane', 'Navi Mumbai', 'Goregaon'],
    'bangalore': ['Whitefield', 'Indiranagar', 'Koramangala', 'HSR Layout', 'Electronic City', 'Marathahalli'],
    'pune': ['Hinjewadi', 'Kharadi', 'Wakad', 'Baner', 'Viman Nagar', 'Hadapsar'],
    'hyderabad': ['Gachibowli', 'HITEC City', 'Madhapur', 'Kondapur', 'Jubilee Hills', 'Banjara Hills'],
    'chennai': ['OMR', 'Adyar', 'T Nagar', 'Velachery', 'Anna Nagar', 'Porur'],
};

// Category-level tabs the backend reliably filters on (inventory.category).
const propertyTypes = [
    { key: 'all', label: 'All', icon: Building2 },
    { key: 'residential', label: 'Residential', icon: Home },
    { key: 'commercial', label: 'Commercial', icon: Store },
];

function formatCityName(slug: string): string {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
}

export default function CityPageClient({ city }: { city: string }) {
    const [activeType, setActiveType] = useState('all');
    const [properties, setProperties] = useState<Property[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const cityName = formatCityName(city);
    const localities = cityLocalities[city.toLowerCase()] || [];

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getProperties({
                location: cityName,
                category: activeType === 'all' ? undefined : activeType,
                limit: 6,
            });
            setProperties(data.properties);
            setTotal(data.pagination.total);
        } catch {
            setProperties([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [cityName, activeType]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
                <div className="absolute inset-0 bg-[url(/grid.svg)] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 py-12 md:py-16 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
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
                            Discover your dream property in {cityName}. Browse residential and commercial listings across top localities.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Stats Bar — real total */}
            <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="grid grid-cols-3 gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{total === null ? '—' : total}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Properties</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                                <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">{localities.length || '—'}</p>
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
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {/* Type tabs */}
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Browse by Property Type</h2>
                    <div className="flex flex-wrap gap-2">
                        {propertyTypes.map(type => {
                            const Icon = type.icon;
                            return (
                                <button
                                    key={type.key}
                                    type="button"
                                    onClick={() => setActiveType(type.key)}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                                        activeType === type.key
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" /> {type.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Real property grid */}
                <div className="mb-16">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                {properties.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
                            </div>
                            <div className="text-center">
                                <Link
                                    href={`/properties?location=${encodeURIComponent(cityName)}`}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                                >
                                    View all {total ?? ''} properties in {cityName} <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <div className="mx-auto w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5">
                                <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">No {activeType === 'all' ? '' : activeType + ' '}properties in {cityName} yet</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-6">We&apos;re adding listings here. Browse all properties meanwhile.</p>
                            <Link href="/properties" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                                Browse All Properties <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Popular Localities (SEO internal links) */}
                {localities.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Popular Localities in {cityName}</h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">Explore properties in the most sought-after neighborhoods</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {localities.map(locality => (
                                <Link
                                    key={locality}
                                    href={`/properties/in/${city}/${toSlug(locality)}`}
                                    className="group flex items-center justify-between p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                            <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{locality}</h3>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">{cityName}</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-12">
                    <InternalLinks city={city} cityName={cityName} showLocalities={false} />
                </div>

                {/* SEO content — real count, no fabricated avg price */}
                <section className="mt-16 py-10 border-t border-slate-200 dark:border-slate-800">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Real Estate in {cityName}</h2>
                    <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                        <p>
                            {cityName} is one of India&apos;s most dynamic real estate markets, offering a diverse range of properties
                            from affordable flats to luxury villas. Whether you&apos;re buying your first home, investing in commercial
                            real estate, or finding the perfect rental, {cityName} has something for every budget.
                        </p>
                        <p>
                            {total ? `With ${total} active listings` : 'With a growing set of listings'}{localities.length ? ` across ${localities.length} popular localities` : ''},
                            Realty Pandit helps you navigate the {cityName} property market with AI-powered recommendations.
                        </p>
                        {localities.length >= 3 && (
                            <p>
                                Top localities like {localities.slice(0, 3).join(', ')} are among the most sought-after areas in {cityName},
                                known for excellent connectivity and modern infrastructure. Use Panditji, our AI property assistant on
                                WhatsApp, for personalized recommendations in {cityName}.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
