'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, ThumbsUp, SkipForward, MapPin, IndianRupee, Building2,
    Maximize2, Sofa, Layers, Sparkles, Calendar, Loader2, X, Check,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/api';

interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    specs: any;
    features: any;
    furnishing: string | null;
    floor_number: number | null;
    total_floors: number | null;
    media_urls: string[];
    match_score: number;
}

const formatPrice = (price: number | null, intent: string) => {
    if (!price) return 'Price on request';
    if (intent === 'rent') return `\u20B9${Number(price).toLocaleString('en-IN')}/month`;
    if (price >= 10000000) return `\u20B9${(price / 10000000).toFixed(1)} Cr`;
    if (price >= 100000) return `\u20B9${(price / 100000).toFixed(1)} Lakh`;
    return `\u20B9${Number(price).toLocaleString('en-IN')}`;
};

export default function BrowseProperties() {
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;

    const [matches, setMatches] = useState<MatchedProperty[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [imageIndex, setImageIndex] = useState(0);

    // Schedule visit modal
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleNotes, setScheduleNotes] = useState('');
    const [scheduling, setScheduling] = useState(false);
    const [scheduleSuccess, setScheduleSuccess] = useState('');

    // Skipped / liked tracking
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [liked, setLiked] = useState<Set<string>>(new Set());

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        if (!token || !dealId) return;
        api.get(`/agent/deals/${dealId}/matches`, { headers })
            .then(res => {
                setMatches(res.data.matches || []);
            })
            .catch(err => setError(err.response?.data?.error || 'Failed to load properties'))
            .finally(() => setLoading(false));
    }, [dealId]);

    const currentProperty = matches[currentIndex];
    const specs = currentProperty?.specs
        ? (typeof currentProperty.specs === 'string' ? JSON.parse(currentProperty.specs) : currentProperty.specs)
        : {};
    const images = currentProperty?.media_urls?.filter((url: string) =>
        /\.(jpg|jpeg|png|webp|avif|gif|bmp)$/i.test(url)
    ) || [];
    const amenities = currentProperty?.features && typeof currentProperty.features === 'object'
        ? Object.entries(currentProperty.features).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' '))
        : [];

    const handleLike = () => {
        if (!currentProperty) return;
        setLiked(prev => new Set(prev).add(currentProperty.id));
        setShowSchedule(true);
    };

    const handleSkip = () => {
        if (!currentProperty) return;
        setSkipped(prev => new Set(prev).add(currentProperty.id));
        goNext();
    };

    const goNext = () => {
        setImageIndex(0);
        setScheduleSuccess('');
        if (currentIndex + 1 < matches.length) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handleScheduleVisit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentProperty) return;
        setScheduling(true);
        try {
            const res = await api.post(`/agent/deals/${dealId}/schedule-visit`, {
                property_id: currentProperty.id,
                preferred_date: scheduleDate || undefined,
                preferred_time: scheduleTime || undefined,
                notes: scheduleNotes || undefined,
            }, { headers });
            setScheduleSuccess(res.data.message || 'Visit scheduled!');
            setShowSchedule(false);
            setScheduleDate('');
            setScheduleTime('');
            setScheduleNotes('');

            // Auto-advance after 2s
            setTimeout(goNext, 2000);
        } catch (err: any) {
            setScheduleSuccess('');
            alert(err.response?.data?.error || 'Failed to schedule visit');
        } finally {
            setScheduling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-20">
                <p className="text-red-600 font-medium">{error}</p>
                <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mt-2">Go back</button>
            </div>
        );
    }

    if (matches.length === 0) {
        return (
            <div className="max-w-lg mx-auto text-center py-20">
                <Building2 className="mx-auto h-16 w-16 text-slate-200 mb-4" />
                <h2 className="text-lg font-bold text-slate-900">No matching properties found</h2>
                <p className="text-sm text-slate-500 mt-2">Your coordinator will notify you when new properties match your requirements.</p>
                <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:underline">Back to deal</button>
            </div>
        );
    }

    // All properties viewed
    if (currentIndex >= matches.length) {
        return (
            <div className="max-w-lg mx-auto text-center py-20">
                <Check className="mx-auto h-16 w-16 text-green-400 mb-4" />
                <h2 className="text-lg font-bold text-slate-900">All properties reviewed!</h2>
                <p className="text-sm text-slate-500 mt-2">
                    You liked {liked.size} and skipped {skipped.size} properties.
                    Your coordinator will follow up on scheduled visits.
                </p>
                <div className="flex gap-3 justify-center mt-6">
                    <button
                        onClick={() => { setCurrentIndex(0); setImageIndex(0); }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
                    >
                        Browse Again
                    </button>
                    <button
                        onClick={() => router.push(`/agent/deals/${dealId}`)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                        Back to Deal
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto space-y-4">
            {/* Back + Counter */}
            <div className="flex items-center justify-between">
                <button onClick={() => router.push(`/agent/deals/${dealId}`)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft size={16} /> Back
                </button>
                <span className="text-sm text-slate-400 font-medium">
                    {currentIndex + 1} / {matches.length}
                </span>
            </div>

            {/* Schedule success banner */}
            {scheduleSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-medium flex items-center gap-2">
                    <Check size={16} /> {scheduleSuccess}
                </div>
            )}

            {/* Property Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Image Carousel */}
                <div className="relative aspect-[4/3] bg-slate-100">
                    {images.length > 0 ? (
                        <>
                            <img
                                src={getMediaUrl(images[imageIndex])}
                                alt={`Property ${currentIndex + 1}`}
                                className="w-full h-full object-cover"
                            />
                            {images.length > 1 && (
                                <>
                                    <button
                                        onClick={() => setImageIndex(prev => (prev - 1 + images.length) % images.length)}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button
                                        onClick={() => setImageIndex(prev => (prev + 1) % images.length)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                        {images.map((_: string, i: number) => (
                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imageIndex ? 'bg-white' : 'bg-white/40'}`} />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Building2 size={48} className="text-slate-300" />
                        </div>
                    )}

                    {/* Match score badge */}
                    <div className="absolute top-3 right-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                        {currentProperty.match_score.toFixed(0)}% match
                    </div>

                    {/* Photo count */}
                    {images.length > 0 && (
                        <div className="absolute top-3 left-3 bg-black/60 text-white px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
                            {imageIndex + 1}/{images.length} photos
                        </div>
                    )}
                </div>

                {/* Property Details */}
                <div className="p-5 space-y-4">
                    {/* Title + Price */}
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">
                            {specs.bedrooms ? `${specs.bedrooms} BHK ` : ''}{currentProperty.type}
                        </h2>
                        <p className="text-xl font-bold text-blue-600 mt-1">
                            {formatPrice(currentProperty.price, currentProperty.intent)}
                        </p>
                    </div>

                    {/* Key Info Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {currentProperty.location && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                                <span className="truncate">{currentProperty.location}</span>
                            </div>
                        )}
                        {specs.area && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Maximize2 size={14} className="text-slate-400 flex-shrink-0" />
                                {specs.area} {specs.area_unit || 'sqft'}
                            </div>
                        )}
                        {currentProperty.furnishing && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Sofa size={14} className="text-slate-400 flex-shrink-0" />
                                {currentProperty.furnishing.replace(/_/g, ' ')}
                            </div>
                        )}
                        {currentProperty.floor_number && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Layers size={14} className="text-slate-400 flex-shrink-0" />
                                Floor {currentProperty.floor_number}{currentProperty.total_floors ? `/${currentProperty.total_floors}` : ''}
                            </div>
                        )}
                    </div>

                    {/* Amenities */}
                    {amenities.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amenities</p>
                            <div className="flex flex-wrap gap-2">
                                {amenities.slice(0, 6).map((a, i) => (
                                    <span key={i} className="px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600">
                                        {a}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* For Rent/Sale badge */}
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            currentProperty.intent === 'rent'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-purple-50 text-purple-700'
                        }`}>
                            For {currentProperty.intent === 'sell' ? 'Sale' : 'Rent'}
                        </span>
                        {currentProperty.category && (
                            <span className="text-xs text-slate-400">{currentProperty.category}</span>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex border-t border-slate-100">
                    <button
                        onClick={handleSkip}
                        className="flex-1 flex items-center justify-center gap-2 py-4 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors text-sm font-semibold"
                    >
                        <SkipForward size={18} /> Skip
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                        onClick={handleLike}
                        className="flex-1 flex items-center justify-center gap-2 py-4 text-blue-600 hover:text-green-600 hover:bg-green-50 transition-colors text-sm font-semibold"
                    >
                        <ThumbsUp size={18} /> Schedule Visit
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / matches.length) * 100}%` }}
                />
            </div>

            {/* Schedule Visit Modal */}
            {showSchedule && currentProperty && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setShowSchedule(false)}>
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h3 className="text-base font-bold text-slate-900">Schedule Visit</h3>
                            <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleScheduleVisit} className="p-5 space-y-4">
                            <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
                                <span className="font-semibold">{specs.bedrooms ? `${specs.bedrooms}BHK ` : ''}{currentProperty.type}</span>
                                {' in '}{currentProperty.location || 'the area'}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Date</label>
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={e => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time</label>
                                <select
                                    value={scheduleTime}
                                    onChange={e => setScheduleTime(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">Select time</option>
                                    <option value="9:00 AM">9:00 AM</option>
                                    <option value="10:00 AM">10:00 AM</option>
                                    <option value="11:00 AM">11:00 AM</option>
                                    <option value="12:00 PM">12:00 PM</option>
                                    <option value="1:00 PM">1:00 PM</option>
                                    <option value="2:00 PM">2:00 PM</option>
                                    <option value="3:00 PM">3:00 PM</option>
                                    <option value="4:00 PM">4:00 PM</option>
                                    <option value="5:00 PM">5:00 PM</option>
                                    <option value="6:00 PM">6:00 PM</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                                <textarea
                                    value={scheduleNotes}
                                    onChange={e => setScheduleNotes(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                                    placeholder="Any specific requests..."
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={scheduling}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {scheduling ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                                {scheduling ? 'Scheduling...' : 'Confirm Visit'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
