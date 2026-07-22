'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, MessageCircle, Tag, Share2, Heart, Check, Calculator, IndianRupee, GraduationCap, Hospital, Train, ShoppingBag, Trees, Copy, Flag, Home } from 'lucide-react';
import Link from 'next/link';
import { getPropertyById, getSimilarProperties, getNearbyLandmarks, formatPrice, getMediaUrl, getImageUrls, isVideoUrl, type Property, type Landmark } from '@/lib/api';
import { formatPropertyTitle, formatAddress, resolveBedroomCount, getAmenities, getTypeLabel, getDisplaySpecs, getRoomLabel } from '@/lib/propertyUtils';
import { COMPANY_WHATSAPP } from '@/lib/constants';
import { getDisplayFloor } from '@/lib/floor';
import PropertyCard from '@/components/PropertyCard';
import InternalLinks from '@/components/InternalLinks';
import ScheduleVisitForm from '@/components/property-detail/ScheduleVisitForm';
import PhoneRevealButton from '@/components/property-detail/PhoneRevealButton';

// New sub-components
import {
    MediaGallery,
    FullscreenLightbox,
    SmartBreadcrumb,
    PropertyMap,
    NeighborhoodScores,
    AIDescription,
    PriceValueBadge,
    AnimatedSpecsGrid,
    StickyPriceBar,
    CompareBar,
} from '@/components/property-detail';

// === Panditji Score (kept inline — lightweight) ===
function calculatePanditjiScore(property: Property): number {
    let score = 6.0;
    if (property.price) score += 1.0;
    if (property.location) score += 0.5;
    if (property.media_urls?.length > 0) score += 0.5;
    const featureCount = getAmenities(property).length;
    if (featureCount >= 3) score += 1.0;
    const specs = property.specs || {};
    if (specs.bhk || specs.rooms || specs.bedrooms || specs.area || specs.bathrooms) score += 1.0;
    return Math.min(score, 10.0);
}

function getScoreColor(score: number): string {
    if (score >= 8) return 'from-green-500 to-emerald-600';
    if (score >= 6) return 'from-yellow-500 to-amber-600';
    return 'from-orange-500 to-red-500';
}

function getScoreBgColor(score: number): string {
    if (score >= 8) return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
    if (score >= 6) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
    return 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800';
}

function getScoreTextColor(score: number): string {
    if (score >= 8) return 'text-green-700 dark:text-green-400';
    if (score >= 6) return 'text-yellow-700 dark:text-yellow-400';
    return 'text-orange-700 dark:text-orange-400';
}

// === Nearby Places grouped display ===
const LANDMARK_TYPE_CONFIG: Record<string, { label: string; icon: typeof GraduationCap }> = {
    school: { label: 'Schools', icon: GraduationCap },
    hospital: { label: 'Hospitals', icon: Hospital },
    transit_station: { label: 'Transit', icon: Train },
    shopping_mall: { label: 'Shopping', icon: ShoppingBag },
    park: { label: 'Parks', icon: Trees },
};

function groupLandmarks(landmarks: Landmark[]) {
    const groups: Record<string, { name: string; distance_km: number }[]> = {};
    for (const lm of landmarks) {
        if (!groups[lm.type]) groups[lm.type] = [];
        groups[lm.type].push({ name: lm.name, distance_km: lm.distance_km });
    }
    return Object.entries(groups)
        .filter(([type]) => LANDMARK_TYPE_CONFIG[type])
        .map(([type, places]) => ({
            category: LANDMARK_TYPE_CONFIG[type].label,
            icon: LANDMARK_TYPE_CONFIG[type].icon,
            places: places.slice(0, 3).map(p => ({
                name: p.name,
                distance: `${p.distance_km.toFixed(1)} km`,
            })),
        }));
}

