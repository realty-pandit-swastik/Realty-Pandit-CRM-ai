'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Home, Building2, Trees, Crown } from 'lucide-react';

const categories = [
    {
        title: 'Residential',
        subtitle: 'Flats, Apartments, Houses',
        icon: Home,
        href: '/properties?category=residential',
        gradient: 'from-blue-500/80 to-blue-800/90',
        bg: 'bg-blue-700',
        count: '250+',
        colSpan: 'col-span-1 row-span-2',
    },
    {
        title: 'Commercial',
        subtitle: 'Offices, Shops, Warehouses',
        icon: Building2,
        href: '/properties?category=commercial',
        gradient: 'from-purple-500/80 to-purple-800/90',
        bg: 'bg-purple-700',
        count: '120+',
        colSpan: 'col-span-1 row-span-1',
    },
    {
        title: 'Plots & Land',
        subtitle: 'Residential, Agricultural',
        icon: Trees,
        href: '/properties?type=plot',
        gradient: 'from-green-500/80 to-green-800/90',
        bg: 'bg-green-700',
        count: '80+',
        colSpan: 'col-span-1 row-span-1',
    },
    {
        title: 'Luxury Collection',
        subtitle: 'Villas, Penthouses, Farmhouses — Premium living redefined',
        icon: Crown,
        href: '/properties?type=villa',
        gradient: 'from-amber-500/80 to-amber-800/90',
        bg: 'bg-amber-700',
        count: '50+',
        colSpan: 'col-span-2 row-span-1',
    },
];

export default function PropertyCategories() {
    return (
        <section className="py-20 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
                    <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-2">Explore</p>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">Browse by Category</h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Find the perfect property type for your needs.</p>
                </motion.div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 grid-rows-2 gap-4 h-auto sm:h-[420px]">
                    {categories.map((cat, i) => (
                        <motion.div
                            key={cat.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08, duration: 0.4 }}
                            viewport={{ once: true }}
                            className={`${cat.colSpan} min-h-[160px] sm:min-h-0`}
                            whileHover={{ y: -4 }}
                        >
                            <Link href={cat.href} className="group block h-full">
                                <div className={`relative h-full rounded-2xl overflow-hidden ${cat.bg} hover:shadow-xl hover:shadow-black/20 transition-shadow duration-300`}>
                                    {/* Background gradient overlay */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient}`} />

                                    {/* Large background icon */}
                                    <div className="absolute -bottom-4 -right-4 opacity-10 group-hover:opacity-15 transition-opacity duration-300">
                                        <cat.icon className="w-40 h-40" />
                                    </div>

                                    {/* Content */}
                                    <div className="relative h-full flex flex-col justify-between p-6">
                                        {/* Count badge — top left */}
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-semibold w-fit">
                                            <cat.icon className="w-3 h-3" />
                                            {cat.count} Properties
                                        </span>

                                        {/* Title + subtitle — bottom */}
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1 group-hover:translate-x-1 transition-transform duration-200">
                                                {cat.title}
                                            </h3>
                                            <p className="text-white/70 text-sm leading-snug">{cat.subtitle}</p>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
