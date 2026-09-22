'use client';

import { motion } from 'framer-motion';
import { Home, DollarSign, Key, Settings, Scale, Landmark, Search, ListChecks, MapPin, CheckCircle2, ChevronRight, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { COMPANY_WHATSAPP_URL } from '@/lib/constants';

const services = [
    {
        icon: Home,
        title: 'Buy Property',
        description: 'Find your dream home from our verified listings. Whether it\'s a flat, villa, plot, or commercial space, Panditji helps you discover the perfect match based on your budget, location, and preferences.',
        color: 'blue',
    },
    {
        icon: DollarSign,
        title: 'Sell Property',
        description: 'List your property with us and reach thousands of verified buyers. We provide professional photography guidance, competitive pricing analysis, and end-to-end selling assistance.',
        color: 'emerald',
    },
    {
        icon: Key,
        title: 'Rent Property',
        description: 'Looking for a rental home or want to list yours? We handle tenant verification, rental agreements, and everything in between for a hassle-free renting experience.',
        color: 'purple',
    },
    {
        icon: Settings,
        title: 'Property Management',
        description: 'Hands-off property management for owners. We take care of tenant screening, rent collection, maintenance coordination, and regular property inspections.',
        color: 'orange',
    },
    {
        icon: Scale,
        title: 'Legal Assistance',
        description: 'Navigate property laws with confidence. Our legal partners help with title verification, RERA compliance, sale deed preparation, and registration processes.',
        color: 'red',
    },
    {
        icon: Landmark,
        title: 'Home Loans',
        description: 'Get the best home loan rates from leading banks. We help you compare offers, prepare documentation, and guide you through the entire loan approval process.',
        color: 'cyan',
    },
];

const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', icon: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
    red: { bg: 'bg-red-100 dark:bg-red-900/30', icon: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
    cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', icon: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800' },
};

const steps = [
    { icon: Search, title: 'Search', description: 'Tell Panditji what you need or browse our listings' },
    { icon: ListChecks, title: 'Shortlist', description: 'Get AI-curated matches based on your preferences' },
    { icon: MapPin, title: 'Visit', description: 'Schedule site visits for your shortlisted properties' },
    { icon: CheckCircle2, title: 'Close Deal', description: 'Complete the transaction with our end-to-end support' },
];

export default function ServicesPage() {
    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-32 pb-20">
                <div className="absolute inset-0 bg-[url(/grid.svg)] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white">Services</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                            Complete Real Estate<br />
                            <span className="text-blue-400">Solutions</span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            From finding the perfect property to closing the deal, Realty Pandit offers comprehensive services to make your real estate journey smooth and stress-free.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Services Grid */}
            <section className="py-20 bg-white dark:bg-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <p className="text-blue-600 dark:text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">What We Offer</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">Our Services</h2>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {services.map((service, index) => {
                            const colors = colorMap[service.color];
                            return (
                                <motion.div
                                    key={service.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                    className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className={`w-14 h-14 ${colors.bg} rounded-xl flex items-center justify-center mb-6`}>
                                        <service.icon className={`w-7 h-7 ${colors.icon}`} />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{service.title}</h3>
                                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{service.description}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-20 bg-slate-50 dark:bg-slate-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <p className="text-blue-600 dark:text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Simple Process</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">How It Works</h2>
                    </motion.div>

                    <div className="relative">
                        {/* Connecting line */}
                        <div className="hidden md:block absolute top-16 left-[12.5%] right-[12.5%] h-0.5 bg-blue-200 dark:bg-blue-800" />

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            {steps.map((step, index) => (
                                <motion.div
                                    key={step.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.15 }}
                                    className="text-center relative"
                                >
                                    <div className="w-32 h-32 bg-white dark:bg-slate-900 border-2 border-blue-200 dark:border-blue-800 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
                                        <div>
                                            <step.icon className="w-10 h-10 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Step {index + 1}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{step.title}</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">{step.description}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-white dark:bg-slate-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                            Ready to Get Started?
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
                            Talk to Panditji on WhatsApp and tell us what you&apos;re looking for. Our AI assistant is available 24/7 to help you with any property requirement.
                        </p>
                        <a
                            href={`${COMPANY_WHATSAPP_URL}?text=Hi%20Panditji`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-green-600/20"
                        >
                            <MessageCircle className="w-5 h-5" />
                            Talk to Panditji
                        </a>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
