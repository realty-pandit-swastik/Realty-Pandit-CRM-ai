'use client';

import Link from 'next/link';
import { MapPin, TrendingUp, Building2, Home, Store, LandPlot } from 'lucide-react';

const allCities = [
    { slug: 'noida', name: 'Noida' },
    { slug: 'gurgaon', name: 'Gurgaon' },
    { slug: 'delhi', name: 'Delhi' },
    { slug: 'mumbai', name: 'Mumbai' },
    { slug: 'bangalore', name: 'Bangalore' },
    { slug: 'pune', name: 'Pune' },
    { slug: 'hyderabad', name: 'Hyderabad' },
    { slug: 'chennai', name: 'Chennai' },
];

const cityLocalities: Record<string, string[]> = {
    'noida': ['Sector 150', 'Sector 137', 'Sector 62', 'Sector 75', 'Sector 44', 'Greater Noida West'],
    'gurgaon': ['DLF Phase 1', 'DLF Phase 3', 'Sohna Road', 'Golf Course Road', 'Sector 49', 'MG Road'],
    'delhi': ['Dwarka', 'Rohini', 'Vasant Kunj', 'Saket', 'Janakpuri', 'Lajpat Nagar'],
    'mumbai': ['Andheri', 'Powai', 'Bandra', 'Thane', 'Navi Mumbai', 'Goregaon'],
    'bangalore': ['Whitefield', 'Indiranagar', 'Koramangala', 'HSR Layout', 'Electronic City', 'Marathahalli'],
    'pune': ['Hinjewadi', 'Kharadi', 'Wakad', 'Baner', 'Viman Nagar', 'Hadapsar'],
    'hyderabad': ['Gachibowli', 'HITEC City', 'Madhapur', 'Kondapur', 'Jubilee Hills', 'Banjara Hills'],
    'chennai': ['OMR', 'Adyar', 'T Nagar', 'Velachery', 'Anna Nagar', 'Porur'],
};

const budgetRanges = [
    { slug: 'below-20-lakhs', label: 'Below 20 Lakhs' },
    { slug: 'below-30-lakhs', label: 'Below 30 Lakhs' },
    { slug: 'below-50-lakhs', label: 'Below 50 Lakhs' },
    { slug: '50-75-lakhs', label: '50-75 Lakhs' },
    { slug: '75-lakhs-1-crore', label: '75 Lakhs - 1 Crore' },
    { slug: '1-2-crore', label: '1-2 Crore' },
    { slug: '2-5-crore', label: '2-5 Crore' },
    { slug: 'above-5-crore', label: 'Above 5 Crore' },
];

const propertyTypes = [
    { slug: 'flat', label: 'Flats', icon: Building2 },
    { slug: 'house', label: 'Houses', icon: Home },
    { slug: 'plot', label: 'Plots', icon: LandPlot },
    { slug: 'commercial', label: 'Commercial', icon: Store },
];

function toSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
}

interface InternalLinksProps {
    city?: string;
    cityName?: string;
    locality?: string;
    localityName?: string;
    propertyType?: string;
    intent?: string;
    showBudgets?: boolean;
    showLocalities?: boolean;
    showCities?: boolean;
    showTypes?: boolean;
    showSearched?: boolean;
    compact?: boolean;
}

export default function InternalLinks({
    city,
    cityName,
    locality,
    localityName,
    propertyType,
    intent,
    showBudgets = true,
    showLocalities = true,
    showCities = true,
    showTypes = true,
    showSearched = true,
    compact = false,
}: InternalLinksProps) {
    const currentCity = city || '';
    const currentCityName = cityName || '';
    const localities = cityLocalities[currentCity] || [];
    const otherCities = allCities.filter(c => c.slug !== currentCity);

    return (
        <div className={`space-y-10 ${compact ? 'text-sm' : ''}`}>
            {/* Nearby Localities */}
            {showLocalities && localities.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-blue-600" />
                        {locality ? 'Nearby Localities' : `Popular Localities in ${currentCityName}`}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {localities
                            .filter(l => toSlug(l) !== locality)
                            .map(loc => (
                                <Link
                                    key={loc}
                                    href={`/properties/in/${currentCity}/${toSlug(loc)}`}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    Properties in {loc}
                                </Link>
                            ))}
                    </div>
                </div>
            )}

            {/* Budget Ranges */}
            {showBudgets && currentCity && (
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                        Properties by Budget in {currentCityName}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {budgetRanges.map(b => (
                            <Link
                                key={b.slug}
                                href={`/properties/in/${currentCity}/budget/${b.slug}`}
                                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                            >
                                {b.label} in {currentCityName}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Property Types */}
            {showTypes && currentCity && (
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-purple-600" />
                        Property Types in {currentCityName}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {propertyTypes
                            .filter(t => t.slug !== propertyType)
                            .map(type => (
                                <Link
                                    key={type.slug}
                                    href={`/properties?location=${encodeURIComponent(currentCityName)}&type=${type.slug}`}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                                >
                                    {type.label} in {currentCityName}
                                </Link>
                            ))}
                        {['buy', 'rent'].map(i => (
                            propertyTypes.map(type => (
                                <Link
                                    key={`${type.slug}-${i}`}
                                    href={`/properties?location=${encodeURIComponent(currentCityName)}&type=${type.slug}&intent=${i === 'buy' ? 'sell' : 'rent'}`}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                                >
                                    {type.label} for {i === 'buy' ? 'Sale' : 'Rent'} in {currentCityName}
                                </Link>
                            ))
                        ))}
                    </div>
                </div>
            )}

            {/* People Also Searched */}
            {showSearched && currentCity && (
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                        People Also Searched For
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {([
                            { label: `1 BHK Flats in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&bhk=1&type=flat` },
                            { label: `2 BHK Flats in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&bhk=2&type=flat` },
                            { label: `3 BHK Flats in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&bhk=3&type=flat` },
                            { label: `Ready to Move in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&status=ready_to_move` },
                            { label: `New Projects in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&tab=projects` },
                            { label: `Affordable Housing in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&price_max=5000000` },
                            { label: `Luxury Apartments in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&price_min=10000000` },
                            { label: `Independent Houses in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&type=house` },
                            { label: `Plots for Sale in ${currentCityName}`, url: `/properties?location=${encodeURIComponent(currentCityName)}&type=plot&intent=buy` },
                            ...(localityName ? [
                                { label: `Flats in ${localityName}`, url: `/properties?location=${encodeURIComponent(localityName)}&type=flat` },
                                { label: `Houses in ${localityName}`, url: `/properties?location=${encodeURIComponent(localityName)}&type=house` },
                                { label: `Plots in ${localityName}`, url: `/properties?location=${encodeURIComponent(localityName)}&type=plot` },
                            ] : []),
                        ] as { label: string; url: string }[]).map(({ label, url }) => (
                            <Link
                                key={label}
                                href={url}
                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 transition-colors"
                            >
                                {label}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Other Cities */}
            {showCities && (
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                        Explore Properties in Other Cities
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {otherCities.map(c => (
                            <Link
                                key={c.slug}
                                href={`/properties/in/${c.slug}`}
                                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                Properties in {c.name}
                            </Link>
                        ))}
                        {otherCities.slice(0, 4).map(c => (
                            <Link
                                key={`flat-${c.slug}`}
                                href={`/properties/in/${c.slug}?intent=buy&type=flat`}
                                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                Flats for Sale in {c.name}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
