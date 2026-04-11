'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MapPin, BedDouble, Bath, Maximize, ArrowRight, Home } from 'lucide-react';
import { formatPrice, getMediaUrl, getImageUrls, type Property } from '@/lib/api';
import { formatPropertyTitle, formatAddress } from '@/lib/propertyUtils';
import CompareButton from '@/components/property-detail/CompareButton';

export default function PropertyCard({ property, index = 0 }: { property: Property; index?: number }) {
    const specs = property.specs || {};
    const imageUrls = getImageUrls(property.media_urls);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            viewport={{ once: true }}
        >
            <Link href={`/properties/${property.slug || property.id}`} className="group block">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-lg dark:hover:shadow-slate-900/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-300">
                    <div className="relative h-52 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 overflow-hidden">
                        {imageUrls[0] ? (
                            <img src={getMediaUrl(imageUrls[0])} alt={formatPropertyTitle(property, 'short')} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-800 dark:to-slate-700">
                                <Home className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Photos Coming Soon</span>
                            </div>
                        )}
                        <div className="absolute top-3 left-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                                property.intent === 'sell' ? 'bg-green-500 text-white' :
                                property.intent === 'rent' ? 'bg-blue-500 text-white' :
                                'bg-purple-500 text-white'
                            }`}>
                                For {property.intent === 'sell' ? 'Sale' : property.intent === 'rent' ? 'Rent' : property.intent}
                            </span>
                        </div>
                        <div className="absolute top-3 right-3">
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 capitalize shadow-sm dark:shadow-slate-900/30">
                                {property.category}
                            </span>
                        </div>
                        {property.renovated && (
                            <div className="absolute bottom-3 left-3">
                                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                                    Newly Renovated
                                </span>
                            </div>
                        )}
                        <div className="absolute bottom-3 right-3">
                            <CompareButton property={property} size="sm" />
                        </div>
                    </div>

                    <div className="p-5">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                            {formatPrice(property.price, property.price_unit)}
                        </div>
                        <h3 className="text-slate-600 dark:text-slate-300 font-medium mb-3">
                            {formatPropertyTitle(property, 'short')}
                        </h3>
                        {(formatAddress(property) || property.location) && (
                            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-sm mb-4">
                                <MapPin className="w-4 h-4 shrink-0" />
                                <span className="truncate">{formatAddress(property) || property.location}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 text-sm border-t border-slate-100 dark:border-slate-800 pt-4">
                            {specs.bedrooms && (
                                <span className="flex items-center gap-1"><BedDouble className="w-4 h-4" /> {specs.bedrooms} BHK</span>
                            )}
                            {specs.bathrooms && (
                                <span className="flex items-center gap-1"><Bath className="w-4 h-4" /> {specs.bathrooms} Bath</span>
                            )}
                            {specs.area && (
                                <span className="flex items-center gap-1"><Maximize className="w-4 h-4" /> {specs.area} {specs.unit || 'sqft'}</span>
                            )}
                            <span className="ml-auto text-blue-500 group-hover:translate-x-1 transition-transform">
                                <ArrowRight className="w-4 h-4" />
                            </span>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
