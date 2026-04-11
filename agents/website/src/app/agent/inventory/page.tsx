'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Check, ChevronRight, ChevronLeft, Building2, MapPin, IndianRupee,
    FileText, Eye, Plus, Loader2, Image, Video, X, Star,
} from 'lucide-react';
import api, { getMediaUrl } from '@/lib/api';

// ─── Google Places ────────────────────────────────────────────────────────────

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
let _gMapsLoaded = false;
let _gMapsLoading = false;
const _gMapsCallbacks: (() => void)[] = [];

function loadGoogleMaps(cb: () => void) {
    if (_gMapsLoaded && (window as any).google?.maps?.places) { cb(); return; }
    _gMapsCallbacks.push(cb);
    if (_gMapsLoading) return;
    _gMapsLoading = true;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    s.async = true;
    s.onload = () => { _gMapsLoaded = true; _gMapsLoading = false; _gMapsCallbacks.forEach(f => f()); _gMapsCallbacks.length = 0; };
    s.onerror = () => { _gMapsLoading = false; };
    document.head.appendChild(s);
}

interface PlaceResult {
    sub_locality: string; locality: string; district: string;
    state: string; pincode: string; full_address: string;
    latitude?: number; longitude?: number;
}

function extractComp(place: any, type: string): string {
    for (const c of place.address_components || []) {
        if (c.types.includes(type)) return ['street_number', 'postal_code'].includes(type) ? c.short_name : c.long_name;
    }
    return '';
}

function GooglePlacesInput({ value, onChange, onSelect }: {
    value: string; onChange: (v: string) => void; onSelect: (p: PlaceResult) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const acRef = useRef<any>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        loadGoogleMaps(() => setReady(true));
        const t = setTimeout(() => setReady(true), 8000);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!ready || !ref.current || acRef.current) return;
        const google = (window as any).google;
        if (!google?.maps?.places) return;
        const ac = new google.maps.places.Autocomplete(ref.current, {
            fields: ['address_components', 'geometry', 'formatted_address'],
            types: ['geocode'],
            componentRestrictions: { country: 'in' },
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            if (!place.address_components) return;
            const sub_locality = extractComp(place, 'sublocality_level_1') || extractComp(place, 'sublocality') || extractComp(place, 'neighborhood');
            const locality = extractComp(place, 'locality');
            const district = extractComp(place, 'administrative_area_level_2') || locality;
            const state = extractComp(place, 'administrative_area_level_1');
            const pincode = extractComp(place, 'postal_code');
            const full_address = place.formatted_address || '';
            const latitude = place.geometry?.location?.lat();
            const longitude = place.geometry?.location?.lng();
            onChange(full_address);
            onSelect({ sub_locality, locality, district, state, pincode, full_address, latitude, longitude });
        });
        acRef.current = ac;
    }, [ready]);

    return (
        <input
            ref={ref}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={ready ? 'Search address on Google Maps...' : 'Loading Google Maps...'}
            className={inputCls}
        />
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
    id: string; display_id?: string; intent: string; category: string; type: string;
    location: string; full_address?: string; locality?: string; sub_locality?: string;
    district?: string; state?: string; pincode?: string;
    latitude?: number | null; longitude?: number | null;
    price: number | null; price_unit: string; specs: any; features?: any;
    status: string; description: string | null; furnishing: string | null;
    facing?: string; property_age?: string; total_floors?: number | null;
    flat_no?: string; floor_number?: number | null; apartment_name?: string; plot_no?: string;
    media_urls: string[]; video_urls?: string[];
    uploader_name?: string; owner_phone?: string; created_at: string;
}

type WizardStep = 'intent' | 'source' | 'property_type' | 'location' | 'specs' | 'amenities' | 'pricing' | 'media' | 'description' | 'confirm' | 'success';

interface FormData {
    intent: string; category: string; type: string;
    lead_reference: string;
    // Address
    google_address: string;
    flat_no: string; floor_number: string; apartment_name: string;
    plot_no: string; sub_locality: string; locality: string;
    district: string; state: string; pincode: string;
    full_address: string; latitude: string; longitude: string;
    // Specs
    bedrooms: string; bathrooms: string; area: string; area_unit: string;
    furnishing: string; total_floors: string; facing: string; property_age: string;
    // Amenities
    amenities: string[];
    // Pricing
    price: string; price_unit: string;
    // Description
    description: string;
}

const INITIAL_FORM: FormData = {
    intent: 'sell', category: 'residential', type: 'flat',
    lead_reference: '',
    google_address: '', flat_no: '', floor_number: '', apartment_name: '',
    plot_no: '', sub_locality: '', locality: '', district: '', state: '', pincode: '',
    full_address: '', latitude: '', longitude: '',
    bedrooms: '', bathrooms: '', area: '', area_unit: 'sqft',
    furnishing: '', total_floors: '', facing: '', property_age: '',
    amenities: [],
    price: '', price_unit: 'Lakh',
    description: '',
};

const STEPS: WizardStep[] = ['intent', 'source', 'property_type', 'location', 'specs', 'amenities', 'pricing', 'media', 'description', 'confirm'];

const STEP_LABELS: Record<WizardStep, string> = {
    intent: 'Intent', source: 'Source', property_type: 'Type',
    location: 'Location', specs: 'Specs', amenities: 'Amenities',
    pricing: 'Price', media: 'Photos', description: 'Details',
    confirm: 'Confirm', success: 'Done',
};

const PROPERTY_TYPES = [
    { value: 'flat', label: 'Flat / Apartment', cat: 'residential' },
    { value: 'house', label: 'House / Villa', cat: 'residential' },
    { value: 'plot', label: 'Residential Plot', cat: 'residential' },
    { value: 'pg', label: 'PG / Hostel', cat: 'residential' },
    { value: 'farm_house', label: 'Farm House', cat: 'residential' },
    { value: 'office', label: 'Office Space', cat: 'commercial' },
    { value: 'shop', label: 'Shop / Showroom', cat: 'commercial' },
    { value: 'warehouse', label: 'Warehouse / Godown', cat: 'commercial' },
    { value: 'commercial_land', label: 'Commercial Land', cat: 'commercial' },
    { value: 'industrial_land', label: 'Industrial Land', cat: 'commercial' },
    { value: 'farm_land', label: 'Farm Land', cat: 'agricultural' },
];

