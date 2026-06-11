/**
 * AddressFields — guided, type-aware, progressive address capture used by BOTH
 * the Add-inventory wizard and the Edit-inventory "Address" tab (desktop + mobile).
 *
 * Flow (one-by-one, gated on viewport — i.e. user PICK or silent geocode resolution):
 *   1. City  (Google cities autocomplete)
 *   2. → after cityViewport: Locality (Google geocode, STRICTLY scoped to city viewport)
 *   3. → after localityViewport: Sub-locality (optional) + Society/Building
 *      (Google establishment, STRICTLY scoped to locality viewport) +
 *      type-aware unit block + pincode/state
 *   4. → after a pin lands: optional, skippable map-pin confirm
 *
 * Auto-recovery: if a user TYPES a city/locality without picking from suggestions,
 * a silent google.maps.Geocoder call resolves the typed text to a viewport so
 * downstream scoping still works (and progressive disclosure opens naturally).
 *
 * Controlled component: reads from `value`, emits the full next object via `onChange`.
 * Writes only EXISTING inventory columns — no schema change.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GooglePlacesInput, type PlaceResult, type ViewportBox } from './GooglePlacesInput';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';

export type AddressLayout = 'flat' | 'house' | 'plot' | 'commercial';

export interface AddressValue {
    city?: string;
    district?: string;
    locality?: string;
    sub_locality?: string;
    state?: string;
    pincode?: string;
    apartment_name?: string;
    flat_no?: string;
    floor_number?: string | number;
    /** Kept for back-compat with the workflow commit reader; AddressFields doesn't
     *  render Total Floors (captured by the taxonomy `floors` field on the Specs tab). */
    total_floors?: string | number;
    plot_no?: string;
    latitude?: number;
    longitude?: number;
    full_address?: string;
}

/**
 * Pick an address layout from whatever signals are available. Slug regex first, then
 * fall back to the per-type flags so an empty slug (e.g. taxonomy plot node with no
 * legacy_flat_property_type_id) can't silently default to "flat".
 */
export function inferAddressLayout(opts: {
    category?: string;
    type?: string;
    slug?: string;
    mainCategory?: string;
    floorRequired?: boolean;
    plotAreaRequired?: boolean;
}): AddressLayout {
    const s = `${opts.category || ''} ${opts.type || ''} ${opts.slug || ''} ${opts.mainCategory || ''}`.toLowerCase();
    if (/plot|land|agricultur/.test(s)) return 'plot';
    if (/villa|bungalow|kothi|farm|independent.?house|\bhouse\b/.test(s)) return 'house';
    if (/commercial|shop|office|showroom|retail|warehouse|godown|industrial|factory/.test(s)) return 'commercial';
    if (opts.plotAreaRequired) return 'plot';
    if (opts.floorRequired === false) return 'plot';
    return 'flat';
}

/**
 * Whether the "Society / Apartment / Building" field is MANDATORY.
 * Only true for named-society residential — apartment / gated society / studio /
 * serviced. Optional for builder flat/floor, independent house/villa, all plots/land,
 * all commercial, agricultural (these often have no registered society/building name).
 */
export function isSocietyRequired(opts: { layout?: AddressLayout; mainCategory?: string; slug?: string }): boolean {
    if (opts.mainCategory === 'commercial' || opts.layout === 'commercial') return false;
    if (opts.layout === 'plot' || opts.layout === 'house') return false;
    const s = `${opts.slug || ''}`.toLowerCase();
    if (/builder/.test(s)) return false;
    return /apartment|gated|studio|serviced/.test(s);
}

