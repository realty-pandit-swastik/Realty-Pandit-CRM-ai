'use client';

import { motion } from 'framer-motion';
import { Building2, Calculator, Ruler, BarChart3, MessageCircle, Scale } from 'lucide-react';
import Link from 'next/link';
import { COMPANY_WHATSAPP_URL } from '@/lib/constants';

const services = [
    {
        icon: Building2,
        title: 'Post Property Free',
        desc: 'List your property for free, reach genuine buyers',
        badge: 'Free',
        badgeColor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        link: '/post-property',
        color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
        icon: Calculator,
        title: 'EMI Calculator',
        desc: 'Calculate your home loan EMI instantly',
        badge: 'Popular',
        badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        link: '/tools/emi-calculator',
        color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    },
    {
        icon: Ruler,
        title: 'Area Converter',
        desc: 'Convert between sq ft, sq m, acres and more',
        badge: 'Free',
        badgeColor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        link: '/tools/area-converter',
        color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
    },
    {
        icon: BarChart3,
        title: 'Compare Properties',
        desc: 'Compare up to 4 properties side by side',
        badge: 'New',
        badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        link: '/compare',
        color: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    },
    {
        icon: MessageCircle,
        title: 'Talk to Panditji',
        desc: 'AI-powered property search assistant on WhatsApp',
        badge: 'Popular',
        badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        link: COMPANY_WHATSAPP_URL,
        color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        external: true,
    },
    {
        icon: Scale,
        title: 'Legal Assistance',
        desc: 'Get help with property documentation and RERA',
        badge: null,
        badgeColor: '',
        link: '/services',
        color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    },
];

export default function ServiceTiles() {
    return (
        <section className="py-20 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-14"
                >
                    <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-2">
                        Tools & Services
                    </p>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                        Tools & Services
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                        Everything you need for your property journey
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map((service, i) => (
                        <motion.div
                            key={service.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            viewport={{ once: true }}
                        >
                            <Link
                                href={service.link}
                                target={service.external ? '_blank' : undefined}
                                rel={service.external ? 'noopener noreferrer' : undefined}
                                className="block bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300 group relative"
                            >
                                {service.badge && (
                                    <span className={`absolute top-4 right-4 text-xs font-semibold px-2.5 py-1 rounded-full ${service.badgeColor}`}>
                                        {service.badge}
                                    </span>
                                )}
                                <div className={`w-14 h-14 ${service.color} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                                    <service.icon className="w-7 h-7" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                                    {service.title}
                                </h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                    {service.desc}
                                </p>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
