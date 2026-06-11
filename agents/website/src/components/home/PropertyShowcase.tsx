'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ArrowRight, MapPin, Home as HomeIcon } from 'lucide-react';
import { type Property, getFeaturedProperties, getMediaUrl, formatPrice } from '@/lib/api';
import { formatPropertyTitle, formatAddress } from '@/lib/propertyUtils';
import PropertyCard from '@/components/PropertyCard';

// ── Carousel Card (portrait, premium) ────────────────────────────────────────

function CarouselCard({ property, active = false }: { property: Property; active?: boolean }) {
    const href = `/properties/${property.slug || property.id}`;
    const imageUrl = property.media_urls?.[0] ? getMediaUrl(property.media_urls[0]) : null;
    const videoUrl = property.video_urls?.[0] ? getMediaUrl(property.video_urls[0]) : null;
    const title = formatPropertyTitle(property, 'short');
    const address = formatAddress(property);
    const price = formatPrice(property.price, property.price_unit);

    return (
        <Link href={href} className="block h-full" tabIndex={active ? 0 : -1}>
            <div
                className={`rounded-2xl overflow-hidden bg-white dark:bg-slate-900 h-full flex flex-col transition-shadow duration-300 ${
                    active
                        ? 'shadow-2xl shadow-blue-500/15 dark:shadow-blue-900/30 ring-1 ring-slate-200/60 dark:ring-slate-700/60'
                        : 'shadow-md'
                }`}
            >
                {/* Media */}
                <div className="relative h-52 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-800 dark:to-slate-700 shrink-0">
                    {videoUrl ? (
                        <video
                            src={videoUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : imageUrl ? (
                        <Image
                            src={imageUrl}
                            alt={title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 90vw, 320px"
                            loading="lazy"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <HomeIcon className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                        </div>
                    )}
                    {/* Intent badge */}
                    <div className="absolute top-3 left-3">
                        <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                                property.intent === 'rent'
                                    ? 'bg-purple-100/90 text-purple-700'
                                    : 'bg-blue-100/90 text-blue-700'
                            }`}
                        >
                            {property.intent === 'rent' ? 'For Rent' : 'For Sale'}
                        </span>
                    </div>
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug line-clamp-1">
                        {title}
                    </h3>
                    {address && (
                        <div className="flex items-start gap-1 text-slate-500 dark:text-slate-400 text-xs">
                            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{address}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{price}</span>
                        {active && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">View Details →</span>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}

// ── 3D Depth Carousel ─────────────────────────────────────────────────────────

function PropertyCarousel({ properties }: { properties: Property[] }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const len = properties.length;

    const prevIndex = (activeIndex - 1 + len) % len;
    const nextIndex = (activeIndex + 1) % len;

    const prev = useCallback(() => setActiveIndex(i => (i - 1 + len) % len), [len]);
    const next = useCallback(() => setActiveIndex(i => (i + 1) % len), [len]);

    useEffect(() => { setActiveIndex(0); }, [properties]);

    if (len === 0) return null;

    return (
        <div className="relative select-none">
            {/* Cards row — 3-column depth layout */}
            <div className="flex items-center justify-center gap-4 py-6">
                {/* Left (prev) — scaled down, faded */}
                <motion.div
                    className="hidden sm:block shrink-0 cursor-pointer"
                    style={{ width: 224 }}
                    animate={{ scale: 0.87, opacity: 0.55 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    onClick={prev}
                    aria-label="Previous property"
                >
                    {len > 1 && <CarouselCard property={properties[prevIndex]} />}
                </motion.div>

                {/* Center (active) — full size, full opacity */}
                <motion.div
                    className="shrink-0 z-10"
                    style={{ width: 288 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.1}
                    onDragEnd={(_, info) => {
                        if (info.offset.x < -50) next();
                        else if (info.offset.x > 50) prev();
                    }}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeIndex}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25 }}
                        >
                            <CarouselCard property={properties[activeIndex]} active />
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

                {/* Right (next) — scaled down, faded */}
                <motion.div
                    className="hidden sm:block shrink-0 cursor-pointer"
                    style={{ width: 224 }}
                    animate={{ scale: 0.87, opacity: 0.55 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    onClick={next}
                    aria-label="Next property"
                >
                    {len > 1 && <CarouselCard property={properties[nextIndex]} />}
                </motion.div>
            </div>

            {/* Arrow buttons */}
            {len > 1 && (
                <>
                    <button
                        type="button"
                        onClick={prev}
                        aria-label="Previous property"
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-11 h-11 min-w-[44px] min-h-[44px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-md flex items-center justify-center hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors z-20"
                    >
                        <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <button
                        type="button"
                        onClick={next}
                        aria-label="Next property"
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-11 h-11 min-w-[44px] min-h-[44px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-md flex items-center justify-center hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors z-20"
                    >
                        <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                </>
            )}

            {/* Dot indicators */}
            {len > 1 && (
                <div className="flex justify-center gap-1.5 mt-5">
                    {properties.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setActiveIndex(i)}
                            aria-label={`Go to property ${i + 1}`}
                            className={`rounded-full transition-all duration-300 ${
                                i === activeIndex
                                    ? 'w-6 h-2 bg-blue-600'
                                    : 'w-2 h-2 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
    return (
        <div className="animate-pulse">
            <div className="flex items-center justify-center gap-4 py-6">
                {[0, 1, 2].map(i => (
                    <div
                        key={i}
                        className={`rounded-2xl bg-slate-100 dark:bg-slate-800 ${
                            i === 1 ? 'w-72 h-[22rem]' : 'hidden sm:block w-56 h-72 opacity-50'
                        }`}
                    />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
                {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="rounded-2xl bg-slate-100 dark:bg-slate-800 h-64" />
                ))}
            </div>
        </div>
    );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function PropertyShowcase() {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [intent, setIntent] = useState<'buy' | 'rent'>('buy');

    useEffect(() => {
        getFeaturedProperties()
            .then(d => setProperties(d.properties || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Client-side filter; fall back to all properties if none match the intent
    const filtered = properties.filter(p => p.intent === intent);
    const displayProps = filtered.length > 0 ? filtered : properties;

    const carouselProps = displayProps.slice(0, 8);
    const gridProps = displayProps.slice(0, 6);

    return (
        <section className="py-16 bg-white dark:bg-slate-950 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4">
                {/* Header + Buy/Rent toggle */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
                >
                    <div>
                        <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-1">Discover</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                            Featured Properties
                        </h2>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-full self-start sm:self-auto">
                        {(['buy', 'rent'] as const).map(opt => (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => setIntent(opt)}
                                className={`relative px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    intent === opt
                                        ? 'text-white'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                {intent === opt && (
                                    <motion.span
                                        layoutId="intentToggleBg"
                                        className="absolute inset-0 bg-blue-600 rounded-full"
                                        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                                    />
                                )}
                                <span className="relative z-10 capitalize">{opt}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>

                {loading ? (
                    <Skeleton />
                ) : (
                    <>
                        {/* 3D Carousel */}
                        <PropertyCarousel properties={carouselProps} />

                        {/* Handpicked Properties grid */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="mt-16"
                        >
                            <div className="flex items-end justify-between mb-8">
                                <div>
                                    <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-1">
                                        Curated
                                    </p>
                                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                                        Handpicked Properties
                                    </h2>
                                </div>
                                <Link
                                    href={`/properties?intent=${intent}`}
                                    className="hidden md:flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                                >
                                    View All <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>

                            {gridProps.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-2xl">
                                    No {intent === 'buy' ? 'properties for sale' : 'rental properties'} right now.{' '}
                                    <Link href="/properties" className="text-blue-600 hover:underline">
                                        Browse all →
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {gridProps.map((p, i) => (
                                        <PropertyCard key={p.id} property={p} index={i} />
                                    ))}
                                </div>
                            )}

                            <div className="mt-6 text-center md:hidden">
                                <Link
                                    href={`/properties?intent=${intent}`}
                                    className="text-blue-600 font-medium"
                                >
                                    View All Properties →
                                </Link>
                            </div>
                        </motion.div>
                    </>
                )}
            </div>
        </section>
    );
}
