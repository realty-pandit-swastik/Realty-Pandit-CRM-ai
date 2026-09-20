'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Heart, Trash2, Search } from 'lucide-react';
import PropertyCard from '@/components/PropertyCard';
import { type Property } from '@/lib/api';

export default function WishlistPage() {
    const [wishlist, setWishlist] = useState<Property[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('wishlist');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    queueMicrotask(() => setWishlist(parsed));
                }
            }
        } catch { /* ignore */ }
        queueMicrotask(() => setLoaded(true));
    }, []);

    const handleClearAll = () => {
        setWishlist([]);
        localStorage.removeItem('wishlist');
        setShowClearConfirm(false);
    };

    if (!loaded) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-800 text-white">
                <div className="max-w-7xl mx-auto px-4 py-10">
                    <nav className="flex items-center gap-2 text-sm text-rose-100 mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white font-medium">My Wishlist</span>
                    </nav>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <Heart className="w-8 h-8" />
                            <h1 className="text-3xl md:text-4xl font-bold">My Wishlist</h1>
                        </div>
                        <p className="text-rose-100 text-lg">
                            Properties you have saved for later
                        </p>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-10">
                {wishlist.length > 0 ? (
                    <>
                        {/* Header with count and clear */}
                        <div className="flex items-center justify-between mb-6">
                            <p className="text-slate-600 dark:text-slate-300 font-medium">
                                {wishlist.length} {wishlist.length === 1 ? 'property' : 'properties'} saved
                            </p>
                            <div className="relative">
                                {!showClearConfirm ? (
                                    <button
                                        onClick={() => setShowClearConfirm(true)}
                                        className="flex items-center gap-2 px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" /> Clear All
                                    </button>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg"
                                    >
                                        <span className="text-sm text-slate-600 dark:text-slate-300">Clear all items?</span>
                                        <button
                                            onClick={handleClearAll}
                                            className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                                        >
                                            Yes, Clear
                                        </button>
                                        <button
                                            onClick={() => setShowClearConfirm(false)}
                                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* Property Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <AnimatePresence>
                                {wishlist.map((property, index) => (
                                    <PropertyCard key={property.id} property={property} index={index} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </>
                ) : (
                    /* Empty State */
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-center py-20"
                    >
                        <div className="mx-auto w-24 h-24 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-6">
                            <Heart className="w-12 h-12 text-rose-300 dark:text-rose-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                            Your wishlist is empty
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
                            Start browsing properties and save the ones you like. They will appear here for easy access.
                        </p>
                        <Link
                            href="/properties"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-xl font-semibold hover:bg-rose-600 transition-colors"
                        >
                            <Search className="w-5 h-5" /> Browse Properties
                        </Link>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
