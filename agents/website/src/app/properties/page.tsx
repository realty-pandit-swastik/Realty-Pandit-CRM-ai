'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { X, Building2, Home } from 'lucide-react';
import Link from 'next/link';
import PropertyCard from '@/components/PropertyCard';
import PropertyListCard from '@/components/properties/PropertyListCard';
import PropertySidebar from '@/components/properties/PropertySidebar';
import PropertySidebarMobile from '@/components/properties/PropertySidebarMobile';
import PropertyToolbar from '@/components/properties/PropertyToolbar';
import PropertyPagination from '@/components/properties/PropertyPagination';
import FilterChips from '@/components/properties/FilterChips';
import ScheduleVisitModal from '@/components/properties/ScheduleVisitModal';
import ShareWhatsAppModal from '@/components/properties/ShareWhatsAppModal';
import { getProperties, getProjects, getMediaUrl, type Property, type Project } from '@/lib/api';

function PropertiesContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'rent' | 'resale' | 'projects'>(() => {
        const tab = searchParams.get('tab');
        if (tab === 'rent') return 'rent';
        if (tab === 'projects') return 'projects';
        return 'resale';
    });

    const [properties, setProperties] = useState<Property[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [scheduleVisitProperty, setScheduleVisitProperty] = useState<Property | null>(null);
    const [shareWhatsAppProperty, setShareWhatsAppProperty] = useState<Property | null>(null);

    // Filter state — taxonomy-driven (taxonomy_node_id) + per-type specs filters.
    const [filters, setFilters] = useState({
        location: searchParams.get('location') || '',
        // Clean city captured on place-select — used by the Projects tab's city filter (the granular
        // `location` is for the Resale/Rent property search).
        city: searchParams.get('city') || '',
        taxonomy_node_id: searchParams.get('taxonomy_node_id') || '',
        intent: searchParams.get('intent') || '',
        price_min: searchParams.get('price_min') || '',
        price_max: searchParams.get('price_max') || '',
        furnishing: searchParams.get('furnishing') || '',
        amenities: searchParams.get('amenities') || '',
        bhk: searchParams.get('bhk') || '',
        rooms: searchParams.get('rooms') || '',
        facing: searchParams.get('facing') || '',
        age: searchParams.get('age') || '',
        roof_rights: searchParams.get('roof_rights') || '',
        sort: searchParams.get('sort') || 'newest',
        page: parseInt(searchParams.get('page') || '1'),
    });

    const loadProperties = useCallback(async () => {
        setLoading(true);
        try {
            if (activeTab !== 'projects') {
                const params: any = {};
                if (filters.location) params.location = filters.location;
                if (filters.taxonomy_node_id) params.taxonomy_node_id = filters.taxonomy_node_id;
                if (filters.price_min) params.price_min = filters.price_min;
                if (filters.price_max) params.price_max = filters.price_max;
                if (filters.furnishing) params.furnishing = filters.furnishing;
                if (filters.amenities) params.amenities = filters.amenities;
                if (filters.bhk) params.bhk = filters.bhk;
                if (filters.rooms) params.rooms = filters.rooms;
                if (filters.facing) params.facing = filters.facing;
                if (filters.age) params.age = filters.age;
                if (filters.roof_rights) params.roof_rights = filters.roof_rights;
                if (filters.sort) params.sort = filters.sort;
                params.page = filters.page;

                // Tab drives intent automatically
                if (activeTab === 'rent') {
                    params.intent = 'rent';
                } else if (activeTab === 'resale') {
                    params.intent = filters.intent || 'sell';
                }

                const data = await getProperties(params);
                setProperties(data.properties);
                setTotalPages(data.pagination.totalPages);
                setTotalCount(data.pagination.total);
            } else {
                const params: any = {};
                // Projects filter by city — prefer the clean city captured on place-select; fall back to
                // the granular location string (e.g. when the user typed without picking a suggestion).
                const projectCity = filters.city || filters.location;
                if (projectCity) params.city = projectCity;
                if (filters.price_min) params.minPrice = filters.price_min;
                if (filters.price_max) params.maxPrice = filters.price_max;
                if (filters.sort) params.sort = filters.sort;
                params.page = filters.page;

                const data = await getProjects(params);
                setProjects(data.projects);
                setTotalPages(data.pagination.totalPages);
                setTotalCount(data.pagination.total);
            }
        } catch {
            if (activeTab !== 'projects') setProperties([]);
            else setProjects([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [filters, activeTab]);

    useEffect(() => { loadProperties(); }, [loadProperties]);

    const switchTab = (tab: 'rent' | 'resale' | 'projects') => {
        setActiveTab(tab);
        clearFilters(tab);
    };

    const updateFilter = (key: string, value: string) => {
        const newFilters = { ...filters, [key]: value, page: 1 };
        setFilters(newFilters);
        syncURL(newFilters);
    };

    const toggleMultiFilter = (key: string, value: string) => {
        const current = filters[key as keyof typeof filters];
        const currentStr = typeof current === 'string' ? current : '';
        const arr = currentStr ? currentStr.split(',').filter(Boolean) : [];
        const idx = arr.indexOf(value);
        if (idx >= 0) {
            arr.splice(idx, 1);
        } else {
            arr.push(value);
        }
        updateFilter(key, arr.join(','));
    };

    const removeFilter = (key: string, value: string) => {
        if (key === 'budget') {
            updateFilter('price_min', '');
            updateFilter('price_max', '');
            return;
        }
        if (key === 'location') {
            const next = { ...filters, location: '', city: '', page: 1 };
            setFilters(next);
            syncURL(next);
            return;
        }
        // For multi-select filters, remove just one value
        const current = filters[key as keyof typeof filters];
        const currentStr = typeof current === 'string' ? current : '';
        const arr = currentStr.split(',').filter(Boolean);
        const idx = arr.indexOf(value);
        if (idx >= 0) {
            arr.splice(idx, 1);
            updateFilter(key, arr.join(','));
        } else {
            updateFilter(key, '');
        }
    };

    const syncURL = (f: typeof filters) => {
        const params = new URLSearchParams();
        params.set('tab', activeTab);
        Object.entries(f).forEach(([k, v]) => {
            if (v && v !== '' && v !== 1 && k !== 'intent') params.set(k, String(v));
        });
        router.push(`/properties?${params.toString()}`);
    };

    const clearFilters = (tab?: 'rent' | 'resale' | 'projects') => {
        const cleared = {
            location: '', city: '', taxonomy_node_id: '', intent: '', price_min: '', price_max: '',
            furnishing: '', amenities: '', bhk: '', rooms: '', facing: '', age: '', roof_rights: '',
            sort: 'newest', page: 1,
        };
        setFilters(cleared);
        router.push(`/properties?tab=${tab || activeTab}`);
    };

    const hasActiveFilters = !!(
        filters.location || filters.taxonomy_node_id || filters.price_min || filters.price_max ||
        filters.furnishing || filters.amenities || filters.bhk || filters.rooms ||
        filters.facing || filters.age || filters.roof_rights
    );

    const pageHeading = activeTab === 'rent' ? 'Properties for Rent' :
        activeTab === 'resale' ? 'Properties for Sale' : 'New Launch Projects';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Tab Switcher + Toolbar */}
            <div className="max-w-[1400px] mx-auto px-4 pt-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">{pageHeading}</h1>

                {/* Buy / Rent Segmented Control */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-full w-fit mb-4 relative">
                    {(['buy', 'rent'] as const).map(intent => (
                        <button
                            key={intent}
                            type="button"
                            onClick={() => switchTab(intent === 'buy' ? 'resale' : 'rent')}
                            className={`relative px-6 py-2 rounded-full text-sm font-semibold z-10 transition-colors duration-200 ${
                                (intent === 'buy' && activeTab !== 'rent') || (intent === 'rent' && activeTab === 'rent')
                                    ? 'text-slate-900 dark:text-white'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            {((intent === 'buy' && activeTab !== 'rent') || (intent === 'rent' && activeTab === 'rent')) && (
                                <motion.div
                                    layoutId="intentPill"
                                    className="absolute inset-0 bg-white dark:bg-slate-700 rounded-full shadow-sm"
                                    initial={false}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10">{intent === 'buy' ? 'Buy' : 'Rent'}</span>
                        </button>
                    ))}
                </div>

                {/* Sub-tabs (shown only when Buy is selected) */}
                {activeTab !== 'rent' && (
                    <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
                        {([
                            { key: 'resale' as const, label: 'Resale Properties' },
                            { key: 'projects' as const, label: 'New Launch Projects' },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => switchTab(tab.key)}
                                className={`px-5 py-2.5 font-semibold text-sm transition-all relative ${
                                    activeTab === tab.key
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                {tab.label}
                                {activeTab === tab.key && (
                                    <motion.div
                                        layoutId="activeSubTab"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                                        initial={false}
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Toolbar */}
                <PropertyToolbar
                    location={filters.location}
                    onLocationChange={(v) => updateFilter('location', v)}
                    onPlaceSelect={(loc, city) => {
                        const next = { ...filters, location: loc, city, page: 1 };
                        setFilters(next);
                        syncURL(next);
                    }}
                    sort={filters.sort}
                    onSortChange={(v) => updateFilter('sort', v)}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    totalCount={totalCount}
                    loading={loading}
                    hasActiveFilters={hasActiveFilters}
                    onToggleMobileFilters={() => setMobileFilterOpen(true)}
                />

                {/* Filter Chips */}
                <FilterChips
                    filters={filters}
                    onRemoveFilter={removeFilter}
                />
            </div>

            {/* Two-column layout */}
            <div className="max-w-[1400px] mx-auto px-4 pb-8 flex gap-6 items-start">
                {/* Sidebar — desktop only */}
                <aside className="hidden lg:block w-[280px] flex-shrink-0 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
                    <PropertySidebar
                        filters={filters}
                        onFilterChange={updateFilter}
                        onToggleMultiFilter={toggleMultiFilter}
                        onClearFilters={() => clearFilters()}
                        hasActiveFilters={hasActiveFilters}
                        activeTab={activeTab}
                    />
                </aside>

                {/* Main content */}
                <main className="flex-1 min-w-0">
                    {loading ? (
                        <div className="space-y-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col sm:flex-row">
                                    <div className="w-full sm:w-[280px] h-[200px] bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                    <div className="flex-1 p-5 space-y-3">
                                        <div className="h-5 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        <div className="h-4 w-36 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        <div className="h-7 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        <div className="flex gap-4">
                                            <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                            <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                            <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : activeTab !== 'projects' ? (
                        properties.length > 0 ? (
                            viewMode === 'list' ? (
                                <div className="space-y-4">
                                    {properties.map((p, i) => (
                                        <PropertyListCard
                                            key={p.id}
                                            property={p}
                                            index={i}
                                            onScheduleVisit={setScheduleVisitProperty}
                                            onShareWhatsApp={setShareWhatsAppProperty}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {properties.map((p, i) => (
                                        <PropertyCard key={p.id} property={p} index={i} />
                                    ))}
                                </div>
                            )
                        ) : (
                            <EmptyState onClear={() => clearFilters()} type="properties" />
                        )
                    ) : (
                        projects.length > 0 ? (
                            <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
                                {projects.map((project, i) => (
                                    <ProjectListCard key={project.id} project={project} index={i} />
                                ))}
                            </div>
                        ) : (
                            <EmptyState onClear={() => clearFilters()} type="projects" />
                        )
                    )}

                    {/* Pagination */}
                    <PropertyPagination
                        currentPage={filters.page}
                        totalPages={totalPages}
                        onPageChange={(page) => setFilters(f => ({ ...f, page }))}
                    />
                </main>
            </div>

            {/* Mobile filter drawer */}
            <PropertySidebarMobile
                open={mobileFilterOpen}
                onClose={() => setMobileFilterOpen(false)}
                onClear={() => clearFilters()}
            >
                <PropertySidebar
                    filters={filters}
                    onFilterChange={updateFilter}
                    onToggleMultiFilter={toggleMultiFilter}
                    onClearFilters={() => clearFilters()}
                    hasActiveFilters={hasActiveFilters}
                    activeTab={activeTab}
                />
            </PropertySidebarMobile>

            {/* Schedule Visit modal */}
            {scheduleVisitProperty && (
                <ScheduleVisitModal
                    property={scheduleVisitProperty}
                    onClose={() => setScheduleVisitProperty(null)}
                />
            )}

            {/* Share WhatsApp modal */}
            {shareWhatsAppProperty && (
                <ShareWhatsAppModal
                    property={shareWhatsAppProperty}
                    onClose={() => setShareWhatsAppProperty(null)}
                />
            )}
        </div>
    );
}

/* Empty state component */
function EmptyState({ onClear, type }: { onClear: () => void; type: string }) {
    return (
        <div className="text-center py-20">
            <div className="mx-auto w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">No {type} found</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                We couldn&apos;t find any {type} matching your criteria. Try adjusting your filters or search for a different location.
            </p>
            <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
                <X className="w-4 h-4" /> Clear All Filters
            </button>
        </div>
    );
}

/* Project card component */
function ProjectListCard({ project, index }: { project: Project; index: number }) {
    const firstImage = getMediaUrl(project.media?.find(m => m.media_type === 'IMAGE')?.media_url);
    const minPrice = project.units?.length > 0 ? Math.min(...project.units.map(u => u.price_min)) : null;
    const maxPrice = project.units?.length > 0 ? Math.max(...project.units.map(u => u.price_max || u.price_min)) : null;
    const priceUnit = project.units[0]?.price_unit || 'Lakh';
    const configs = project.units?.length > 0
        ? [...new Set(project.units.map(u => u.configuration))].sort().join(', ')
        : 'Various';

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Link href={`/projects/${project.id}`}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700 h-full">
                    <div className="relative h-52 bg-slate-200 dark:bg-slate-700">
                        {firstImage ? (
                            <img src={firstImage} alt={project.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600"><Building2 className="w-12 h-12" /></div>
                        )}
                        {project.rera_number && (
                            <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">RERA</div>
                        )}
                        <div className="absolute bottom-3 left-3 bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold uppercase">
                            {project.project_status.replace('_', ' ')}
                        </div>
                    </div>
                    <div className="p-5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-1">{project.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {project.locality}, {project.city}
                        </p>
                        {minPrice && (
                            <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-3">
                                ₹{minPrice}{maxPrice && maxPrice !== minPrice && ` - ${maxPrice}`} {priceUnit}
                            </div>
                        )}
                        <div className="flex items-center text-sm text-slate-600 dark:text-slate-300 mb-3">
                            <Home className="w-4 h-4 mr-1" /> {configs}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{project.short_description}</p>
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            By <span className="font-semibold text-slate-700 dark:text-slate-300">{project.owner.contact.name}</span>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

export default function PropertiesPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20 flex items-center justify-center text-slate-500 dark:text-slate-400">Loading...</div>}>
            <PropertiesContent />
        </Suspense>
    );
}
