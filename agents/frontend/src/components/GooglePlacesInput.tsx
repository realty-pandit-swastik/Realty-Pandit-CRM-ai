
import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';

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
    style?: React.CSSProperties;
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

export const GooglePlacesInput: React.FC<GooglePlacesInputProps> = ({
    value,
    onChange,
    onPlaceSelect,
    placeholder = 'Search address...',
    style,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        loadGoogleMaps()
            .then(() => setReady(true))
            .catch(() => setFailed(true));
        // Timeout: if Google script hasn't loaded in 8s, enable input anyway
        const timer = setTimeout(() => {
            if (!(window as any).google?.maps?.places) {
                setFailed(true);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!ready || !inputRef.current || autocompleteRef.current) return;

        const google = (window as any).google;
        if (!google?.maps?.places) return;

        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ['address_components', 'geometry', 'name', 'formatted_address'],
            types: ['geocode'],
            componentRestrictions: { country: 'in' }, // India only
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

            onChange(full_address);
            onPlaceSelect({ sub_locality, locality, district, state, pincode, full_address, country, latitude, longitude });
        });

        autocompleteRef.current = autocomplete;
    }, [ready]);

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

    // Never disable the input — let users type manually even if Google API fails
    const inputEnabled = ready || failed;

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={inputEnabled ? placeholder : 'Loading Google Places...'}
            style={{ ...defaultStyle, ...style }}
            disabled={!inputEnabled}
        />
    );
};
