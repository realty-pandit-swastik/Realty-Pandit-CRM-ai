'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
    Building2, Users, Award, TrendingUp, CheckCircle,
    Target, Heart, Shield, Zap, MapPin, Calendar,
    Sparkles, Trophy, Star, MessageCircle, Phone, Bot
} from 'lucide-react';
import Link from 'next/link';
import { COMPANY_WHATSAPP_URL, COMPANY_PHONE_TEL } from '@/lib/constants';

const stats = [
    { label: 'Years of Experience', value: '15+', icon: Calendar },
    { label: 'Clients Served', value: '1M+', icon: Users },
    { label: 'In-House Experts', value: '50+', icon: Award },
    { label: 'Properties Sold', value: '10K+', icon: Building2 },
];

const timeline = [
    {
        year: '2008',
        title: 'The Beginning',
        description: 'Realty Pandit was founded with a vision to bring transparency and professional consultation into the Delhi NCR real estate market.',
        icon: Sparkles,
        color: 'from-blue-500 to-cyan-500'
    },
    {
        year: '2012',
        title: 'Expanding Network',
        description: 'Established strong partnerships with leading developers and builders across Ghaziabad and Noida.',
        icon: TrendingUp,
        color: 'from-purple-500 to-pink-500'
    },
    {
        year: '2015',
        title: 'Team Growth',
        description: 'Expanded in-house team and began handling large-scale residential and commercial projects.',
        icon: Users,
        color: 'from-green-500 to-emerald-500'
    },
    {
        year: '2018',
        title: 'Builder Direct Access',
        description: 'Secured direct channel partnerships with top developers, providing clients early access to pre-launch and upcoming projects.',
        icon: Building2,
        color: 'from-orange-500 to-red-500'
    },
    {
        year: '2020',
        title: 'Digital Transformation',
        description: 'Adopted digital systems, CRM integration, and structured client management to improve transparency and efficiency.',
        icon: Zap,
        color: 'from-yellow-500 to-orange-500'
    },
    {
        year: '2022',
        title: '1 Million+ Client Milestone',
        description: 'Crossed the milestone of serving over 1 million clients across Delhi NCR.',
        icon: Trophy,
        color: 'from-pink-500 to-rose-500'
    },
    {
        year: '2026',
        title: 'AI-Powered Platform',
        description: 'Launched advanced AI-driven automation system for smart property matching, WhatsApp consultation, call intelligence, and faster appointment booking.',
        icon: Bot,
        color: 'from-indigo-500 to-purple-500'
    },
];

const expertise = [
    {
        category: 'Residential Properties',
        icon: Building2,
        items: ['1/2/3 BHK Flats', 'Builder Floors', 'Villas', 'Luxury Apartments', 'Ready-to-move & Under-construction']
    },
    {
        category: 'Commercial Properties',
        icon: Building2,
        items: ['Office Spaces', 'Retail Shops', 'Commercial Complexes', 'Pre-leased Investments']
    },
    {
        category: 'New Launch & Pre-Launch',
        icon: Sparkles,
        items: ['Early bird pricing', 'Exclusive inventory', 'Special payment plans', 'Builder-direct transparency']
    },
];

const whyChooseUs = [
    { text: '15+ Years of Experience', icon: Calendar },
    { text: '1 Million+ Clients Served', icon: Users },
    { text: '50+ In-House Professionals', icon: Award },
    { text: 'Direct Builder Partnerships', icon: Building2 },
    { text: 'Award-Winning Consultants', icon: Trophy },
    { text: 'Transparent Advisory Model', icon: Shield },
    { text: 'Strong Network Across Delhi NCR', icon: MapPin },
    { text: 'AI-Powered Technology', icon: Bot },
];

function AnimatedStat({ stat, index }: { stat: typeof stats[0]; index: number }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });
    const Icon = stat.icon;

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/5 dark:to-purple-500/5 rounded-2xl p-8 border border-blue-500/20 dark:border-blue-500/10 text-center"
        >
            <Icon className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <motion.div
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
                className="text-4xl font-bold text-gray-900 dark:text-white mb-2"
            >
                {stat.value}
            </motion.div>
            <div className="text-gray-600 dark:text-gray-400 font-medium">{stat.label}</div>
        </motion.div>
    );
}

