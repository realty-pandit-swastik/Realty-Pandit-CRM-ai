'use client';

import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

const badges = [
    { name: '99acres', text: '99acres' },
    { name: 'MagicBricks', text: 'MagicBricks' },
    { name: 'Housing.com', text: 'Housing.com' },
    { name: 'RERA Certified', text: 'RERA' },
    { name: 'Google Partner', text: 'Google' },
    { name: '99acres', text: '99acres' },
    { name: 'MagicBricks', text: 'MagicBricks' },
    { name: 'Housing.com', text: 'Housing.com' },
    { name: 'RERA Certified', text: 'RERA' },
    { name: 'Google Partner', text: 'Google' },
];

export default function TrustBadges() {
    return (
        <section className="py-14 bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-8">
                    <p className="text-slate-400 dark:text-slate-500 text-sm font-medium uppercase tracking-widest flex items-center justify-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> Integrated With & Trusted By
                    </p>
                </motion.div>
                <div className="overflow-hidden max-w-full">
                    <div className="flex animate-scroll-x gap-6 md:gap-12">
                        {badges.map((badge, i) => (
                            <div key={i} className="shrink-0 flex items-center justify-center h-12 px-6 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-bold text-sm hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 transition-colors cursor-default whitespace-nowrap">
                                {badge.text}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
