'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, BedDouble, Ruler, ArrowRight, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { Property, getMediaUrl, getImageUrls } from '@/lib/api';
import { getRoomCount, getRoomLabel, getTypeLabel } from '@/lib/propertyUtils';

interface PropertyChatCardProps {
    property: Property;
}

export default function PropertyChatCard({ property }: PropertyChatCardProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const photos = getImageUrls(property.media_urls).map(u => getMediaUrl(u));
    const typeLabel = getTypeLabel(property);

    // Extract BHK/Rooms from the specs SoT (configuration is legacy + usually null)
    const _rooms = getRoomCount(property);
    const bhk = _rooms != null && _rooms > 0 ? `${_rooms} ${getRoomLabel(property)}` : (property.property_configuration?.name || '');

    // Extract area from specs (canonical key first)
    const area = property.specs?.area ?? property.specs?.area_sqft ?? property.specs?.built_area ?? property.specs?.super_built_up_area;

    // Format price
    const formatPrice = (price: number | null) => {
        if (!price) return 'Price on Request';
        if (price >= 10000000) {
            return `₹${(price / 10000000).toFixed(2)} Cr`;
        } else if (price >= 100000) {
            return `₹${(price / 100000).toFixed(0)} L`;
        } else {
            return `₹${price.toLocaleString('en-IN')}`;
        }
    };

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

    return (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{
                type: "spring",
                damping: 25,
                stiffness: 400
            }}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md hover:shadow-xl transition-all"
        >
            <Link href={`/properties/${property.slug || property.id}`} className="block">
                {/* Large Property Image Section with Carousel */}
                <div className="relative h-48 md:h-64 bg-slate-100 dark:bg-slate-700 group overflow-hidden">
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
                                    alt={`${bhk} ${typeLabel}`}
                                    fill
                                    className="object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                    sizes="(max-width: 768px) 100vw, 800px"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                                    <Ruler className="w-12 h-12" />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Status Badge */}
                    {property.status && (
                        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                            {property.status}
                        </div>
                    )}

                    {/* Image Counter Badge */}
                    <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-sm font-medium flex items-center gap-1.5 shadow-lg">
                        <span className="text-base">📸</span>
                        {currentImageIndex + 1} / {photos.length}
                    </div>

                    {/* Navigation Arrows - Always visible on desktop */}
                    {photos.length > 1 && (
                        <>
                            <button
                                onClick={prevImage}
                                className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center hover:scale-110 transition-transform opacity-0 md:opacity-100 group-hover:opacity-100"
                                aria-label="Previous image"
                            >
                                <ChevronLeft className="w-6 h-6 text-slate-900 dark:text-white" />
                            </button>
                            <button
                                onClick={nextImage}
                                className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-slate-800/90 shadow-lg flex items-center justify-center hover:scale-110 transition-transform opacity-0 md:opacity-100 group-hover:opacity-100"
                                aria-label="Next image"
                            >
                                <ChevronRightIcon className="w-6 h-6 text-slate-900 dark:text-white" />
                            </button>
                        </>
                    )}

                    {/* Thumbnail Strip (for multiple images) */}
                    {photos.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                            {photos.slice(0, 5).map((photo, idx) => (
                                <button
                                    key={idx}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setCurrentImageIndex(idx);
                                    }}
                                    className={`relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border-2 transition-all ${
                                        idx === currentImageIndex
                                            ? 'border-white scale-110 shadow-lg'
                                            : 'border-white/50 opacity-70 hover:opacity-100 hover:scale-105'
                                    }`}
                                >
                                    <Image
                                        src={photo}
                                        alt={`Thumbnail ${idx + 1}`}
                                        fill
                                        className="object-cover"
                                        sizes="56px"
                                    />
                                </button>
                            ))}
                            {photos.length > 5 && (
                                <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg bg-black/70 backdrop-blur-sm flex items-center justify-center text-white text-xs font-bold border-2 border-white/50">
                                    +{photos.length - 5}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Property Details Section */}
                <div className="p-4">
                    {/* Title & Location */}
                    <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-2 line-clamp-1">
                        {`${bhk} ${typeLabel}`}
                    </h4>
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-3">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm line-clamp-1">{property.location || 'Location'}</span>
                    </div>

                    {/* Specs */}
                    <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-4">
                        {bhk && (
                            <div className="flex items-center gap-1.5">
                                <BedDouble className="w-4 h-4" />
                                <span>{bhk}</span>
                            </div>
                        )}
                        {area && (
                            <div className="flex items-center gap-1.5">
                                <Ruler className="w-4 h-4" />
                                <span>{area} sqft</span>
                            </div>
                        )}
                    </div>

                    {/* Price & CTA */}
                    <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {formatPrice(property.price)}
                        </div>
                        <div className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
                            View Details <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
