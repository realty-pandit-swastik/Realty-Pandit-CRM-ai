'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { User, Handshake, Building2, Shield, ArrowRight } from 'lucide-react';
import UserLoginModal from '@/components/login/UserLoginModal';

interface LoginCard {
    icon: any;
    title: string;
    description: string;
    action: string;
    gradientFrom: string;
    gradientTo: string;
    onClick?: () => void;
    href?: string;
    external?: boolean;
}

export default function LoginPage() {
    const [showUserModal, setShowUserModal] = useState(false);

    const loginCards: LoginCard[] = [
        {
            icon: User,
            title: 'Customer / User Login',
            description: 'Access saved searches, favorites, and scheduled visits',
            action: 'Sign In as User',
            gradientFrom: 'from-blue-500',
            gradientTo: 'to-cyan-500',
            onClick: () => setShowUserModal(true),
        },
        {
            icon: Handshake,
            title: 'Partner Agent Dashboard',
            description: 'Manage your property listings and leads',
            action: 'Access Agent Portal',
            gradientFrom: 'from-green-500',
            gradientTo: 'to-emerald-500',
            href: '/agent/login',
        },
        {
            icon: Building2,
            title: 'Builder Dashboard',
            description: 'Upload projects, manage units, view leads',
            action: 'Access Builder Portal',
            gradientFrom: 'from-orange-500',
            gradientTo: 'to-red-500',
            href: '/join/builder',
        },
        {
            icon: Shield,
            title: 'Internal Admin',
            description: 'Team management and CRM access',
            action: 'Admin Dashboard',
            gradientFrom: 'from-red-500',
            gradientTo: 'to-pink-500',
            href: 'http://localhost:5173',
            external: true,
        },
    ];

    return (
        <div className="min-h-screen pt-20 relative overflow-hidden">
            {/* Animated gradient background */}
            <div className="absolute inset-0 -z-10 pointer-events-none [overflow:clip] [clip-path:inset(0)]">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />

                {/* Animated gradient blobs — inset by blur radius to prevent viewport overflow */}
                <motion.div
                    animate={{
                        rotate: [0, 360],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                    className="absolute top-20 left-20 w-48 h-48 md:w-80 md:h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"
                />
                <motion.div
                    animate={{
                        rotate: [360, 0],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                    className="absolute bottom-20 right-20 w-48 h-48 md:w-80 md:h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"
                />
            </div>

            {/* Grid pattern overlay */}
            <div className="absolute inset-0 -z-10 opacity-10 dark:opacity-5 pointer-events-none overflow-hidden">
                <div className="absolute inset-0" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }} />
            </div>

            <div className="max-w-6xl mx-auto px-4 py-16">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                        Realty Pandit Login Portal
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
                        Choose your account type to continue
                    </p>
                </motion.div>

                {/* Login Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-5xl mx-auto">
                    {loginCards.map((card, index) => {
                        const Icon = card.icon;
                        const content = (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                whileHover={{ scale: 1.02, y: -4 }}
                                whileTap={{ scale: 0.98 }}
                                className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-3xl p-8 cursor-pointer transition-all hover:shadow-2xl dark:hover:shadow-slate-900/50 h-full flex flex-col"
                            >
                                {/* Icon */}
                                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${card.gradientFrom} ${card.gradientTo} flex items-center justify-center mb-6 shadow-lg`}>
                                    <Icon className="w-10 h-10 text-white" />
                                </div>

                                {/* Content */}
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                                    {card.title}
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 mb-6 flex-grow">
                                    {card.description}
                                </p>

                                {/* Action Button */}
                                <div className={`flex items-center font-semibold text-transparent bg-gradient-to-r ${card.gradientFrom} ${card.gradientTo} bg-clip-text`}>
                                    {card.action} <ArrowRight className="w-5 h-5 ml-2 text-blue-600 dark:text-blue-400" />
                                </div>
                            </motion.div>
                        );

                        if (card.href) {
                            if (card.external) {
                                return (
                                    <a
                                        key={card.title}
                                        href={card.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                    >
                                        {content}
                                    </a>
                                );
                            }
                            return (
                                <Link key={card.title} href={card.href} className="block">
                                    {content}
                                </Link>
                            );
                        }

                        return (
                            <div key={card.title} onClick={card.onClick}>
                                {content}
                            </div>
                        );
                    })}
                </div>

                {/* Help Text */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-12"
                >
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                        Don&apos;t have an account?{' '}
                        <Link href="/join" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                            Register here
                        </Link>
                    </p>
                </motion.div>
            </div>

            {/* User Login Modal */}
            <UserLoginModal isOpen={showUserModal} onClose={() => setShowUserModal(false)} />
        </div>
    );
}
