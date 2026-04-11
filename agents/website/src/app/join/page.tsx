'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Building2, Users, UserCircle, ArrowRight, CheckCircle } from 'lucide-react';

export default function JoinPage() {
    const userTypes = [
        {
            id: 'individual-agent',
            title: 'Individual Agent',
            icon: UserCircle,
            description: 'Independent property consultant looking to grow your business',
            features: [
                'List up to 10 properties (FREE plan)',
                'Receive qualified buyer leads',
                'Commission on successful deals',
                'WhatsApp integration for easy updates'
            ],
            href: '/join/agent?type=individual',
            badge: 'FREE Plan Available',
            color: 'from-blue-500 to-cyan-500'
        },
        {
            id: 'property-agent',
            title: 'Property Agency',
            icon: Users,
            description: 'Established agency with multiple agents and properties',
            features: [
                'List up to 25+ properties',
                'Team management dashboard',
                'Full buyer contact details',
                'Advanced analytics & reports'
            ],
            href: '/join/agent?type=agency',
            badge: 'PRO Plan',
            color: 'from-purple-500 to-pink-500'
        },
        {
            id: 'builder',
            title: 'Real Estate Builder',
            icon: Building2,
            description: 'Developer with residential or commercial projects',
            features: [
                'Unlimited project listings',
                'Unit-wise inventory management',
                'Direct buyer appointments',
                'Premium placement & analytics'
            ],
            href: '/join/builder',
            badge: 'PREMIUM Plan',
            color: 'from-orange-500 to-red-500'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="max-w-7xl mx-auto text-center mb-12">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                        Join Realty Pandit Marketplace
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                        Connect with thousands of verified buyers and sellers. Grow your real estate business with AI-powered lead matching.
                    </p>
                </motion.div>
            </div>

            {/* User Type Cards */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                {userTypes.map((type, index) => {
                    const Icon = type.icon;
                    return (
                        <motion.div
                            key={type.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                            <Link href={type.href}>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden group cursor-pointer h-full">
                                    {/* Gradient Header */}
                                    <div className={`bg-gradient-to-r ${type.color} p-6 text-white relative`}>
                                        <div className="absolute top-4 right-4">
                                            <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
                                                {type.badge}
                                            </span>
                                        </div>
                                        <Icon className="w-12 h-12 mb-3" />
                                        <h2 className="text-2xl font-bold mb-2">{type.title}</h2>
                                        <p className="text-white/90 text-sm">{type.description}</p>
                                    </div>

                                    {/* Features List */}
                                    <div className="p-6">
                                        <ul className="space-y-3 mb-6">
                                            {type.features.map((feature, i) => (
                                                <li key={i} className="flex items-start">
                                                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                                                    <span className="text-gray-700 dark:text-gray-300 text-sm">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        {/* CTA Button */}
                                        <div className="flex items-center justify-between text-gray-900 dark:text-white font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            <span>Get Started</span>
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>

            {/* Benefits Section */}
            <div className="max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-12"
                >
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
                        Why Join Realty Pandit?
                    </h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        {[
                            {
                                title: 'AI-Powered Matching',
                                description: 'Our Panditji AI matches your properties with the right buyers based on their preferences and budget.'
                            },
                            {
                                title: 'WhatsApp Integration',
                                description: 'Manage your inventory, check appointments, and respond to leads directly via WhatsApp.'
                            },
                            {
                                title: 'Verified Buyers',
                                description: 'All buyer leads are pre-qualified by our AI to ensure serious intent and budget alignment.'
                            },
                            {
                                title: 'Zero Commission for PRO',
                                description: 'PRO and PREMIUM members get full buyer details without commission sharing (FREE plan: commission-based).'
                            }
                        ].map((benefit, i) => (
                            <div key={i} className="flex">
                                <div className="flex-shrink-0">
                                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                        <CheckCircle className="h-6 w-6" />
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                                        {benefit.title}
                                    </h3>
                                    <p className="text-gray-600 dark:text-gray-300 text-sm">
                                        {benefit.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Footer CTA */}
            <div className="max-w-5xl mx-auto mt-12 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                    Already a member?{' '}
                    <Link href="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                        Login to your dashboard
                    </Link>
                </p>
            </div>
        </div>
    );
}
