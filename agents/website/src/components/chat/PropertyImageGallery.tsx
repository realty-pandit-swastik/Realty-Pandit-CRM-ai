'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Building2 } from 'lucide-react';

interface PropertyImageGalleryProps {
    images: string[];
    title: string;
}

export default function PropertyImageGallery({ images, title }: PropertyImageGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset index when images change
    useEffect(() => {
        setCurrentIndex(0);
    }, [images]);

    const goNext = useCallback((e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (images.length <= 1) return;
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const goPrevious = useCallback((e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (images.length <= 1) return;
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goPrevious();
            if (e.key === 'ArrowRight') goNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goNext, goPrevious]);

    if (images.length === 0) {
        return (
            <div className="relative w-full h-[40vh] md:h-[50vh] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex flex-col items-center justify-center">
                <Building2 className="w-20 h-20 text-slate-300 dark:text-slate-600 mb-3" />
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500">No photos available</span>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[40vh] md:h-[50vh] bg-slate-100 dark:bg-slate-800 group overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative w-full h-full"
                >
                    <Image
                        src={images[currentIndex]}
                        alt={`${title} - Image ${currentIndex + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 60vw"
                        priority={currentIndex === 0}
                    />
                </motion.div>
            </AnimatePresence>

            {/* Image counter */}
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-sm font-medium">
                {currentIndex + 1} / {images.length}
            </div>

            {/* Navigation arrows */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={goPrevious}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="w-6 h-6 text-slate-900 dark:text-white" />
                    </button>
                    <button
                        onClick={goNext}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                        aria-label="Next image"
                    >
                        <ChevronRight className="w-6 h-6 text-slate-900 dark:text-white" />
                    </button>
                </>
            )}

            {/* Dot indicators */}
            {images.length > 1 && images.length <= 10 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCurrentIndex(i);
                            }}
                            className="min-w-[28px] min-h-[44px] flex items-center justify-center"
                            aria-label={`Go to image ${i + 1}`}
                        >
                            <span className={`block rounded-full transition-all ${
                                i === currentIndex
                                    ? 'bg-white w-5 h-2'
                                    : 'bg-white/50 hover:bg-white/80 w-2 h-2'
                            }`} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
