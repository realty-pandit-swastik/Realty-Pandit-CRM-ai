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

    // 2026-07-29: some uploaded videos are HEVC/H.265 (iPhone) which Chrome/Firefox can't decode —
    // they render a black, stuck player. Track load/decode failures and, when every video is
    // unplayable, fall back to Photos so visitors see the images instead of a dead player.
    const [erroredVideos, setErroredVideos] = useState<Set<number>>(new Set());

    const handleVideoEnded = () => {
        videoEndedCountRef.current += 1;
        // Switch to photos after the last video ends
        if (videoEndedCountRef.current >= videoUrls.length) {
            setActiveTab('photos');
            videoEndedCountRef.current = 0;
        }
    };

    const handleVideoError = (i: number) => {
        setErroredVideos((prev) => {
            if (prev.has(i)) return prev;
            const next = new Set(prev);
            next.add(i);
            // Every video failed to play → auto-switch to Photos (if any images exist).
            if (next.size >= videoUrls.length && hasImages) {
                setActiveTab('photos');
            }
            return next;
        });
    };

    // A single video with graceful fallback when it can't be decoded/played.
    const VideoItem = ({ url, i }: { url: string; i: number }) =>
        erroredVideos.has(i) ? (
            <div
                key={i}
                className="w-full rounded-2xl bg-slate-100 dark:bg-slate-800 max-h-[420px] aspect-video flex flex-col items-center justify-center text-center px-6"
            >
                <Play className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">This video can’t be played in your browser</p>
                {hasImages && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Showing photos instead →</p>}
            </div>
        ) : (
            <video
                key={i}
                controls
                playsInline
                className="w-full rounded-2xl bg-black max-h-[420px]"
                preload="metadata"
                onEnded={handleVideoEnded}
                onError={() => handleVideoError(i)}
            >
                <source src={getMediaUrl(url)} type="video/mp4" />
            </video>
        );

    // Only videos, no images
    if (hasVideos && !hasImages) {
        return (
            <div className="mb-8">
                <div className="grid grid-cols-1 gap-4">
                    {videoUrls.map((url, i) => (
                        <VideoItem key={i} url={url} i={i} />
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
                            <VideoItem key={i} url={url} i={i} />
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
