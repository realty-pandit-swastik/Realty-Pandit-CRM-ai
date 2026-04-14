
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getInventory, getInventoryItem, updateInventory, deleteInventory, approveInventory, rejectInventory, getCategoryTree, getStates, getTeamMembers, getTeamMembersList, uploadInventoryImages, deleteInventoryMedia, transferInventory, uploadInventoryDocument, deleteInventoryDocument } from '../api/client';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { InventoryModal } from './InventoryModal';
import { GooglePlacesInput } from './GooglePlacesInput';
import ShareToClientModal from './ShareToClientModal';
import BookVisitModal from './BookVisitModal';
import { ContactSearchField, type SelectedContact } from './ContactSearchField';
import type { PlaceResult } from './GooglePlacesInput';
import {
    FilterSection,
    FilterCategorySection,
    FilterLocationSection,
    StalenessSection,
} from './filters/FilterSheetShared';
import type { CategorySelection, LocationSelection } from './filters/FilterSheetShared';

function formatPrice(price: number | null, intent: string): string {
    if (!price || price === 0) return 'Price on request';
    const num = Number(price);
    if (intent === 'rent') {
        return `\u20B9${num.toLocaleString('en-IN')}/month`;
    }
    if (num >= 10000000) {
        return `\u20B9${(num / 10000000).toFixed(1)} Cr`;
    }
    if (num >= 100000) {
        return `\u20B9${(num / 100000).toFixed(1)} Lakh`;
    }
    return `\u20B9${num.toLocaleString('en-IN')}`;
}

