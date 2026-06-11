'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Plus, X, Scale, MapPin, Maximize } from 'lucide-react';
import { formatPrice, getMediaUrl } from '@/lib/api';
import { getCompareList, setCompareList, type CompareItem } from '@/components/property-detail/CompareButton';
import { getRoomCount, getRoomLabel, getTypeLabel, getFurnishing, getFacing, getConstructionAge, getTotalFloors, getAmenities } from '@/lib/propertyUtils';

const MAX_SLOTS = 3;

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'N/A');

const COMPARISON_ROWS: { label: string; key: string; render: (p: CompareItem) => string }[] = [
    { label: 'Price', key: 'price', render: p => formatPrice(p.price, p.price_unit) },
    { label: 'Price/sqft', key: 'price_sqft', render: p => {
        const area = Number(p.specs?.area);
        if (!area || !p.price) return 'N/A';
        const totalPrice = p.price * (p.price_unit === 'Cr' || p.price_unit === 'Crore' ? 10000000 : p.price_unit === 'Lakh' ? 100000 : 1);
        return `₹${Math.round(totalPrice / area).toLocaleString('en-IN')}`;
    }},
    { label: 'Location', key: 'location', render: p => p.location || 'N/A' },
    { label: 'Type', key: 'type', render: p => getTypeLabel(p as any) },
    { label: 'Category', key: 'category', render: p => cap(p.category) },
    { label: 'Configuration', key: 'bhk', render: p => { const c = getRoomCount(p as any); return c ? `${c} ${getRoomLabel(p as any)}` : 'N/A'; } },
    { label: 'Bathrooms', key: 'bathrooms', render: p => p.specs?.bathrooms ? `${p.specs.bathrooms}` : 'N/A' },
    { label: 'Area', key: 'area', render: p => p.specs?.area ? `${p.specs.area} ${p.specs.unit || 'sqft'}` : 'N/A' },
    { label: 'Furnishing', key: 'furnishing', render: p => getFurnishing(p as any) || 'N/A' },
    { label: 'Facing', key: 'facing', render: p => getFacing(p as any) || 'N/A' },
    { label: 'Floor', key: 'floor', render: p => { const tf = getTotalFloors(p as any); return p.floor_number ? `${p.floor_number}${tf ? ` of ${tf}` : ''}` : 'N/A'; } },
    { label: 'Age', key: 'age', render: p => getConstructionAge(p as any) || 'N/A' },
    { label: 'Intent', key: 'intent', render: p => p.intent === 'sell' ? 'For Sale' : p.intent === 'rent' ? 'For Rent' : (p.intent || 'N/A') },
    { label: 'Amenities', key: 'amenities', render: p => { const a = getAmenities(p as any); return a.length > 0 ? a.slice(0, 5).join(', ') : 'N/A'; } },
    { label: 'Status', key: 'status', render: p => cap(p.status) },
];

export default function ComparePage() {
    const [properties, setProperties] = useState<CompareItem[]>([]);

    useEffect(() => {
        // Single source of truth: the same list the "Add to Compare" button writes.
        const refresh = () => setProperties(getCompareList().slice(0, MAX_SLOTS));
        refresh();
        window.addEventListener('compare-list-changed', refresh);
        window.addEventListener('storage', refresh);
        return () => {
            window.removeEventListener('compare-list-changed', refresh);
            window.removeEventListener('storage', refresh);
        };
    }, []);

    const removeProperty = (id: string) => {
        const updated = getCompareList().filter(p => p.id !== id);
        setCompareList(updated); // fires 'compare-list-changed' → refresh
    };

    const emptySlots = MAX_SLOTS - properties.length;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-700 dark:to-indigo-800 text-white">
                <div className="max-w-7xl mx-auto px-4 py-10">
                    <nav className="flex items-center gap-2 text-sm text-purple-100 mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white font-medium">Compare Properties</span>
                    </nav>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <Scale className="w-8 h-8" />
                            <h1 className="text-3xl md:text-4xl font-bold">Compare Properties</h1>
                        </div>
                        <p className="text-purple-100 text-lg">
                            Compare up to 3 properties side by side
                        </p>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {/* Property Slots */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
                >
                    <AnimatePresence mode="popLayout">
                        {properties.map((property) => (
                            <motion.div
                                key={property.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm relative"
                            >
                                <button
                                    onClick={() => removeProperty(property.id)}
                                    className="absolute top-3 right-3 z-10 w-8 h-8 bg-red-500/90 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                                    title="Remove"
                                    aria-label="Remove property from comparison"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="h-36 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center overflow-hidden">
                                    {property.image ? (
                                        <img src={getMediaUrl(property.image)} alt={getTypeLabel(property as any)} className="w-full h-full object-cover" />
                                    ) : (
                                        <Maximize className="w-10 h-10 text-slate-300 dark:text-slate-500" />
                                    )}
                                </div>
                                <div className="p-4">
                                    <p className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                                        {formatPrice(property.price, property.price_unit)}
                                    </p>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-2">
                                        {(() => { const c = getRoomCount(property as any); return c ? `${c} ${getRoomLabel(property as any)} ` : ''; })()}{getTypeLabel(property as any)}
                                    </p>
                                    {property.location && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {property.location}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Empty slots */}
                    {Array.from({ length: emptySlots }).map((_, i) => (
                        <Link
                            key={`empty-${i}`}
                            href="/properties"
                            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl flex flex-col items-center justify-center py-16 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors group"
                        >
                            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-colors">
                                <Plus className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors" />
                            </div>
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                Add Property
                            </span>
                        </Link>
                    ))}
                </motion.div>

                {/* Comparison Table */}
                {properties.length >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm"
                    >
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Detailed Comparison</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                        <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-semibold w-36">Feature</th>
                                        {properties.map(p => (
                                            <th key={p.id} className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-semibold">
                                                {(() => { const c = getRoomCount(p as any); return c ? `${c} ${getRoomLabel(p as any)} ` : ''; })()}{getTypeLabel(p as any)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {COMPARISON_ROWS.map(row => (
                                        <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-medium">{row.label}</td>
                                            {properties.map(p => (
                                                <td key={p.id} className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                                                    {row.render(p)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {properties.length < 2 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <Scale className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Add at least 2 properties to compare
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">
                            Browse our listings and add properties to your comparison list.
                        </p>
                        <Link
                            href="/properties"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
                        >
                            Add from listings
                        </Link>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
