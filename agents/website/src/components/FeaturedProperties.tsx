'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import PropertyCard from './PropertyCard';
import { type Property, getFeaturedProperties } from '@/lib/api';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function FeaturedProperties() {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadProperties() {
            try {
                const data = await getFeaturedProperties();
                setProperties(data.properties || []);
            } catch (err) {
                console.error('Failed to load featured properties', err);
            } finally {
                setLoading(false);
            }
        }
        loadProperties();
    }, []);

    return (
        <section className="py-20 bg-white dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="flex items-end justify-between mb-12"
                >
                    <div>
                        <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-2">Featured</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">Handpicked Properties</h2>
                    </div>
                    <Link href="/properties" className="hidden md:flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors font-medium">
                        View All <ArrowRight className="w-4 h-4" />
                    </Link>
                </motion.div>

                {loading ? (
                    <div className="text-center py-12 text-slate-500">Loading properties...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {properties.slice(0, 6).map((p, i) => (
                            <PropertyCard key={p.id} property={p} index={i} />
                        ))}
                        {properties.length === 0 && (
                            <div className="col-span-full text-center py-12 text-slate-500 bg-slate-50 rounded-xl">
                                No featured properties found at the moment.
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-8 text-center md:hidden">
                    <Link href="/properties" className="text-blue-600 font-medium">
                        View All Properties &rarr;
                    </Link>
                </div>
            </div>
        </section>
    );
}