// ─── Inline Contact Search for Edit Form ────────────────────────────────────
function EditContactSection({ label, color, currentPhone, currentName, onContactSelected }: {
    label: string;
    color: string;
    currentPhone: string;
    currentName: string;
    onContactSelected: (contact: SelectedContact) => void;
}) {
    const [searching, setSearching] = useState(false);

    if (searching) {
        return (
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {label}
                    <button onClick={() => setSearching(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                </div>
                <ContactSearchField
                    label={`Search ${label.toLowerCase()}`}
                    placeholder="Enter phone number or name"
                    onContactSelected={(contact) => {
                        onContactSelected(contact);
                        setSearching(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>{label}</div>
            {currentPhone ? (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                    borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                        backgroundColor: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 700,
                    }}>
                        {(currentName || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{currentName || 'Unknown'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{currentPhone}</div>
                    </div>
                    <button
                        onClick={() => setSearching(true)}
                        style={{
                            padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                            backgroundColor: `${color}22`, color, border: `1px solid ${color}44`, cursor: 'pointer',
                        }}
                    >Change</button>
                </div>
            ) : (
                <button
                    onClick={() => setSearching(true)}
                    style={{
                        width: '100%', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)',
                        border: '1px dashed var(--border-secondary)', cursor: 'pointer', textAlign: 'center',
                    }}
                >+ Search & Select Contact</button>
            )}
        </div>
    );
}

export const InventoryList: React.FC = () => {
    const { hasPermission } = useAuth();
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const pageSize = 20;

    // Filters
    const [filterIntent, setFilterIntent] = useState('');
    const [filterState, setFilterState] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterAgent, setFilterAgent] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterBhk, setFilterBhk] = useState<number[]>([]);
    const [filterLocation, setFilterLocation] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Filter sheet state (v2 redesign) ──
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [filterCategorySelection, setFilterCategorySelection] = useState<CategorySelection>({
        categoryId: '', subCategoryId: '', typeId: '', bhk: [],
    });
    const [filterLocationSelection, setFilterLocationSelection] = useState<LocationSelection>({
        label: '', lat: null, lng: null, radiusKm: 2,
    });
    const [filterListingSource, setFilterListingSource] = useState('');
    const [filterDataSource, setFilterDataSource] = useState('');
    const [filterDaysInSystem, setFilterDaysInSystem] = useState(0);
    const [filterDaysNoVisit, setFilterDaysNoVisit] = useState(0);
    const [filterClassificationTree, setFilterClassificationTree] = useState<any[]>([]);

    // Dropdown data for filters
    const [statesList, setStatesList] = useState<string[]>([]);
    const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);

    // Classification tree for edit form
    const [classTree, setClassTree] = useState<{
        categories: any[];
        configurations: any[];
        usage_types: any[];
        investment_types: any[];
    }>({ categories: [], configurations: [], usage_types: [], investment_types: [] });

    // Add Property form view
    const [showAddForm, setShowAddForm] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Share to Client & Book Visit modals
    const [shareItem, setShareItem] = useState<any>(null);
    const [bookVisitItem, setBookVisitItem] = useState<any>(null);

    // Edit modal tab state
    const [editTab, setEditTab] = useState('media');
    const [editLoading, setEditLoading] = useState(false);

    // Media edit state (live media_urls/video_urls for the item being edited)
    const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);
    const [editVideoUrls, setEditVideoUrls] = useState<string[]>([]);
    const [mediaUploading, setMediaUploading] = useState(false);
    const imageUploadRef = useRef<HTMLInputElement>(null);
    const videoUploadRef = useRef<HTMLInputElement>(null);

    // Document edit state
    const [editDocuments, setEditDocuments] = useState<any[]>([]);
    const [docUploading, setDocUploading] = useState(false);
    const [newDocType, setNewDocType] = useState('other');
    const [newDocTitle, setNewDocTitle] = useState('');
    const docUploadRef = useRef<HTMLInputElement>(null);

    // Call dropdown state
    const [callDropdownId, setCallDropdownId] = useState<string | null>(null);

    // Multi-select state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBatchShareModal, setShowBatchShareModal] = useState(false);
    const [batchShareContact, setBatchShareContact] = useState<{ phone_number: string; name: string | null } | null>(null);
    const [batchShareLoading, setBatchShareLoading] = useState(false);
    const [batchShareResults, setBatchShareResults] = useState<{ id: string; title: string; status: 'sent' | 'already_shared' | 'error'; message: string }[]>([]);
    const [batchContactSearch, setBatchContactSearch] = useState('');
    const [batchContactResults, setBatchContactResults] = useState<{ phone_number: string; name: string | null }[]>([]);
    const [batchContactSearching, setBatchContactSearching] = useState(false);
    const batchSearchTimer = useRef<any>(null);

    // Bulk upload state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{
        imported: number; skipped: number; total: number;
        errors: string[]; message: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadInventory();
    }, [currentPage, filterIntent, filterState, filterType, filterStatus, filterAgent, filterBhk, filterLocation, filterCategorySelection, filterLocationSelection, filterListingSource, filterDataSource, filterDaysInSystem, filterDaysNoVisit]);

    // Close call dropdown on outside click
    useEffect(() => {
        if (!callDropdownId) return;
        const handler = () => setCallDropdownId(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [callDropdownId]);

    // Load dropdown data on mount
    useEffect(() => {
        getStates().then(data => {
            if (Array.isArray(data)) setStatesList(data.map((s: any) => s.name || s));
            else if (data?.states) setStatesList(data.states.map((s: any) => s.name || s));
        }).catch(() => {});
        getTeamMembers().then(data => {
            const members = Array.isArray(data) ? data : data?.data || data?.members || [];
            setAgentsList(members.map((m: any) => ({ id: m.id, name: m.name, role: m.role })));
        }).catch(() => {
            // Fallback for employees who lack manage_team permission
            getTeamMembersList().then(data => {
                const members = Array.isArray(data) ? data : [];
                setAgentsList(members.map((m: any) => ({ id: m.id, name: m.name, role: m.role })));
            }).catch(() => {});
        });
        getCategoryTree().then(data => {
            setClassTree({
                categories: data?.categories || [],
                configurations: data?.configurations || [],
                usage_types: data?.usage_types || [],
                investment_types: data?.investment_types || [],
            });
        }).catch(() => {});
    }, []);

    useEffect(() => {
        client.get('/public/classification-tree')
            .then((r: any) => setFilterClassificationTree(r.data.categories || []))
            .catch(() => {});
    }, []);

    // Debounced search
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setCurrentPage(1);
            loadInventory();
        }, 800);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery]);

    const loadInventory = async () => {
        try {
            setLoading(true);
            const params: Record<string, any> = { page: currentPage, limit: pageSize };
            if (filterIntent) params.intent = filterIntent;
            if (filterState) params.state = filterState;
            if (filterType) params.category = filterType;
            if (filterStatus) params.status = filterStatus;
            if (filterAgent) params.agent_id = filterAgent;
            if (searchQuery.trim()) params.search = searchQuery.trim();
            if (filterBhk.length > 0) params.bhk = filterBhk.join(',');
            if (filterLocation.trim()) params.location = filterLocation.trim();
            if (filterCategorySelection.categoryId) params.category_id = filterCategorySelection.categoryId;
            if (filterCategorySelection.subCategoryId) params.sub_category_id = filterCategorySelection.subCategoryId;
            if (filterListingSource) params.listing_source = filterListingSource;
            if (filterDataSource) params.data_source = filterDataSource;
            if (filterLocationSelection.lat !== null) params.lat = String(filterLocationSelection.lat);
            if (filterLocationSelection.lng !== null) params.lng = String(filterLocationSelection.lng);
            if (filterLocationSelection.lat !== null && filterLocationSelection.radiusKm > 0) params.radius_km = String(filterLocationSelection.radiusKm);
            if (filterDaysInSystem > 0) params.days_in_system = String(filterDaysInSystem);
            if (filterDaysNoVisit > 0) params.days_no_visit = String(filterDaysNoVisit);

            const res = await getInventory(params);
            // Support both paginated { data, total } and legacy array responses
            if (res && res.data && Array.isArray(res.data)) {
                setInventory(res.data);
                setTotalCount(res.total || res.data.length);
                setTotalPages(res.totalPages || 1);
            } else if (Array.isArray(res)) {
                setInventory(res);
                setTotalCount(res.length);
                setTotalPages(1);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Contact search for batch share
    useEffect(() => {
        if (batchContactSearch.trim().length < 2) { setBatchContactResults([]); return; }
        if (batchSearchTimer.current) clearTimeout(batchSearchTimer.current);
        batchSearchTimer.current = setTimeout(async () => {
            setBatchContactSearching(true);
            try {
                const res = await axios.get(`${(import.meta as any).env.VITE_API_BASE_URL}/api/leads/search`, {
                    params: { q: batchContactSearch.trim() },
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                });
                setBatchContactResults(res.data || []);
            } catch { setBatchContactResults([]); }
            finally { setBatchContactSearching(false); }
        }, 400);
    }, [batchContactSearch]);

    const handleBatchShare = async () => {
        if (!batchShareContact || selectedIds.size === 0) return;
        setBatchShareLoading(true);
        setBatchShareResults([]);
        const results: { id: string; title: string; status: 'sent' | 'already_shared' | 'error'; message: string }[] = [];
        for (const invId of Array.from(selectedIds)) {
            const inv = inventory.find(i => i.id === invId);
            const title = [inv?.apartment_name, inv?.locality || inv?.full_address].filter(Boolean).join(', ') || invId;
            try {
                const res = await axios.post(
                    `${(import.meta as any).env.VITE_API_BASE_URL}/api/inventory/${invId}/share-to-client`,
                    { client_phone: batchShareContact.phone_number },
                    { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
                );
                if (res.data.already_shared) {
                    results.push({ id: invId, title, status: 'already_shared', message: `Already shared on ${new Date(res.data.shared_at).toLocaleDateString('en-IN')}` });
                } else {
                    results.push({ id: invId, title, status: 'sent', message: 'Sent via WhatsApp' });
                }
            } catch (err: any) {
                results.push({ id: invId, title, status: 'error', message: err?.response?.data?.error || 'Failed to share' });
            }
        }
        setBatchShareResults(results);
        setBatchShareLoading(false);
    };

    const clearFilters = () => {
        setFilterIntent('');
        setFilterState('');
        setFilterType('');
        setFilterStatus('');
        setFilterAgent('');
        setSearchQuery('');
        setFilterBhk([]);
        setFilterLocation('');
        setCurrentPage(1);
    };

    const hasActiveFilters = filterIntent || filterState || filterType || filterStatus || filterAgent || searchQuery.trim() || filterBhk.length > 0 || filterLocation.trim();

    const activeInventoryFilterCount = [
        filterIntent,
        filterStatus,
        filterAgent,
        filterListingSource,
        filterDataSource,
        filterCategorySelection.categoryId,
        filterCategorySelection.subCategoryId,
        filterLocationSelection.lat !== null ? '1' : '',
        filterDaysInSystem > 0 ? '1' : '',
        filterDaysNoVisit > 0 ? '1' : '',
    ].filter(Boolean).length + (filterCategorySelection.bhk.length > 0 ? 1 : 0);

    const AMENITIES_LIST = [
        { value: 'parking', label: 'Parking' }, { value: 'lift', label: 'Lift' },
        { value: 'security', label: 'Security' }, { value: 'power_backup', label: 'Power Backup' },
        { value: 'swimming_pool', label: 'Swimming Pool' }, { value: 'gym', label: 'Gym' },
        { value: 'garden', label: 'Garden' }, { value: 'club_house', label: 'Club House' },
        { value: 'wifi', label: 'WiFi' }, { value: 'air_conditioning', label: 'Air Conditioning' },
        { value: 'balcony', label: 'Balcony' }, { value: 'cctv', label: 'CCTV' },
        { value: 'visitor_parking', label: 'Visitor Parking' }, { value: 'water_supply', label: '24hr Water' },
        { value: 'gas_pipeline', label: 'Gas Pipeline' }, { value: 'gated_community', label: 'Gated Community' },
        { value: 'fire_safety', label: 'Fire Safety' }, { value: 'solar_panels', label: 'Solar Panels' },
        { value: 'rainwater_harvesting', label: 'Rainwater Harvesting' }, { value: 'intercom', label: 'Intercom' },
    ];

    const populateEditForm = (item: any) => {
        const specs = item.specs || {};
        const features = item.features || {};

        // Derive classification IDs from text slugs (partner-created items have only text, not IDs)
        const catNode = classTree.categories.find((c: any) =>
            c.slug === item.category || c.name?.toLowerCase() === (item.category || '').toLowerCase()
        );
        // Validate that stored IDs exist in the active classTree (deactivated categories won't be there)
        const validCatId = item.category_id && classTree.categories.some((c: any) => c.id === item.category_id);
        const resolvedCatId = validCatId ? item.category_id : (catNode?.id || '');
        const resolvedCat = classTree.categories.find((c: any) => c.id === resolvedCatId);

        const allTypes = resolvedCat?.subcategories?.flatMap((sc: any) => sc.types || []) || [];
        const typeNode = allTypes.find((t: any) =>
            t.slug === item.type || t.name?.toLowerCase() === (item.type || '').toLowerCase()
        );
        const validSubCatId = item.sub_category_id && resolvedCat?.subcategories?.some((sc: any) => sc.id === item.sub_category_id);
        const subCatNode = resolvedCat?.subcategories?.find((sc: any) =>
            sc.types?.some((t: any) => t.id === (item.type_id || typeNode?.id))
        );
        const resolvedSubCatId = validSubCatId ? item.sub_category_id : (subCatNode?.id || '');
        const resolvedSubCat = resolvedCat?.subcategories?.find((sc: any) => sc.id === resolvedSubCatId);
        const validTypeId = item.type_id && resolvedSubCat?.types?.some((t: any) => t.id === item.type_id);

        setEditMediaUrls(Array.isArray(item.media_urls) ? item.media_urls : []);
        setEditVideoUrls(Array.isArray(item.video_urls) ? item.video_urls : []);
        setEditData({
            // Classification IDs (validate against active classTree, fallback to text-based lookup)
            category_id: resolvedCatId,
            sub_category_id: resolvedSubCatId,
            type_id: validTypeId ? item.type_id : (typeNode?.id || ''),
            configuration_id: item.configuration_id || '',
            usage_type_id: item.usage_type_id || '',
            investment_type_id: item.investment_type_id || '',
            // Legacy text fields (auto-derived)
            type: item.type || '',
            category: item.category || '',
            // Property details
            intent: item.intent || '',
            status: item.status || 'active',
            furnishing: item.furnishing || '',
            property_age: item.property_age || '',
            facing: item.facing || '',
            ownership_type: item.ownership_type || '',
            // Specs
            bedrooms: specs.bedrooms ?? '',
            bathrooms: specs.bathrooms ?? '',
            area: specs.area ?? '',
            area_unit: specs.area_unit || 'sqft',
            // Features/Amenities
            features,
            // Address
            flat_no: item.flat_no || '',
            floor_number: item.floor_number ?? '',
            total_floors: item.total_floors ?? '',
            plot_no: item.plot_no || '',
            apartment_name: item.apartment_name || '',
            sub_locality: item.sub_locality || '',
            full_address: item.full_address || '',
            locality: item.locality || '',
            district: item.district || '',
            state: item.state || '',
            pincode: item.pincode || '',
            latitude: item.latitude ?? '',
            longitude: item.longitude ?? '',
            // Pricing
            price: item.price || '',
            price_unit: item.price_unit || '',
            display_price: item.display_price || '',
            customer_price: item.customer_price || '',
            // Owner / Source Contact
            owner_phone: item.owner_phone || '',
            uploader_phone: item.uploader_phone || '',
            uploader_name: item.uploader_name || '',
            // Key Holder
            key_holder_type: item.key_holder_type || '',
            key_holder_name: item.key_holder_name || '',
            key_holder_phone: item.key_holder_phone || '',
            // Description
            description: item.description || '',
            // Assignment & Sharing
            assigned_agent_id: item.assigned_agent_id || '',
            shared_with_ids: item.shared_with_ids || [],
            // Renovation
            renovated: item.renovated || false,
        });
    };

    const handleEdit = async (item: any) => {
        setEditingId(item.id);
        setEditTab('media');
        setEditLoading(true);
        setEditDocuments([]);
        populateEditForm(item); // populate immediately with list data
        try {
            const fullItem = await getInventoryItem(item.id);
            if (fullItem) {
                populateEditForm(fullItem); // re-populate with full fresh data
                setEditDocuments(fullItem.documents || []);
            }
        } catch {
            // keep the list data already populated
        } finally {
            setEditLoading(false);
        }
    };

    const handleDeleteMedia = async (invId: string, url: string) => {
        const filename = url.split('/').pop() || '';
        if (!confirm(`Delete this image?`)) return;
        try {
            await deleteInventoryMedia(invId, filename);
            setEditMediaUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete image');
        }
    };

    const handleDeleteVideo = async (invId: string, url: string) => {
        const filename = url.split('/').pop() || '';
        if (!confirm(`Delete this video?`)) return;
        try {
            await deleteInventoryMedia(invId, filename);
            setEditVideoUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete video');
        }
    };

    const handleUploadImages = async (invId: string, files: FileList) => {
        if (!files.length) return;
        setMediaUploading(true);
        try {
            const result = await uploadInventoryImages(invId, Array.from(files));
            if (result.media_urls) setEditMediaUrls(result.media_urls);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Upload failed');
        } finally {
            setMediaUploading(false);
            if (imageUploadRef.current) imageUploadRef.current.value = '';
        }
    };

    const handleUploadVideos = async (invId: string, files: FileList) => {
        if (!files.length) return;
        setMediaUploading(true);
        try {
            const result = await uploadInventoryImages(invId, Array.from(files));
            if (result.video_urls) setEditVideoUrls(result.video_urls);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Upload failed');
        } finally {
            setMediaUploading(false);
            if (videoUploadRef.current) videoUploadRef.current.value = '';
        }
    };

    const handleSaveEdit = async (closeAfterSave = false) => {
        if (!editingId) return;
        setSaving(true);
        try {
            // Build specs JSON from individual fields
            const specs: Record<string, any> = {};
            if (editData.bedrooms) specs.bedrooms = Number(editData.bedrooms);
            if (editData.bathrooms) specs.bathrooms = Number(editData.bathrooms);
            if (editData.area) specs.area = Number(editData.area);
            if (editData.area_unit) specs.area_unit = editData.area_unit;

            // Build payload — exclude UI-only fields
            const { bedrooms: _b, bathrooms: _ba, area: _a, area_unit: _au, ...rest } = editData;
            const payload: Record<string, any> = { ...rest, specs };

            // Parse numeric coordinate fields
            if (payload.latitude !== '' && payload.latitude !== null && payload.latitude !== undefined) {
                payload.latitude = parseFloat(payload.latitude);
            } else {
                delete payload.latitude;
            }
            if (payload.longitude !== '' && payload.longitude !== null && payload.longitude !== undefined) {
                payload.longitude = parseFloat(payload.longitude);
            } else {
                delete payload.longitude;
            }
            // Clean numeric Decimal fields — empty/NaN must be removed or Prisma crashes
            for (const decField of ['price', 'display_price', 'customer_price']) {
                const v = payload[decField];
                if (v === '' || v === null || v === undefined) {
                    delete payload[decField];
                } else {
                    const parsed = parseFloat(v);
                    if (isNaN(parsed)) {
                        delete payload[decField];
                    } else {
                        payload[decField] = parsed;
                    }
                }
            }

            // Derive legacy text fields from classification IDs
            if (payload.category_id) {
                const cat = classTree.categories.find((c: any) => c.id === payload.category_id);
                if (cat) payload.category = cat.slug;
            }
            if (payload.sub_category_id && payload.category_id) {
                const cat = classTree.categories.find((c: any) => c.id === payload.category_id);
                const sub = cat?.subcategories?.find((s: any) => s.id === payload.sub_category_id);
                if (sub) payload.type = sub.slug;
            }

            await updateInventory(editingId, payload);
            await loadInventory();
            if (closeAfterSave) {
                setEditingId(null);
                setEditData({});
            }
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        setDeleting(true);
        try {
            await deleteInventory(deletingId);
            setDeletingId(null);
            await loadInventory();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete');
        } finally {
            setDeleting(false);
        }
    };

    const handleDownloadTemplate = () => {
        const link = document.createElement('a');
        link.href = `/api/team/inventory/bulk-template`;
        link.click();
    };

    const handleUpload = async () => {
        if (!uploadFile) return;
        setUploading(true);
        setUploadResult(null);

        const formData = new FormData();
        formData.append('file', uploadFile);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/team/inventory/bulk-upload', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                }
            });
            setUploadResult(res.data);
            // Reload inventory after successful upload
            if (res.data.imported > 0) {
                await loadInventory();
            }
        } catch (err: any) {
            setUploadResult({
                imported: 0, skipped: 0, total: 0,
                errors: [err.response?.data?.error || 'Upload failed'],
                message: 'Upload failed'
            });
        } finally {
            setUploading(false);
        }
    };

    const closeModal = () => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadResult(null);
    };

    const s: Record<string, React.CSSProperties> = {
        page: { padding: window.innerWidth < 768 ? '12px' : '24px', overflowY: 'auto', flex: 1, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: window.innerWidth < 768 ? 'flex-start' : 'center', marginBottom: '20px', flexDirection: window.innerWidth < 768 ? 'column' as const : 'row' as const, gap: '10px' },
        h2: { margin: 0, fontSize: '20px', color: 'var(--text-primary)' },
        btnPrimary: {
            backgroundColor: '#3b82f6', color: '#fff', border: 'none',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600
        },
        card: {
            border: '1px solid var(--bg-secondary)', borderRadius: '8px', padding: '16px',
            backgroundColor: 'var(--bg-secondary)', marginBottom: '12px'
        },
        cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' },
        title: { fontWeight: 'bold', fontSize: '15px', color: 'var(--text-primary)' },
        badgeActive: {
            backgroundColor: '#064e3b', color: '#34d399', padding: '3px 10px',
            borderRadius: '12px', fontSize: '12px'
        },
        badgeInactive: {
            backgroundColor: '#450a0a', color: '#f87171', padding: '3px 10px',
            borderRadius: '12px', fontSize: '12px'
        },
        badgePending: {
            backgroundColor: '#451a03', color: '#fbbf24', padding: '3px 10px',
            borderRadius: '12px', fontSize: '12px'
        },
        meta: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' },
        overlay: {
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        },
        modal: {
            backgroundColor: 'var(--bg-secondary)', borderRadius: window.innerWidth < 768 ? '12px 12px 0 0' : '12px',
            padding: window.innerWidth < 768 ? '20px 16px' : '28px',
            width: window.innerWidth < 768 ? '100%' : '500px', maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            maxHeight: window.innerWidth < 768 ? '90vh' : undefined,
            overflowY: 'auto' as const,
        },
        modalTitle: { color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, margin: '0 0 20px' },
        dropzone: {
            border: '2px dashed var(--border-secondary)', borderRadius: '8px', padding: '32px',
            textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-primary)',
            marginBottom: '16px', transition: 'border-color 0.2s'
        },
        smallBtn: {
            background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-link)',
            padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
        },
        successBox: {
            backgroundColor: '#064e3b', border: '1px solid #065f46',
            borderRadius: '8px', padding: '12px', marginBottom: '12px'
        },
        errorBox: {
            backgroundColor: '#450a0a', border: '1px solid var(--error-bg)',
            borderRadius: '8px', padding: '12px', marginBottom: '12px',
            maxHeight: '160px', overflowY: 'auto'
        },
        btnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' },
        cancelBtn: {
            background: 'var(--border-secondary)', border: 'none', color: 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
        },
        actionBtn: {
            background: 'none', border: '1px solid var(--border-secondary)',
            padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
            marginLeft: '6px',
        },
        editInput: {
            width: '100%', padding: '6px 10px', borderRadius: '6px',
            border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: '13px', marginBottom: '8px',
        },
        editLabel: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px', display: 'block' },
        callDropdown: {
            position: 'absolute' as const, bottom: '100%', left: 0, marginBottom: '4px',
            backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
            borderRadius: '8px', padding: '4px', minWidth: '200px', zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        },
        callEntry: {
            display: 'flex', flexDirection: 'column' as const, padding: '8px 12px', borderRadius: '6px',
            textDecoration: 'none', color: 'inherit', cursor: 'pointer',
        },
        callLabel: { fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
        callName: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' },
        callPhone: { fontSize: '12px', color: '#22d3ee' },
    };

    // InventoryModal is rendered at end of main return JSX (no longer a full-page takeover)

    if (loading) return (
        <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Loading inventory...</span>
        </div>
    );

    return (
        <div style={s.page}>
            <div style={s.header}>
                <h2 style={s.h2}>Property Inventory ({totalCount})</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => { setSelectionMode(p => !p); setSelectedIds(new Set()); }}
                        style={{
                            padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            border: selectionMode ? '1.5px solid #3b82f6' : '1px solid var(--border-secondary)',
                            backgroundColor: selectionMode ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)',
                            color: selectionMode ? '#3b82f6' : 'var(--text-secondary)',
                        }}
                    >
                        {selectionMode ? `✓ ${selectedIds.size} Selected` : '☐ Select'}
                    </button>
                    {hasPermission('edit_inventory') && (
                        <button style={{ ...s.btnPrimary, backgroundColor: '#059669' }} onClick={() => setShowAddForm(true)}>
                            + Add Property
                        </button>
                    )}
                    {hasPermission('bulk_upload') && (
                        <button style={s.btnPrimary} onClick={() => setShowUploadModal(true)}>
                            Bulk Upload
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', border: '1px solid var(--border-secondary)' }}>
                <input
                    style={{ ...s.editInput, marginBottom: 0, flex: '1 1 200px', minWidth: '160px' }}
                    placeholder="Search location, locality, apartment..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                            setCurrentPage(1);
                            loadInventory();
                        }
                    }}
                />
                <select style={{ ...s.editInput, marginBottom: 0, flex: '0 1 130px' }} value={filterIntent} onChange={e => { setFilterIntent(e.target.value); setCurrentPage(1); }}>
                    <option value="">All Intent</option>
                    <option value="sell">Sell</option>
                    <option value="rent">Rent</option>
                    <option value="lease">Lease</option>
                </select>
                <select style={{ ...s.editInput, marginBottom: 0, flex: '0 1 130px' }} value={filterType} onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}>
                    <option value="">All Category</option>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="agricultural_land">Agricultural Land</option>
                </select>
                <select style={{ ...s.editInput, marginBottom: 0, flex: '0 1 150px' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
                    <option value="">All Status</option>
                    <option value="pending_approval">⏳ Pending Approval</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="sold">Sold</option>
                    <option value="rented">Rented</option>
                    <option value="withdrawn">Withdrawn</option>
                </select>
                <select style={{ ...s.editInput, marginBottom: 0, flex: '0 1 150px' }} value={filterState} onChange={e => { setFilterState(e.target.value); setCurrentPage(1); }}>
                    <option value="">All States</option>
                    {statesList.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <select style={{ ...s.editInput, marginBottom: 0, flex: '0 1 150px' }} value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setCurrentPage(1); }}>
                    <option value="">All Agents</option>
                    {agentsList.map(ag => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
                </select>
                {/* BHK multi-select chips */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5].map(bhk => (
                        <button
                            key={bhk}
                            onClick={() => {
                                setFilterBhk(prev => prev.includes(bhk) ? prev.filter(b => b !== bhk) : [...prev, bhk]);
                                setCurrentPage(1);
                            }}
                            style={{
                                padding: '4px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
                                border: filterBhk.includes(bhk) ? '1px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                background: filterBhk.includes(bhk) ? 'var(--text-link)' : 'transparent',
                                color: filterBhk.includes(bhk) ? '#fff' : 'var(--text-muted)',
                                fontWeight: filterBhk.includes(bhk) ? 600 : 400,
                            }}
                        >{bhk}BHK</button>
                    ))}
                </div>
                {/* Location search */}
                <input
                    type="text"
                    placeholder="Location..."
                    value={filterLocation}
                    onChange={e => { setFilterLocation(e.target.value); setCurrentPage(1); }}
                    style={{ ...s.editInput, marginBottom: 0, flex: '0 1 140px' }}
                />
                {hasActiveFilters && (
                    <button style={{ ...s.smallBtn, color: '#f87171', borderColor: '#f87171' }} onClick={clearFilters}>
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setShowFilterSheet(true)}
                    style={{
                        padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
                        border: activeInventoryFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                        backgroundColor: activeInventoryFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                        color: activeInventoryFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                        fontWeight: 600, fontSize: '13px',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                >
                    <span>⚙</span>
                    <span>Filters{activeInventoryFilterCount > 0 ? ` (${activeInventoryFilterCount})` : ''}</span>
                </button>
            </div>

            {inventory.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '60px' }}>
                    {hasActiveFilters ? 'No properties match your filters.' : 'No inventory found. Use Bulk Upload to add properties.'}
                </div>
            ) : (
                <div>
                    {inventory.map((item) => (
                        <div key={item.id} style={s.card}>
                            {false ? (
                                /* ── Edit Mode (now in overlay modal) ── */
                                <div>
                                    {/* ── Section: Media Management ── */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>
                                            Photos & Videos {mediaUploading && <span style={{ color: '#fbbf24', fontWeight: 400 }}> (uploading...)</span>}
                                        </div>
                                        {/* Images */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Photos ({editMediaUrls.length})</div>
                                            {editMediaUrls.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                                                    {editMediaUrls.map(url => (
                                                        <div key={url} style={{ position: 'relative', width: '80px', height: '60px' }}>
                                                            <img
                                                                src={url.replace(/(\.[^.]+)$/, '_thumb$1').replace('.webp', '_thumb.webp')}
                                                                onError={e => { (e.target as HTMLImageElement).src = url; }}
                                                                style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-secondary)' }}
                                                                alt=""
                                                            />
                                                            <button
                                                                onClick={() => handleDeleteMedia(editingId!, url)}
                                                                style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px', lineHeight: '18px', padding: 0 }}
                                                            >✕</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input ref={imageUploadRef} type="file" multiple accept="image/*" title="Upload photos" style={{ display: 'none' }} onChange={e => e.target.files && handleUploadImages(editingId!, e.target.files)} />
                                                <button style={{ ...s.smallBtn }} onClick={() => imageUploadRef.current?.click()} disabled={mediaUploading}>+ Add Photos</button>
                                            </div>
                                        </div>
                                        {/* Videos */}
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Videos ({editVideoUrls.length})</div>
                                            {editVideoUrls.length > 0 && (
                                                <div style={{ marginBottom: '6px' }}>
                                                    {editVideoUrls.map(url => (
                                                        <div key={url} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                            <span>🎬 {url.split('/').pop()}</span>
                                                            <button onClick={() => handleDeleteVideo(editingId!, url)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>✕ Remove</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input ref={videoUploadRef} type="file" multiple accept="video/*" title="Upload videos" style={{ display: 'none' }} onChange={e => e.target.files && handleUploadVideos(editingId!, e.target.files)} />
                                                <button style={{ ...s.smallBtn }} onClick={() => videoUploadRef.current?.click()} disabled={mediaUploading}>+ Add Videos</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Classification ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Classification</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Category</label>
                                                <select style={s.editInput} value={editData.category_id} onChange={e => setEditData({ ...editData, category_id: e.target.value, sub_category_id: '', type_id: '' })}>
                                                    <option value="">Select Category</option>
                                                    {classTree.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Sub Category</label>
                                                <select style={s.editInput} value={editData.sub_category_id} onChange={e => setEditData({ ...editData, sub_category_id: e.target.value, type_id: '' })}>
                                                    <option value="">Select Sub Category</option>
                                                    {(classTree.categories.find((c: any) => c.id === editData.category_id)?.subcategories || []).map((sc: any) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Property Type</label>
                                                <select style={s.editInput} value={editData.type_id} onChange={e => setEditData({ ...editData, type_id: e.target.value })}>
                                                    <option value="">Select Type</option>
                                                    {(classTree.categories.find((c: any) => c.id === editData.category_id)?.subcategories?.find((sc: any) => sc.id === editData.sub_category_id)?.types || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Configuration</label>
                                                <select style={s.editInput} value={editData.configuration_id} onChange={e => setEditData({ ...editData, configuration_id: e.target.value })}>
                                                    <option value="">Select Config</option>
                                                    {classTree.configurations.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Usage Type</label>
                                                <select style={s.editInput} value={editData.usage_type_id} onChange={e => setEditData({ ...editData, usage_type_id: e.target.value })}>
                                                    <option value="">Select Usage</option>
                                                    {classTree.usage_types.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Investment Type</label>
                                                <select style={s.editInput} value={editData.investment_type_id} onChange={e => setEditData({ ...editData, investment_type_id: e.target.value })}>
                                                    <option value="">Select Investment</option>
                                                    {classTree.investment_types.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Property Details ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Property Details</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Intent</label>
                                                <select style={s.editInput} value={editData.intent} onChange={e => setEditData({ ...editData, intent: e.target.value })}>
                                                    <option value="sell">Sell</option>
                                                    <option value="rent">Rent</option>
                                                    <option value="lease">Lease</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Status</label>
                                                <select style={s.editInput} value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value })}>
                                                    <option value="pending_approval">Pending Approval</option>
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="sold">Sold</option>
                                                    <option value="rented">Rented</option>
                                                    <option value="withdrawn">Withdrawn</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Furnishing</label>
                                                <select style={s.editInput} value={editData.furnishing} onChange={e => setEditData({ ...editData, furnishing: e.target.value })}>
                                                    <option value="">None</option>
                                                    <option value="unfurnished">Unfurnished</option>
                                                    <option value="semi_furnished">Semi-Furnished</option>
                                                    <option value="fully_furnished">Fully Furnished</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Property Age</label>
                                                <select style={s.editInput} value={editData.property_age} onChange={e => setEditData({ ...editData, property_age: e.target.value })}>
                                                    <option value="">Select</option>
                                                    <option value="new_construction">New</option>
                                                    <option value="1-3_years">1-3 Years</option>
                                                    <option value="3-5_years">3-5 Years</option>
                                                    <option value="5-10_years">5-10 Years</option>
                                                    <option value="10+_years">10+ Years</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Facing</label>
                                                <select style={s.editInput} value={editData.facing} onChange={e => setEditData({ ...editData, facing: e.target.value })}>
                                                    <option value="">Select</option>
                                                    {['north','south','east','west','north_east','north_west','south_east','south_west'].map(f =>
                                                        <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                                                    )}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Ownership Type</label>
                                                <select title="Ownership Type" style={s.editInput} value={editData.ownership_type} onChange={e => setEditData({ ...editData, ownership_type: e.target.value })}>
                                                    <option value="">Select</option>
                                                    <option value="OWNER">Owner</option>
                                                    <option value="EXTERNAL_AGENT">External Agent</option>
                                                    <option value="AGENT_OWNER">Agent-Owner</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Specs ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Specifications</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Bedrooms</label>
                                                <input style={s.editInput} type="number" min="0" value={editData.bedrooms} onChange={e => setEditData({ ...editData, bedrooms: e.target.value })} placeholder="e.g. 2" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Bathrooms</label>
                                                <input style={s.editInput} type="number" min="0" value={editData.bathrooms} onChange={e => setEditData({ ...editData, bathrooms: e.target.value })} placeholder="e.g. 2" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Area</label>
                                                <input style={s.editInput} type="number" min="0" value={editData.area} onChange={e => setEditData({ ...editData, area: e.target.value })} placeholder="e.g. 1200" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Area Unit</label>
                                                <select style={s.editInput} value={editData.area_unit} onChange={e => setEditData({ ...editData, area_unit: e.target.value })}>
                                                    <option value="sqft">Sq.Ft</option>
                                                    <option value="sqm">Sq.M</option>
                                                    <option value="sqyd">Sq.Yd</option>
                                                    <option value="acre">Acre</option>
                                                    <option value="hectare">Hectare</option>
                                                    <option value="bigha">Bigha</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Amenities & Features ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Amenities & Features</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '6px' }}>
                                            {AMENITIES_LIST.map(a => (
                                                <label key={a.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!editData.features?.[a.value]}
                                                        onChange={e => setEditData({ ...editData, features: { ...editData.features, [a.value]: e.target.checked } })}
                                                    />
                                                    {a.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── Section: Address ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Address</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Flat / Unit No</label>
                                                <input style={s.editInput} value={editData.flat_no} onChange={e => setEditData({ ...editData, flat_no: e.target.value })} placeholder="e.g. A-1201" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Floor</label>
                                                <input style={s.editInput} type="number" value={editData.floor_number} onChange={e => setEditData({ ...editData, floor_number: e.target.value })} placeholder="e.g. 3" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Total Floors</label>
                                                <input style={s.editInput} type="number" value={editData.total_floors} onChange={e => setEditData({ ...editData, total_floors: e.target.value })} placeholder="e.g. 12" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Plot No / Building</label>
                                                <input style={s.editInput} value={editData.plot_no} onChange={e => setEditData({ ...editData, plot_no: e.target.value })} placeholder="e.g. Plot 42" />
                                            </div>
                                            <div style={{ gridColumn: window.innerWidth < 768 ? 'span 1' : 'span 2' }}>
                                                <label style={s.editLabel}>Apartment / Society</label>
                                                <input style={s.editInput} value={editData.apartment_name} onChange={e => setEditData({ ...editData, apartment_name: e.target.value })} placeholder="e.g. Gaur City 2" />
                                            </div>
                                            <div style={{ gridColumn: window.innerWidth < 768 ? 'span 1' : 'span 3' }}>
                                                <label style={s.editLabel}>Search Address (Google Places)</label>
                                                <GooglePlacesInput
                                                    value={editData.full_address || ''}
                                                    onChange={v => setEditData({ ...editData, full_address: v })}
                                                    onPlaceSelect={(place: PlaceResult) => {
                                                        setEditData(prev => ({
                                                            ...prev,
                                                            state: place.state || prev.state,
                                                            district: place.district || prev.district,
                                                            locality: place.locality || prev.locality,
                                                            pincode: place.pincode || prev.pincode,
                                                            full_address: place.full_address || prev.full_address,
                                                        }));
                                                    }}
                                                    placeholder="Type to search and auto-fill address fields..."
                                                    style={s.editInput}
                                                />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Locality / Area</label>
                                                <input style={s.editInput} value={editData.locality} onChange={e => setEditData({ ...editData, locality: e.target.value })} placeholder="e.g. Sector 150" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Sub Locality</label>
                                                <input style={s.editInput} value={editData.sub_locality} onChange={e => setEditData({ ...editData, sub_locality: e.target.value })} placeholder="e.g. Block A" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>City</label>
                                                <input style={s.editInput} value={editData.district} onChange={e => setEditData({ ...editData, district: e.target.value })} placeholder="e.g. Gautam Buddh Nagar" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>State</label>
                                                <select style={s.editInput} value={editData.state} onChange={e => setEditData({ ...editData, state: e.target.value })}>
                                                    <option value="">Select State</option>
                                                    {statesList.map(st => <option key={st} value={st}>{st}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Pincode</label>
                                                <input style={s.editInput} value={editData.pincode} onChange={e => setEditData({ ...editData, pincode: e.target.value })} placeholder="e.g. 201310" maxLength={6} />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Latitude</label>
                                                <input style={s.editInput} type="number" step="any" value={editData.latitude} onChange={e => setEditData({ ...editData, latitude: e.target.value })} placeholder="e.g. 28.5355" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Longitude</label>
                                                <input style={s.editInput} type="number" step="any" value={editData.longitude} onChange={e => setEditData({ ...editData, longitude: e.target.value })} placeholder="e.g. 77.3910" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Pricing ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Pricing</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Price (raw INR)</label>
                                                <input style={s.editInput} type="number" value={editData.price} onChange={e => setEditData({ ...editData, price: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Price Unit</label>
                                                <select style={s.editInput} value={editData.price_unit} onChange={e => setEditData({ ...editData, price_unit: e.target.value })}>
                                                    <option value="">Raw INR</option>
                                                    <option value="Lakh">Lakh</option>
                                                    <option value="Crore">Crore</option>
                                                    <option value="Per Month">Per Month</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Display Price (public)</label>
                                                <input style={s.editInput} value={editData.display_price} onChange={e => setEditData({ ...editData, display_price: e.target.value })} placeholder="e.g. 45 Lakh" />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Customer Price (internal)</label>
                                                <input style={s.editInput} type="number" value={editData.customer_price} onChange={e => setEditData({ ...editData, customer_price: e.target.value })} placeholder="e.g. 4500000" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Owner / Source Contact ── */}
                                    <EditContactSection
                                        label="Owner / Source Contact"
                                        color="#34d399"
                                        currentPhone={editData.owner_phone}
                                        currentName={editData.uploader_name}
                                        onContactSelected={(contact) => setEditData({
                                            ...editData,
                                            owner_phone: contact.phone,
                                            uploader_phone: contact.phone,
                                            uploader_name: contact.name,
                                        })}
                                    />

                                    {/* ── Section: Key Holder ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Key Holder</div>
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={s.editLabel}>Key Holder Type</label>
                                            <select style={s.editInput} value={editData.key_holder_type} onChange={e => setEditData({ ...editData, key_holder_type: e.target.value })}>
                                                <option value="">Not Set</option>
                                                <option value="UPLOADER">Uploader</option>
                                                <option value="OWNER">Owner</option>
                                                <option value="EXTERNAL">External (Someone Else)</option>
                                            </select>
                                        </div>
                                        {editData.key_holder_type === 'EXTERNAL' && (
                                            <EditContactSection
                                                label="Key Holder Contact"
                                                color="#60a5fa"
                                                currentPhone={editData.key_holder_phone}
                                                currentName={editData.key_holder_name}
                                                onContactSelected={(contact) => setEditData({
                                                    ...editData,
                                                    key_holder_name: contact.name,
                                                    key_holder_phone: contact.phone,
                                                })}
                                            />
                                        )}
                                    </div>

                                    {/* ── Section: Description ── */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={s.editLabel}>Description</label>
                                        <textarea style={{ ...s.editInput, minHeight: '60px', resize: 'vertical' }} value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} />
                                    </div>

                                    <div style={s.btnRow}>
                                        <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                                        <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={() => handleSaveEdit(true)}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── View Mode — Redesigned Card ── */
                                <>
                                    <div style={{ display: 'flex', gap: '14px' }}>
                                        {/* Selection checkbox */}
                                        {selectionMode && (
                                            <div
                                                onClick={e => { e.stopPropagation(); setSelectedIds(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; }); }}
                                                style={{
                                                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer', alignSelf: 'center',
                                                    border: selectedIds.has(item.id) ? '2px solid #3b82f6' : '2px solid var(--border-secondary)',
                                                    backgroundColor: selectedIds.has(item.id) ? '#3b82f6' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}
                                            >
                                                {selectedIds.has(item.id) && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
                                            </div>
                                        )}
                                        {/* Thumbnail */}
                                        <div style={{ width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {item.media_urls?.[0] ? (
                                                <img
                                                    src={item.media_urls[0].replace(/(\.[^.]+)$/, '_thumb$1')}
                                                    onError={e => { (e.target as HTMLImageElement).src = item.media_urls[0]; }}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    alt=""
                                                />
                                            ) : (
                                                <span style={{ fontSize: '28px', color: 'var(--text-muted)', fontWeight: 700 }}>
                                                    {(item.flat_property_type?.name || item.type || 'P')[0].toUpperCase()}
                                                </span>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* Row 1: Title + badges */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                                    {item.flat_property_type?.name || item.property_type_link?.name || item.type?.replace(/_/g, ' ') || 'Property'}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                                                    ...(item.intent === 'sell' ? { backgroundColor: '#312e81', color: '#818cf8' } :
                                                        item.intent === 'rent' ? { backgroundColor: '#064e3b', color: '#34d399' } :
                                                            { backgroundColor: '#451a03', color: '#fbbf24' })
                                                }}>
                                                    {item.intent?.toUpperCase()}
                                                </span>
                                                <span style={item.status === 'active' ? s.badgeActive : item.status === 'pending_approval' ? s.badgePending : s.badgeInactive}>
                                                    {item.status === 'pending_approval' ? 'PENDING' : item.status?.toUpperCase()}
                                                </span>
                                                {item.upload_source === 'mobile_app' && (
                                                    <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: '#16a34a', borderRadius: 4, padding: '1px 5px' }}>Partner</span>
                                                )}
                                                {item.lead_reference?.startsWith('NEEDS_REVIEW') && (
                                                    <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>Needs Review</span>
                                                )}
                                                {item.renovated && (
                                                    <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🔨 Renovated</span>
                                                )}
                                            </div>

                                            {/* Row 2: Location */}
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {[item.apartment_name, item.full_address || [item.sub_locality, item.locality, item.district || item.city, item.state].filter(Boolean).join(', ')].filter(Boolean).join(', ') || 'Location N/A'}
                                                {item.specs?.bedrooms && ` | ${item.specs.bedrooms}BHK`}
                                                {item.specs?.area && ` | ${item.specs.area} ${item.specs.area_unit || 'sqft'}`}
                                            </div>

                                            {/* Row 3: Dual Pricing */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', fontSize: '13px', flexWrap: 'wrap' }}>
                                                {(item.customer_price || item.price) && (
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        Demand: <strong style={{ color: 'var(--text-secondary)' }}>{formatPrice(item.customer_price || item.price, item.intent)}</strong>
                                                    </span>
                                                )}
                                                {(item.display_price || item.price) && (
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        Display: <strong style={{ color: 'var(--text-link)' }}>{formatPrice(item.display_price || item.price, item.intent)}</strong>
                                                    </span>
                                                )}
                                                {(() => {
                                                    const demand = Number(item.customer_price || item.price || 0);
                                                    const display = Number(item.display_price || 0);
                                                    if (demand > 0 && display > 0 && display !== demand) {
                                                        const margin = display - demand;
                                                        const pct = ((margin / demand) * 100).toFixed(1);
                                                        return (
                                                            <span style={{
                                                                fontSize: '12px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                                                                ...(margin > 0 ? { color: '#34d399', backgroundColor: 'rgba(52,211,153,0.1)' } : { color: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)' })
                                                            }}>
                                                                {margin > 0 ? '+' : ''}{formatPrice(margin, 'sell')} ({pct}%)
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>

                                            {/* Row 4: Completion Bar */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <div style={{ flex: 1, height: '6px', borderRadius: '3px', backgroundColor: 'var(--bg-primary)', maxWidth: '200px' }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: '3px', transition: 'width 0.3s ease',
                                                        width: `${item.completion_pct || 0}%`,
                                                        backgroundColor: (item.completion_pct || 0) > 60 ? '#34d399' : (item.completion_pct || 0) > 30 ? '#fbbf24' : '#f87171',
                                                    }} />
                                                </div>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 700, minWidth: '32px',
                                                    color: (item.completion_pct || 0) > 60 ? '#34d399' : (item.completion_pct || 0) > 30 ? '#fbbf24' : '#f87171',
                                                }}>
                                                    {item.completion_pct || 0}%
                                                </span>
                                                {item.assigned_agent && (
                                                    <span style={{ fontSize: '11px', color: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {item.assigned_agent.name}
                                                    </span>
                                                )}
                                                {item.uploaded_by_agent && (
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        by {item.uploaded_by_agent.name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 5: Action Buttons */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                                {/* Call Button */}
                                                {(item.uploader_phone || item.owner_phone || item.key_holder_phone) && (
                                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                                        <button
                                                            style={{ ...s.actionBtn, color: '#22d3ee', borderColor: '#22d3ee' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCallDropdownId(callDropdownId === item.id ? null : item.id);
                                                            }}
                                                        >&#9742; Call</button>
                                                        {callDropdownId === item.id && (
                                                            <div style={s.callDropdown} onClick={e => e.stopPropagation()}>
                                                                {item.uploader_phone && (
                                                                    <a href={`tel:${item.uploader_phone}`} style={s.callEntry}
                                                                       onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                                                                       onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                                        <span style={s.callLabel}>{item.ownership_type === 'OWNER' ? 'Owner' : 'Uploader'}</span>
                                                                        <span style={s.callName}>{item.uploader_name || 'Unknown'}</span>
                                                                        <span style={s.callPhone}>{item.uploader_phone}</span>
                                                                    </a>
                                                                )}
                                                                {item.owner_phone && item.owner_phone !== item.uploader_phone && (
                                                                    <a href={`tel:${item.owner_phone}`} style={s.callEntry}
                                                                       onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                                                                       onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                                        <span style={s.callLabel}>Owner</span>
                                                                        <span style={s.callPhone}>{item.owner_phone}</span>
                                                                    </a>
                                                                )}
                                                                {item.key_holder_type === 'EXTERNAL' && item.key_holder_phone && (
                                                                    <a href={`tel:${item.key_holder_phone}`} style={s.callEntry}
                                                                       onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                                                                       onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                                        <span style={s.callLabel}>Key Holder</span>
                                                                        <span style={s.callName}>{item.key_holder_name || 'Unknown'}</span>
                                                                        <span style={s.callPhone}>{item.key_holder_phone}</span>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {hasPermission('edit_inventory') && item.status === 'pending_approval' && (
                                                    <>
                                                        <button
                                                            style={{ ...s.actionBtn, color: '#34d399', borderColor: '#34d399' }}
                                                            onClick={async () => {
                                                                if (!confirm('Approve this listing?')) return;
                                                                try { await approveInventory(item.id); await loadInventory(); }
                                                                catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
                                                            }}
                                                        >Approve</button>
                                                        <button
                                                            style={{ ...s.actionBtn, color: '#f87171', borderColor: '#f87171' }}
                                                            onClick={async () => {
                                                                const reason = prompt('Rejection reason (optional):') ?? undefined;
                                                                if (reason === null) return;
                                                                try { await rejectInventory(item.id, reason || undefined); await loadInventory(); }
                                                                catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
                                                            }}
                                                        >Reject</button>
                                                    </>
                                                )}
                                                <button style={{ ...s.actionBtn, color: '#22c55e', borderColor: '#22c55e' }} onClick={() => setShareItem(item)}>Share Client</button>
                                                <button style={{ ...s.actionBtn, color: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={() => setBookVisitItem(item)}>Visit</button>
                                                {hasPermission('edit_inventory') && (
                                                    <button style={{ ...s.actionBtn, color: 'var(--text-link)', borderColor: 'var(--text-link)' }} onClick={() => handleEdit(item)}>Edit</button>
                                                )}
                                                {hasPermission('edit_inventory') && item.status !== 'pending_approval' && (
                                                    <button
                                                        style={{ ...s.actionBtn, color: item.status === 'active' ? '#f59e0b' : '#10b981' }}
                                                        onClick={async () => {
                                                            const newStatus = item.status === 'active' ? 'inactive' : 'active';
                                                            if (!confirm(`${newStatus === 'inactive' ? 'Deactivate' : 'Activate'} this property?`)) return;
                                                            try { await updateInventory(item.id, { status: newStatus }); await loadInventory(); }
                                                            catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
                                                        }}
                                                    >
                                                        {item.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                )}
                                                {hasPermission('delete_inventory') && (
                                                    <button style={{ ...s.actionBtn, color: '#f87171' }} onClick={() => setDeletingId(item.id)}>Delete</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            style={{ ...s.smallBtn, opacity: currentPage <= 1 ? 0.4 : 1 }}
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                        >Previous</button>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '4px 8px' }}>
                            Page {currentPage} / {totalPages}
                        </span>
                        <button
                            style={{ ...s.smallBtn, opacity: currentPage >= totalPages ? 0.4 : 1 }}
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >Next</button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingId && (
                <div style={s.overlay} onClick={e => e.target === e.currentTarget && setDeletingId(null)}>
                    <div style={{ ...s.modal, width: '400px' }}>
                        <h3 style={s.modalTitle}>Confirm Delete</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            Are you sure you want to permanently delete this inventory record? This action cannot be undone.
                        </p>
                        <div style={s.btnRow}>
                            <button style={s.cancelBtn} onClick={() => setDeletingId(null)}>Cancel</button>
                            <button
                                style={{ ...s.btnPrimary, backgroundColor: '#ef4444', opacity: deleting ? 0.6 : 1 }}
                                disabled={deleting}
                                onClick={handleDelete}
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Upload Modal */}
            {showUploadModal && (
                <div style={s.overlay} onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div style={s.modal}>
                        <h3 style={s.modalTitle}>Bulk Inventory Upload</h3>

                        {!uploadResult ? (
                            <>
                                <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                        Upload a CSV file with property details
                                    </span>
                                    <button style={s.smallBtn} onClick={handleDownloadTemplate}>
                                        Download Template
                                    </button>
                                </div>

                                <div
                                    style={{
                                        ...s.dropzone,
                                        borderColor: uploadFile ? '#3b82f6' : 'var(--border-secondary)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv"
                                        style={{ display: 'none' }}
                                        onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                    />
                                    {uploadFile ? (
                                        <div>
                                            <div style={{ fontSize: '28px', marginBottom: '8px' }}>File selected</div>
                                            <div style={{ color: 'var(--text-link)', fontWeight: 600 }}>{uploadFile.name}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                                {(uploadFile.size / 1024).toFixed(1)} KB
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>Click to upload</div>
                                            <div style={{ color: 'var(--text-muted)' }}>Click to select CSV file</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                                Max 10 MB
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Required columns: <code style={{ color: 'var(--text-link)' }}>type, intent, owner_phone</code><br />
                                    Address: state, district, locality, pincode<br />
                                    Optional: category, price, price_unit, bedrooms, bathrooms, area, area_unit, owner_name, status, furnishing, floor_number, total_floors, facing, property_age, key_holder_type, amenities, category_slug, sub_category_slug, type_slug, configuration_slug
                                </div>

                                <div style={s.btnRow}>
                                    <button style={s.cancelBtn} onClick={closeModal}>Cancel</button>
                                    <button
                                        style={{
                                            ...s.btnPrimary,
                                            opacity: (!uploadFile || uploading) ? 0.6 : 1,
                                            cursor: (!uploadFile || uploading) ? 'not-allowed' : 'pointer'
                                        }}
                                        disabled={!uploadFile || uploading}
                                        onClick={handleUpload}
                                    >
                                        {uploading ? 'Uploading...' : 'Upload Now'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={s.successBox}>
                                    <div style={{ color: '#34d399', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>
                                        {uploadResult.message}
                                    </div>
                                    <div style={{ color: '#6ee7b7', fontSize: '13px' }}>
                                        Imported: {uploadResult.imported} &nbsp;|&nbsp;
                                        Skipped: {uploadResult.skipped} &nbsp;|&nbsp;
                                        Total rows: {uploadResult.total}
                                    </div>
                                </div>

                                {uploadResult.errors.length > 0 && (
                                    <div style={s.errorBox}>
                                        <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>
                                            {uploadResult.errors.length} row(s) had issues:
                                        </div>
                                        {uploadResult.errors.map((err, i) => (
                                            <div key={i} style={{ color: 'var(--error-text)', fontSize: '12px', marginBottom: '3px' }}>
                                                {err}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div style={s.btnRow}>
                                    <button style={s.cancelBtn} onClick={closeModal}>Close</button>
                                    <button style={s.btnPrimary} onClick={() => { setUploadFile(null); setUploadResult(null); }}>
                                        Upload Another
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Edit Overlay Modal */}
            {editingId && (
                <div style={s.overlay} onClick={e => e.target === e.currentTarget && setEditingId(null)}>
                    <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 'min(900px, 96vw)',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-secondary)',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                    }}>
                        {/* Modal Header */}
                        {(() => { const editItem = inventory.find(i => i.id === editingId); return (
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Inventory</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID: {editingId?.substring(0, 8)}</span>
                                    {editLoading && <span style={{ fontSize: '12px', color: '#fbbf24' }}>Loading fresh data...</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px' }}>
                                    {editItem?.owner_phone && (
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Owner:</span> {editItem.owner_name || editItem.owner_phone}
                                            {editItem.owner_name && editItem.owner_phone && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({editItem.owner_phone})</span>}
                                        </span>
                                    )}
                                    {(editItem?.uploaded_by_agent || editItem?.uploader_name) && (
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Uploaded by:</span> {editItem.uploaded_by_agent?.name || editItem.uploader_name}
                                            {editItem.uploader_phone && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({editItem.uploader_phone})</span>}
                                            {editItem.upload_source === 'mobile_app' && <span style={{ marginLeft: 4, fontSize: 11, background: 'rgba(34,197,94,0.12)', color: '#16a34a', borderRadius: 4, padding: '1px 5px' }}>Partner</span>}
                                        </span>
                                    )}
                                    {editItem?.upload_source && !editItem?.uploaded_by_agent && !editItem?.uploader_name && (
                                        <span style={{ color: 'var(--text-muted)' }}>Source: {editItem.upload_source}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingId(null)}
                                style={{ background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px' }}
                            >✕ Close</button>
                        </div>
                        ); })()}

                        {/* Tab Bar */}
                        <div style={{ display: 'flex', gap: '2px', padding: '8px 16px 0', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0, overflowX: 'auto' }}>
                            {[
                                { id: 'media', label: 'Media' },
                                { id: 'classification', label: 'Classification' },
                                { id: 'details', label: 'Details' },
                                { id: 'specs', label: 'Specs' },
                                { id: 'amenities', label: 'Amenities' },
                                { id: 'address', label: 'Address' },
                                { id: 'pricing', label: 'Pricing' },
                                { id: 'more', label: 'More' },
                                { id: 'documents', label: 'Documents' },
                                { id: 'assignment', label: 'Assignment' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setEditTab(tab.id)}
                                    style={{
                                        padding: '7px 14px',
                                        fontSize: '13px',
                                        fontWeight: editTab === tab.id ? 700 : 400,
                                        color: editTab === tab.id ? 'var(--text-link)' : 'var(--text-muted)',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: editTab === tab.id ? '2px solid var(--text-link)' : '2px solid transparent',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        marginBottom: '-1px',
                                    }}
                                >{tab.label}</button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                            {/* ── Tab: Media ── */}
                            {editTab === 'media' && (
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '12px' }}>
                                        Photos & Videos {mediaUploading && <span style={{ color: '#fbbf24', fontWeight: 400 }}>(uploading...)</span>}
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Photos ({editMediaUrls.length})</div>
                                        {editMediaUrls.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                                {editMediaUrls.map(url => (
                                                    <div key={url} style={{ position: 'relative', width: '100px', height: '75px' }}>
                                                        <img
                                                            src={url.replace(/(\.[^.]+)$/, '_thumb$1').replace('.webp', '_thumb.webp')}
                                                            onError={e => { (e.target as HTMLImageElement).src = url; }}
                                                            style={{ width: '100px', height: '75px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-secondary)' }}
                                                            alt=""
                                                        />
                                                        <button
                                                            onClick={() => handleDeleteMedia(editingId!, url)}
                                                            style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '11px', lineHeight: '20px', padding: 0 }}
                                                        >✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <input ref={imageUploadRef} type="file" multiple accept="image/*" title="Upload photos" style={{ display: 'none' }} onChange={e => e.target.files && handleUploadImages(editingId!, e.target.files)} />
                                        <button style={s.smallBtn} onClick={() => imageUploadRef.current?.click()} disabled={mediaUploading}>+ Add Photos</button>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Videos ({editVideoUrls.length})</div>
                                        {editVideoUrls.length > 0 && (
                                            <div style={{ marginBottom: '10px' }}>
                                                {editVideoUrls.map(url => (
                                                    <div key={url} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        <span>🎬 {url.split('/').pop()}</span>
                                                        <button onClick={() => handleDeleteVideo(editingId!, url)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>✕ Remove</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <input ref={videoUploadRef} type="file" multiple accept="video/*" title="Upload videos" style={{ display: 'none' }} onChange={e => e.target.files && handleUploadVideos(editingId!, e.target.files)} />
                                        <button style={s.smallBtn} onClick={() => videoUploadRef.current?.click()} disabled={mediaUploading}>+ Add Videos</button>
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Classification ── */}
                            {editTab === 'classification' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={s.editLabel}>Category</label>
                                        <select style={s.editInput} value={editData.category_id} onChange={e => setEditData({ ...editData, category_id: e.target.value, sub_category_id: '', type_id: '' })}>
                                            <option value="">Select Category</option>
                                            {classTree.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Sub Category</label>
                                        <select style={s.editInput} value={editData.sub_category_id} onChange={e => setEditData({ ...editData, sub_category_id: e.target.value, type_id: '' })}>
                                            <option value="">Select Sub Category</option>
                                            {(classTree.categories.find((c: any) => c.id === editData.category_id)?.subcategories || []).map((sc: any) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Property Type</label>
                                        <select style={s.editInput} value={editData.type_id} onChange={e => setEditData({ ...editData, type_id: e.target.value })}>
                                            <option value="">Select Type</option>
                                            {(classTree.categories.find((c: any) => c.id === editData.category_id)?.subcategories?.find((sc: any) => sc.id === editData.sub_category_id)?.types || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Configuration</label>
                                        <select style={s.editInput} value={editData.configuration_id} onChange={e => setEditData({ ...editData, configuration_id: e.target.value })}>
                                            <option value="">Select Config</option>
                                            {classTree.configurations.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Usage Type</label>
                                        <select style={s.editInput} value={editData.usage_type_id} onChange={e => setEditData({ ...editData, usage_type_id: e.target.value })}>
                                            <option value="">Select Usage</option>
                                            {classTree.usage_types.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Investment Type</label>
                                        <select style={s.editInput} value={editData.investment_type_id} onChange={e => setEditData({ ...editData, investment_type_id: e.target.value })}>
                                            <option value="">Select Investment</option>
                                            {classTree.investment_types.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Details ── */}
                            {editTab === 'details' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={s.editLabel}>Intent</label>
                                        <select style={s.editInput} value={editData.intent} onChange={e => setEditData({ ...editData, intent: e.target.value })}>
                                            <option value="sell">Sell</option>
                                            <option value="rent">Rent</option>
                                            <option value="lease">Lease</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Status</label>
                                        <select style={s.editInput} value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value })}>
                                            <option value="pending_approval">Pending Approval</option>
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                            <option value="sold">Sold</option>
                                            <option value="rented">Rented</option>
                                            <option value="withdrawn">Withdrawn</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Furnishing</label>
                                        <select style={s.editInput} value={editData.furnishing} onChange={e => setEditData({ ...editData, furnishing: e.target.value })}>
                                            <option value="">None</option>
                                            <option value="unfurnished">Unfurnished</option>
                                            <option value="semi_furnished">Semi-Furnished</option>
                                            <option value="fully_furnished">Fully Furnished</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Property Age</label>
                                        <select style={s.editInput} value={editData.property_age} onChange={e => setEditData({ ...editData, property_age: e.target.value })}>
                                            <option value="">Select</option>
                                            <option value="new_construction">New</option>
                                            <option value="1-3_years">1-3 Years</option>
                                            <option value="3-5_years">3-5 Years</option>
                                            <option value="5-10_years">5-10 Years</option>
                                            <option value="10+_years">10+ Years</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Facing</label>
                                        <select style={s.editInput} value={editData.facing} onChange={e => setEditData({ ...editData, facing: e.target.value })}>
                                            <option value="">Select</option>
                                            {['north','south','east','west','north_east','north_west','south_east','south_west'].map(f =>
                                                <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Ownership Type</label>
                                        <select title="Ownership Type" style={s.editInput} value={editData.ownership_type} onChange={e => setEditData({ ...editData, ownership_type: e.target.value })}>
                                            <option value="">Select</option>
                                            <option value="OWNER">Owner</option>
                                            <option value="EXTERNAL_AGENT">External Agent</option>
                                            <option value="AGENT_OWNER">Agent-Owner</option>
                                        </select>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={s.editLabel}>Renovation Status</label>
                                        <button
                                            onClick={() => setEditData((p: any) => ({ ...p, renovated: !p.renovated }))}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                                                borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'left',
                                                border: editData.renovated ? '1.5px solid #22c55e' : '1px solid var(--border-secondary)',
                                                backgroundColor: editData.renovated ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                                                border: editData.renovated ? '2px solid #22c55e' : '2px solid var(--border-secondary)',
                                                backgroundColor: editData.renovated ? '#22c55e' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {editData.renovated && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: editData.renovated ? '#22c55e' : 'var(--text-secondary)' }}>
                                                    {editData.renovated ? 'Renovated ✓' : 'Mark as Renovated'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {editData.renovated ? 'Will show "Renovated" badge on website' : 'Property has been newly renovated'}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Specs ── */}
                            {editTab === 'specs' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={s.editLabel}>Bedrooms</label>
                                        <input style={s.editInput} type="number" min="0" value={editData.bedrooms} onChange={e => setEditData({ ...editData, bedrooms: e.target.value })} placeholder="e.g. 2" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Bathrooms</label>
                                        <input style={s.editInput} type="number" min="0" value={editData.bathrooms} onChange={e => setEditData({ ...editData, bathrooms: e.target.value })} placeholder="e.g. 2" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Area</label>
                                        <input style={s.editInput} type="number" min="0" value={editData.area} onChange={e => setEditData({ ...editData, area: e.target.value })} placeholder="e.g. 1200" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Area Unit</label>
                                        <select style={s.editInput} value={editData.area_unit} onChange={e => setEditData({ ...editData, area_unit: e.target.value })}>
                                            <option value="sqft">Sq.Ft</option>
                                            <option value="sqm">Sq.M</option>
                                            <option value="sqyd">Sq.Yd</option>
                                            <option value="acre">Acre</option>
                                            <option value="hectare">Hectare</option>
                                            <option value="bigha">Bigha</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Amenities ── */}
                            {editTab === 'amenities' && (
                                <div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>Select all amenities available at this property.</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                                        {AMENITIES_LIST.map(a => (
                                            <label key={a.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!editData.features?.[a.value]}
                                                    onChange={e => setEditData({ ...editData, features: { ...editData.features, [a.value]: e.target.checked } })}
                                                />
                                                {a.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Address ── */}
                            {editTab === 'address' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={s.editLabel}>Flat / Unit No</label>
                                        <input style={s.editInput} value={editData.flat_no} onChange={e => setEditData({ ...editData, flat_no: e.target.value })} placeholder="e.g. A-1201" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Floor</label>
                                        <input style={s.editInput} type="number" value={editData.floor_number} onChange={e => setEditData({ ...editData, floor_number: e.target.value })} placeholder="e.g. 3" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Total Floors</label>
                                        <input style={s.editInput} type="number" value={editData.total_floors} onChange={e => setEditData({ ...editData, total_floors: e.target.value })} placeholder="e.g. 12" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Plot No / Building</label>
                                        <input style={s.editInput} value={editData.plot_no} onChange={e => setEditData({ ...editData, plot_no: e.target.value })} placeholder="e.g. Plot 42" />
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <label style={s.editLabel}>Apartment / Society</label>
                                        <input style={s.editInput} value={editData.apartment_name} onChange={e => setEditData({ ...editData, apartment_name: e.target.value })} placeholder="e.g. Gaur City 2" />
                                    </div>
                                    <div style={{ gridColumn: 'span 3' }}>
                                        <label style={s.editLabel}>Search Address (Google Places)</label>
                                        <GooglePlacesInput
                                            value={editData.full_address || ''}
                                            onChange={v => setEditData({ ...editData, full_address: v })}
                                            onPlaceSelect={(place: PlaceResult) => {
                                                setEditData(prev => ({
                                                    ...prev,
                                                    state: place.state || prev.state,
                                                    district: place.district || prev.district,
                                                    locality: place.locality || prev.locality,
                                                    pincode: place.pincode || prev.pincode,
                                                    full_address: place.full_address || prev.full_address,
                                                }));
                                            }}
                                            placeholder="Type to search and auto-fill address fields..."
                                            style={s.editInput}
                                        />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Locality / Area</label>
                                        <input style={s.editInput} value={editData.locality} onChange={e => setEditData({ ...editData, locality: e.target.value })} placeholder="e.g. Sector 150" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Sub Locality</label>
                                        <input style={s.editInput} value={editData.sub_locality} onChange={e => setEditData({ ...editData, sub_locality: e.target.value })} placeholder="e.g. Block A" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>City</label>
                                        <input style={s.editInput} value={editData.district} onChange={e => setEditData({ ...editData, district: e.target.value })} placeholder="e.g. Gautam Buddh Nagar" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>State</label>
                                        <select style={s.editInput} value={editData.state} onChange={e => setEditData({ ...editData, state: e.target.value })}>
                                            <option value="">Select State</option>
                                            {statesList.map(st => <option key={st} value={st}>{st}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Pincode</label>
                                        <input style={s.editInput} value={editData.pincode} onChange={e => setEditData({ ...editData, pincode: e.target.value })} placeholder="e.g. 201310" maxLength={6} />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Latitude</label>
                                        <input style={s.editInput} type="number" step="any" value={editData.latitude} onChange={e => setEditData({ ...editData, latitude: e.target.value })} placeholder="e.g. 28.5355" />
                                    </div>
                                    <div>
                                        <label style={s.editLabel}>Longitude</label>
                                        <input style={s.editInput} type="number" step="any" value={editData.longitude} onChange={e => setEditData({ ...editData, longitude: e.target.value })} placeholder="e.g. 77.3910" />
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Pricing ── */}
                            {editTab === 'pricing' && (
                                <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                        {/* Demand Price */}
                                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                                            <label style={{ ...s.editLabel, fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px', marginBottom: '4px' }}>
                                                Demand Price
                                            </label>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                                Owner's expected price (internal, never shown publicly)
                                            </div>
                                            <input
                                                style={s.editInput}
                                                type="number"
                                                value={editData.customer_price}
                                                onChange={e => setEditData({ ...editData, customer_price: e.target.value })}
                                                placeholder="e.g. 4500000"
                                            />
                                            {editData.customer_price && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    = {formatPrice(Number(editData.customer_price), editData.intent || 'sell')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Display Price */}
                                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                                            <label style={{ ...s.editLabel, fontWeight: 700, color: 'var(--text-link)', fontSize: '13px', marginBottom: '4px' }}>
                                                Display Price
                                            </label>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                                Price shown on website to buyers (set higher for margin)
                                            </div>
                                            <input
                                                style={s.editInput}
                                                type="number"
                                                value={editData.display_price}
                                                onChange={e => setEditData({ ...editData, display_price: e.target.value })}
                                                placeholder="e.g. 5000000"
                                            />
                                            {editData.display_price && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    = {formatPrice(Number(editData.display_price), editData.intent || 'sell')}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Margin Calculator */}
                                    {(() => {
                                        const demand = parseFloat(editData.customer_price) || 0;
                                        const display = parseFloat(editData.display_price) || 0;
                                        if (demand > 0 && display > 0) {
                                            const margin = display - demand;
                                            const pct = ((margin / demand) * 100).toFixed(1);
                                            const isPositive = margin > 0;
                                            const isNegative = margin < 0;
                                            return (
                                                <div style={{
                                                    padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
                                                    border: `1px solid ${isNegative ? 'rgba(248,113,113,0.3)' : isPositive ? 'rgba(52,211,153,0.3)' : 'var(--border-secondary)'}`,
                                                    backgroundColor: isNegative ? 'rgba(248,113,113,0.05)' : isPositive ? 'rgba(52,211,153,0.05)' : 'var(--bg-primary)',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                }}>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        {isNegative ? 'Loss' : 'Margin'}:
                                                    </span>
                                                    <span style={{
                                                        fontSize: '16px', fontWeight: 700,
                                                        color: isNegative ? '#f87171' : isPositive ? '#34d399' : 'var(--text-primary)',
                                                    }}>
                                                        {isPositive ? '+' : ''}{formatPrice(margin, 'sell')} ({pct}%)
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Quick Actions */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                        <button
                                            style={{ ...s.smallBtn, fontSize: '12px' }}
                                            onClick={() => setEditData({ ...editData, display_price: editData.customer_price })}
                                            disabled={!editData.customer_price}
                                        >
                                            Copy Demand to Display
                                        </button>
                                        <button
                                            style={{ ...s.smallBtn, fontSize: '12px' }}
                                            onClick={() => {
                                                const d = parseFloat(editData.customer_price);
                                                if (d > 0) setEditData({ ...editData, display_price: String(Math.round(d * 1.1)) });
                                            }}
                                            disabled={!editData.customer_price}
                                        >
                                            +10% Margin
                                        </button>
                                        <button
                                            style={{ ...s.smallBtn, fontSize: '12px' }}
                                            onClick={() => {
                                                const d = parseFloat(editData.customer_price);
                                                if (d > 0) setEditData({ ...editData, display_price: String(Math.round(d * 1.2)) });
                                            }}
                                            disabled={!editData.customer_price}
                                        >
                                            +20% Margin
                                        </button>
                                    </div>

                                    {/* Legacy Price (collapsed) */}
                                    <details style={{ marginTop: '8px' }}>
                                        <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '8px' }}>
                                            Legacy Price Fields (auto-synced)
                                        </summary>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={s.editLabel}>Price (raw INR)</label>
                                                <input style={s.editInput} type="number" value={editData.price} onChange={e => setEditData({ ...editData, price: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Price Unit</label>
                                                <select style={s.editInput} value={editData.price_unit} onChange={e => setEditData({ ...editData, price_unit: e.target.value })}>
                                                    <option value="">Raw INR</option>
                                                    <option value="Lakh">Lakh</option>
                                                    <option value="Crore">Crore</option>
                                                    <option value="Per Month">Per Month</option>
                                                </select>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            )}

                            {/* ── Tab: More ── */}
                            {editTab === 'more' && (
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '12px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Key Holder</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                        <div>
                                            <label style={s.editLabel}>Key Holder</label>
                                            <select style={s.editInput} value={editData.key_holder_type} onChange={e => setEditData({ ...editData, key_holder_type: e.target.value })}>
                                                <option value="">Not Set</option>
                                                <option value="UPLOADER">Uploader</option>
                                                <option value="OWNER">Owner</option>
                                                <option value="EXTERNAL">External</option>
                                            </select>
                                        </div>
                                        {editData.key_holder_type === 'EXTERNAL' && (
                                            <>
                                                <div>
                                                    <label style={s.editLabel}>Key Holder Name</label>
                                                    <input style={s.editInput} value={editData.key_holder_name} onChange={e => setEditData({ ...editData, key_holder_name: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label style={s.editLabel}>Key Holder Phone</label>
                                                    <input style={s.editInput} value={editData.key_holder_phone} onChange={e => setEditData({ ...editData, key_holder_phone: e.target.value })} />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '12px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Description</div>
                                    <textarea style={{ ...s.editInput, minHeight: '120px', resize: 'vertical' }} value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} />
                                </div>
                            )}

                            {/* ── Tab: Documents ── */}
                            {editTab === 'documents' && (
                                <div>
                                    {/* Upload Section */}
                                    <div style={{ padding: '14px', borderRadius: '8px', border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '10px' }}>Upload Document</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                            <div>
                                                <label style={s.editLabel}>Document Type</label>
                                                <select style={s.editInput} value={newDocType} onChange={e => setNewDocType(e.target.value)}>
                                                    <option value="title_deed">Title Deed</option>
                                                    <option value="noc">NOC</option>
                                                    <option value="layout_plan">Layout Plan</option>
                                                    <option value="sale_agreement">Sale Agreement</option>
                                                    <option value="encumbrance">Encumbrance Certificate</option>
                                                    <option value="tax_receipt">Tax Receipt</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={s.editLabel}>Title / Label</label>
                                                <input style={s.editInput} value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} placeholder="e.g. NOC from Builder" />
                                            </div>
                                        </div>
                                        <input
                                            ref={docUploadRef}
                                            type="file"
                                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                                            style={{ display: 'none' }}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file || !editingId) return;
                                                setDocUploading(true);
                                                try {
                                                    const doc = await uploadInventoryDocument(editingId, file, newDocType, newDocTitle || file.name);
                                                    setEditDocuments(prev => [doc, ...prev]);
                                                    setNewDocTitle('');
                                                } catch (err: any) {
                                                    alert(err.response?.data?.error || 'Upload failed');
                                                } finally {
                                                    setDocUploading(false);
                                                    if (docUploadRef.current) docUploadRef.current.value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            style={{ ...s.btnPrimary, fontSize: '13px', opacity: docUploading ? 0.6 : 1 }}
                                            disabled={docUploading}
                                            onClick={() => docUploadRef.current?.click()}
                                        >
                                            {docUploading ? 'Uploading...' : 'Choose File & Upload'}
                                        </button>
                                    </div>

                                    {/* Document List */}
                                    {editDocuments.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            No documents uploaded yet. Add title deeds, NOCs, layout plans, and other property documents.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {editDocuments.map((doc: any) => {
                                                const DOC_TYPE_LABELS: Record<string, string> = {
                                                    title_deed: 'Title Deed', noc: 'NOC', layout_plan: 'Layout Plan',
                                                    sale_agreement: 'Sale Agreement', encumbrance: 'Encumbrance', tax_receipt: 'Tax Receipt', other: 'Other',
                                                };
                                                const isPdf = doc.mime_type === 'application/pdf';
                                                const isImage = doc.mime_type?.startsWith('image/');
                                                return (
                                                    <div key={doc.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                        borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                                    }}>
                                                        {/* Icon */}
                                                        <span style={{ fontSize: '20px', flexShrink: 0 }}>
                                                            {isPdf ? '📄' : isImage ? '🖼' : '📎'}
                                                        </span>
                                                        {/* Info */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {doc.title || doc.file_name}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                                                                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                                                                </span>
                                                                {doc.file_size && (
                                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                        {doc.file_size > 1048576 ? `${(doc.file_size / 1048576).toFixed(1)} MB` : `${Math.round(doc.file_size / 1024)} KB`}
                                                                    </span>
                                                                )}
                                                                {doc.created_at && (
                                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                        {new Date(doc.created_at).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {/* Actions */}
                                                        <a
                                                            href={doc.file_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{ ...s.smallBtn, textDecoration: 'none', color: 'var(--text-link)' }}
                                                        >View</a>
                                                        <button
                                                            style={{ ...s.smallBtn, color: '#f87171', borderColor: '#f87171' }}
                                                            onClick={async () => {
                                                                if (!confirm('Delete this document?') || !editingId) return;
                                                                try {
                                                                    await deleteInventoryDocument(editingId, doc.id);
                                                                    setEditDocuments(prev => prev.filter((d: any) => d.id !== doc.id));
                                                                } catch (err: any) {
                                                                    alert(err.response?.data?.error || 'Failed to delete');
                                                                }
                                                            }}
                                                        >Delete</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Tab: Assignment ── */}
                            {editTab === 'assignment' && (
                                <div>
                                    {/* Assigned To */}
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '12px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Assigned To</div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <select style={s.editInput} value={editData.assigned_agent_id || ''} onChange={e => setEditData({ ...editData, assigned_agent_id: e.target.value })}>
                                            <option value="">Not Assigned</option>
                                            {agentsList.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                                        </select>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>The primary agent handling this property. Changes are saved when you click Save.</div>
                                    </div>

                                    {/* Shared With */}
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-link)', marginBottom: '12px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Shared With</div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>Select team members who should also see and work on this inventory.</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                            {agentsList.map((a: any) => (
                                                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)', background: (editData.shared_with_ids || []).includes(a.id) ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={(editData.shared_with_ids || []).includes(a.id)}
                                                        onChange={e => {
                                                            const current = editData.shared_with_ids || [];
                                                            setEditData({
                                                                ...editData,
                                                                shared_with_ids: e.target.checked
                                                                    ? [...current, a.id]
                                                                    : current.filter((id: string) => id !== a.id)
                                                            });
                                                        }}
                                                    />
                                                    <span>{a.name}</span>
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({a.role})</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Transfer */}
                                    {hasPermission('transfer_inventory') && (
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', marginBottom: '8px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '4px' }}>Transfer Ownership</div>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                                Transfer moves primary assignment to another team member. The current handler loses access unless shared.
                                            </p>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select id="transfer-target-select" style={{ ...s.editInput, flex: 1 }}>
                                                    <option value="">Select team member...</option>
                                                    {agentsList.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                                                </select>
                                                <button
                                                    style={{ ...s.btnPrimary, backgroundColor: '#f87171', whiteSpace: 'nowrap' }}
                                                    onClick={async () => {
                                                        const sel = document.getElementById('transfer-target-select') as HTMLSelectElement;
                                                        const target = sel?.value;
                                                        if (!target) return alert('Select a team member to transfer to');
                                                        const targetName = agentsList.find((a: any) => a.id === target)?.name || target;
                                                        if (!confirm(`Transfer this property to ${targetName}? This changes the assigned agent.`)) return;
                                                        try {
                                                            await transferInventory(editingId!, target);
                                                            setEditData({ ...editData, assigned_agent_id: target });
                                                            alert(`Transferred to ${targetName}`);
                                                            await loadInventory();
                                                        } catch (err: any) {
                                                            alert(err.response?.data?.error || 'Transfer failed');
                                                        }
                                                    }}
                                                >Transfer Now</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, backgroundColor: 'var(--bg-secondary)' }}>
                            <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                            <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)' }} disabled={saving} onClick={() => handleSaveEdit(false)}>
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={() => handleSaveEdit(true)}>
                                {saving ? 'Saving...' : 'Save & Exit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share to Client Modal */}
            {shareItem && (
                <ShareToClientModal
                    item={shareItem}
                    onClose={() => setShareItem(null)}
                    onShared={() => { setShareItem(null); }}
                />
            )}

            {/* Book Visit Modal */}
            {bookVisitItem && (
                <BookVisitModal
                    item={bookVisitItem}
                    onClose={() => setBookVisitItem(null)}
                    onBooked={() => { setBookVisitItem(null); }}
                />
            )}

            {/* Floating action bar — appears when items are selected */}
            {selectionMode && selectedIds.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
                    borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000,
                }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} selected
                    </span>
                    <button
                        onClick={() => { setShowBatchShareModal(true); setBatchShareResults([]); setBatchShareContact(null); setBatchContactSearch(''); }}
                        style={{
                            padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            backgroundColor: '#25d366', border: 'none', color: '#fff',
                        }}
                    >📲 Share via WhatsApp</button>
                    <button
                        onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                        style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                    >Cancel</button>
                </div>
            )}

            {/* Batch Share Modal */}
            {showBatchShareModal && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { if (e.target === e.currentTarget) setShowBatchShareModal(false); }}
                >
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
                            📲 Share {selectedIds.size} Propert{selectedIds.size === 1 ? 'y' : 'ies'} via WhatsApp
                        </div>
                        {batchShareResults.length > 0 ? (
                            <div>
                                {batchShareResults.map(r => (
                                    <div key={r.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-secondary)', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '16px' }}>
                                            {r.status === 'sent' ? '✅' : r.status === 'already_shared' ? '⚠️' : '❌'}
                                        </span>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.title}</div>
                                            <div style={{ fontSize: '11px', color: r.status === 'already_shared' ? '#f59e0b' : r.status === 'error' ? '#ef4444' : '#22c55e' }}>{r.message}</div>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => { setShowBatchShareModal(false); setSelectionMode(false); setSelectedIds(new Set()); setBatchShareResults([]); }}
                                    style={{ marginTop: '16px', width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 700, backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
                                >Done</button>
                            </div>
                        ) : (
                            <div>
                                {!batchShareContact ? (
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Search contact to share with:</div>
                                        <input
                                            type="text"
                                            placeholder="Name or phone number..."
                                            value={batchContactSearch}
                                            onChange={e => setBatchContactSearch(e.target.value)}
                                            autoFocus
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                        {batchContactSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>Searching...</div>}
                                        {batchContactResults.map(c => (
                                            <div
                                                key={c.phone_number}
                                                onClick={() => { setBatchShareContact(c); setBatchContactSearch(''); setBatchContactResults([]); }}
                                                style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', margin: '4px 0', backgroundColor: 'var(--bg-secondary)', display: 'flex', gap: '10px', alignItems: 'center' }}
                                            >
                                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                                    {(c.name || c.phone_number)[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.name || 'Unknown'}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone_number}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.3)', marginBottom: '16px' }}>
                                            <div style={{ fontSize: '12px', color: '#25d366', fontWeight: 600, marginBottom: '4px' }}>Sending to:</div>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{batchShareContact.name || batchShareContact.phone_number}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{batchShareContact.phone_number}</div>
                                            <button onClick={() => setBatchShareContact(null)} style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Change contact</button>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                            {selectedIds.size} propert{selectedIds.size === 1 ? 'y' : 'ies'} will be sent. Already-shared properties will be flagged, not re-sent.
                                        </div>
                                        <button
                                            onClick={handleBatchShare}
                                            disabled={batchShareLoading}
                                            style={{ width: '100%', padding: '12px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', backgroundColor: '#25d366', color: '#fff', border: 'none', cursor: batchShareLoading ? 'not-allowed' : 'pointer', opacity: batchShareLoading ? 0.7 : 1 }}
                                        >{batchShareLoading ? 'Sending...' : '📲 Send via WhatsApp'}</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Inventory Modal */}
            <InventoryModal
                isOpen={showAddForm}
                onClose={() => setShowAddForm(false)}
                onCreated={() => { setShowAddForm(false); loadInventory(); }}
                onEditInventory={async (invId) => {
                    setShowAddForm(false);
                    await loadInventory();
                    try {
                        const item = await getInventoryItem(invId);
                        if (item) handleEdit(item);
                    } catch {}
                }}
            />

            {/* ── Inventory Filter Bottom Sheet ── */}
            {showFilterSheet && (
                <div
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--sheet-backdrop)', zIndex: 900 }}
                    onClick={() => setShowFilterSheet(false)}
                >
                    <div
                        style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '20px 20px 0 0',
                            maxHeight: '85vh', overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            padding: '0 0 32px',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                            animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
                        </div>

                        {/* Header */}
                        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                            <button type="button" onClick={() => {
                                setFilterListingSource(''); setFilterDataSource('');
                                setFilterCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
                                setFilterLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
                                setFilterDaysInSystem(0); setFilterDaysNoVisit(0);
                            }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Clear All
                            </button>
                        </div>

                        <FilterLocationSection value={filterLocationSelection} onChange={setFilterLocationSelection} />

                        <FilterSection title="Listing Source" defaultOpen={false} badge={filterListingSource ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Direct Owner', value: 'OWNER' },
                                    { label: 'Partner Agent', value: 'EXTERNAL_AGENT' },
                                    { label: 'Internal Agent', value: 'AGENT_OWNER' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterListingSource(filterListingSource === opt.value ? '' : opt.value)}
                                        className={`chip ${filterListingSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterSection title="Purpose" defaultOpen badge={filterIntent ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[{ label: 'Sale', value: 'sell' }, { label: 'Rent', value: 'rent' }].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterIntent(filterIntent === opt.value ? '' : opt.value)}
                                        className={`chip ${filterIntent === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterCategorySection
                            tree={filterClassificationTree}
                            value={filterCategorySelection}
                            onChange={setFilterCategorySelection}
                        />

                        <FilterSection title="Listing Status" defaultOpen={false} badge={filterStatus ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['active', 'sold', 'rented', 'withdrawn'].map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                                        className={`chip ${filterStatus === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterSection title="Data Source" defaultOpen={false} badge={filterDataSource ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'WhatsApp', value: 'whatsapp' },
                                    { label: 'Website', value: 'website' },
                                    { label: 'Manual Entry', value: 'admin' },
                                    { label: 'Mobile App', value: 'mobile_app' },
                                    { label: 'Voice', value: 'voice' },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setFilterDataSource(filterDataSource === opt.value ? '' : opt.value)}
                                        className={`chip ${filterDataSource === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <StalenessSection
                            title="Inventory Staleness"
                            label1="Days in system (unsold)"
                            label2="Days since last visit"
                            days1={filterDaysInSystem}
                            days2={filterDaysNoVisit}
                            onDays1Change={setFilterDaysInSystem}
                            onDays2Change={setFilterDaysNoVisit}
                            badge={(filterDaysInSystem > 0 ? 1 : 0) + (filterDaysNoVisit > 0 ? 1 : 0)}
                        />

                        {/* Apply button */}
                        <div style={{ padding: '16px 20px 0' }}>
                            <button type="button"
                                onClick={() => setShowFilterSheet(false)}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                Apply Filters{activeInventoryFilterCount > 0 ? ` (${activeInventoryFilterCount} active)` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
