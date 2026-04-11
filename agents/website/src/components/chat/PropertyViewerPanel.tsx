'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, BedDouble, Ruler, Sofa, Building2, Calendar, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import PropertyImageGallery from './PropertyImageGallery';
import { NormalizedProperty } from './normalizeProperty';
import Link from 'next/link';

interface PropertyViewerPanelProps {
    property: NormalizedProperty;
    currentIndex: number;
    totalCount: number;
    onNext: () => void;
    onPrevious: () => void;
    onBookVisit: () => void;
    onClose: () => void;
    source: 'ai' | 'buyer';
    isLoading?: boolean;
}

export default function PropertyViewerPanel({
    property,
    currentIndex,
    totalCount,
    onNext,
    onPrevious,
    onBookVisit,
    onClose,
    source,
    isLoading = false,
}: PropertyViewerPanelProps) {
    const canGoPrevious = source === 'ai' ? currentIndex > 0 : true;
    const canGoNext = source === 'ai' ? currentIndex < totalCount - 1 : true;

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Sticky Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                        #{currentIndex + 1}{totalCount > 0 ? ` of ${totalCount}` : ''}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        property.intent === 'rent'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}>
                        {property.intent === 'rent' ? 'For Rent' : 'For Sale'}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Close property viewer"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={property.id}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        {/* Image Gallery */}
                        <PropertyImageGallery images={property.images} title={property.title} />

                        {/* Property Details */}
                        <div className="p-5 space-y-4">
                            {/* Title */}
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                {property.title}
                            </h2>

                            {/* Price */}
                            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                {property.priceFormatted}
                            </div>

                            {/* Location */}
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                <MapPin className="w-5 h-5 flex-shrink-0 text-blue-500" />
                                <span className="text-base">{property.location || 'Location not specified'}</span>
                            </div>

                            {/* Specs Row */}
                            {(property.bhk || property.area || property.furnishing || property.floor) && (
                                <div className="grid grid-cols-2 gap-3">
                                    {property.bhk && (
                                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <BedDouble className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500">Configuration</div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{property.bhk}</div>
                                            </div>
                                        </div>
                                    )}
                                    {property.area && (
                                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <Ruler className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500">Area</div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{property.area}</div>
                                            </div>
                                        </div>
                                    )}
                                    {property.furnishing && (
                                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <Sofa className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500">Furnishing</div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{property.furnishing}</div>
                                            </div>
                                        </div>
                                    )}
                                    {property.floor && (
                                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <Building2 className="w-5 h-5 text-blue-500" />
                                            <div>
                                                <div className="text-xs text-slate-400 dark:text-slate-500">Floor</div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{property.floor}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Amenities */}
                            {property.amenities.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Amenities</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {property.amenities.map((amenity) => (
                                            <span
                                                key={amenity}
                                                className="px-3 py-1 text-xs rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                            >
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Status badge */}
                            {property.status && (
                                <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium border border-emerald-200 dark:border-emerald-800">
                                    {property.status}
                                </div>
                            )}

                            {/* View full details link (AI properties only) */}
                            {property.detailUrl && (
                                <Link
                                    href={property.detailUrl}
                                    className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
                                >
                                    View Full Details <ExternalLink className="w-4 h-4" />
                                </Link>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Sticky Bottom Action Bar */}
            <div className="border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onPrevious}
                        disabled={isLoading || !canGoPrevious}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                    </button>

                    <button
                        onClick={onBookVisit}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                        <Calendar className="w-4 h-4" />
                        Book Site Visit
                    </button>

                    <button
                        onClick={onNext}
                        disabled={isLoading || !canGoNext}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
