'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRightLeft } from 'lucide-react';
import { getMediaUrl, formatPrice } from '@/lib/api';
import { getCompareList, setCompareList, type CompareItem } from './CompareButton';
import CompareModal from './CompareModal';

export default function CompareBar() {
    const [items, setItems] = useState<CompareItem[]>([]);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        const update = () => setItems(getCompareList());
        update();
        window.addEventListener('compare-list-changed', update);
        window.addEventListener('storage', update);
        return () => {
            window.removeEventListener('compare-list-changed', update);
            window.removeEventListener('storage', update);
        };
    }, []);

    const removeItem = (id: string) => {
        setCompareList(items.filter(c => c.id !== id));
    };

    const clearAll = () => {
        setCompareList([]);
    };

    if (items.length === 0) return null;

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    exit={{ y: 100 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 md:bottom-4 left-0 md:left-1/2 md:-translate-x-1/2 right-0 md:right-auto md:w-auto z-30"
                >
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 md:rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)] px-4 py-3 flex items-center gap-3">
                        {/* Property thumbnails */}
                        <div className="flex items-center gap-2">
                            {items.map(item => (
                                <div key={item.id} className="relative group">
                                    <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-blue-200 dark:border-blue-800">
                                        {item.image ? (
                                            <img
                                                src={getMediaUrl(item.image)}
                                                alt={item.type}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-slate-200 dark:bg-slate-700" />
                                        )}
                                    </div>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        aria-label="Remove from compare"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}

                            {/* Empty slots */}
                            {Array.from({ length: 3 - items.length }).map((_, i) => (
                                <div
                                    key={`empty-${i}`}
                                    className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center"
                                >
                                    <span className="text-slate-300 dark:text-slate-600 text-xs">+</span>
                                </div>
                            ))}
                        </div>

                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

                        {/* Actions */}
                        <button
                            onClick={() => setShowModal(true)}
                            disabled={items.length < 2}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 text-white rounded-xl font-medium text-sm transition-colors"
                        >
                            <ArrowRightLeft className="w-4 h-4" />
                            Compare ({items.length})
                        </button>

                        <button
                            onClick={clearAll}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Compare Modal */}
            {showModal && (
                <CompareModal items={items} onClose={() => setShowModal(false)} />
            )}
        </>
    );
}
