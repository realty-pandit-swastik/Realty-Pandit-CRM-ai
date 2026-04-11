'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';

interface FullscreenLightboxProps {
    images: string[];
    getMediaUrl: (path: string) => string;
    initialIndex: number;
    onClose: () => void;
}

export default function FullscreenLightbox({ images, getMediaUrl, initialIndex, onClose }: FullscreenLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoomed, setZoomed] = useState(false);
    const [direction, setDirection] = useState(0);
    const dragX = useMotionValue(0);
    const dragOpacity = useTransform(dragX, [-200, 0, 200], [0.5, 1, 0.5]);
    const lastTap = useRef(0);

    const goNext = useCallback(() => {
        if (zoomed) return;
        if (currentIndex < images.length - 1) {
            setDirection(1);
            setCurrentIndex(prev => prev + 1);
        }
    }, [currentIndex, images.length, zoomed]);

    const goPrev = useCallback(() => {
        if (zoomed) return;
        if (currentIndex > 0) {
            setDirection(-1);
            setCurrentIndex(prev => prev - 1);
        }
    }, [currentIndex, zoomed]);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') goNext();
            else if (e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goNext, goPrev, onClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
        if (zoomed) return;
        const swipeThreshold = 50;
        const velocityThreshold = 300;

        if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
            goNext();
        } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
            goPrev();
        }
    };

    // Double-tap to zoom
    const handleTap = () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            setZoomed(prev => !prev);
        }
        lastTap.current = now;
    };

    const variants = {
        enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center select-none"
            onClick={onClose}
        >
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-20">
                <span className="text-white/70 text-sm font-medium">
                    {currentIndex + 1} / {images.length}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
                        onClick={(e) => { e.stopPropagation(); setZoomed(prev => !prev); }}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                    >
                        {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
                    </button>
                    <button
                        aria-label="Close lightbox"
                        onClick={onClose}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Navigation arrows */}
            {currentIndex > 0 && !zoomed && (
                <button
                    aria-label="Previous image"
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white z-20 transition-colors"
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {currentIndex < images.length - 1 && !zoomed && (
                <button
                    aria-label="Next image"
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white z-20 transition-colors"
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            {/* Image */}
            <div
                className="flex-1 flex items-center justify-center w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                style={{ touchAction: zoomed ? 'pan-x pan-y' : 'pan-y' }}
            >
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        drag={zoomed ? false : 'x'}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.7}
                        onDragEnd={handleDragEnd}
                        style={{ x: dragX, opacity: zoomed ? 1 : dragOpacity }}
                        onClick={handleTap}
                        className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                    >
                        <motion.img
                            src={getMediaUrl(images[currentIndex])}
                            alt={`Image ${currentIndex + 1}`}
                            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
                            animate={{ scale: zoomed ? 2 : 1 }}
                            transition={{ duration: 0.3 }}
                            draggable={false}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom thumbnails */}
            {images.length > 1 && !zoomed && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[90vw] pb-1 z-20">
                    {images.map((url, i) => (
                        <button
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                setDirection(i > currentIndex ? 1 : -1);
                                setCurrentIndex(i);
                            }}
                            className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                                i === currentIndex
                                    ? 'border-white opacity-100'
                                    : 'border-transparent opacity-40 hover:opacity-70'
                            }`}
                        >
                            <img src={getMediaUrl(url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
