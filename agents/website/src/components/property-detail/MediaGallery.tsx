'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Images } from 'lucide-react';
import KenBurnsGallery from './KenBurnsGallery';

interface MediaGalleryProps {
    images: string[];
    videoUrls: string[];
    getMediaUrl: (path: string) => string;
    onImageClick?: (index: number) => void;
}

type Tab = 'videos' | 'photos';

export default function MediaGallery({ images, videoUrls, getMediaUrl, onImageClick }: MediaGalleryProps) {
    const hasVideos = videoUrls.length > 0;
    const hasImages = images.length > 0;
    const showTabs = hasVideos && hasImages;

    const [activeTab, setActiveTab] = useState<Tab>(hasVideos ? 'videos' : 'photos');
    const videoEndedCountRef = useRef(0);

    const handleVideoEnded = () => {
        videoEndedCountRef.current += 1;
        // Switch to photos after the last video ends
        if (videoEndedCountRef.current >= videoUrls.length) {
            setActiveTab('photos');
            videoEndedCountRef.current = 0;
        }
    };

    // Only videos, no images
    if (hasVideos && !hasImages) {
        return (
            <div className="mb-8">
                <div className="grid grid-cols-1 gap-4">
                    {videoUrls.map((url, i) => (
                        <video
                            key={i}
                            controls
                            className="w-full rounded-2xl bg-black max-h-[420px]"
                            preload="metadata"
                            onEnded={handleVideoEnded}
                        >
                            <source src={getMediaUrl(url)} />
                        </video>
                    ))}
                </div>
            </div>
        );
    }

    // Only images, no videos
    if (!hasVideos) {
        return (
            <div className="mb-8">
                <KenBurnsGallery
                    images={images}
                    getMediaUrl={getMediaUrl}
                    onImageClick={onImageClick}
                    autoAdvanceMs={4000}
                />
            </div>
        );
    }

    // Both videos and images — show tabbed gallery
    return (
        <div className="mb-8">
            {/* Tab Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-full w-fit mb-4 relative">
                <motion.div
                    layoutId="mediaTab"
                    className="absolute inset-y-1 rounded-full bg-white dark:bg-slate-700 shadow-sm"
                    style={{
                        width: 'calc(50% - 4px)',
                        left: activeTab === 'videos' ? '4px' : 'calc(50%)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
                <button
                    onClick={() => setActiveTab('videos')}
                    className={`relative z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        activeTab === 'videos'
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    <Play className="w-3.5 h-3.5" />
                    Videos
                </button>
                <button
                    onClick={() => setActiveTab('photos')}
                    className={`relative z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        activeTab === 'photos'
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    <Images className="w-3.5 h-3.5" />
                    Photos
                </button>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
                {activeTab === 'videos' ? (
                    <motion.div
                        key="videos"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 gap-4"
                    >
                        {videoUrls.map((url, i) => (
                            <video
                                key={i}
                                controls
                                className="w-full rounded-2xl bg-black max-h-[420px]"
                                preload="metadata"
                                onEnded={handleVideoEnded}
                            >
                                <source src={getMediaUrl(url)} />
                            </video>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div
                        key="photos"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                    >
                        <KenBurnsGallery
                            images={images}
                            getMediaUrl={getMediaUrl}
                            onImageClick={onImageClick}
                            autoAdvanceMs={4000}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
