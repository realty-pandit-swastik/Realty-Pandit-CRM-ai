'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Building2, Home, Landmark, Trees, Send, Sparkles, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const quickFilters = [
    { id: 'buy', label: 'Buy', icon: Home },
    { id: 'rent', label: 'Rent', icon: Building2 },
    { id: 'commercial', label: 'Commercial', icon: Landmark },
    { id: 'plot', label: 'Plots & Land', icon: Trees },
];

const budgetOptions = [
    { label: 'Under 50L', min: 0, max: 5000000 },
    { label: '50L - 1Cr', min: 5000000, max: 10000000 },
    { label: '1Cr - 2Cr', min: 10000000, max: 20000000 },
    { label: '2Cr - 5Cr', min: 20000000, max: 50000000 },
    { label: '5Cr+', min: 50000000, max: 0 },
];

const bhkOptions = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK'];

const suggestions = [
    'I want to buy a 3 BHK flat in Noida',
    'Looking for office space in Gurgaon',
    'Rental apartment near metro station',
    'Plot for sale under 1 crore',
    'Luxury villa in Delhi NCR',
];

export default function Hero() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [typingText, setTypingText] = useState('');
    const [lastSearch, setLastSearch] = useState<{ query: string; filter: string; budget: string; bhk: string; url: string; timestamp: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load last search from localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const saved = localStorage.getItem('rp-last-search');
            if (saved) {
                const data = JSON.parse(saved);
                const sevenDays = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - data.timestamp < sevenDays) {
                    setLastSearch(data);
                }
            }
        } catch { /* ignore corrupted localStorage */ }
    }, []);

    // Typing animation for placeholder
    useEffect(() => {
        const texts = [
            'I want to buy a 3BHK in Noida...',
            'Looking for office space in Gurgaon...',
            'Find me a rental apartment...',
            'Plot for sale under 1 crore...',
        ];
        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;

        const typeInterval = setInterval(() => {
            if (!isDeleting) {
                setTypingText(texts[textIndex].slice(0, charIndex + 1));
                charIndex++;
                if (charIndex === texts[textIndex].length) {
                    isDeleting = true;
                }
            } else {
                setTypingText(texts[textIndex].slice(0, charIndex - 1));
                charIndex--;
                if (charIndex === 0) {
                    isDeleting = false;
                    textIndex = (textIndex + 1) % texts.length;
                }
            }
        }, isDeleting ? 30 : 80);

        return () => clearInterval(typeInterval);
    }, []);

    const handleSearch = (searchQuery?: string) => {
        const q = (searchQuery ?? query).trim();
        const url = q ? `/properties?q=${encodeURIComponent(q)}` : '/properties';
        if (q) {
            try {
                localStorage.setItem('rp-last-search', JSON.stringify({ query: q, filter: '', budget: '', bhk: '', url, timestamp: Date.now() }));
            } catch { /* ignore */ }
        }
        router.push(url);
    };

    return (
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            {/* Animated Background */}
            <div className="absolute inset-0">
                <div className="absolute top-20 left-[10%] w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] animate-pulse" />
                <div className="absolute bottom-20 right-[10%] w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,90vw)] h-[min(600px,90vw)] bg-blue-600/5 rounded-full blur-[200px]" />
            </div>

            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

            <div className="relative z-10 w-full max-w-4xl mx-auto px-4 pt-20">
                {/* Headline */}
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center mb-10">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
                        <Sparkles className="w-4 h-4" />
                        Powered by Panditji AI
                    </motion.div>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight">
                        Find Your{' '}
                        <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">Dream Property</span>
                    </h1>
                    <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
                        Tell Panditji what you&apos;re looking for. Buy, sell, or rent — AI-powered search that understands you.
                    </p>
                </motion.div>

                {/* Search Box */}
                <motion.div
                    ref={containerRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="relative"
                >
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl shadow-blue-500/10 dark:shadow-slate-900/50 overflow-hidden transition-shadow hover:shadow-blue-500/20"
                    >
                        <div className="flex items-center gap-3 p-4">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                                <Search className="w-5 h-5 text-blue-600" />
                            </div>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={typingText || 'Search properties…'}
                                className="flex-1 bg-transparent outline-none text-slate-800 dark:text-white placeholder-slate-400 text-sm"
                                autoComplete="off"
                            />
                            <button
                                type="submit"
                                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                                aria-label="Search"
                            >
                                <Send className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    </form>

                    {/* Quick Suggestion Pills */}
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {suggestions.slice(0, 3).map((suggestion, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleSearch(suggestion)}
                                className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs hover:bg-white/20 hover:text-white transition-all"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Quick Stats */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex justify-center gap-8 mt-10 text-sm text-slate-400 pb-10">
                    <span>500+ Properties</span>
                    <span className="text-slate-600">|</span>
                    <span>50+ Locations</span>
                    <span className="text-slate-600">|</span>
                    <span>1000+ Happy Clients</span>
                </motion.div>

                {lastSearch && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center gap-3 pb-8"
                    >
                        <Link
                            href={lastSearch.url}
                            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 px-5 py-2.5 rounded-full text-sm hover:bg-white/20 transition-colors"
                        >
                            <Search className="w-4 h-4" />
                            Continue: {lastSearch.query || lastSearch.filter || 'Your last search'}
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </motion.div>
                )}
            </div>
        </section>
    );
}