const FURNISHING = [
    { value: 'unfurnished', label: 'Unfurnished' },
    { value: 'semi_furnished', label: 'Semi Furnished' },
    { value: 'fully_furnished', label: 'Fully Furnished' },
];

const FACING = ['North', 'South', 'East', 'West', 'North East', 'North West', 'South East', 'South West'];
const PROPERTY_AGE_OPTS = [
    { value: 'new', label: 'New Construction' },
    { value: '0-1', label: 'Less than 1 year' },
    { value: '1-3', label: '1–3 years' },
    { value: '3-5', label: '3–5 years' },
    { value: '5-10', label: '5–10 years' },
    { value: '10+', label: '10+ years' },
];

const AMENITIES = [
    'parking', 'lift', 'security', 'power_backup', 'swimming_pool', 'gym',
    'garden', 'club_house', 'wifi', 'air_conditioning', 'balcony', 'cctv',
    'visitor_parking', 'water_supply', 'gas_pipeline', 'gated_community',
    'fire_safety', 'solar_panels', 'rainwater_harvesting', 'intercom',
];

const AMENITY_LABELS: Record<string, string> = {
    parking: 'Parking', lift: 'Lift / Elevator', security: 'Security',
    power_backup: 'Power Backup', swimming_pool: 'Swimming Pool', gym: 'Gym / Fitness',
    garden: 'Garden / Park', club_house: 'Club House', wifi: 'WiFi Ready',
    air_conditioning: 'Air Conditioning', balcony: 'Balcony', cctv: 'CCTV',
    visitor_parking: 'Visitor Parking', water_supply: '24x7 Water Supply', gas_pipeline: 'Gas Pipeline',
    gated_community: 'Gated Community', fire_safety: 'Fire Safety', solar_panels: 'Solar Panels',
    rainwater_harvesting: 'Rainwater Harvesting', intercom: 'Intercom',
};

const SOURCE_OPTIONS = [
    { value: 'owner', label: 'Owner', desc: 'Property owner directly' },
    { value: 'agent', label: 'Agent', desc: 'Another real estate agent' },
    { value: 'dealer', label: 'Dealer', desc: 'Property dealer' },
    { value: 'financer', label: 'Financer', desc: 'Bank / financial institution' },
    { value: 'builder', label: 'Builder', desc: 'Developer / builder' },
    { value: 'other', label: 'Other', desc: 'Other source' },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder-slate-400';
const selectCls = `${inputCls} cursor-pointer`;
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

function req(label: string) {
    return <><span>{label}</span><span className="text-red-500 ml-0.5">*</span></>;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ current }: { current: WizardStep }) {
    const activeIdx = STEPS.indexOf(current);
    return (
        <div className="flex gap-1 mb-7 overflow-x-auto pb-1">
            {STEPS.map((step, i) => {
                const isDone = i < activeIdx;
                const isActive = i === activeIdx;
                return (
                    <div key={step} className={`flex-1 min-w-[44px] flex flex-col items-center gap-1 py-2 px-0.5 rounded-xl transition-all ${
                        isDone ? 'bg-green-50 border border-green-200' :
                        isActive ? 'bg-blue-50 border border-blue-300 shadow-sm' :
                        'bg-slate-50 border border-slate-100'
                    }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            isDone ? 'bg-green-500' : isActive ? 'bg-blue-600' : 'bg-slate-200'
                        }`}>
                            {isDone
                                ? <Check size={11} className="text-white" />
                                : <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{i + 1}</span>
                            }
                        </div>
                        <span className={`text-[10px] font-medium hidden sm:block leading-tight text-center ${
                            isDone ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-slate-400'
                        }`}>{STEP_LABELS[step]}</span>
                    </div>
                );
            })}
        </div>
    );
}

