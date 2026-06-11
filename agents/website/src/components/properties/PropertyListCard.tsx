'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MapPin, BedDouble, Bath, Maximize, Building2, Camera, CalendarPlus, MessageCircle, CheckCircle, Car, ArrowUpDown, Trees, Waves, Dumbbell, Shield, Zap, Droplets, Flame, Home } from 'lucide-react';
import { formatPrice, getMediaUrl, getImageUrls, timeAgo, type Property } from '@/lib/api';
import { formatPropertyTitle, formatAddress, getAmenities, getRoomCount, getRoomLabel, getFurnishing, getTotalFloors, amenitySlug } from '@/lib/propertyUtils';

const AMENITY_MAP: Record<string, { icon: typeof Car; label: string }> = {
    parking: { icon: Car, label: 'Parking' },
    lift: { icon: ArrowUpDown, label: 'Lift' },
    garden: { icon: Trees, label: 'Garden' },
    pool: { icon: Waves, label: 'Pool' },
    gym: { icon: Dumbbell, label: 'Gym' },
    security: { icon: Shield, label: 'Security' },
    power_backup: { icon: Zap, label: 'Power Backup' },
    water_supply: { icon: Droplets, label: '24x7 Water' },
    club_house: { icon: Building2, label: 'Club House' },
    gas_pipeline: { icon: Flame, label: 'Gas Pipeline' },
    park: { icon: Trees, label: 'Park' },
};

interface PropertyListCardProps {
    property: Property;
    index?: number;
    onScheduleVisit?: (property: Property) => void;
    onShareWhatsApp?: (property: Property) => void;
}

function formatFurnishing(f: string | null | undefined): string {
    if (!f) return '';
    return f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function PropertyListCard({ property, index = 0, onScheduleVisit, onShareWhatsApp }: PropertyListCardProps) {
    const specs = property.specs || {};
    const imageUrls = getImageUrls(property.media_urls);
    const pricePerSqft = property.price && specs.area
        ? Math.round(Number(property.price) / Number(specs.area))
        : null;

    const propertyUrl = `/properties/${property.slug || property.id}`;
    const title = formatPropertyTitle(property, 'short');
    const locationText = formatAddress(property) || property.location || '';

    // Taxonomy-aware specs (inventory.specs is the SoT; furnishing/floors/features cols dropped).
    const roomCount = getRoomCount(property);
    const roomLabel = getRoomLabel(property);
    const totalFloors = getTotalFloors(property);
    const furnishing = getFurnishing(property);

    // Amenities from specs.amenities (array of labels); map each to an icon, generic fallback.
    const activeAmenities = getAmenities(property).map((label) => {
        const m = AMENITY_MAP[amenitySlug(label)];
        return { key: amenitySlug(label), icon: m?.icon ?? CheckCircle, label: m?.label ?? label };
    });
    const shownAmenities = activeAmenities.slice(0, 4);
    const extraCount = activeAmenities.length - shownAmenities.length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            viewport={{ once: true }}
        >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-lg dark:hover:shadow-slate-900/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300 flex flex-col sm:flex-row">
                {/* Image Section */}
                <Link href={propertyUrl} className="relative w-full sm:w-[280px] h-[200px] sm:h-auto flex-shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 overflow-hidden block">
                    {imageUrls[0] ? (
                        <img
                            src={getMediaUrl(imageUrls[0])}
                            alt={title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-800 dark:to-slate-700">
                            <Home className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Photos Coming Soon</span>
                        </div>
                    )}

                    {/* Intent badge */}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                        property.intent === 'sell' ? 'bg-green-500 text-white' :
                        property.intent === 'rent' ? 'bg-blue-500 text-white' :
                        'bg-purple-500 text-white'
                    }`}>
                        For {property.intent === 'sell' ? 'Sale' : property.intent === 'rent' ? 'Rent' : property.intent}
                    </span>

                    {/* Photo count */}
                    {imageUrls.length > 1 && (
                        <span className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {imageUrls.length}
                        </span>
                    )}
                </Link>

                {/* Content Section */}
                <div className="flex-1 p-4 sm:p-5 flex flex-col min-w-0">
                    {/* Top row: verified badge + title */}
                    <div className="flex items-start gap-2 mb-1">
                        {property.is_enriched && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 flex-shrink-0 mt-0.5">
                                <CheckCircle className="w-3 h-3" /> Verified
                            </span>
                        )}
                        <Link href={propertyUrl} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors min-w-0">
                            <h3 className="font-semibold text-slate-900 dark:text-white capitalize truncate text-base">
                                {title}
                            </h3>
                        </Link>
                    </div>

                    {/* Location */}
                    {locationText && (
                        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-sm mb-2">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{locationText}</span>
                        </div>
                    )}

                    {/* Price row */}
                    <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xl font-bold text-slate-900 dark:text-white">
                            {formatPrice(property.price, property.price_unit)}
                        </span>
                        {pricePerSqft && pricePerSqft > 0 && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                ({`₹${pricePerSqft.toLocaleString('en-IN')}`}/sqft)
                            </span>
                        )}
                    </div>

                    {/* Specs row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400 mb-3">
                        {roomCount != null && roomCount > 0 && (
                            <span className="flex items-center gap-1">
                                <BedDouble className="w-3.5 h-3.5" /> {roomCount} {roomLabel}
                            </span>
                        )}
                        {specs.bathrooms && (
                            <span className="flex items-center gap-1">
                                <Bath className="w-3.5 h-3.5" /> {specs.bathrooms} Bath
                            </span>
                        )}
                        {specs.area && (
                            <span className="flex items-center gap-1">
                                <Maximize className="w-3.5 h-3.5" /> {specs.area} {specs.unit || 'sqft'}
                            </span>
                        )}
                        {property.floor_number != null && (
                            <span className="flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5" /> Floor {property.floor_number}{totalFloors != null ? `/${totalFloors}` : ''}
                            </span>
                        )}
                    </div>

                    {/* Amenities row */}
                    {shownAmenities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {shownAmenities.map(({ key, icon: Icon, label }) => (
                                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50">
                                    <Icon className="w-3 h-3" /> {label}
                                </span>
                            ))}
                            {extraCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    +{extraCount} more
                                </span>
                            )}
                        </div>
                    )}

                    {/* Meta row: furnishing, posted date (team member name intentionally hidden — privacy) */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500 mb-3">
                        {furnishing && (
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                {formatFurnishing(furnishing)}
                            </span>
                        )}
                        {property.created_at && (
                            <span>{timeAgo(property.created_at)}</span>
                        )}
                    </div>

                    {/* CTA buttons — pushed to bottom */}
                    <div className="flex items-center gap-2 mt-auto pt-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onScheduleVisit?.(property);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <CalendarPlus className="w-3.5 h-3.5" /> Schedule Visit
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onShareWhatsApp?.(property);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl transition-colors"
                        >
                            <MessageCircle className="w-3.5 h-3.5" /> Share on WhatsApp
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
