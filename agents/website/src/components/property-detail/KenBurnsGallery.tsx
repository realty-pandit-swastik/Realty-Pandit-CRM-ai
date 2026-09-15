'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 6 Ken Burns presets — each image gets a random cinematic effect
const KEN_BURNS_PRESETS = [
    { startScale: 1, endScale: 1.15, startX: '0%', endX: '-3%', startY: '0%', endY: '0%' },   // Zoom in + pan right
    { startScale: 1.15, endScale: 1, startX: '0%', endX: '3%', startY: '0%', endY: '0%' },     // Zoom out + pan left
    { startScale: 1, endScale: 1.15, startX: '0%', endX: '0%', startY: '0%', endY: '-3%' },    // Zoom in + pan up
    { startScale: 1, endScale: 1.15, startX: '0%', endX: '0%', startY: '0%', endY: '3%' },     // Zoom in + pan down
    { startScale: 1, endScale: 1.2, startX: '0%', endX: '0%', startY: '0%', endY: '0%' },      // Slow zoom center
    { startScale: 1.1, endScale: 1.1, startX: '-2%', endX: '2%', startY: '0%', endY: '0%' },   // Pan left to right
];

interface KenBurnsGalleryProps {
    images: string[];
    getMediaUrl: (path: string) => string;
    onImageClick?: (index: number) => void;
    autoAdvanceMs?: number;
    className?: string;
}

export default function KenBurnsGallery({
    images,
    getMediaUrl,
    onImageClick,
    autoAdvanceMs = 5000,
    className = '',
}: KenBurnsGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stable random preset assignment per image (deterministic based on image count)
    const presetMap = useMemo(() => {
        return images.map((_, i) => KEN_BURNS_PRESETS[i % KEN_BURNS_PRESETS.length]);
    }, [images]);

    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (images.length <= 1) return;
        timerRef.current = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % images.length);
        }, autoAdvanceMs);
    }, [images.length, autoAdvanceMs]);

    useEffect(() => {
        startTimer();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [startTimer]);

    const goToImage = (index: number) => {
        setActiveIndex(index);
        startTimer();
    };

    const nextImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveIndex(prev => (prev + 1) % images.length);
        startTimer();
    };

    const prevImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveIndex(prev => (prev - 1 + images.length) % images.length);
        startTimer();
    };

    const handleImageLoad = (index: number) => {
        setLoadedImages(prev => new Set(prev).add(index));
    };

    if (images.length === 0) {
        return (
            <div className={`w-full h-80 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center rounded-2xl ${className}`}>
                <span className="text-slate-400 dark:text-slate-500">No images available</span>
            </div>
        );
    }

    const preset = presetMap[activeIndex];

    return (
        <div className={`rounded-2xl overflow-hidden ${className}`}>
            {/* Main Carousel */}
            <div
                className="relative h-80 md:h-[28rem] bg-slate-200 dark:bg-slate-800 overflow-hidden rounded-2xl cursor-pointer group"
                onClick={() => onImageClick?.(activeIndex)}
            >
                <AnimatePresence mode="sync">
                    <motion.div
                        key={activeIndex}
                        className="absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                    >
                        {/* Blur placeholder */}
                        {!loadedImages.has(activeIndex) && (
                            <div className="absolute inset-0 bg-slate-300 dark:bg-slate-700 animate-pulse z-10" />
                        )}
                        {/* Ken Burns animated image */}
                        <motion.img
                            src={getMediaUrl(images[activeIndex])}
                            alt={`Property image ${activeIndex + 1}`}
                            className="absolute inset-0 w-full h-full object-cover"
                            initial={{
                                scale: preset.startScale,
                                x: preset.startX,
                                y: preset.startY,
                            }}
                            animate={{
                                scale: preset.endScale,
                                x: preset.endX,
                                y: preset.endY,
                            }}
                            transition={{
                                duration: 6,
                                ease: 'linear',
                            }}
                            onLoad={() => handleImageLoad(activeIndex)}
                        />
                    </motion.div>
                </AnimatePresence>

                {/* Navigation Arrows */}
                {images.length > 1 && (
                    <>
                        <button
                            aria-label="Previous image"
                            onClick={prevImage}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-white dark:hover:bg-slate-700"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                        </button>
                        <button
                            aria-label="Next image"
                            onClick={nextImage}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-white dark:hover:bg-slate-700"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                        </button>
                    </>
                )}

                {/* Image Counter */}
                <div className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs font-medium z-20">
                    {activeIndex + 1} / {images.length}
                </div>

                {/* Dot Indicators */}
                {images.length > 1 && images.length <= 20 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                        {images.map((_, i) => (
                            <button
                                key={i}
                                aria-label={`Go to image ${i + 1}`}
                                onClick={(e) => { e.stopPropagation(); goToImage(i); }}
                                className={`rounded-full transition-all ${i === activeIndex ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Thumbnail Strip */}
            {images.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-thin">
                    {images.map((url, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={`View image ${i + 1}`}
                            onClick={() => goToImage(i)}
                            className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                                i === activeIndex
                                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
                                    : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                            }`}
                        >
                            <img
                                src={getMediaUrl(url)}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