function OptionBtn({ label, sublabel, selected, onClick }: { label: string; sublabel?: string; selected: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all text-left ${
                selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
            }`}>
            <div className="font-semibold">{label}</div>
            {sublabel && <div className="text-xs text-slate-400 mt-0.5">{sublabel}</div>}
        </button>
    );
}

// ─── Step: Intent ─────────────────────────────────────────────────────────────

function StepIntent({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">What do you want to do with this property?</p>
            <div className="grid grid-cols-3 gap-3">
                {[['sell', 'Transfer ownership'], ['rent', 'Monthly rental'], ['lease', 'Long-term lease']].map(([v, d]) => (
                    <OptionBtn key={v} label={v.charAt(0).toUpperCase() + v.slice(1)} sublabel={d} selected={form.intent === v} onClick={() => set('intent', v)} />
                ))}
            </div>
        </div>
    );
}

// ─── Step: Source ─────────────────────────────────────────────────────────────

function StepSource({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">Where did you get this inventory from?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SOURCE_OPTIONS.map(s => (
                    <OptionBtn key={s.value} label={s.label} sublabel={s.desc} selected={form.lead_reference === s.value} onClick={() => set('lead_reference', s.value)} />
                ))}
            </div>
            <button type="button" onClick={() => set('lead_reference', '')}
                className="text-xs text-slate-400 hover:text-slate-600 underline">Skip this step</button>
        </div>
    );
}

// ─── Step: Property Type ──────────────────────────────────────────────────────

function StepPropertyType({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    const filtered = PROPERTY_TYPES.filter(t => t.cat === form.category);
    return (
        <div className="space-y-5">
            <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Category</p>
                <div className="flex flex-wrap gap-2">
                    {['residential', 'commercial', 'agricultural'].map(c => (
                        <OptionBtn key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} selected={form.category === c}
                            onClick={() => { set('category', c); set('type', ''); }} />
                    ))}
                </div>
            </div>
            {form.category && (
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Property Type</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {filtered.map(t => (
                            <OptionBtn key={t.value} label={t.label} selected={form.type === t.value} onClick={() => set('type', t.value)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Step: Location ───────────────────────────────────────────────────────────

function StepLocation({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    const handlePlace = (p: PlaceResult) => {
        set('sub_locality', p.sub_locality);
        set('locality', p.locality);
        set('district', p.district);
        set('state', p.state);
        set('pincode', p.pincode);
        set('full_address', p.full_address);
        if (p.latitude) set('latitude', String(p.latitude));
        if (p.longitude) set('longitude', String(p.longitude));
    };

    return (
        <div className="space-y-4">
            {/* Google autocomplete */}
            <div>
                <label className={labelCls}>Search on Google Maps</label>
                <GooglePlacesInput
                    value={form.google_address}
                    onChange={v => set('google_address', v)}
                    onSelect={handlePlace}
                />
                <p className="text-xs text-slate-400 mt-1">Selecting an address will auto-fill the fields below</p>
            </div>

            <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Address Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Flat / Unit No.</label>
                        <input className={inputCls} placeholder="e.g. B-1204" value={form.flat_no} onChange={e => set('flat_no', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>Floor No.</label>
                        <input type="number" className={inputCls} placeholder="e.g. 4" value={form.floor_number} onChange={e => set('floor_number', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>Society / Building Name</label>
                        <input className={inputCls} placeholder="e.g. Gaur City 2" value={form.apartment_name} onChange={e => set('apartment_name', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>Plot No.</label>
                        <input className={inputCls} placeholder="e.g. Plot 42" value={form.plot_no} onChange={e => set('plot_no', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                        <label className={labelCls}>{req('Sub Locality')}</label>
                        <input className={inputCls} placeholder="e.g. Sector 150, Phase 2" required value={form.sub_locality} onChange={e => set('sub_locality', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>{req('Locality')}</label>
                        <input className={inputCls} placeholder="e.g. Noida Extension" required value={form.locality} onChange={e => set('locality', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>{req('District / City')}</label>
                        <input className={inputCls} placeholder="e.g. Gautam Buddh Nagar" required value={form.district} onChange={e => set('district', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>{req('State')}</label>
                        <input className={inputCls} placeholder="e.g. Uttar Pradesh" required value={form.state} onChange={e => set('state', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>Pincode</label>
                        <input className={inputCls} placeholder="6-digit" maxLength={6} value={form.pincode} onChange={e => set('pincode', e.target.value)} />
                    </div>
                </div>

                {/* Lat/Lng display */}
                {(form.latitude || form.longitude) && (
                    <div className="mt-3 flex gap-3">
                        <div className="flex-1">
                            <label className={labelCls}>Latitude</label>
                            <input className={inputCls} readOnly value={form.latitude} onChange={e => set('latitude', e.target.value)} />
                        </div>
                        <div className="flex-1">
                            <label className={labelCls}>Longitude</label>
                            <input className={inputCls} readOnly value={form.longitude} onChange={e => set('longitude', e.target.value)} />
                        </div>
                    </div>
                )}
                {form.latitude && form.longitude && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                        <MapPin size={11} /> GPS coordinates captured from Google Maps
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Step: Specs ──────────────────────────────────────────────────────────────

function StepSpecs({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    const showBhk = ['flat', 'house', 'pg', 'farm_house'].includes(form.type);
    const showFloor = ['flat', 'office', 'shop'].includes(form.type);
    return (
        <div className="space-y-4">
            {showBhk && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Bedrooms</label>
                        <input type="number" min={0} className={inputCls} placeholder="e.g. 3" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)} />
                    </div>
                    <div>
                        <label className={labelCls}>Bathrooms</label>
                        <input type="number" min={0} className={inputCls} placeholder="e.g. 2" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)} />
                    </div>
                </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                    <label className={labelCls}>Area</label>
                    <input type="number" min={0} className={inputCls} placeholder="e.g. 1200" value={form.area} onChange={e => set('area', e.target.value)} />
                </div>
                <div>
                    <label className={labelCls}>Unit</label>
                    <select title="Area unit" className={selectCls} value={form.area_unit} onChange={e => set('area_unit', e.target.value)}>
                        {['sqft', 'sqm', 'sqyd', 'acre', 'bigha', 'gaj'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Furnishing</label>
                    <select title="Furnishing status" className={selectCls} value={form.furnishing} onChange={e => set('furnishing', e.target.value)}>
                        <option value="">Select...</option>
                        {FURNISHING.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {showFloor && (
                    <>
                        <div>
                            <label className={labelCls}>Floor No.</label>
                            <input type="number" min={0} className={inputCls} placeholder="e.g. 4" value={form.floor_number} onChange={e => set('floor_number', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Total Floors</label>
                            <input type="number" min={1} className={inputCls} placeholder="e.g. 12" value={form.total_floors} onChange={e => set('total_floors', e.target.value)} />
                        </div>
                    </>
                )}
                <div>
                    <label className={labelCls}>Facing</label>
                    <select title="Property facing direction" className={selectCls} value={form.facing} onChange={e => set('facing', e.target.value)}>
                        <option value="">Select...</option>
                        {FACING.map(f => <option key={f} value={f.toLowerCase().replace(/ /g, '_')}>{f}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Property Age</label>
                    <select title="Property age" className={selectCls} value={form.property_age} onChange={e => set('property_age', e.target.value)}>
                        <option value="">Select...</option>
                        {PROPERTY_AGE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
}

// ─── Step: Amenities ──────────────────────────────────────────────────────────

function StepAmenities({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    const toggle = (a: string) => {
        const cur = form.amenities;
        set('amenities', cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]);
    };
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">Select all amenities available with this property.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AMENITIES.map(a => {
                    const selected = form.amenities.includes(a);
                    return (
                        <button key={a} type="button" onClick={() => toggle(a)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border-2 transition-all text-left ${
                                selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                            }`}>
                            <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 ${selected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                {selected && <Check size={10} className="text-white" />}
                            </div>
                            {AMENITY_LABELS[a]}
                        </button>
                    );
                })}
            </div>
            {form.amenities.length > 0 && (
                <p className="text-xs text-blue-600">{form.amenities.length} amenit{form.amenities.length !== 1 ? 'ies' : 'y'} selected</p>
            )}
            <button type="button" onClick={() => set('amenities', [])}
                className="text-xs text-slate-400 hover:text-slate-600 underline">Skip / Clear all</button>
        </div>
    );
}

// ─── Step: Pricing ────────────────────────────────────────────────────────────

