'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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
}

interface GooglePlacesInputProps {
    value: string;
    onChange: (value: string) => void;
    onPlaceSelect: (place: PlaceResult) => void;
    placeholder?: string;
    className?: string;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(callback: () => void) {
    if (scriptLoaded && (window as any).google?.maps?.places) {
        callback();
        return;
    }
    loadCallbacks.push(callback);
    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
        scriptLoaded = true;
        scriptLoading = false;
        loadCallbacks.forEach(cb => cb());
        loadCallbacks.length = 0;
    };
    script.onerror = () => {
        scriptLoading = false;
    };
    document.head.appendChild(script);
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

export function GooglePlacesInput({
    value,
    onChange,
    onPlaceSelect,
    placeholder = 'Search address...',
    className,
}: GooglePlacesInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(() => !GOOGLE_MAPS_KEY);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalChangeRef = useRef(false);

    // Sync input value from parent (e.g. clear filters) — without disrupting Google autocomplete
    useEffect(() => {
        if (inputRef.current && !internalChangeRef.current) {
            inputRef.current.value = value;
        }
        internalChangeRef.current = false;
    }, [value]);

    useEffect(() => {
        if (!GOOGLE_MAPS_KEY) return;
        loadGoogleMapsScript(() => {
            const google = (window as any).google;
            if (google?.maps?.places) {
                setReady(true);
            } else {
                setFailed(true);
            }
        });
        const timer = setTimeout(() => {
            if (!(window as any).google?.maps?.places) setFailed(true);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!ready || !inputRef.current || autocompleteRef.current) return;

        const google = (window as any).google;
        if (!google?.maps?.places) return;

        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ['address_components', 'geometry', 'name', 'formatted_address'],
            types: ['(regions)'],
            componentRestrictions: { country: 'in' },
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.address_components) return;

            const sub_locality =
                extractComponent(place, 'sublocality_level_1') ||
                extractComponent(place, 'sublocality') ||
                extractComponent(place, 'neighborhood');
            const locality = extractComponent(place, 'locality');
            const district =
                extractComponent(place, 'administrative_area_level_2') ||
                locality;
            const state = extractComponent(place, 'administrative_area_level_1');
            const pincode = extractComponent(place, 'postal_code');
            const country = extractComponent(place, 'country');
            const full_address = place.formatted_address || '';
            const latitude = place.geometry?.location?.lat();
            const longitude = place.geometry?.location?.lng();

            const displayText = locality || sub_locality || district || full_address;
            internalChangeRef.current = true;
            onChange(displayText);
            onPlaceSelect({ sub_locality, locality, district, state, pincode, full_address, country, latitude, longitude });
        });

        autocompleteRef.current = autocomplete;
    }, [ready]);

    // On typing: update input locally, debounce parent notification
    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            internalChangeRef.current = true;
            onChange(e.target.value);
        }, 800);
    }, [onChange]);

    // On blur: sync immediately
    const handleBlur = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (inputRef.current) {
            internalChangeRef.current = true;
            onChange(inputRef.current.value);
        }
    }, [onChange]);

    const inputEnabled = ready || failed;

    return (
        <input
            ref={inputRef}
            type="text"
            defaultValue={value}
            onChange={handleInput}
            onBlur={handleBlur}
            placeholder={inputEnabled ? placeholder : 'Loading Google Places...'}
            className={className}
            disabled={!inputEnabled}
            aria-label={placeholder || 'Search location'}
        />
    );
}