// ── Optional draggable map pin ─────────────────────────────────────────────────
function MapPinPicker({ lat, lng, onMove }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    useEffect(() => {
        let cancelled = false;
        loadGoogleMaps().then(() => {
            if (cancelled || !ref.current) return;
            const google = (window as any).google;
            if (!google?.maps) return;
            const center = { lat, lng };
            if (!mapRef.current) {
                mapRef.current = new google.maps.Map(ref.current, { center, zoom: 16, disableDefaultUI: true, zoomControl: true });
                markerRef.current = new google.maps.Marker({ position: center, map: mapRef.current, draggable: true });
                markerRef.current.addListener('dragend', () => {
                    const p = markerRef.current.getPosition();
                    onMove(p.lat(), p.lng());
                });
            } else {
                mapRef.current.setCenter(center);
                markerRef.current.setPosition(center);
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [lat, lng]);
    return <div ref={ref} style={{ width: '100%', height: '220px', borderRadius: '8px', border: '1px solid var(--border-secondary)' }} />;
}

/**
 * Silent geocode fallback (Task 3 / Bug A): when the user types an address without
 * picking from autocomplete, resolve their text to a viewport so downstream scoping
 * + progressive disclosure still work. No-op on failure.
 */
function resolveViewport(address: string, setVp: (vp: ViewportBox) => void) {
    if (!address || !address.trim()) return;
    loadGoogleMaps().then(() => {
        const google = (window as any).google;
        if (!google?.maps) return;
        new google.maps.Geocoder().geocode(
            { address: address.trim(), componentRestrictions: { country: 'IN' } },
            (results: any[], status: string) => {
                if (status !== 'OK' || !results?.[0]?.geometry?.viewport) return;
                const vp = results[0].geometry.viewport;
                const j = typeof vp.toJSON === 'function' ? vp.toJSON() : null;
                if (j) setVp({ north: j.north, south: j.south, east: j.east, west: j.west });
            },
        );
    }).catch(() => {});
}

export default function AddressFields({
    value,
    onChange,
    layout,
    mainCategory,
    slug,
    inputStyle,
    labelStyle,
}: {
    value: AddressValue;
    onChange: (next: AddressValue) => void;
    layout: AddressLayout;
    mainCategory?: string;
    slug?: string;
    inputStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}) {
    const [cityViewport, setCityViewport] = useState<ViewportBox | undefined>(undefined);
    const [localityViewport, setLocalityViewport] = useState<ViewportBox | undefined>(undefined);
    const [showMap, setShowMap] = useState(false);

    const iStyle: React.CSSProperties = inputStyle || {
        width: '100%', padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box',
    };
    const lStyle: React.CSSProperties = labelStyle || { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block', fontWeight: 600 };
    const row: React.CSSProperties = { marginBottom: '12px' };

    const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

    // Inject z-index so Google's .pac-container sits above modals.
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = '.pac-container { z-index: 99999 !important; }';
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    // ── Task 3 (Bug A): silent geocode fallback ─────────────────────────────────
    // When city text exists without a captured viewport, resolve it once.
    // Debounced via the useEffect dependency — fires after the user pauses typing.
    useEffect(() => {
        if (cityViewport || !value.city || !value.city.toString().trim()) return;
        const t = setTimeout(() => resolveViewport(value.city as string, setCityViewport), 500);
        return () => clearTimeout(t);
    }, [value.city, cityViewport]);

    // Same for locality (scoped via "<locality>, <city>" for better hits).
    useEffect(() => {
        if (localityViewport || !value.locality || !value.locality.toString().trim()) return;
        if (!cityViewport && !value.city) return; // wait until we at least have a city text/viewport
        const t = setTimeout(() => {
            const addr = value.city ? `${value.locality}, ${value.city}` : (value.locality as string);
            resolveViewport(addr, setLocalityViewport);
        }, 500);
        return () => clearTimeout(t);
    }, [value.locality, localityViewport, cityViewport, value.city]);

    const onCity = (p: PlaceResult) => {
        if (p.viewport) setCityViewport(p.viewport);
        setLocalityViewport(undefined);
        set({
            city: p.city || p.locality || p.district,
            district: p.city || p.locality || p.district,
            state: p.state || value.state,
            // Clear downstream so the user re-picks within the new city
            locality: '',
            sub_locality: '',
            apartment_name: '',
            pincode: '',
            latitude: undefined,
            longitude: undefined,
            full_address: '',
        });
    };

    // ── Task 4 (Bug D + Kaushambi follow-up): atomic locality update.
    // Picking "Kaushambi, Ghaziabad, …" fires TWO setStates in the same event:
    //   (a) GooglePlacesInput's onChange("Kaushambi") replaces `locality`
    //   (b) our onPlaceSelect → set({…})
    // Both closures captured `value` from BEFORE the pick (where locality="kau"), so
    // React's batch merges set (b) LAST and clobbers (a) back to "kau". Fix: include
    // the picked label here so this set() is itself the source of truth. Prefer
    // place.name (the suggestion's primary label, e.g. "Kaushambi") over Google's
    // `locality` component (which is the parent CITY for sublocality picks).
    const onLocality = (p: PlaceResult) => {
        if (p.viewport) setLocalityViewport(p.viewport);
        const localityVal = p.name || p.sub_locality || value.locality;
        const subVal = p.sub_locality && p.sub_locality !== localityVal
            ? p.sub_locality
            : value.sub_locality;
        set({
            locality: localityVal,
            sub_locality: subVal,
            pincode: p.pincode || value.pincode,
            state: p.state || value.state,
            latitude: p.latitude ?? value.latitude,
            longitude: p.longitude ?? value.longitude,
            apartment_name: '',
        });
    };

    const onSociety = (p: PlaceResult) => {
        set({
            // Store the FULL picked string so storage matches what the user sees in the
            // Society input (GooglePlacesInput now emits full_address for establishment
            // picks too). Falls back to short name, then to whatever was already there.
            apartment_name: p.full_address || p.name || value.apartment_name,
            pincode: value.pincode || p.pincode,
            // Building pin is CANONICAL — overwrite any coarser locality pin
            latitude: p.latitude ?? value.latitude,
            longitude: p.longitude ?? value.longitude,
            full_address: p.full_address || value.full_address,
        });
    };

    const isPlot = layout === 'plot';
    const societyOptional = !isSocietyRequired({ layout, mainCategory, slug });
    const societyLabel = layout === 'commercial' ? 'Building Name'
        : layout === 'house' ? 'Project / Building'
        : isPlot ? 'Society / Colony'
        : 'Society / Apartment';
    const unitLabel = layout === 'commercial' ? 'Unit / Shop No' : 'Flat / Unit No';

    // ── Viewport-gated progressive disclosure ───────────────────────────────────
    // Locality reveals once we have a cityViewport (= user picked OR auto-geocode
    // resolved the typed city). Sub-locality / Society / unit block / pincode all
    // reveal together once localityViewport is set — Flat/Floor/Plot must be
    // fillable independent of Society (you might know the plot/flat number before
    // you know the building, or there's no society at all).
    const showLocality = !!cityViewport;
    const showAfterLocality = !!localityViewport;
    const showUnitBlock = showAfterLocality;
    const showMapToggle = value.latitude != null && value.longitude != null;

    return (
        <div onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
            {/* 1. City */}
            <div style={row}>
                <label style={lStyle}>City *</label>
                <GooglePlacesInput
                    mode="cities"
                    value={value.city || ''}
                    onChange={v => set({ city: v, district: v })}
                    onPlaceSelect={onCity}
                    placeholder="Start typing your city…"
                    style={iStyle}
                />
            </div>

            {/* 2. Locality — revealed once city viewport is captured (pick or silent geocode) */}
            {showLocality && (
                <div style={row}>
                    <label style={lStyle}>Locality / Sector *</label>
                    <GooglePlacesInput
                        mode="geocode"
                        value={value.locality || ''}
                        onChange={v => set({ locality: v })}
                        onPlaceSelect={onLocality}
                        placeholder={`Locality inside ${value.city || ''}…`}
                        style={iStyle}
                        bounds={cityViewport}
                        strictBounds
                    />
                </div>
            )}

            {/* 3+. After locality viewport: sub-locality, society (if applicable), unit block, pincode/state */}
            {showAfterLocality && (
                <>
                    <div style={row}>
                        <label style={lStyle}>Sub-locality (optional)</label>
                        <input style={iStyle} value={value.sub_locality || ''} onChange={e => set({ sub_locality: e.target.value })} placeholder="Block / pocket / nearby landmark" />
                    </div>

                    {!isPlot && (
                        <div style={row}>
                            <label style={lStyle}>{societyLabel}{societyOptional ? '' : ' *'}</label>
                            <GooglePlacesInput
                                mode="establishment"
                                value={value.apartment_name || ''}
                                onChange={v => set({ apartment_name: v })}
                                onPlaceSelect={onSociety}
                                placeholder={`Building / society inside ${value.locality || value.city || ''}…`}
                                style={iStyle}
                                bounds={localityViewport}
                                strictBounds
                            />
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                Pick from suggestions for an exact map pin, or type the name if it’s not listed.
                            </div>
                        </div>
                    )}

                    {showUnitBlock && (
                        <div style={{ display: 'grid', gridTemplateColumns: (isPlot || layout === 'house') ? '1fr 1fr' : '1fr 1fr 1fr', gap: '10px', ...row }}>
                            {isPlot ? (
                                <div style={{ gridColumn: 'span 1' }}>
                                    <label style={lStyle}>Plot No</label>
                                    <input style={iStyle} value={value.plot_no || ''} onChange={e => set({ plot_no: e.target.value })} placeholder="e.g. Plot 42" />
                                </div>
                            ) : layout === 'house' ? (
                                <div style={{ gridColumn: 'span 1' }}>
                                    <label style={lStyle}>House / Plot No</label>
                                    <input style={iStyle} value={value.plot_no || ''} onChange={e => set({ plot_no: e.target.value })} placeholder="e.g. H-12" />
                                </div>
                            ) : (
                                <>
                                    <div><label style={lStyle}>{unitLabel}</label><input style={iStyle} value={value.flat_no || ''} onChange={e => set({ flat_no: e.target.value })} placeholder="e.g. A-1201" /></div>
                                    <div><label style={lStyle}>Floor</label><input style={iStyle} type="number" value={value.floor_number ?? ''} onChange={e => set({ floor_number: e.target.value })} placeholder="e.g. 3" /></div>
                                    {/* Plot/Khasra optional — some apartment registries DO record one; honour it if user provides. */}
                                    <div><label style={lStyle}>Plot / Khasra No (optional)</label><input style={iStyle} value={value.plot_no || ''} onChange={e => set({ plot_no: e.target.value })} placeholder="e.g. Plot 42 / Khasra 1234" /></div>
                                </>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', ...row }}>
                        <div><label style={lStyle}>Pincode</label><input style={iStyle} value={value.pincode || ''} onChange={e => set({ pincode: e.target.value })} placeholder="e.g. 201019" /></div>
                        <div><label style={lStyle}>State</label><input style={iStyle} value={value.state || ''} onChange={e => set({ state: e.target.value })} placeholder="e.g. Uttar Pradesh" /></div>
                    </div>

                    {showMapToggle && (
                        <div style={row}>
                            <button type="button" onClick={() => setShowMap(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>
                                📍 {showMap ? 'Hide map' : 'Adjust pin on map (optional)'}
                            </button>
                            {showMap && (
                                <div style={{ marginTop: '8px' }}>
                                    <MapPinPicker lat={value.latitude!} lng={value.longitude!} onMove={(la, ln) => set({ latitude: la, longitude: ln })} />
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Drag the pin to the exact location. Optional — skip if it’s already correct.</div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
