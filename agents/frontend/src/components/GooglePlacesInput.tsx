
import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';

export interface ViewportBox {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface PlaceResult {
    sub_locality: string;
    locality: string;
    district: string;
    state: string;
    pincode: string;
    full_address: string;
    country: string;
    latitude?: number;
    longitude?: number;
    /** Establishment name (society/building) — only populated in mode="establishment". */
    name?: string;
    /** Best-effort city — locality or district (handy in mode="cities"). */
    city?: string;
    /** Google's actual viewport for the pick — used to STRICTLY scope subsequent autocompletes. */
    viewport?: ViewportBox;
}

type PlacesMode = 'geocode' | 'cities' | 'establishment';

interface GooglePlacesInputProps {
    value: string;
    onChange: (value: string) => void;
    onPlaceSelect: (place: PlaceResult) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    className?: string;
    mode?: PlacesMode;
    /** Bias suggestions to a ~25km box around this point. Use `bounds` for STRICT scoping. */
    biasLat?: number;
    biasLng?: number;
    /** STRICT bounding box — when set with `strictBounds`, Google won't suggest anything outside. */
    bounds?: ViewportBox;
    /** Force suggestions to stay inside `bounds` (or the bias box). Hard filter, not a hint. */
    strictBounds?: boolean;
    disabled?: boolean;
}

const SHORT_NAME_TYPES = new Set(['street_number', 'postal_code']);

function extractComponent(place: any, type: string): string {
    for (const component of place.address_components || []) {
        if (component.types.includes(type)) {
            return SHORT_NAME_TYPES.has(type) ? component.short_name : component.long_name;
        }
    }
    return '';
}

function typesForMode(mode: PlacesMode): string[] {
    if (mode === 'cities') return ['(cities)'];
    if (mode === 'establishment') return ['establishment'];
    return ['geocode'];
}

export const GooglePlacesInput: React.FC<GooglePlacesInputProps> = ({
    value,
    onChange,
    onPlaceSelect,
    placeholder = 'Search address...',
    style,
    mode = 'geocode',
    biasLat,
    biasLng,
    bounds,
    strictBounds = false,
    disabled = false,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // ── Latest-ref pattern (fixes the City→"G" clobber, Bug C) ─────────────────
    // Google's place_changed listener is attached ONCE per autocomplete instance
    // but must always call the freshest onChange/onPlaceSelect — otherwise it
    // captures stale React state (the snapshot at first mount) and clobbers
    // parent fields when the user later picks from this input's suggestions.
    const onChangeRef = useRef(onChange);
    const onPlaceRef = useRef(onPlaceSelect);
    const modeRef = useRef(mode);
    useEffect(() => { onChangeRef.current = onChange; });
    useEffect(() => { onPlaceRef.current = onPlaceSelect; });
    useEffect(() => { modeRef.current = mode; });

    useEffect(() => {
        loadGoogleMaps()
            .then(() => setReady(true))
            .catch(() => setFailed(true));
        const timer = setTimeout(() => {
            if (!(window as any).google?.maps?.places) setFailed(true);
        }, 8000);
        return () => clearTimeout(timer);
    }, []);

    // ── Single autocomplete-lifecycle effect (fixes Bug B) ──────────────────────
    // Legacy google.maps.places.Autocomplete reads `strictBounds`/`bounds` ONLY
    // at construction — `setOptions({strictBounds: …})` is silently ignored.
    // So we recreate the widget whenever either changes. Serialize `bounds` to a
    // primitive key so React's dep-array detects changes.
    const boundsKey = bounds ? `${bounds.south},${bounds.west},${bounds.north},${bounds.east}` : '';

    useEffect(() => {
        if (!ready || !inputRef.current) return;
        const google = (window as any).google;
        if (!google?.maps?.places) return;

        // Tear down any prior instance
        if (autocompleteRef.current) {
            google.maps.event.clearInstanceListeners(autocompleteRef.current);
            autocompleteRef.current = null;
        }

        const options: any = {
            fields: ['address_components', 'geometry', 'name', 'formatted_address'],
            types: typesForMode(mode),
            componentRestrictions: { country: 'in' },
            strictBounds,
        };
        if (bounds) {
            options.bounds = new google.maps.LatLngBounds(
                { lat: bounds.south, lng: bounds.west },
                { lat: bounds.north, lng: bounds.east },
            );
        } else if (biasLat != null && biasLng != null) {
            const d = 0.22; // ~25km bias box
            options.bounds = new google.maps.LatLngBounds(
                { lat: biasLat - d, lng: biasLng - d },
                { lat: biasLat + d, lng: biasLng + d },
            );
        }

        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, options);

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.address_components && !place.geometry) return;

            const sub_locality =
                extractComponent(place, 'sublocality_level_1') ||
                extractComponent(place, 'sublocality') ||
                extractComponent(place, 'neighborhood');
            const locality = extractComponent(place, 'locality');
            const district =
                extractComponent(place, 'administrative_area_level_2') || locality;
            const state = extractComponent(place, 'administrative_area_level_1');
            const pincode = extractComponent(place, 'postal_code');
            const country = extractComponent(place, 'country');
            const full_address = place.formatted_address || place.name || '';
            const latitude = place.geometry?.location?.lat();
            const longitude = place.geometry?.location?.lng();
            // Emit place.name for ALL modes — Locality picks need it so the parent can
            // store the picked label ("Kaushambi") instead of leaving the typed text ("kau").
            const name = place.name || '';
            const city = locality || district || '';
            let viewport: ViewportBox | undefined;
            const vp = place.geometry?.viewport;
            if (vp && typeof vp.toJSON === 'function') {
                const j = vp.toJSON();
                viewport = { north: j.north, south: j.south, east: j.east, west: j.west };
            } else if (vp) {
                try {
                    const ne = vp.getNorthEast(), sw = vp.getSouthWest();
                    viewport = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
                } catch { /* viewport unusable */ }
            }

            // Latest-ref calls — always the freshest parent handlers.
            // All modes emit the full formatted address so the input shows what was
            // picked (Society/Locality/City). Falls back to place.name for rare picks
            // that have no formatted_address.
            onChangeRef.current(full_address || place.name || '');
            onPlaceRef.current({ sub_locality, locality, district, state, pincode, full_address, country, latitude, longitude, name, city, viewport });
        });

        autocompleteRef.current = autocomplete;

        return () => {
            try { google.maps.event.clearInstanceListeners(autocomplete); } catch { /* ignore */ }
        };
    }, [ready, mode, strictBounds, boundsKey, biasLat, biasLng]);

    const defaultStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '13px',
        outline: 'none',
        boxSizing: 'border-box',
    };

    const inputEnabled = (ready || failed) && !disabled;

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={inputEnabled ? placeholder : (disabled ? '— fill the previous field first —' : 'Loading Google Places...')}
            autoComplete="off"
            name="rp-places-search"
            style={{ ...defaultStyle, ...style, ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null) }}
            disabled={!inputEnabled}
        />
    );
};
