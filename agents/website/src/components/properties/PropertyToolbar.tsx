'use client';

import { Search, SlidersHorizontal, LayoutGrid, List } from 'lucide-react';
import { GooglePlacesInput, type PlaceResult } from '@/components/workflow/GooglePlacesInput';

interface PropertyToolbarProps {
    location: string;
    onLocationChange: (value: string) => void;
    /** On Google-place select: granular location (for the property search) + the clean city (Projects tab).
     *  Both set together so neither clobbers the other. */
    onPlaceSelect?: (location: string, city: string) => void;
    sort: string;
    onSortChange: (value: string) => void;
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    totalCount: number;
    loading: boolean;
    hasActiveFilters: boolean;
    onToggleMobileFilters: () => void;
}

export default function PropertyToolbar({
    location,
    onLocationChange,
    onPlaceSelect,
    sort,
    onSortChange,
    viewMode,
    onViewModeChange,
    totalCount,
    loading,
    hasActiveFilters,
    onToggleMobileFilters,
}: PropertyToolbarProps) {
    return (
        <div className="space-y-3 mb-4">
            {/* Search + sort row */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Location search with Google Places autocomplete */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                    <GooglePlacesInput
                        value={location}
                        onChange={onLocationChange}
                        onPlaceSelect={(place: PlaceResult) => {
                            // Send the FULL granular address (Sector + locality + city) so the search narrows
                            // to the area — not just the city. The API strips Google's pincode/", India" cruft.
                            // City is kept separately for the Projects tab. Both set in one update.
                            const granular = place.full_address || place.locality || place.district || place.sub_locality;
                            const city = place.locality || place.district || '';
                            if (onPlaceSelect) onPlaceSelect(granular, city);
                            else onLocationChange(granular);
                        }}
                        placeholder="Search by location, city, locality..."
                        className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors"
                    />
                </div>

                {/* Sort */}
                <div className="relative sm:w-44">
                    <select
                        value={sort}
                        onChange={(e) => onSortChange(e.target.value)}
                        aria-label="Sort properties"
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white appearance-none pr-8 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors"
                    >
                        <option value="newest">Newest First</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                    </select>
                </div>

                {/* View toggle */}
                <div className="hidden sm:flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                        onClick={() => onViewModeChange('list')}
                        aria-label="List view"
                        className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onViewModeChange('grid')}
                        aria-label="Grid view"
                        className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>

                {/* Mobile filter button */}
                <button
                    onClick={onToggleMobileFilters}
                    className="lg:hidden flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Filters
                    {hasActiveFilters && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                    )}
                </button>
            </div>

            {/* Result count */}
            <div className="text-sm text-slate-500 dark:text-slate-400">
                {loading ? 'Searching...' : `${totalCount} properties found`}
            </div>
        </div>
    );
}
