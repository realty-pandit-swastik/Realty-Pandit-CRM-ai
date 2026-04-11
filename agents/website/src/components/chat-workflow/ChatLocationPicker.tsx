'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Check, Loader2 } from 'lucide-react';
import { GooglePlacesInput, type PlaceResult } from '@/components/workflow/GooglePlacesInput';

interface AddressConfig {
    floor_required?: boolean;
    plot_area_required?: boolean;
    bhk_required?: boolean;
    sub_category_slug?: string;
}

interface ChatLocationPickerProps {
    onSubmit: (addressJson: string) => void;
    sending?: boolean;
    addressConfig?: AddressConfig;
}

export default function ChatLocationPicker({ onSubmit, sending }: ChatLocationPickerProps) {
    const [searchText, setSearchText] = useState('');
    const [place, setPlace] = useState<PlaceResult | null>(null);
    const [flatNo, setFlatNo] = useState('');
    const [floorNumber, setFloorNumber] = useState('');
    const [apartmentName, setApartmentName] = useState('');
    const [plotNo, setPlotNo] = useState('');
    const [subLocality, setSubLocality] = useState('');
    const [locality, setLocality] = useState('');
    const [district, setDistrict] = useState('');
    const [state, setState] = useState('');
    const [pincode, setPincode] = useState('');
    const [manualMode, setManualMode] = useState(false);
    const [showValidation, setShowValidation] = useState(false);

    const handlePlaceSelect = (p: PlaceResult) => {
        setPlace(p);
        setSubLocality(p.sub_locality || '');
        setLocality(p.locality || '');
        setDistrict(p.district || '');
        setState(p.state || '');
        setPincode(p.pincode || '');
    };

    const showFields = place || manualMode;

    const canConfirm =
        (subLocality.trim() || locality.trim()) &&
        (locality.trim() || district.trim()) &&
        state.trim();

    const handleConfirm = () => {
        if (!canConfirm) {
            setShowValidation(true);
            return;
        }
        setShowValidation(false);
        const addr: Record<string, string> = {};
        if (flatNo.trim()) addr.flat_no = flatNo.trim();
        if (floorNumber.trim()) addr.floor_number = floorNumber.trim();
        if (apartmentName.trim()) addr.apartment_name = apartmentName.trim();
        if (plotNo.trim()) addr.plot_no = plotNo.trim();
        if (subLocality.trim()) addr.sub_locality = subLocality.trim();
        if (locality.trim()) { addr.locality = locality.trim(); addr.city = locality.trim(); }
        if (district.trim()) addr.district = district.trim();
        if (state.trim()) addr.state = state.trim();
        if (pincode.trim()) addr.pincode = pincode.trim();
        if (place?.full_address) addr.full_address = place.full_address;
        if (place?.latitude) addr.latitude = String(place.latitude);
        if (place?.longitude) addr.longitude = String(place.longitude);
        onSubmit(JSON.stringify(addr));
    };

    const inputClass = "flex-1 px-3 py-2.5 text-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";
    const inputErrorClass = "flex-1 px-3 py-2.5 text-sm rounded-lg bg-white dark:bg-slate-800 border-2 border-red-400 dark:border-red-500 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500";
    const needsSubLocality = showValidation && !subLocality.trim() && !locality.trim();
    const needsState = showValidation && !state.trim();
    const needsCity = showValidation && !locality.trim() && !district.trim();

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
        >
            {/* Search bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Search Location</label>
                <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <GooglePlacesInput
                        value={searchText}
                        onChange={setSearchText}
                        onPlaceSelect={handlePlaceSelect}
                        placeholder="Type your property address, locality, or landmark..."
                        className="w-full px-4 py-3 text-base rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
            </div>

            {/* Address fields */}
            {showFields && (
                <div className="p-4 space-y-3">
                    {place && (
                        <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">{place.full_address}</p>
                    )}

                    {/* Editable address fields — 2 column grid on larger screens */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Flat / Unit No.</label>
                            <input value={flatNo} onChange={e => { setFlatNo(e.target.value); setShowValidation(false); }} placeholder="e.g., A-101" className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Floor No.</label>
                            <input value={floorNumber} onChange={e => { setFloorNumber(e.target.value); setShowValidation(false); }} placeholder="e.g., 2" className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Society / Building</label>
                            <input value={apartmentName} onChange={e => { setApartmentName(e.target.value); setShowValidation(false); }} placeholder="e.g., Seemant Vihar" className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Plot No.</label>
                            <input value={plotNo} onChange={e => { setPlotNo(e.target.value); setShowValidation(false); }} placeholder="e.g., Plot 42" className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Sub-Locality / Sector <span className="text-red-500">*</span></label>
                            <input value={subLocality} onChange={e => { setSubLocality(e.target.value); setShowValidation(false); }} placeholder="e.g., Sector 150, Bani Park" className={needsSubLocality ? inputErrorClass : inputClass} />
                            {needsSubLocality && <p className="text-xs text-red-500 mt-1">Please enter Sub-Locality or City</p>}
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Locality / City <span className="text-red-500">*</span></label>
                            <input value={locality} onChange={e => { setLocality(e.target.value); setShowValidation(false); }} placeholder="e.g., Noida, Jaipur" className={(needsSubLocality || needsCity) ? inputErrorClass : inputClass} />
                            {needsCity && !needsSubLocality && <p className="text-xs text-red-500 mt-1">Please enter City or District</p>}
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">District</label>
                            <input value={district} onChange={e => { setDistrict(e.target.value); setShowValidation(false); }} placeholder="e.g., Gautam Buddh Nagar" className={needsCity ? inputErrorClass : inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">State <span className="text-red-500">*</span></label>
                            <input value={state} onChange={e => { setState(e.target.value); setShowValidation(false); }} placeholder="e.g., Uttar Pradesh" className={needsState ? inputErrorClass : inputClass} />
                            {needsState && <p className="text-xs text-red-500 mt-1">Please enter State</p>}
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Pincode</label>
                            <input value={pincode} onChange={e => setPincode(e.target.value)} placeholder="6-digit pincode" className={inputClass} />
                        </div>
                    </div>

                    {/* Lat/Lng display */}
                    {place?.latitude && place?.longitude && (
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400 dark:text-slate-500">
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">Lat: {place.latitude.toFixed(6)}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">Lng: {place.longitude.toFixed(6)}</span>
                        </div>
                    )}

                    {/* Confirm button */}
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={sending}
                            className={`w-full py-3 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                canConfirm
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-emerald-600/70 hover:bg-emerald-600'
                            } disabled:opacity-50`}
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Confirm Address
                        </button>
                        {showValidation && !canConfirm && (
                            <p className="text-xs text-red-500 text-center mt-2">
                                Please fill the required fields (Sub-Locality/City and State) to continue
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state — with manual entry option */}
            {!showFields && (
                <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                    <p>Search for your property location above</p>
                    <button
                        type="button"
                        onClick={() => setManualMode(true)}
                        className="mt-2 text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium"
                    >
                        Or enter address manually
                    </button>
                </div>
            )}
        </motion.div>
    );
}
