'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, MapPin, ExternalLink } from 'lucide-react';
import type { Landmark } from '@/lib/api';

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Dark mode map styles
const DARK_MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
];

interface PropertyMapProps {
    latitude?: number | null;
    longitude?: number | null;
    location: string;
    city?: string | null;
    landmarks?: Landmark[];
}

// Singleton Google Maps script loader
let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(callback: () => void) {
    if (scriptLoaded) { callback(); return; }
    loadCallbacks.push(callback);
    if (scriptLoading) return;
    scriptLoading = true;

    (window as any).__gmapsCallback = () => {
        scriptLoaded = true;
        scriptLoading = false;
        loadCallbacks.forEach(cb => cb());
        loadCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=__gmapsCallback`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

const LANDMARK_COLORS: Record<string, string> = {
    school: '#4CAF50',
    hospital: '#F44336',
    transit_station: '#2196F3',
    shopping_mall: '#FF9800',
    park: '#8BC34A',
};

export default function PropertyMap({ latitude, longitude, location, city, landmarks = [] }: PropertyMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const [expanded, setExpanded] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    const [isDark, setIsDark] = useState(false);

    // Detect dark mode
    useEffect(() => {
        const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkDark();
        const observer = new MutationObserver(checkDark);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const initMap = useCallback(() => {
        if (!mapRef.current || !GOOGLE_MAPS_KEY) return;

        const hasCoords = latitude && longitude;
        const center = hasCoords
            ? { lat: latitude!, lng: longitude! }
            : { lat: 28.6139, lng: 77.209 }; // Default: Delhi

        const map = new (window as any).google.maps.Map(mapRef.current, {
            center,
            zoom: hasCoords ? 15 : 12,
            styles: isDark ? DARK_MAP_STYLES : [],
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
        });

        mapInstanceRef.current = map;

        if (hasCoords) {
            // Property marker (red)
            new (window as any).google.maps.Marker({
                position: center,
                map,
                title: location,
                icon: {
                    path: (window as any).google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#EF4444',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                },
            });

            // Landmark markers (colored by type)
            landmarks.forEach(lm => {
                if (lm.lat && lm.lng) {
                    new (window as any).google.maps.Marker({
                        position: { lat: lm.lat, lng: lm.lng },
                        map,
                        title: `${lm.name} (${lm.distance_km} km)`,
                        icon: {
                            path: (window as any).google.maps.SymbolPath.CIRCLE,
                            scale: 7,
                            fillColor: LANDMARK_COLORS[lm.type] || '#9E9E9E',
                            fillOpacity: 0.9,
                            strokeColor: '#ffffff',
                            strokeWeight: 1.5,
                        },
                    });
                }
            });
        } else {
            // Geocode by location name
            const geocoder = new (window as any).google.maps.Geocoder();
            geocoder.geocode({ address: `${location}${city ? ', ' + city : ''}, India` }, (results: any[], status: string) => {
                if (status === 'OK' && results[0]) {
                    map.setCenter(results[0].geometry.location);
                    new (window as any).google.maps.Marker({
                        position: results[0].geometry.location,
                        map,
                        title: location,
                    });
                }
            });
        }

        setMapReady(true);
    }, [latitude, longitude, location, city, landmarks, isDark]);

    useEffect(() => {
        if (!GOOGLE_MAPS_KEY) return;
        loadGoogleMapsScript(initMap);
    }, [initMap]);

    // Re-apply styles on dark mode change
    useEffect(() => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setOptions({ styles: isDark ? DARK_MAP_STYLES : [] });
        }
    }, [isDark]);

    // Resize map when expanding/collapsing
    useEffect(() => {
        if (mapInstanceRef.current) {
            setTimeout(() => {
                (window as any).google?.maps?.event?.trigger(mapInstanceRef.current, 'resize');
            }, 100);
        }
    }, [expanded]);

    if (!GOOGLE_MAPS_KEY) {
        // Fallback: Google Maps link
        return (
            <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location + (city ? ', ' + city : ''))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group"
            >
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                    <MapPin className="w-6 h-6" />
                </div>
                <div className="flex-1">
                    <div className="text-slate-900 dark:text-white font-semibold text-sm">View on Google Maps</div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs">{location}{city ? `, ${city}` : ''}</div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
            </a>
        );
    }

    return (
        <>
            <div id="property-map" className={`relative ${expanded ? 'fixed inset-0 z-40' : ''}`}>
                <div
                    ref={mapRef}
                    className={`w-full bg-slate-200 dark:bg-slate-800 ${expanded ? 'h-full' : 'h-72 md:h-80 rounded-xl'}`}
                />

                {/* Loading placeholder */}
                {!mapReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                            <MapPin className="w-8 h-8 animate-pulse" />
                            <span className="text-sm">Loading map...</span>
                        </div>
                    </div>
                )}

                {/* Expand/Collapse button */}
                <button
                    onClick={() => setExpanded(prev => !prev)}
                    className={`absolute ${expanded ? 'top-4 right-4' : 'bottom-3 right-3'} p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors z-10`}
                    aria-label={expanded ? 'Minimize map' : 'Expand map'}
                >
                    {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Open in Google Maps link */}
                <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location + (city ? ', ' + city : ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`absolute ${expanded ? 'top-4 right-16' : 'bottom-3 right-14'} p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors z-10`}
                    aria-label="Open in Google Maps"
                >
                    <ExternalLink className="w-4 h-4" />
                </a>

                {/* Legend (only in expanded mode) */}
                <AnimatePresence>
                    {expanded && landmarks.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="absolute bottom-4 left-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-lg z-10"
                        >
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Legend</div>
                            <div className="space-y-1">
                                <LegendItem color="#EF4444" label="Property" />
                                {Object.entries(LANDMARK_COLORS).map(([type, color]) => (
                                    <LegendItem key={type} color={color} label={type.replace(/_/g, ' ')} />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Backdrop when expanded */}
            {expanded && <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setExpanded(false)} />}
        </>
    );
}

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="capitalize">{label}</span>
        </div>
    );
}