function TimelineItem({ item, index }: { item: typeof timeline[0]; index: number }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });
    const Icon = item.icon;
    const isEven = index % 2 === 0;

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, x: isEven ? -50 : 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={`flex items-center gap-8 mb-16 ${isEven ? 'flex-row' : 'flex-row-reverse'}`}
        >
            {/* Content */}
            <div className={`flex-1 ${isEven ? 'text-right' : 'text-left'}`}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className={`inline-block bg-gradient-to-r ${item.color} text-white px-4 py-1 rounded-full text-sm font-bold mb-3`}
                >
                    {item.year}
                </motion.div>
                <motion.h3
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                >
                    {item.title}
                </motion.h3>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="text-gray-600 dark:text-gray-400 leading-relaxed"
                >
                    {item.description}
                </motion.p>
            </div>

            {/* Icon Circle */}
            <motion.div
                initial={{ scale: 0 }}
                animate={isInView ? { scale: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
                className={`relative w-16 h-16 bg-gradient-to-r ${item.color} rounded-full flex items-center justify-center shadow-lg z-10`}
            >
                <Icon className="w-8 h-8 text-white" />
            </motion.div>

            {/* Spacer */}
            <div className="flex-1" />
        </motion.div>
    );
}

export default function AboutPage() {
    const heroRef = useRef(null);
    const isHeroInView = useInView(heroRef, { once: true });

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Hero Section */}
            <section className="relative pt-32 pb-20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-pink-600/10 dark:from-blue-600/5 dark:via-purple-600/5 dark:to-pink-600/5" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                    <motion.div
                        ref={heroRef}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.8 }}
                        className="text-center max-w-4xl mx-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={isHeroInView ? { opacity: 1, scale: 1 } : {}}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full text-sm font-semibold mb-6"
                        >
                            <Award className="w-4 h-4" />
                            Award-Winning Real Estate Consultants
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6"
                        >
                            About{' '}
                            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                Realty Pandit
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={isHeroInView ? { opacity: 1 } : {}}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 leading-relaxed mb-8"
                        >
                            Trusted Real Estate Consultants in Delhi NCR Since 2008
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={isHeroInView ? { opacity: 1 } : {}}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400"
                        >
                            <MapPin className="w-5 h-5 text-blue-500" />
                            <span className="font-medium">Headquartered in Vaishali, Ghaziabad</span>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-20 bg-white dark:bg-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {stats.map((stat, index) => (
                            <AnimatedStat key={stat.label} stat={stat} index={index} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Who We Are */}
            <section className="py-20">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">Who We Are</h2>
                        <div className="space-y-4 text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
                            <p>
                                Founded in <span className="font-bold text-blue-600 dark:text-blue-400">2008</span>, Realty Pandit is one of the most trusted and award-winning real estate consulting firms in Delhi NCR, headquartered in <span className="font-semibold">Vaishali, Ghaziabad</span>.
                            </p>
                            <p>
                                For over <span className="font-bold text-blue-600 dark:text-blue-400">15 years</span>, we have been delivering transparent, professional, and result-driven real estate services to buyers, sellers, investors, and developers across Delhi NCR.
                            </p>
                            <p>
                                With an in-house team of <span className="font-bold text-blue-600 dark:text-blue-400">50+ dedicated professionals</span>, Realty Pandit has proudly served more than <span className="font-bold text-blue-600 dark:text-blue-400">1 million clients</span>, making us a recognized name in residential, commercial, resale, and new launch properties.
                            </p>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-8 border border-blue-200 dark:border-blue-800"
                    >
                        <div className="flex items-start gap-4">
                            <MapPin className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Our Location & Market Presence</h3>
                                <p className="text-gray-700 dark:text-gray-300 mb-2">
                                    <span className="font-semibold">Head Office:</span> Vaishali, Ghaziabad, Uttar Pradesh, India 201010
                                </p>
                                <p className="text-gray-700 dark:text-gray-300 mb-4">
                                    <span className="font-semibold">Operating Across:</span> Delhi NCR (Noida, Greater Noida, Indirapuram, Ghaziabad, Vaishali, Vasundhara, Noida Extension, Gurugram & surrounding areas)
                                </p>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    Our deep understanding of the Delhi NCR property market trends, price movement, builder reputation, and locality growth gives our clients a competitive advantage.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Timeline Section */}
            <section className="py-20 bg-white dark:bg-gray-800">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-20"
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                            Our Journey
                        </h2>
                        <p className="text-xl text-gray-600 dark:text-gray-400">
                            From 2008 to Today — Building Trust, One Property at a Time
                        </p>
                    </motion.div>

                    {/* Timeline Line */}
                    <div className="relative">
                        {/* Vertical Line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 transform -translate-x-1/2 hidden lg:block" />

                        {/* Timeline Items */}
                        <div className="relative hidden lg:block">
                            {timeline.map((item, index) => (
                                <TimelineItem key={item.year} item={item} index={index} />
                            ))}
                        </div>

                        {/* Mobile Timeline */}
                        <div className="lg:hidden space-y-8">
                            {timeline.map((item, index) => {
                                const Icon = item.icon;
                                return (
                                    <motion.div
                                        key={item.year}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.5 }}
                                        className="relative pl-16"
                                    >
                                        <div className={`absolute left-0 top-0 w-12 h-12 bg-gradient-to-r ${item.color} rounded-full flex items-center justify-center`}>
                                            <Icon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className={`inline-block bg-gradient-to-r ${item.color} text-white px-3 py-1 rounded-full text-sm font-bold mb-2`}>
                                            {item.year}
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                                        <p className="text-gray-600 dark:text-gray-400">{item.description}</p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Expertise */}
            <section className="py-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Our Expertise</h2>
                        <p className="text-xl text-gray-600 dark:text-gray-400">
                            Comprehensive Real Estate Solutions Across All Segments
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {expertise.map((item, index) => {
                            const Icon = item.icon;
                            return (
                                <motion.div
                                    key={item.category}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-xl"
                                >
                                    <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-6">
                                        <Icon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{item.category}</h3>
                                    <ul className="space-y-3">
                                        {item.items.map((subItem) => (
                                            <li key={subItem} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                                                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                <span>{subItem}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Why Choose Us */}
            <section className="py-20 bg-white dark:bg-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Why Choose Realty Pandit?</h2>
                        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                            We are not just brokers — We are trusted advisors and strategic property consultants
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {whyChooseUs.map((item, index) => {
                            const Icon = item.icon;
                            return (
                                <motion.div
                                    key={item.text}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                    className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-xl p-6 border border-blue-200 dark:border-blue-800 hover:shadow-lg transition-shadow"
                                >
                                    <Icon className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-3" />
                                    <p className="text-gray-900 dark:text-white font-semibold">{item.text}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Awards Section */}
            <section className="py-20">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full mb-6">
                            <Trophy className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">Awards & Recognition</h2>
                        <div className="space-y-3 text-lg">
                            <div className="flex items-center justify-center gap-3 text-gray-700 dark:text-gray-300">
                                <Star className="w-6 h-6 text-yellow-500" />
                                <span className="font-semibold">Award-Winning Real Estate Agent in Delhi NCR</span>
                            </div>
                            <div className="flex items-center justify-center gap-3 text-gray-700 dark:text-gray-300">
                                <Star className="w-6 h-6 text-yellow-500" />
                                <span className="font-semibold">Trusted Channel Partner for Multiple Builders</span>
                            </div>
                            <div className="flex items-center justify-center gap-3 text-gray-700 dark:text-gray-300">
                                <Star className="w-6 h-6 text-yellow-500" />
                                <span className="font-semibold">Top Performing Sales Consultant</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Mission Section */}
            <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Target className="w-16 h-16 mx-auto mb-6" />
                        <h2 className="text-4xl font-bold mb-6">Our Mission</h2>
                        <p className="text-xl leading-relaxed opacity-90">
                            To provide honest, transparent, and technology-driven real estate consultation that empowers buyers and sellers to make confident property decisions.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-gray-50 dark:bg-gray-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                            Ready to Find Your Dream Property?
                        </h2>
                        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                            Talk to our AI assistant Panditji or connect with our expert team today!
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <a
                                href={COMPANY_WHATSAPP_URL}
                                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-semibold transition-colors"
                            >
                                <MessageCircle className="w-5 h-5" />
                                Chat with Panditji
                            </a>
                            <a
                                href={`tel:${COMPANY_PHONE_TEL}`}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold transition-colors"
                            >
                                <Phone className="w-5 h-5" />
                                Call Us Now
                            </a>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
