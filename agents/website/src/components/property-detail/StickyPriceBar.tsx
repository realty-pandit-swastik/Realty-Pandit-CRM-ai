'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone } from 'lucide-react';

interface StickyPriceBarProps {
    price: string;
    onContact: () => void;
    priceElementId?: string;
}

export default function StickyPriceBar({ price, onContact, priceElementId = 'property-price' }: StickyPriceBarProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const target = document.getElementById(priceElementId);
        if (!target) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setVisible(!entry.isIntersecting);
            },
            { threshold: 0 }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [priceElementId]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    exit={{ y: 100 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
                >
                    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{price}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">Asking Price</div>
                        </div>
                        <button
                            onClick={onContact}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl font-medium text-sm transition-colors"
                        >
                            <Phone className="w-4 h-4" />
                            Contact
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
