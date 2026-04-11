'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Calculator, ArrowLeftRight, TrendingUp, Ruler } from 'lucide-react';

const tools = [
    {
        title: 'EMI Calculator',
        description: 'Calculate your monthly EMI for home loans. Adjust loan amount, interest rate, and tenure to plan your finances.',
        href: '/tools/emi-calculator',
        icon: Calculator,
        color: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        gradient: 'from-blue-600 to-indigo-600',
    },
    {
        title: 'Area Converter',
        description: 'Convert between sq ft, sq m, sq yards, acres, hectares, gaj, bigha, biswa, marla, and kanal instantly.',
        href: '/tools/area-converter',
        icon: ArrowLeftRight,
        color: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        gradient: 'from-emerald-600 to-teal-600',
    },
];

export default function ToolsPage() {
    return (
        <div className="min-h-screen">
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-32 pb-20">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white">Tools</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                            Real Estate<br />
                            <span className="text-blue-400">Tools</span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Free calculators and converters to help you make informed property decisions.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Tools Grid */}
            <section className="py-20 bg-white dark:bg-slate-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {tools.map((tool, i) => {
                            const Icon = tool.icon;
                            return (
                                <motion.div
                                    key={tool.href}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <Link
                                        href={tool.href}
                                        className="block bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:shadow-xl dark:hover:shadow-slate-900/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all group"
                                    >
                                        <div className={`inline-flex p-4 rounded-xl border ${tool.color} mb-5 group-hover:scale-110 transition-transform`}>
                                            <Icon className="w-8 h-8" />
                                        </div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {tool.title}
                                        </h2>
                                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                                            {tool.description}
                                        </p>
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
                                            Use Tool <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
}