// === Main Component ===
export default function PropertyDetailClient({ id }: { id: string }) {
    const [property, setProperty] = useState<(Property & { owner_name?: string; contact?: any; latitude?: number; longitude?: number }) | null>(null);
    const [loading, setLoading] = useState(true);

    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [saved, setSaved] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
    const [similarLoading, setSimilarLoading] = useState(true);
    const [landmarks, setLandmarks] = useState<Landmark[]>([]);

    // EMI Calculator state
    const [loanAmount, setLoanAmount] = useState(5000000);
    const [interestRate, setInterestRate] = useState(8.5);
    const [tenure, setTenure] = useState(20);

    // === Data Loading ===
    useEffect(() => {
        if (id) {
            loadProperty(id);
            loadSimilarProperties(id);
            loadLandmarks(id);
        }
    }, [id]);

    useEffect(() => {
        const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        setSaved(wishlist.some((p: Property) => p.id === id));
    }, [id]);

    // Track property view for known leads (ref token from notification links)
    useEffect(() => {
        if (!id) return;
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (!ref) return;
        fetch('/public/track-property-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref, property_id: id }),
        }).catch(() => {});
    }, [id]);

    const loadProperty = async (propertyId: string) => {
        try {
            const data = await getPropertyById(propertyId);
            setProperty(data);
            if (data?.price) {
                setLoanAmount(Math.round((data.price * (data.price_unit === 'Cr' ? 10000000 : data.price_unit === 'Lakh' ? 100000 : 1)) * 0.8));
            }
        } catch {
            setProperty(null);
        } finally {
            setLoading(false);
        }
    };

    const loadSimilarProperties = async (propertyId: string) => {
        try {
            const data = await getSimilarProperties(propertyId);
            setSimilarProperties(Array.isArray(data) ? data.slice(0, 4) : (data?.properties || []).slice(0, 4));
        } catch {
            setSimilarProperties([]);
        } finally {
            setSimilarLoading(false);
        }
    };

    const loadLandmarks = async (propertyId: string) => {
        try {
            const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('landmarks timeout')), 5000));
            const data = await Promise.race([getNearbyLandmarks(propertyId), timeout]);
            setLandmarks(data.landmarks || []);
        } catch {
            setLandmarks([]);
        }
    };

    // === Actions ===
    const toggleSave = () => {
        if (!property) return;
        const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        if (saved) {
            localStorage.setItem('wishlist', JSON.stringify(wishlist.filter((p: Property) => p.id !== property.id)));
        } else {
            localStorage.setItem('wishlist', JSON.stringify([...wishlist, property]));
        }
        setSaved(!saved);
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({ title: `Property in ${property?.location}`, url: window.location.href });
        } else {
            navigator.clipboard.writeText(window.location.href);
        }
    };

    const getShareText = () => {
        if (!property) return '';
        const bedrooms = resolveBedroomCount(property);
        const bhk = bedrooms ? `${bedrooms} BHK ` : '';
        const type = getTypeLabel(property);
        const loc = property.location || '';
        const price = formatPrice(property.price || null, property.price_unit || null);
        const intent = property.intent === 'sell' ? 'Sale' : 'Rent';
        return `${bhk}${type} for ${intent} in ${loc} - ${price}`;
    };

    const handleWhatsAppShare = () => {
        const text = `${getShareText()}\n\nView on Realty Pandit: ${window.location.href}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleTwitterShare = () => {
        const text = `${getShareText()} on @RealtyPandit`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`, '_blank');
    };

    const handleFacebookShare = () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank');
    };

    const handleEmailShare = () => {
        const subject = getShareText();
        const body = `I found this property on Realty Pandit and thought you might be interested:\n\n${getShareText()}\n\nView details: ${window.location.href}`;
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    // EMI Calculation
    const monthlyRate = interestRate / 12 / 100;
    const months = tenure * 12;
    const emi = loanAmount > 0 && monthlyRate > 0
        ? Math.round(loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1))
        : 0;
    const totalPayable = emi * months;
    const totalInterest = totalPayable - loanAmount;

    // === Loading / Error States ===
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Loading property details...
                </div>
            </div>
        );
    }

    if (!property) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-4">
                <p className="text-xl font-semibold text-slate-700 dark:text-slate-300">Property not found</p>
                <Link href="/properties" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Back to listings</Link>
            </div>
        );
    }

    const specs = property.specs || {};
    const resolvedBedrooms = resolveBedroomCount(property);
    const amenities = getAmenities(property);
    const displaySpecs = getDisplaySpecs(property);
    const panditjiScore = calculatePanditjiScore(property);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Smart Breadcrumb */}
                <SmartBreadcrumb propertyType={getTypeLabel(property)} location={property.location || ''} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Images + Details */}
                    <div className="lg:col-span-2">
                        {/* Unified Media Gallery — Videos + Images with toggle */}
                        {(() => {
                            const imageUrls = getImageUrls(property.media_urls);
                            // Use video_urls if populated; otherwise extract video files from media_urls as fallback
                            const videoUrls = property.video_urls?.length
                                ? property.video_urls
                                : (property.media_urls || []).filter(url => isVideoUrl(url));
                            return (
                                <MediaGallery
                                    images={imageUrls}
                                    videoUrls={videoUrls}
                                    getMediaUrl={getMediaUrl}
                                    onImageClick={(index) => setLightboxIndex(index)}
                                />
                            );
                        })()}

                        {/* Title + Actions */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex gap-2 flex-wrap items-center">
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${property.intent === 'sell' ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-700' : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700'}`}>
                                        For {property.intent === 'sell' ? 'Sale' : property.intent}
                                    </span>
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 capitalize">{property.category}</span>
                                    {property.renovated && (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700">
                                            Newly Renovated
                                        </span>
                                    )}
                                    {property.roof_rights && (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                                            Roof Rights
                                        </span>
                                    )}
                                    {property.pre_rented && (() => {
                                        const rent = Number(property.pre_rented_monthly_rent) || 0;
                                        const absPrice = (property.price || 0) * (property.price_unit === 'Cr' ? 10000000 : property.price_unit === 'Lakh' ? 100000 : 1);
                                        const yld = rent > 0 && absPrice > 0 ? (rent * 12 / absPrice) * 100 : 0;
                                        const suffix = yld > 0 ? ` · ${yld.toFixed(1)}% yield` : rent > 0 ? ` · ₹${rent.toLocaleString('en-IN')}/mo` : '';
                                        return (
                                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">
                                                Pre-rented{suffix}
                                            </span>
                                        );
                                    })()}
                                    {/* Panditji Score Badge */}
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreBgColor(panditjiScore)} ${getScoreTextColor(panditjiScore)}`}
                                    >
                                        Panditji Score: {panditjiScore.toFixed(1)}/10
                                    </motion.span>
                                    {/* Price Value Badge */}
                                    <PriceValueBadge property={property} similarProperties={similarProperties} />
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" aria-label="Share property" onClick={handleShare} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                                        <Share2 className="w-5 h-5" />
                                    </button>
                                    <button type="button" aria-label={saved ? 'Remove from saved' : 'Save property'} onClick={toggleSave} className={`p-2 rounded-lg border transition-colors ${saved ? 'bg-red-50 border-red-200 text-red-500 dark:bg-red-950 dark:border-red-800 dark:text-red-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                        <Heart className={`w-5 h-5 ${saved ? 'fill-current' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                                {formatPropertyTitle(property, 'long')}
                            </h1>
                            <div id="property-price" className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-4">
                                {formatPrice(property.price, property.price_unit)}
                            </div>

                            {property.location && (
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-4">
                                    <MapPin className="w-5 h-5" /> {property.location}
                                </div>
                            )}

                            {/* Share Buttons */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="flex items-center gap-2 mb-6 flex-wrap"
                            >
                                <span className="text-sm text-slate-500 dark:text-slate-400 mr-1">Share:</span>
                                <button onClick={handleWhatsAppShare} className="p-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition-colors" title="Share on WhatsApp" aria-label="Share on WhatsApp">
                                    <MessageCircle className="w-4 h-4" />
                                </button>
                                <button onClick={handleTwitterShare} className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors" title="Share on Twitter" aria-label="Share on Twitter">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                </button>
                                <button onClick={handleFacebookShare} className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors" title="Share on Facebook" aria-label="Share on Facebook">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                </button>
                                <button onClick={handleEmailShare} className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors" title="Share via Email" aria-label="Share via Email">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                                </button>
                                <button onClick={handleCopyLink} className={`p-2 rounded-lg border transition-colors ${linkCopied ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`} title={linkCopied ? 'Copied!' : 'Copy link'} aria-label="Copy link">
                                    {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                                {linkCopied && (
                                    <motion.span initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                        Link copied!
                                    </motion.span>
                                )}
                            </motion.div>

                            {/* Animated Specs Grid */}
                            <AnimatedSpecsGrid specs={specs} createdAt={property.created_at} bedroomsOverride={resolvedBedrooms} roomLabel={getRoomLabel(property)} />

                            {/* Features & Amenities — from specs.amenities (array of labels) */}
                            {amenities.length > 0 && (
                                <div className="mb-8">
                                    <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                                        <Tag className="w-5 h-5" /> Features & Amenities
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {amenities.map((label) => (
                                            <div key={label} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300">
                                                <Check className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" />
                                                <span>{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* AI Enhanced Description */}
                            <AIDescription propertyId={id} originalDescription={property.description} />

                            {/* Original Description (only if no AI description will show — AIDescription handles both) */}
                            {/* Kept as fallback in case AI description fails to load */}

                            {/* Property Details Grid — driven by the type's taxonomy specs (furnishing,
                                facing, age, floors, plot-area, road-facing, ownership, etc. per type) */}
                            {(displaySpecs.length > 0 || getDisplayFloor(property) || property.apartment_name) && (
                                <div className="mb-8">
                                    <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-4">Property Details</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {getDisplayFloor(property) && (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
                                                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Floor</div>
                                                <div className="text-slate-900 dark:text-white font-medium text-sm">{getDisplayFloor(property)}{specs.floors ? ` of ${specs.floors}` : ''}</div>
                                            </div>
                                        )}
                                        {displaySpecs.map(({ key, label, value }) => (
                                            <div key={key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
                                                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">{label}</div>
                                                <div className="text-slate-900 dark:text-white font-medium text-sm">{value}</div>
                                            </div>
                                        ))}
                                        {property.apartment_name && (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 col-span-2">
                                                <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Society / Project</div>
                                                <div className="text-slate-900 dark:text-white font-medium text-sm capitalize">{property.apartment_name}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Embedded Google Map */}
                            {property.location && (
                                <div className="mb-8">
                                    <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                                        <MapPin className="w-5 h-5" /> Location
                                    </h3>
                                    <PropertyMap
                                        latitude={property.latitude}
                                        longitude={property.longitude}
                                        location={property.location}
                                        city={property.city}
                                        landmarks={landmarks}
                                    />
                                </div>
                            )}

                            {/* Neighborhood Scores */}
                            {landmarks.length > 0 && (
                                <div className="mb-8">
                                    <NeighborhoodScores landmarks={landmarks} />
                                </div>
                            )}

                            {/* Nearby Places Section */}
                            {landmarks.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4 }}
                                    className="mb-8"
                                >
                                    <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                                        <MapPin className="w-5 h-5" /> Nearby Places
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {groupLandmarks(landmarks).map((category) => {
                                            const IconComponent = category.icon;
                                            return (
                                                <motion.div
                                                    key={category.category}
                                                    whileHover={{ y: -2 }}
                                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md dark:hover:shadow-slate-900/50 transition-shadow"
                                                >
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                                                            <IconComponent className="w-5 h-5" />
                                                        </div>
                                                        <h4 className="font-semibold text-slate-900 dark:text-white">{category.category}</h4>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {category.places.map((place) => (
                                                            <div key={place.name} className="flex items-center justify-between text-sm">
                                                                <span className="text-slate-600 dark:text-slate-300">{place.name}</span>
                                                                <span className="text-slate-400 dark:text-slate-500 font-medium">{place.distance}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}

                            {/* Report Listing */}
                            <div className="text-center mb-8">
                                <button
                                    onClick={() => window.open(`mailto:support@realtypandit.in?subject=Report%20Listing%20${property.id}&body=I%20would%20like%20to%20report%20this%20property%20listing%20(${window.location.href})%20for%20the%20following%20reason%3A%0A%0A`, '_blank')}
                                    className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                >
                                    <Flag className="w-3.5 h-3.5" />
                                    Report this listing
                                </button>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right: Contact Card */}
                    <div className="lg:col-span-1">
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="sticky top-24 space-y-4">
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg dark:shadow-slate-900/50">
                                <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-3">Schedule a Visit</h3>
                                <div className="mb-4">
                                    <ScheduleVisitForm property={property} />
                                </div>
                                <a href={`https://wa.me/${COMPANY_WHATSAPP}?text=Hi%20Panditji%2C%20I%27m%20interested%20in%20property%20${property.id}`} target="_blank" rel="noopener noreferrer" className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 text-sm">
                                    <MessageCircle className="w-4 h-4" /> Chat with Panditji
                                </a>
                            </div>

                            {/* Phone Reveal */}
                            <PhoneRevealButton propertyId={property.id} />

                            {/* Price Highlights */}
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm dark:shadow-slate-900/50">
                                <h4 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
                                    <IndianRupee className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Price Details
                                </h4>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Asking Price</span><span className="font-semibold text-slate-900 dark:text-white">{formatPrice(property.price, property.price_unit)}</span></div>
                                    {property.intent === 'sell' && specs.area && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Price/sqft</span><span className="font-semibold text-slate-900 dark:text-white">₹{Math.round((property.price || 0) * (property.price_unit === 'Cr' ? 10000000 : property.price_unit === 'Lakh' ? 100000 : 1) / specs.area).toLocaleString('en-IN')}</span></div>}
                                    {property.intent === 'sell' && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Est. EMI</span><span className="font-semibold text-blue-600 dark:text-blue-400">₹{emi.toLocaleString('en-IN')}/mo</span></div>}
                                    {property.pre_rented && Number(property.pre_rented_monthly_rent) > 0 && (() => {
                                        const monthlyRent = Number(property.pre_rented_monthly_rent);
                                        const absPrice = (property.price || 0) * (property.price_unit === 'Cr' ? 10000000 : property.price_unit === 'Lakh' ? 100000 : 1);
                                        const annualIncome = monthlyRent * 12;
                                        const grossYield = absPrice > 0 ? (annualIncome / absPrice) * 100 : 0;
                                        const paybackYears = annualIncome > 0 ? absPrice / annualIncome : 0;
                                        const fmtAbs = (n: number) => n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;
                                        return (
                                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-1 space-y-2.5">
                                                <div className="flex justify-between"><span className="text-blue-600 dark:text-blue-400 font-medium">Already rented · Monthly rent</span><span className="font-semibold text-blue-600 dark:text-blue-400">₹{monthlyRent.toLocaleString('en-IN')}/mo</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Annual rental income</span><span className="font-semibold text-slate-900 dark:text-white">{fmtAbs(annualIncome)}/yr</span></div>
                                                {grossYield > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Gross rental yield</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{grossYield.toFixed(1)}% p.a.</span></div>}
                                                {paybackYears > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Rent payback</span><span className="font-semibold text-slate-900 dark:text-white">~{paybackYears.toFixed(1)} yrs</span></div>}
                                            </div>
                                        );
                                    })()}
                                </div>
                                {property.pre_rented && (
                                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                        Sold with a sitting tenant — you earn rental income from day one.
                                    </p>
                                )}
                            </div>

                            {/* Panditji Score Card */}
                            <div className={`border rounded-2xl p-5 shadow-sm ${getScoreBgColor(panditjiScore)}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getScoreColor(panditjiScore)} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
                                        {panditjiScore.toFixed(1)}
                                    </div>
                                    <div>
                                        <div className={`font-semibold ${getScoreTextColor(panditjiScore)}`}>Panditji Score</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Listing completeness</div>
                                    </div>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(panditjiScore / 10) * 100}%` }}
                                        transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                                        className={`h-2 rounded-full bg-gradient-to-r ${getScoreColor(panditjiScore)}`}
                                    />
                                </div>
                            </div>

                            {/* EMI Calculator — only for sale properties (sidebar) */}
                            {property.intent === 'sell' && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
                                    <h4 className="text-slate-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
                                        <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" /> EMI Calculator
                                    </h4>
                                    <div className="space-y-4 mb-4">
                                        <div>
                                            <label htmlFor="emi-loan-amount" className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1 block">Loan Amount</label>
                                            <input id="emi-loan-amount" type="range" min={500000} max={100000000} step={100000} value={loanAmount} onChange={e => setLoanAmount(Number(e.target.value))} className="w-full accent-blue-600" />
                                            <div className="text-slate-900 dark:text-white font-semibold text-sm mt-0.5">₹{loanAmount.toLocaleString('en-IN')}</div>
                                        </div>
                                        <div>
                                            <label htmlFor="emi-interest-rate" className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1 block">Interest Rate</label>
                                            <input id="emi-interest-rate" type="range" min={6} max={15} step={0.1} value={interestRate} onChange={e => setInterestRate(Number(e.target.value))} className="w-full accent-blue-600" />
                                            <div className="text-slate-900 dark:text-white font-semibold text-sm mt-0.5">{interestRate}%</div>
                                        </div>
                                        <div>
                                            <label htmlFor="emi-tenure" className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1 block">Tenure</label>
                                            <input id="emi-tenure" type="range" min={1} max={30} step={1} value={tenure} onChange={e => setTenure(Number(e.target.value))} className="w-full accent-blue-600" />
                                            <div className="text-slate-900 dark:text-white font-semibold text-sm mt-0.5">{tenure} years</div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 dark:text-slate-400 text-xs">Monthly EMI</span>
                                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{emi.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 dark:text-slate-400 text-xs">Total Interest</span>
                                            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">₹{totalInterest.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 dark:text-slate-400 text-xs">Total Payable</span>
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white">₹{totalPayable.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>

                {/* Similar Properties Section */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="mt-16 mb-12"
                >
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Similar Properties</h2>
                    {similarLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Loading similar properties...
                            </div>
                        </div>
                    ) : similarProperties.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {similarProperties.map((p, i) => (
                                <PropertyCard key={p.id} property={p} index={i} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-14 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
                            <Home className="w-16 h-16 text-slate-200 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500 dark:text-slate-400 font-medium">No similar properties in this area yet</p>
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Check back soon or browse all listings</p>
                            <Link href="/properties" className="mt-5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-semibold transition-colors">
                                Browse All Properties
                            </Link>
                        </div>
                    )}
                </motion.div>

                {/* Internal Links for SEO */}
                {property && (
                    <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                        <InternalLinks
                            city={property.city?.toLowerCase().replace(/\s+/g, '-') || property.location?.split(',')[0]?.trim().toLowerCase().replace(/\s+/g, '-') || ''}
                            cityName={property.city || property.location?.split(',')[0]?.trim() || ''}
                            locality={property.locality?.toLowerCase().replace(/\s+/g, '-')}
                            localityName={property.locality || undefined}
                        />
                    </div>
                )}
            </div>

            {/* Fullscreen Lightbox */}
            {lightboxIndex !== null && property.media_urls?.length > 0 && (
                <FullscreenLightbox
                    images={property.media_urls}
                    getMediaUrl={getMediaUrl}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}

            {/* Sticky Price Bar (Mobile) */}
            <StickyPriceBar
                price={formatPrice(property.price, property.price_unit)}
                onContact={() => document.querySelector<HTMLInputElement>('input[placeholder="Your Name *"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />

            {/* Compare Bar (Global) */}
            <CompareBar />
        </div>
    );
}
