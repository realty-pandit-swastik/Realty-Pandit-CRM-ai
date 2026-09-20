'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Grid2X2 } from 'lucide-react';
import KenBurnsGallery from './KenBurnsGallery';

interface AirbnbImageGridProps {
    images: string[];
    videoUrls?: string[];
    getMediaUrl: (path: string) => string;
    onOpenLightbox: (index: number) => void;
}

export default function AirbnbImageGrid({ images, videoUrls, getMediaUrl, onOpenLightbox }: AirbnbImageGridProps) {
    const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    if (images.length === 0) {
        return (
            <div className="w-full h-80 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center rounded-2xl">
                <span className="text-slate-400 dark:text-slate-500">No images available</span>
            </div>
        );
    }

    // Mobile: Ken Burns carousel
    if (!isDesktop) {
        return (
            <div className="relative">
                {videoUrls && videoUrls.length > 0 && (
                    <VirtualTourOverlay />
                )}
                <KenBurnsGallery
                    images={images}
                    getMediaUrl={getMediaUrl}
                    onImageClick={onOpenLightbox}
                />
            </div>
        );
    }

    // Desktop: Airbnb-style grid (1 large + up to 4 small)
    const gridImages = images.slice(0, 5);
    const hasMore = images.length > 5;

    return (
        <div className="relative">
            {videoUrls && videoUrls.length > 0 && (
                <VirtualTourOverlay />
            )}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="airbnb-grid rounded-2xl overflow-hidden"
            >
                <div className={`grid gap-1 h-[28rem] ${gridImages.length === 1 ? '' : 'grid-cols-2'}`}>
                    {/* Large image - left side */}
                    <div
                        className={`relative overflow-hidden cursor-pointer group ${gridImages.length > 2 ? 'row-span-2' : ''}`}
                        onClick={() => onOpenLightbox(0)}
                    >
                        <motion.img
                            src={getMediaUrl(gridImages[0])}
                            alt="Property main"
                            className="w-full h-full object-cover"
                            initial={{ scale: 1 }}
                            animate={{ scale: 1.05 }}
                            transition={{ duration: 8, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </div>

                    {/* Right side thumbnails */}
                    {gridImages.length > 1 && (
                        <div className={`grid gap-1 ${gridImages.length > 3 ? 'grid-rows-2' : ''}`}>
                            {gridImages.length <= 3 ? (
                                // 2-3 images: stack on right
                                <div className={`grid gap-1 ${gridImages.length === 3 ? 'grid-rows-2' : ''} h-full`}>
                                    {gridImages.slice(1).map((img, i) => (
                                        <div
                                            key={i + 1}
                                            className="relative overflow-hidden cursor-pointer group"
                                            onClick={() => onOpenLightbox(i + 1)}
                                        >
                                            <img
                                                src={getMediaUrl(img)}
                                                alt={`Property ${i + 2}`}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // 4-5 images: 2x2 grid on right
                                <>
                                    <div className="grid grid-cols-2 gap-1">
                                        {gridImages.slice(1, 3).map((img, i) => (
                                            <div
                                                key={i + 1}
                                                className="relative overflow-hidden cursor-pointer group"
                                                onClick={() => onOpenLightbox(i + 1)}
                                            >
                                                <img
                                                    src={getMediaUrl(img)}
                                                    alt={`Property ${i + 2}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {gridImages.slice(3, 5).map((img, i) => (
                                            <div
                                                key={i + 3}
                                                className="relative overflow-hidden cursor-pointer group"
                                                onClick={() => onOpenLightbox(i + 3)}
                                            >
                                                <img
                                                    src={getMediaUrl(img)}
                                                    alt={`Property ${i + 4}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* "Show all photos" button */}
                {hasMore && (
                    <button
                        onClick={() => onOpenLightbox(0)}
                        className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors z-10"
                    >
                        <Grid2X2 className="w-4 h-4" />
                        Show all {images.length} photos
                    </button>
                )}
            </motion.div>
        </div>
    );
}

function VirtualTourOverlay() {
    const scrollToVideos = () => {
        document.getElementById('property-videos')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <button
            onClick={scrollToVideos}
            className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full text-white text-xs font-semibold hover:bg-black/80 transition-colors"
        >
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            Virtual Tour
        </button>
    );
}
