'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CarouselProps {
    children: ReactNode[];
    autoPlay?: boolean;
    interval?: number;
    showDots?: boolean;
    showArrows?: boolean;
    className?: string;
}

export default function Carousel({
    children,
    autoPlay = false,
    interval = 5000,
    showDots = true,
    showArrows = true,
    className,
}: CarouselProps) {
    const [current, setCurrent] = useState(0);
    const total = children.length;

    const next = useCallback(() => {
        setCurrent(c => (c + 1) % total);
    }, [total]);

    const prev = useCallback(() => {
        setCurrent(c => (c - 1 + total) % total);
    }, [total]);

    useEffect(() => {
        if (!autoPlay) return;
        const timer = setInterval(next, interval);
        return () => clearInterval(timer);
    }, [autoPlay, interval, next]);

    return (
        <div className={cn('relative', className)}>
            <div className="overflow-hidden rounded-2xl">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={current}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                    >
                        {children[current]}
                    </motion.div>
                </AnimatePresence>
            </div>

            {showArrows && total > 1 && (
                <>
                    <button
                        onClick={prev}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all z-10"
                    >
                        <ChevronLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    <button
                        onClick={next}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all z-10"
                    >
                        <ChevronRight className="w-5 h-5 text-slate-700" />
                    </button>
                </>
            )}

            {showDots && total > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    {children.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrent(i)}
                            className={cn(
                                'w-2.5 h-2.5 rounded-full transition-all',
                                i === current ? 'bg-blue-600 w-6' : 'bg-slate-300 hover:bg-slate-400'
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