function StepPricing({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-500">
                {form.intent === 'sell' ? 'Selling price of the property' : form.intent === 'rent' ? 'Monthly rent amount' : 'Lease amount'}
            </p>
            <div className="flex gap-3 max-w-sm">
                <div className="flex-1">
                    <label className={labelCls}>Amount</label>
                    <input type="number" min={0} step="0.01" className={inputCls} placeholder="e.g. 45" value={form.price} onChange={e => set('price', e.target.value)} />
                </div>
                <div className="w-32">
                    <label className={labelCls}>Unit</label>
                    <select title="Price unit" className={selectCls} value={form.price_unit} onChange={e => set('price_unit', e.target.value)}>
                        <option value="Lakh">Lakh</option>
                        <option value="Crore">Crore</option>
                        <option value="Thousand">Thousand</option>
                        {form.intent !== 'sell' && <option value="per_month">/ month</option>}
                    </select>
                </div>
            </div>
            <button type="button" onClick={() => set('price', '')}
                className="text-xs text-slate-400 hover:text-slate-600 underline">Skip — Price on Request</button>
        </div>
    );
}

// ─── Step: Media ──────────────────────────────────────────────────────────────

function StepMedia({ photos, videos, onAddPhotos, onAddVideos, onRemovePhoto, onRemoveVideo }: {
    photos: File[]; videos: File[];
    onAddPhotos: (files: File[]) => void; onAddVideos: (files: File[]) => void;
    onRemovePhoto: (i: number) => void; onRemoveVideo: (i: number) => void;
}) {
    const photoRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-5">
            <p className="text-sm text-slate-500">Add photos and videos. These will be uploaded after your listing is created.</p>

            {/* Photos */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Photos ({photos.length}/20)</p>
                    <button type="button" onClick={() => photoRef.current?.click()}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                        <Image size={13} /> Add Photos
                    </button>
                </div>
                <input ref={photoRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) onAddPhotos(Array.from(e.target.files)); e.target.value = ''; }} />
                {photos.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {photos.map((f, i) => (
                            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => onRemovePhoto(i)}
                                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => photoRef.current?.click()}
                            className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 transition-colors">
                            <Plus size={20} />
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => photoRef.current?.click()}
                        className="w-full py-8 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                        <Image size={24} />
                        <span className="text-sm">Tap to add photos</span>
                    </button>
                )}
            </div>

            {/* Videos */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Videos ({videos.length}/3)</p>
                    <button type="button" onClick={() => videoRef.current?.click()}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                        <Video size={13} /> Add Video
                    </button>
                </div>
                <input ref={videoRef} type="file" accept="video/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) onAddVideos(Array.from(e.target.files)); e.target.value = ''; }} />
                {videos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {videos.map((f, i) => (
                            <div key={i} className="relative flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
                                <Video size={14} className="text-slate-500 flex-shrink-0" />
                                <span className="text-xs text-slate-600 truncate max-w-[120px]">{f.name}</span>
                                <button type="button" onClick={() => onRemoveVideo(i)} className="text-red-400 hover:text-red-600">
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <button type="button" onClick={() => videoRef.current?.click()}
                        className="w-full py-5 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                        <Video size={18} />
                        <span className="text-sm">Add walkthrough video (optional)</span>
                    </button>
                )}
            </div>

            <button type="button" className="text-xs text-slate-400 hover:text-slate-600 underline">Skip — Add photos later</button>
        </div>
    );
}

// ─── Step: Description ────────────────────────────────────────────────────────

function StepDescription({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-500">Describe key features, amenities, nearby landmarks, condition, etc.</p>
            <textarea className={`${inputCls} resize-none`} rows={5}
                placeholder="e.g. Well-maintained 3BHK in Gaur City 2, Sector 16C. Near metro station. Corner flat with excellent ventilation and natural light..."
                value={form.description} onChange={e => set('description', e.target.value)} />
            <button type="button" onClick={() => set('description', '')}
                className="text-xs text-slate-400 hover:text-slate-600 underline">Skip this step</button>
        </div>
    );
}

// ─── Step: Confirm ────────────────────────────────────────────────────────────

function StepConfirm({ form, photoCount, videoCount }: { form: FormData; photoCount: number; videoCount: number }) {
    const typeLabel = PROPERTY_TYPES.find(t => t.value === form.type)?.label || form.type;
    const sourceLabel = SOURCE_OPTIONS.find(s => s.value === form.lead_reference)?.label;
    const addressParts = [
        form.flat_no && `Flat ${form.flat_no}`,
        form.apartment_name,
        form.plot_no && `Plot ${form.plot_no}`,
        form.sub_locality,
        form.locality,
        form.district,
        form.state,
        form.pincode,
    ].filter(Boolean).join(', ');

    const rows: [string, string][] = [
        ['Intent', form.intent.charAt(0).toUpperCase() + form.intent.slice(1)],
        ['Type', typeLabel],
        ['Category', form.category.charAt(0).toUpperCase() + form.category.slice(1)],
        ...(sourceLabel ? [['Source', sourceLabel] as [string, string]] : []),
        ['Address', addressParts || '—'],
        ...(form.latitude ? [[`GPS`, `${parseFloat(form.latitude).toFixed(5)}, ${parseFloat(form.longitude).toFixed(5)}`] as [string, string]] : []),
        ...(form.bedrooms ? [['Bedrooms', form.bedrooms] as [string, string]] : []),
        ...(form.area ? [['Area', `${form.area} ${form.area_unit}`] as [string, string]] : []),
        ...(form.furnishing ? [['Furnishing', form.furnishing.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())] as [string, string]] : []),
        ['Price', form.price ? `₹${form.price} ${form.price_unit}` : 'Price on request'],
        ...(form.amenities.length > 0 ? [['Amenities', `${form.amenities.length} selected`] as [string, string]] : []),
        ...(photoCount > 0 ? [['Photos', `${photoCount} photo${photoCount !== 1 ? 's' : ''}`] as [string, string]] : []),
        ...(videoCount > 0 ? [['Videos', `${videoCount} video${videoCount !== 1 ? 's' : ''}`] as [string, string]] : []),
        ...(form.description ? [['Description', form.description.slice(0, 80) + (form.description.length > 80 ? '…' : '')] as [string, string]] : []),
    ];

    return (
        <div>
            <p className="text-sm text-slate-500 mb-4">Review before submitting. Go back to change anything.</p>
            <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                        <span className="text-xs font-medium text-slate-400 w-24 flex-shrink-0 pt-0.5">{label}</span>
                        <span className="text-sm text-slate-800">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function AddInventoryWizard({ token, onDone }: { token: string; onDone: () => void }) {
    const [step, setStep] = useState<WizardStep>('intent');
    const [form, setFormState] = useState<FormData>(INITIAL_FORM);
    const [photos, setPhotos] = useState<File[]>([]);
    const [videos, setVideos] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [error, setError] = useState('');
    const [displayId, setDisplayId] = useState('');
    const [uploadedCount, setUploadedCount] = useState(0);
    const [uploadError, setUploadError] = useState('');

    const set = (k: keyof FormData, v: any) => setFormState(prev => ({ ...prev, [k]: v }));
    const stepIdx = STEPS.indexOf(step);

    const canNext = (): boolean => {
        if (step === 'intent') return !!form.intent;
        if (step === 'property_type') return !!form.type;
        if (step === 'location') return !!(form.sub_locality.trim() && form.locality.trim() && form.district.trim() && form.state.trim());
        return true;
    };

    const goNext = () => { if (!canNext()) return; const n = STEPS[stepIdx + 1]; if (n) setStep(n); };
    const goBack = () => { const p = STEPS[stepIdx - 1]; if (p) setStep(p); };

    const submit = async () => {
        setError('');
        setSubmitting(true);
        try {
            const specs: any = {};
            if (form.bedrooms) specs.bedrooms = parseInt(form.bedrooms);
            if (form.bathrooms) specs.bathrooms = parseInt(form.bathrooms);
            if (form.area) { specs.area = parseFloat(form.area); specs.area_unit = form.area_unit; }

            const features: any = {};
            form.amenities.forEach(a => { features[a] = true; });

            const res = await api.post('/agent/inventory', {
                intent: form.intent,
                type: form.type,
                category: form.category,
                full_address: form.full_address || [form.sub_locality, form.locality, form.district, form.state].filter(Boolean).join(', '),
                flat_no: form.flat_no || undefined,
                floor_number: form.floor_number ? parseInt(form.floor_number) : undefined,
                apartment_name: form.apartment_name || undefined,
                plot_no: form.plot_no || undefined,
                sub_locality: form.sub_locality,
                locality: form.locality,
                district: form.district,
                state: form.state,
                pincode: form.pincode || undefined,
                latitude: form.latitude ? parseFloat(form.latitude) : undefined,
                longitude: form.longitude ? parseFloat(form.longitude) : undefined,
                price: form.price ? parseFloat(form.price) : undefined,
                price_unit: form.price_unit,
                specs: Object.keys(specs).length > 0 ? specs : undefined,
                features: Object.keys(features).length > 0 ? features : undefined,
                furnishing: form.furnishing || undefined,
                total_floors: form.total_floors ? parseInt(form.total_floors) : undefined,
                facing: form.facing || undefined,
                property_age: form.property_age || undefined,
                description: form.description || undefined,
                lead_reference: form.lead_reference || undefined,
            }, { headers: { Authorization: `Bearer ${token}` } });

            const inventoryId = res.data.id;
            setDisplayId(res.data.display_id || inventoryId.slice(0, 8));

            // Upload media if any
            const allFiles = [...photos, ...videos];
            if (allFiles.length > 0) {
                setUploadingMedia(true);
                const fd = new FormData();
                allFiles.forEach(f => fd.append('files', f));
                try {
                    await api.post(`/agent/inventory/${inventoryId}/upload`, fd, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setUploadedCount(allFiles.length);
                } catch {
                    setUploadError('Photos/videos could not be saved. Your listing was created — you can add media later from the Edit button.');
                }
                setUploadingMedia(false);
            }

            setStep('success');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create listing. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (step === 'success') {
        return (
            <div className="text-center py-10">
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <Check size={30} className="text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Property Submitted!</h2>
                {displayId && <p className="mt-1 font-mono text-lg font-bold text-blue-600">{displayId}</p>}
                {uploadedCount > 0 && (
                    <p className="text-sm text-green-600 mt-1">{uploadedCount} media file{uploadedCount !== 1 ? 's' : ''} uploaded</p>
                )}
                {uploadError && (
                    <div className="mt-2 mx-auto max-w-sm bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-2.5 rounded-xl text-left">
                        ⚠️ {uploadError}
                    </div>
                )}
                <p className="text-sm text-amber-600 mt-1 font-medium">⏳ Under review — your coordinator will approve it shortly.</p>
                <p className="text-xs text-slate-400 mt-1">You&apos;ll be notified on WhatsApp once it goes live.</p>
                <div className="flex gap-3 justify-center mt-8">
                    <button type="button" onClick={() => { setStep('intent'); setFormState(INITIAL_FORM); setPhotos([]); setVideos([]); setDisplayId(''); setUploadedCount(0); setUploadError(''); }}
                        className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors">
                        Add Another Property
                    </button>
                    <button type="button" onClick={onDone}
                        className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                        View My Listings
                    </button>
                </div>
            </div>
        );
    }

    const stepDesc: Record<WizardStep, string> = {
        intent: 'What do you want to do?',
        source: 'Where did you get this property?',
        property_type: 'What type of property?',
        location: 'Where is it located?',
        specs: 'Property specifications',
        amenities: 'Available amenities',
        pricing: 'Asking price',
        media: 'Photos & videos',
        description: 'Property description',
        confirm: 'Review & submit',
        success: '',
    };

    return (
        <div>
            <ProgressBar current={step} />
            <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">{stepDesc[step]}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Step {stepIdx + 1} of {STEPS.length}</p>
            </div>

            <div className="min-h-[200px]">
                {step === 'intent'        && <StepIntent form={form} set={set} />}
                {step === 'source'        && <StepSource form={form} set={set} />}
                {step === 'property_type' && <StepPropertyType form={form} set={set} />}
                {step === 'location'      && <StepLocation form={form} set={set} />}
                {step === 'specs'         && <StepSpecs form={form} set={set} />}
                {step === 'amenities'     && <StepAmenities form={form} set={set} />}
                {step === 'pricing'       && <StepPricing form={form} set={set} />}
                {step === 'media'         && (
                    <StepMedia
                        photos={photos} videos={videos}
                        onAddPhotos={f => setPhotos(prev => [...prev, ...f].slice(0, 20))}
                        onAddVideos={f => setVideos(prev => [...prev, ...f].slice(0, 3))}
                        onRemovePhoto={i => setPhotos(prev => prev.filter((_, j) => j !== i))}
                        onRemoveVideo={i => setVideos(prev => prev.filter((_, j) => j !== i))}
                    />
                )}
                {step === 'description'   && <StepDescription form={form} set={set} />}
                {step === 'confirm'       && <StepConfirm form={form} photoCount={photos.length} videoCount={videos.length} />}
            </div>

            {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{error}</div>
            )}

            {/* Location validation hint */}
            {step === 'location' && (!form.sub_locality || !form.locality || !form.district || !form.state) && (
                <div className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
                    <Star size={11} /> Sub Locality, Locality, District and State are required to continue
                </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button type="button" onClick={stepIdx === 0 ? onDone : goBack}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                    <ChevronLeft size={15} />
                    {stepIdx === 0 ? 'Cancel' : 'Back'}
                </button>

                {step === 'confirm' ? (
                    <button type="button" onClick={submit} disabled={submitting || uploadingMedia}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl disabled:opacity-60 transition-all shadow-md">
                        {(submitting || uploadingMedia)
                            ? <><Loader2 size={15} className="animate-spin" />{uploadingMedia ? 'Uploading...' : 'Submitting...'}</>
                            : <><Check size={15} />Submit Listing</>
                        }
                    </button>
                ) : (
                    <button type="button" onClick={goNext} disabled={!canNext()}
                        className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors">
                        Next <ChevronRight size={15} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Inventory Card ────────────────────────────────────────────────────────────

type EditTab = 'details' | 'address' | 'amenities' | 'pricing' | 'media' | 'description';
const EDIT_TABS: { id: EditTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'address', label: 'Address' },
    { id: 'amenities', label: 'Amenities' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'media', label: 'Photos' },
    { id: 'description', label: 'Description' },
];

function InventoryCard({ item, token, onRefresh }: { item: InventoryItem; token: string; onRefresh: () => void }) {
    const typeLabel = PROPERTY_TYPES.find(t => t.value === item.type)?.label || item.type?.replace(/_/g, ' ');
    const specs = item.specs;
    const specsStr = specs ? [specs.bedrooms && `${specs.bedrooms} BHK`, specs.area && `${specs.area} ${specs.area_unit || 'sqft'}`].filter(Boolean).join(' · ') : null;
    const hasPhotos = item.media_urls?.length > 0;
    const displayAddr = item.full_address || [item.locality, item.district].filter(Boolean).join(', ') || item.location;

    const [editing, setEditing] = useState(false);
    const [editTab, setEditTab] = useState<EditTab>('details');
    const [editData, setEditData] = useState<Record<string, any>>({});
    const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);
    const [editVideoUrls, setEditVideoUrls] = useState<string[]>([]);
    const [mediaUploading, setMediaUploading] = useState(false);
    const imgRef = useRef<HTMLInputElement>(null);
    const vidRef = useRef<HTMLInputElement>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editErr, setEditErr] = useState('');

    const statusBadge = item.status === 'active'
        ? 'bg-green-100 text-green-700'
        : item.status === 'pending_approval'
        ? 'bg-amber-100 text-amber-700'
        : item.status === 'sold'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-slate-100 text-slate-500';

    const statusLabel = item.status === 'pending_approval' ? '⏳ Under Review'
        : item.status === 'active' ? '✅ Live'
        : item.status === 'withdrawn' ? 'Withdrawn'
        : item.status;

    const openEdit = () => {
        const s = item.specs || {};
        const f = item.features || {};
        setEditData({
            bedrooms: s.bedrooms ?? '', bathrooms: s.bathrooms ?? '',
            area: s.area ?? '', area_unit: s.area_unit || 'sqft',
            furnishing: item.furnishing || '', facing: item.facing || '',
            property_age: item.property_age || '',
            total_floors: item.total_floors ?? '', floor_number: item.floor_number ?? '',
            flat_no: item.flat_no || '', plot_no: item.plot_no || '',
            apartment_name: item.apartment_name || '',
            sub_locality: item.sub_locality || '', locality: item.locality || '',
            district: item.district || '', state: item.state || '',
            pincode: item.pincode || '',
            latitude: item.latitude ?? '', longitude: item.longitude ?? '',
            features: { ...f },
            price: item.price ?? '', price_unit: item.price_unit || 'Lakh',
            description: item.description || '',
        });
        setEditMediaUrls(Array.isArray(item.media_urls) ? [...item.media_urls] : []);
        setEditVideoUrls(Array.isArray(item.video_urls) ? [...item.video_urls] : []);
        setEditTab('details');
        setEditErr('');
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true); setEditErr('');
        try {
            const specs: any = {};
            if (editData.bedrooms !== '') specs.bedrooms = parseInt(editData.bedrooms);
            if (editData.bathrooms !== '') specs.bathrooms = parseInt(editData.bathrooms);
            if (editData.area !== '') { specs.area = parseFloat(editData.area); specs.area_unit = editData.area_unit; }

            const payload: any = {
                description: editData.description || null,
                furnishing: editData.furnishing || null,
                facing: editData.facing || null,
                property_age: editData.property_age || null,
                total_floors: editData.total_floors !== '' ? parseInt(editData.total_floors) : null,
                floor_number: editData.floor_number !== '' ? parseInt(editData.floor_number) : null,
                flat_no: editData.flat_no || null,
                plot_no: editData.plot_no || null,
                apartment_name: editData.apartment_name || null,
                sub_locality: editData.sub_locality || null,
                locality: editData.locality || null,
                district: editData.district || null,
                state: editData.state || null,
                pincode: editData.pincode || null,
                latitude: editData.latitude !== '' ? parseFloat(editData.latitude) : null,
                longitude: editData.longitude !== '' ? parseFloat(editData.longitude) : null,
                price: editData.price !== '' ? parseFloat(editData.price) : null,
                price_unit: editData.price_unit || null,
                features: Object.keys(editData.features).length > 0 ? editData.features : null,
            };
            if (Object.keys(specs).length > 0) payload.specs = specs;

            await api.patch(`/agent/inventory/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
            setEditing(false);
            onRefresh();
        } catch (err: any) {
            setEditErr(err.response?.data?.error || 'Failed to save');
        } finally { setSaving(false); }
    };

    const handleDeleteMedia = async (url: string) => {
        const filename = url.split('/').pop() || '';
        if (!confirm('Delete this image?')) return;
        try {
            await api.delete(`/agent/inventory/${item.id}/media/${filename}`, { headers: { Authorization: `Bearer ${token}` } });
            setEditMediaUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) { alert(err.response?.data?.error || 'Failed to delete image'); }
    };

    const handleDeleteVideo = async (url: string) => {
        const filename = url.split('/').pop() || '';
        if (!confirm('Delete this video?')) return;
        try {
            await api.delete(`/agent/inventory/${item.id}/media/${filename}`, { headers: { Authorization: `Bearer ${token}` } });
            setEditVideoUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) { alert(err.response?.data?.error || 'Failed to delete video'); }
    };

    const handleUploadMedia = async (files: FileList, type: 'image' | 'video') => {
        setMediaUploading(true);
        try {
            const fd = new FormData();
            Array.from(files).forEach(f => fd.append('files', f));
            const res = await api.post(`/agent/inventory/${item.id}/upload`, fd, { headers: { Authorization: `Bearer ${token}` } });
            const updated = res.data?.inventory || res.data;
            if (type === 'image' && updated?.media_urls) setEditMediaUrls(updated.media_urls);
            if (type === 'video' && updated?.video_urls) setEditVideoUrls(updated.video_urls);
        } catch (err: any) { alert(err.response?.data?.error || 'Upload failed'); }
        finally { setMediaUploading(false); }
    };

    const handleDelete = async () => {
        const isActive = item.status === 'active';
        const msg = isActive
            ? 'This will withdraw your listing from the website. Continue?'
            : 'Delete this listing permanently?';
        if (!confirm(msg)) return;
        setDeleting(true);
        try {
            await api.delete(`/agent/inventory/${item.id}`, { headers: { Authorization: `Bearer ${token}` } });
            onRefresh();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete');
        } finally { setDeleting(false); }
    };

    const ed = editData;
    const setEd = (k: string, v: any) => setEditData(prev => ({ ...prev, [k]: v }));

    return (
        <>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition-all">
            {hasPhotos && (
                <div className="h-36 bg-slate-100 overflow-hidden">
                    <img src={getMediaUrl(item.media_urls[0])} alt="" className="w-full h-full object-cover" />
                </div>
            )}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">
                                {specsStr ? `${specsStr} · ` : ''}{typeLabel}
                            </h3>
                            {item.display_id && <span className="text-xs text-slate-400 font-mono">{item.display_id}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                            {displayAddr && <span className="flex items-center gap-1"><MapPin size={11} />{displayAddr}</span>}
                            <span className="flex items-center gap-1">
                                <IndianRupee size={11} />
                                {item.price ? `${item.price} ${item.price_unit || 'Lakh'}` : 'Price on request'}
                            </span>
                            <span className="capitalize">{item.intent}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge}`}>{statusLabel}</span>
                        <span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString('en-IN')}</span>
                    </div>
                </div>

                {item.status === 'active' && (
                    <p className="text-xs text-slate-400 mt-2 italic">Editing will reset to &quot;Under Review&quot; for re-approval.</p>
                )}

                {item.status !== 'sold' && (
                    <div className="flex gap-2 mt-3">
                        <button type="button" onClick={openEdit}
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                            Edit
                        </button>
                        <button type="button" onClick={handleDelete} disabled={deleting}
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                            {deleting ? 'Processing...' : item.status === 'active' ? 'Withdraw' : 'Delete'}
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* ── Full Edit Modal ── */}
        {editing && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) setEditing(false); }}>
                <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Edit Listing</h3>
                            {item.status === 'active' && <p className="text-xs text-amber-600 mt-0.5">Saving will reset status to Under Review</p>}
                        </div>
                        <button type="button" onClick={() => setEditing(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} className="text-slate-500" /></button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 overflow-x-auto flex-shrink-0">
                        {EDIT_TABS.map(t => (
                            <button key={t.id} type="button" onClick={() => setEditTab(t.id)}
                                className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${editTab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">

                        {editTab === 'details' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Bedrooms</label>
                                    <input type="number" min="0" value={ed.bedrooms} onChange={e => setEd('bedrooms', e.target.value)} title="Bedrooms" placeholder="e.g. 3" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Bathrooms</label>
                                    <input type="number" min="0" value={ed.bathrooms} onChange={e => setEd('bathrooms', e.target.value)} title="Bathrooms" placeholder="e.g. 2" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Area</label>
                                    <input type="number" min="0" value={ed.area} onChange={e => setEd('area', e.target.value)} title="Area" placeholder="e.g. 1200" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Area Unit</label>
                                    <select value={ed.area_unit} onChange={e => setEd('area_unit', e.target.value)} title="Area Unit" className={selectCls}>
                                        {['sqft','sqm','sqyd','acre','hectare','bigha'].map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Furnishing</label>
                                    <select value={ed.furnishing} onChange={e => setEd('furnishing', e.target.value)} title="Furnishing" className={selectCls}>
                                        <option value="">Select</option>
                                        {FURNISHING.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Facing</label>
                                    <select value={ed.facing} onChange={e => setEd('facing', e.target.value)} title="Facing" className={selectCls}>
                                        <option value="">Select</option>
                                        {FACING.map(f => <option key={f} value={f.toLowerCase().replace(' ', '_')}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Property Age</label>
                                    <select value={ed.property_age} onChange={e => setEd('property_age', e.target.value)} title="Property Age" className={selectCls}>
                                        <option value="">Select</option>
                                        {PROPERTY_AGE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Total Floors</label>
                                    <input type="number" min="0" value={ed.total_floors} onChange={e => setEd('total_floors', e.target.value)} title="Total Floors" placeholder="e.g. 12" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Floor No</label>
                                    <input type="number" min="0" value={ed.floor_number} onChange={e => setEd('floor_number', e.target.value)} title="Floor Number" placeholder="e.g. 3" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Flat / Unit No</label>
                                    <input value={ed.flat_no} onChange={e => setEd('flat_no', e.target.value)} title="Flat No" placeholder="e.g. A-1201" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Plot / Building No</label>
                                    <input value={ed.plot_no} onChange={e => setEd('plot_no', e.target.value)} title="Plot No" placeholder="e.g. Plot 42" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Apartment / Society</label>
                                    <input value={ed.apartment_name} onChange={e => setEd('apartment_name', e.target.value)} title="Apartment Name" placeholder="e.g. Gaur City 2" className={inputCls} />
                                </div>
                            </div>
                        )}

                        {editTab === 'address' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className={labelCls}>Sub Locality</label>
                                    <input value={ed.sub_locality} onChange={e => setEd('sub_locality', e.target.value)} title="Sub Locality" placeholder="e.g. Block A" className={inputCls} />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Locality / Area</label>
                                    <input value={ed.locality} onChange={e => setEd('locality', e.target.value)} title="Locality" placeholder="e.g. Sector 150" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>City / District</label>
                                    <input value={ed.district} onChange={e => setEd('district', e.target.value)} title="District" placeholder="e.g. Noida" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>State</label>
                                    <input value={ed.state} onChange={e => setEd('state', e.target.value)} title="State" placeholder="e.g. Uttar Pradesh" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Pincode</label>
                                    <input value={ed.pincode} onChange={e => setEd('pincode', e.target.value)} title="Pincode" placeholder="e.g. 201310" maxLength={6} className={inputCls} />
                                </div>
                                <div></div>
                                <div>
                                    <label className={labelCls}>Latitude</label>
                                    <input type="number" step="any" value={ed.latitude} onChange={e => setEd('latitude', e.target.value)} title="Latitude" placeholder="e.g. 28.5355" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Longitude</label>
                                    <input type="number" step="any" value={ed.longitude} onChange={e => setEd('longitude', e.target.value)} title="Longitude" placeholder="e.g. 77.3910" className={inputCls} />
                                </div>
                            </div>
                        )}

                        {editTab === 'amenities' && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {AMENITIES.map(a => (
                                    <label key={a} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                                        <input type="checkbox"
                                            checked={!!ed.features?.[a]}
                                            onChange={e => setEd('features', { ...ed.features, [a]: e.target.checked })}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {AMENITY_LABELS[a]}
                                    </label>
                                ))}
                            </div>
                        )}

                        {editTab === 'pricing' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Price</label>
                                    <input type="number" value={ed.price} onChange={e => setEd('price', e.target.value)} title="Price" placeholder="e.g. 45" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Price Unit</label>
                                    <select value={ed.price_unit} onChange={e => setEd('price_unit', e.target.value)} title="Price Unit" className={selectCls}>
                                        <option value="">Raw INR</option>
                                        <option value="Lakh">Lakh</option>
                                        <option value="Crore">Crore</option>
                                        <option value="Per Month">Per Month</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {editTab === 'media' && (
                            <div className="space-y-4">
                                {/* Photos */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-slate-600">Photos ({editMediaUrls.length})</span>
                                        <div>
                                            <input ref={imgRef} type="file" multiple accept="image/*" title="Upload photos" className="hidden"
                                                onChange={e => e.target.files && handleUploadMedia(e.target.files, 'image')} />
                                            <button type="button" onClick={() => imgRef.current?.click()} disabled={mediaUploading}
                                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50">
                                                <Image size={13} /> Add Photos
                                            </button>
                                        </div>
                                    </div>
                                    {mediaUploading && <p className="text-xs text-amber-600 mb-2">Uploading...</p>}
                                    {editMediaUrls.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {editMediaUrls.map(url => (
                                                <div key={url} className="relative w-20 h-16 rounded-lg overflow-hidden border border-slate-200">
                                                    <img src={url.replace('.webp', '_thumb.webp')} onError={e => { (e.target as HTMLImageElement).src = getMediaUrl(url); }}
                                                        alt="" className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => handleDeleteMedia(url)}
                                                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white text-[9px] rounded-full flex items-center justify-center hover:bg-red-600">✕</button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-xs text-slate-400">No photos yet</p>}
                                </div>

                                {/* Videos */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-slate-600">Videos ({editVideoUrls.length})</span>
                                        <div>
                                            <input ref={vidRef} type="file" multiple accept="video/*" title="Upload videos" className="hidden"
                                                onChange={e => e.target.files && handleUploadMedia(e.target.files, 'video')} />
                                            <button type="button" onClick={() => vidRef.current?.click()} disabled={mediaUploading}
                                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50">
                                                <Video size={13} /> Add Videos
                                            </button>
                                        </div>
                                    </div>
                                    {editVideoUrls.length > 0 ? (
                                        <div className="space-y-1">
                                            {editVideoUrls.map(url => (
                                                <div key={url} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                                                    <span className="truncate text-slate-600">🎬 {url.split('/').pop()}</span>
                                                    <button type="button" onClick={() => handleDeleteVideo(url)} className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0">✕</button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-xs text-slate-400">No videos yet</p>}
                                </div>
                            </div>
                        )}

                        {editTab === 'description' && (
                            <div>
                                <label className={labelCls}>Property Description</label>
                                <textarea value={ed.description} onChange={e => setEd('description', e.target.value)} rows={6}
                                    placeholder="Describe the property — key highlights, nearby landmarks, connectivity..."
                                    className={`${inputCls} resize-none`} />
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {editErr && <div className="px-5 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">{editErr}</div>}
                    <div className="flex gap-3 px-5 py-4 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onClick={() => setEditing(false)}
                            className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button type="button" onClick={handleSave} disabled={saving}
                            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentInventory() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);

    const token = typeof window !== 'undefined' ? localStorage.getItem('agent_token') : null;

    const fetchInventory = () => {
        if (!token) { setLoading(false); return; }
        setLoading(true);
        api.get('/agent/inventory', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setInventory(Array.isArray(res.data) ? res.data : []))
            .catch(() => setInventory([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchInventory(); }, []);

    if (showWizard) {
        return (
            <div className="max-w-2xl">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <AddInventoryWizard token={token || ''} onDone={() => { setShowWizard(false); fetchInventory(); }} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">My Inventory</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {loading ? 'Loading...' : `${inventory.length} propert${inventory.length !== 1 ? 'ies' : 'y'} listed`}
                    </p>
                </div>
                <button type="button" onClick={() => setShowWizard(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all">
                    <Plus size={16} /> Add Property
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 h-24 animate-pulse">
                            <div className="space-y-2"><div className="h-3.5 bg-slate-100 rounded w-1/2" /><div className="h-3 bg-slate-100 rounded w-1/3" /></div>
                        </div>
                    ))}
                </div>
            ) : inventory.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                        <Building2 size={24} className="text-slate-300" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-700">No properties yet</h3>
                    <p className="text-sm text-slate-400 mt-1 mb-6">Add your first property listing to get started.</p>
                    <button type="button" onClick={() => setShowWizard(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                        <Plus size={15} /> Add Property
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {inventory.map(item => <InventoryCard key={item.id} item={item} token={token || ''} onRefresh={fetchInventory} />)}
                </div>
            )}
        </div>
    );
}
