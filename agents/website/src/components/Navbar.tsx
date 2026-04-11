'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Building2, ChevronDown, Phone, Home, Search, Briefcase, Users, BookOpen, Wrench, MessageCircle, Sun, Moon, LogIn, User as UserIcon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import AIChatModal from './chat/AIChatModal';

const propertyDropdown = [
    { label: 'Buy Property', href: '/properties?intent=buy', desc: 'Find your dream home' },
    { label: 'Rent Property', href: '/properties?intent=rent', desc: 'Verified rental listings' },
    { label: 'Commercial', href: '/properties?category=commercial', desc: 'Offices, shops & more' },
    { label: 'Plots & Land', href: '/properties?type=plot', desc: 'Residential & agricultural' },
    { label: 'All Properties', href: '/properties', desc: 'Browse everything' },
];

const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Properties', href: '/properties', hasDropdown: true },
    { label: 'Services', href: '/services' },
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
];

const mobileLinks = [
    { label: 'Home', href: '/', icon: Home },
    { label: 'Login', href: '/login', icon: LogIn },
    { label: 'Post Property', href: '/post-property', icon: Building2 },
    { label: 'Properties', href: '/properties', icon: Search },
    { label: 'Buy', href: '/properties?intent=buy', icon: Building2 },
    { label: 'Rent', href: '/properties?intent=rent', icon: Building2 },
    { label: 'Commercial', href: '/properties?category=commercial', icon: Briefcase },
    { label: 'Services', href: '/services', icon: Wrench },
    { label: 'About', href: '/about', icon: Users },
    { label: 'Blog', href: '/blog', icon: BookOpen },
    { label: 'Contact', href: '/contact', icon: Phone },
];

export default function Navbar() {
    const [open, setOpen] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showChatModal, setShowChatModal] = useState(false);
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();

    // Check authentication status on mount
    useEffect(() => {
        const token = localStorage.getItem('user_token');
        setIsAuthenticated(!!token);
    }, []);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        setOpen(false);
        setShowDropdown(false);
    }, [pathname]);

    const isHome = pathname === '/';
    const isTransparent = isHome && !scrolled;

    const navBg = isTransparent
        ? 'bg-transparent'
        : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-200/80 dark:border-slate-700/80';
    const textColor = isTransparent
        ? 'text-white'
        : 'text-slate-700 dark:text-slate-200';
    const logoColor = isTransparent
        ? 'text-white'
        : 'text-blue-600 dark:text-blue-400';

    const isAgentPortal = pathname?.startsWith('/agent');

    if (isAgentPortal) return null;

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5 }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navBg}`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 lg:h-18">
                    {/* Logo */}
                    <Link href="/" className="flex items-center">
                        <Image
                            src="/logo.png"
                            alt="Realty Pandit"
                            width={180}
                            height={60}
                            className="h-10 w-auto"
                            priority
                        />
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden lg:flex items-center gap-1">
                        {navLinks.map(link => (
                            <div
                                key={link.href}
                                className="relative"
                                onMouseEnter={() => link.hasDropdown && setShowDropdown(true)}
                                onMouseLeave={() => link.hasDropdown && setShowDropdown(false)}
                            >
                                <Link
                                    href={link.href}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${pathname === link.href
                                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                                            : `${textColor} hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20`
                                        }`}
                                >
                                    {link.label}
                                    {link.hasDropdown && <ChevronDown className="w-3.5 h-3.5" />}
                                </Link>

                                {link.hasDropdown && (
                                    <AnimatePresence>
                                        {showDropdown && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 8 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute top-full left-0 pt-2 w-64 z-50"
                                            >
                                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2">
                                                {propertyDropdown.map(item => (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                                    >
                                                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</div>
                                                    </Link>
                                                ))}
                                            </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Desktop CTA + Theme Toggle */}
                    <div className="hidden lg:flex items-center gap-3">
                        <Link
                            href="/post-property"
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${isTransparent
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                }`}
                        >
                            <Building2 className="w-4 h-4" /> Post Property Free
                        </Link>
                        {isAuthenticated ? (
                            <Link
                                href="/"
                                onClick={() => {
                                    localStorage.removeItem('user_token');
                                    setIsAuthenticated(false);
                                }}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${isTransparent
                                        ? 'text-white/80 hover:text-white hover:bg-white/10'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <UserIcon className="w-4 h-4" /> Logout
                            </Link>
                        ) : (
                            <Link
                                href="/login"
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${isTransparent
                                        ? 'text-white/80 hover:text-white hover:bg-white/10'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <LogIn className="w-4 h-4" /> Login
                            </Link>
                        )}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`p-2.5 rounded-xl transition-colors ${isTransparent
                                    ? 'text-white/80 hover:text-white hover:bg-white/10'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowChatModal(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <MessageCircle className="w-4 h-4" /> Talk to Panditji
                        </button>
                    </div>

                    {/* Mobile: Theme Toggle + Menu Toggle */}
                    <div className="lg:hidden flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`p-2 rounded-lg ${isTransparent ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title="Toggle theme"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className={`p-2 rounded-lg ${textColor}`}
                            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
                        >
                            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl shadow-lg overflow-hidden"
                        >
                            <div className="py-4 space-y-1 px-2">
                                {mobileLinks.map(link => (
                                    <Link
                                        key={link.href + link.label}
                                        href={link.href}
                                        onClick={() => setOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${pathname === link.href
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        <link.icon className="w-5 h-5" />
                                        {link.label}
                                    </Link>
                                ))}
                                <div className="pt-3 px-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOpen(false);
                                            setShowChatModal(true);
                                        }}
                                        className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-3 rounded-xl text-sm font-medium transition-colors"
                                    >
                                        Talk to Panditji
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* AI Chat Modal */}
            <AIChatModal
                isOpen={showChatModal}
                onClose={() => setShowChatModal(false)}
                initialQuery=""
            />
        </motion.nav>
    );
}
