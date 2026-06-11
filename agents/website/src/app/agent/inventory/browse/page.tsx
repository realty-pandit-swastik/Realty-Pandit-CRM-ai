'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, IndianRupee, Bed, Filter, Loader2 } from 'lucide-react';
import api from '@/lib/api';

/**
 * Partner Browse page — masked cross-partner inventory search.
 *
 * Middleman model (2026-04-17): partners can self-search inventory platform-wide, but the
 * backend (/agent/inventory/browse) strips owner, source partner, and exact address. Anything
 * a partner sees here is safe to share with their client. For coordination/visits, the partner
 * contacts their assigned manager (see ManagerContactBanner).
 *
 * If the partner needs more on a listing, they "Request visit" which creates a deal on their
 * side — all further coordination is handled by the platform's internal team.
 */

interface BrowseItem {
    id: string;
    display_id?: string;
    slug?: string;
    intent?: string;
    category?: string;
    type?: string;
    city?: string | null;
    locality?: string | null;
    sub_locality?: string | null;
    state?: string | null;
    price?: number | string | null;
    price_unit?: string | null;
    specs?: any;
    media_urls?: string[];
    furnishing?: string | null;
    floor_number?: number | null;
    total_floors?: number | null;
    created_at?: string;
}

interface BrowseResponse {
    rows: BrowseItem[];
    total: number;
    page: number;
    limit: number;
}

const INTENT_LABELS: Record<string, string> = {
    sell: 'For sale',
    rent: 'For rent',
    rent_lease: 'Rent / lease',
    lease: 'Lease',
};

function formatPrice(price: BrowseItem['price'], unit?: string | null): string {
    if (price == null) return '—';
    const n = typeof price === 'string' ? parseFloat(price) : price;
    if (!isFinite(n)) return '—';
    if (unit === 'Cr' || n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
    if (unit === 'Lakh' || n >= 100000) return `${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
}

function bhkFromSpecs(specs: any): string | null {
    if (!specs) return null;
    const b = typeof specs === 'string' ? JSON.parse(specs).bedrooms : specs.bedrooms;
    return b ? `${b} BHK` : null;
}

export default function BrowseInventoryPage() {
    const [filters, setFilters] = useState({
        city: '',
        locality: '',
        intent: '',
        type: '',
        bhk: '',
        budget_min: '',
        budget_max: '',
    });
    const [rows, setRows] = useState<BrowseItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async (nextPage = 1) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = { page: String(nextPage), limit: '20' };
            for (const [k, v] of Object.entries(filters)) {
                if (v.trim()) params[k] = v.trim();
            }
            const res = await api.get<BrowseResponse>('/agent/inventory/browse', { params });
            setRows(res.data.rows || []);
            setTotal(res.data.total || 0);
            setPage(res.data.page || 1);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasFilters = useMemo(() => Object.values(filters).some((v) => v.trim()), [filters]);

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Browse inventory</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Search all listings on the platform. Property details are visible — owner contact stays
                    private and flows through your manager.
                </p>
            </div>

            {/* Tabs (same as /agent/inventory) */}
            <nav className="flex gap-1 border-b border-slate-200">
                <a
                    href="/agent/inventory"
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:border-b-2 hover:border-slate-300"
                >
                    My inventory
                </a>
                <a
                    href="/agent/inventory/browse"
                    className="px-4 py-2 text-sm font-semibold text-blue-700 border-b-2 border-blue-600"
                >
                    Browse all
                </a>
            </nav>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-800">Filters</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <input
                        type="text"
                        value={filters.city}
                        onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                        placeholder="City"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                    <input
                        type="text"
                        value={filters.locality}
                        onChange={(e) => setFilters((f) => ({ ...f, locality: e.target.value }))}
                        placeholder="Locality"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                    <select
                        value={filters.intent}
                        onChange={(e) => setFilters((f) => ({ ...f, intent: e.target.value }))}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                        <option value="">Any purpose</option>
                        <option value="sell">For sale</option>
                        <option value="rent">For rent</option>
                        <option value="rent_lease">Rent/lease</option>
                    </select>
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                        <option value="">Any type</option>
                        <option value="flat">Flat / Apartment</option>
                        <option value="house">House / Villa</option>
                        <option value="plot">Plot</option>
                        <option value="office">Office</option>
                        <option value="shop">Shop</option>
                    </select>
                    <select
                        value={filters.bhk}
                        onChange={(e) => setFilters((f) => ({ ...f, bhk: e.target.value }))}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                        <option value="">Any BHK</option>
                        <option value="1">1 BHK</option>
                        <option value="2">2 BHK</option>
                        <option value="3">3 BHK</option>
                        <option value="4">4+ BHK</option>
                    </select>
                    <input
                        type="number"
                        value={filters.budget_min}
                        onChange={(e) => setFilters((f) => ({ ...f, budget_min: e.target.value }))}
                        placeholder="Min budget"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                    <input
                        type="number"
                        value={filters.budget_max}
                        onChange={(e) => setFilters((f) => ({ ...f, budget_max: e.target.value }))}
                        placeholder="Max budget"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => load(1)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        Apply
                    </button>
                </div>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => {
                            setFilters({ city: '', locality: '', intent: '', type: '', bhk: '', budget_min: '', budget_max: '' });
                            setTimeout(() => load(1), 0);
                        }}
                        className="mt-3 text-xs text-slate-500 hover:text-slate-800"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            {/* Result header */}
            <div className="flex items-center justify-between text-sm text-slate-600">
                <span>{loading ? 'Loading…' : `${total} listing${total === 1 ? '' : 's'}`}</span>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>

            {/* Results */}
            {!loading && rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                        <Building2 size={24} className="text-slate-300" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-700">No matches</h3>
                    <p className="text-sm text-slate-400 mt-1">Try broadening your filters.</p>
                </div>
            ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {rows.map((r) => (
                        <li key={r.id} className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-shadow">
                            {r.media_urls && r.media_urls.length > 0 && (
                                <div className="h-40 rounded-xl bg-slate-100 mb-3 overflow-hidden">
                                    <img src={r.media_urls[0]} alt="" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                        {bhkFromSpecs(r.specs) ? `${bhkFromSpecs(r.specs)} ${r.type || ''}` : (r.type || 'Property')}
                                    </p>
                                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                        <MapPin size={12} />
                                        {[r.sub_locality, r.locality, r.city].filter(Boolean).join(', ') || r.state || '—'}
                                    </p>
                                </div>
                                {r.intent && (
                                    <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                        {INTENT_LABELS[r.intent] || r.intent}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-600 mt-2">
                                <span className="inline-flex items-center gap-1">
                                    <IndianRupee size={12} />{formatPrice(r.price, r.price_unit)}
                                </span>
                                {bhkFromSpecs(r.specs) && (
                                    <span className="inline-flex items-center gap-1">
                                        <Bed size={12} />{bhkFromSpecs(r.specs)}
                                    </span>
                                )}
                                {r.furnishing && <span className="text-slate-500">{r.furnishing}</span>}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-3">
                                Owner details hidden — contact your manager to arrange a visit.
                            </p>
                        </li>
                    ))}
                </ul>
            )}

            {/* Pagination */}
            {total > 20 && (
                <div className="flex items-center justify-between pt-2">
                    <button
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => load(page - 1)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-slate-500">
                        Page {page} of {Math.ceil(total / 20)}
                    </span>
                    <button
                        type="button"
                        disabled={page >= Math.ceil(total / 20) || loading}
                        onClick={() => load(page + 1)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
