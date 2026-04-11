'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { MapPin, BedDouble, Ruler, Calendar, ChevronLeft, ChevronRight as ChevronRightIcon, Sofa, Building2 } from 'lucide-react';
import { getMediaUrl } from '@/lib/api';

export interface PropertyMatchData {
    property_id: string;
    type: string;
    bhk?: string;
    location: string;
    display_price: number;
    display_price_formatted: string;
    area?: string;
    furnishing?: string;
    floor?: string;
    amenities: string[];
    images: string[];
    videos: string[];
    match_score?: number;
    intent: string;
}

interface PropertyMatchCardProps {
    property: PropertyMatchData;
    matchIndex: number;
    totalAvailable: number;
    onAction: (action: string) => void;
    isLoading?: boolean;
}

export default function PropertyMatchCard({
    property,
    matchIndex,
    totalAvailable,
    onAction,
    isLoading = false,
}: PropertyMatchCardProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const photos = property.images.map(u => getMediaUrl(u));

    const nextImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % photos.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    const title = [property.bhk, property.type].filter(Boolean).join(' ');

    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md w-full max-w-lg"
        >
            {/* Image Carousel */}
            <div className="relative h-48 md:h-56 bg-slate-100 dark:bg-slate-700 group overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentImageIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="relative w-full h-full"
                    >
                        {photos.length > 0 ? (
                            <Image
                                src={photos[currentImageIndex]}
                                alt={title}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 500px"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800">
                                <Building2 className="w-16 h-16 mb-2" />
                                <span className="text-xs font-medium">No photos available</span>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Match badge */}
                <div className="absolute top-3 left-3 flex gap-2">
                    <div className="px-3 py-1.5 rounded-lg bg-blue-600/90 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                        #{matchIndex + 1}{totalAvailable > 0 ? ` of ${totalAvailable}` : ''}
                    </div>
                </div>

                {/* Intent badge */}
                <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                    {property.intent === 'rent' ? 'For Rent' : 'For Sale'}
                </div>

                {/* Image counter */}
                {photos.length > 1 && (
                    <div className="absolute bottom-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
                        {currentImageIndex + 1}/{photos.length}
                    </div>
                )}

                {/* Navigation arrows */}
                {photos.length > 1 && (
                    <>
                        <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-900" />
                        </button>
                        <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronRightIcon className="w-5 h-5 text-slate-900" />
                        </button>
                    </>
                )}
            </div>

            {/* Property Details */}
            <div className="p-4">
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-1 line-clamp-1">
                    {title}
                </h4>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-3">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm line-clamp-1">{property.location}</span>
                </div>

                {/* Specs row */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400 mb-3">
                    {property.bhk && (
                        <div className="flex items-center gap-1">
                            <BedDouble className="w-4 h-4" />
                            <span>{property.bhk}</span>
                        </div>
                    )}
                    {property.area && (
                        <div className="flex items-center gap-1">
                            <Ruler className="w-4 h-4" />
                            <span>{property.area}</span>
                        </div>
                    )}
                    {property.furnishing && (
                        <div className="flex items-center gap-1">
                            <Sofa className="w-4 h-4" />
                            <span>{property.furnishing}</span>
                        </div>
                    )}
                    {property.floor && (
                        <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            <span>Floor {property.floor}</span>
                        </div>
                    )}
                </div>

                {/* Amenities */}
                {property.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {property.amenities.slice(0, 4).map((a) => (
                            <span key={a} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                {a}
                            </span>
                        ))}
                        {property.amenities.length > 4 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                                +{property.amenities.length - 4} more
                            </span>
                        )}
                    </div>
                )}

                {/* Price */}
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">
                    {property.display_price_formatted || `₹${property.display_price?.toLocaleString('en-IN')}`}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onAction('__schedule_visit__')}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        <Calendar className="w-4 h-4" />
                        Schedule Visit
                    </button>
                    <button
                        onClick={() => onAction('__next_property__')}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Next Property
                    </button>
                    <button
                        onClick={() => onAction('__change_requirements__')}
                        disabled={isLoading}
                        className="px-3 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-sm"
                        title="Change requirements"
                    >
                        Edit
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
