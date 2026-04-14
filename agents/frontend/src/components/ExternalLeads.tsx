
import { useEffect, useState, useCallback, useRef } from 'react';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import LeadCard from './leads/LeadCard';
import MatchedPropertiesSection from './leads/MatchedPropertiesSection';
import { loadGoogleMaps } from '../lib/loadGoogleMaps';
import {
    FilterSection,
    FilterCategorySection,
    FilterLocationSection,
    StalenessSection,
} from './filters/FilterSheetShared';
import type { CategorySelection, LocationSelection } from './filters/FilterSheetShared';

// ─── Constants ───────────────────────────────────────────────────────────────

const AMENITIES_LIST = [
    { value: 'parking', label: 'Parking' },
    { value: 'lift', label: 'Lift' },
    { value: 'gym', label: 'Gym' },
    { value: 'security', label: 'Security' },
    { value: 'power_backup', label: 'Power Backup' },
    { value: 'garden', label: 'Garden' },
    { value: 'pool', label: 'Swimming Pool' },
    { value: 'water_supply', label: 'Water Supply' },
    { value: 'club_house', label: 'Club House' },
    { value: 'intercom', label: 'Intercom' },
    { value: 'gas_pipeline', label: 'Gas Pipeline' },
    { value: 'park', label: 'Park' },
];

// ─── Type Definitions ────────────────────────────────────────────────────────

interface LeadBySource {
    source: string;
    _count: number;
    latest: string | null;
}

interface Lead {
    phone_number: string;
    name: string | null;
    email: string | null;
    source: string;
    lead_status: string;
    contact_type: string | null;
    intent: string | null;
    property_type: string | null;
    preferred_location: string | null;
    preferred_lat: number | null;
    preferred_lng: number | null;
    lifecycle_stage: string | null;
    created_at: string;
    notes: string | null;
    assigned_agent_id: string | null;
    budget_min: string | null;
    budget_max: string | null;
    demand_bhk: number | null;
    category_id: string | null;
    sub_category_id: string | null;
    type_id: string | null;
    lead_score: { total_score: number } | null;
    timeline: string | null;
    area_min: number | null;
    area_max: number | null;
    area_unit: string | null;
    demand_amenities: string[] | null;
    lead_type: string | null;
    referral_partner_id: string | null;
    referral_partner_name: string | null;
    referral_partner_phone: string | null;
}

interface AppointmentEntry {
    id: string;
    type: string;
    title: string;
    scheduled_at: string;
    status: string;
    property_id: string | null;
    property: { id: string; type: string; location: string | null } | null;
}

interface LeadDetail extends Lead {
    recent_interactions: Array<{
        id: string;
        channel: string;
        direction: string;
        event_type: string;
        content: string | null;
        created_at: string;
        metadata?: Record<string, any> | null;
    }>;
}

interface MatchedProperty {
    id: string;
    type: string;
    category: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    intent: string;
    match_score: number;
    priority_tier: string;
    specs: any;
    media_urls: string[];
}

interface Configuration { id: string; name: string; slug: string; }
interface TeamMember { id: string; name: string; role: string; }

interface PropertyTypeDef { id: string; name: string; slug: string; }
interface SubCategory { id: string; name: string; slug: string; types: PropertyTypeDef[]; }
interface Category { id: string; name: string; slug: string; subcategories: SubCategory[]; }

// ─── Constants ────────────────────────────────────────────────────────────────

const sourceColors: Record<string, string> = {
    '99acres': '#ef4444', 'magicbricks': '#f59e0b', 'housing': '#3b82f6',
    'website': '#22c55e', 'whatsapp': '#25d366', 'voice': '#8b5cf6', 'manual': '#6b7280',
    'admin_created': '#a855f7', 'inventory_workflow': '#06b6d4', 'website_popup': '#f97316',
    'agent_registration': '#ec4899',
};
const sourceLabels: Record<string, string> = {
    '99acres': '99acres', 'magicbricks': 'MagicBricks', 'housing': 'Housing.com',
    'website': 'Website', 'whatsapp': 'WhatsApp', 'voice': 'Voice Call', 'manual': 'Manual',
    'admin_created': 'Admin Created', 'inventory_workflow': 'Inventory Flow', 'website_popup': 'Website Popup',
    'agent_registration': 'Agent Reg.',
};
const LEAD_STATUSES = ['cold', 'warm', 'hot', 'closed', 'lost'];
const LIFECYCLE_STAGES = ['NEW', 'QUALIFIED', 'MATCHED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
const SOURCES = ['99acres', 'magicbricks', 'housing', 'website', 'whatsapp', 'voice', 'manual', 'admin_created', 'inventory_workflow', 'website_popup', 'agent_registration'];
const TIMELINES = ['immediate', '1-3 months', '3-6 months', '6-12 months', '12+ months'];
const BHK_SLUGS = ['studio', '1-bhk', '2-bhk', '3-bhk', '4-bhk', '5-plus-bhk'];
const PRIVILEGED_ROLES = ['super_boss', 'manager'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) { return s >= 80 ? '#ef4444' : s >= 60 ? '#f59e0b' : '#6b7280'; }

function formatBudget(val: string | null): string {
    if (!val) return '-';
    const n = Number(val);
    if (n >= 10000000) return `\u20b9${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `\u20b9${(n / 100000).toFixed(0)}L`;
    return `\u20b9${n.toLocaleString('en-IN')}`;
}

function channelIcon(ch: string) {
    return ({ whatsapp: '💬', voice: '📞', email: '📧', website: '🌐' } as any)[ch] || '📌';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExternalLeads({ isMobile: isMobileProp }: { isMobile?: boolean } = {}) {
    const { agent, hasPermission } = useAuth();
    const isPrivileged = PRIVILEGED_ROLES.includes(agent?.role ?? '');
    const closingViaPopState = useRef(false);

    // ── Mobile detection ──
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // ── Browser back button support (PWA mobile) ──
    useEffect(() => {
        const mobile = isMobileProp ?? isMobile;
        if (!mobile) return;
        const handler = (e: PopStateEvent) => {
            const s = e.state;
            if (s?.view === 'leads' && !s.detail && !s.modal) {
                closingViaPopState.current = true;
                setSelectedPhone(null);
                setLeadDetail(null);
                setMatches([]);
                setShowCreateModal(false);
                closingViaPopState.current = false;
            }
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, [isMobileProp, isMobile]);

    // ── Data state ──
    const [leadsBySource, setLeadsBySource] = useState<LeadBySource[]>([]);
    const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Filters ──
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [agentFilter, setAgentFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    // v2 filter state
    const [intentFilter, setIntentFilter] = useState<'BUYER' | 'TENANT' | ''>('');
    const [categorySelection, setCategorySelection] = useState<CategorySelection>({
        categoryId: '', subCategoryId: '', typeId: '', bhk: [],
    });
    const [locationSelection, setLocationSelection] = useState<LocationSelection>({
        label: '', lat: null, lng: null, radiusKm: 2,
    });
    const [notContactedDays, setNotContactedDays] = useState(0);
    const [noShowcaseDays, setNoShowcaseDays] = useState(0);

    // ── Classification tree ──
    const [classificationTree, setClassificationTree] = useState<Category[]>([]);
    const [configurations, setConfigurations] = useState<Configuration[]>([]);

    // ── Team members ──
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

    // ── Status update ──
    const [updatingPhone, setUpdatingPhone] = useState<string | null>(null);

    // ── Create lead modal ──
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', phone: '', email: '', source: 'manual', intent: '', notes: '',
        preferred_location: '',
    });
    const [createCategoryId, setCreateCategoryId] = useState('');
    const [createSubCategoryId, setCreateSubCategoryId] = useState('');
    const [createPreferredLat, setCreatePreferredLat] = useState<number | null>(null);
    const [createPreferredLng, setCreatePreferredLng] = useState<number | null>(null);
    const [createAssignedAgentId, setCreateAssignedAgentId] = useState('');
    const [createBudgetMin, setCreateBudgetMin] = useState('');
    const [createBudgetMax, setCreateBudgetMax] = useState('');
    const [createBhk, setCreateBhk] = useState('');
    const [createTimeline, setCreateTimeline] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    // Google Maps refs for create modal
    const createLocationRef = useRef<HTMLInputElement>(null);
    const createAcRef = useRef<any>(null);

    // ── Lead Detail Slide-Over ──
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // ── Matches ──
    const [matches, setMatches] = useState<MatchedProperty[]>([]);
    const [matchLoading, setMatchLoading] = useState(false);
    const [matchError, setMatchError] = useState('');

    // ── Slide-over edit state ──
    const [editNotes, setEditNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [editLifecycle, setEditLifecycle] = useState('');
    const [editAgent, setEditAgent] = useState('');
    const [editBudgetMin, setEditBudgetMin] = useState('');
    const [editBudgetMax, setEditBudgetMax] = useState('');
    const [editBhk, setEditBhk] = useState('');
    const [editCategoryId, setEditCategoryId] = useState('');
    const [editSubCategoryId, setEditSubCategoryId] = useState('');
    const [editTypeId, setEditTypeId] = useState('');
    const [editIntent, setEditIntent] = useState('');
    const [editPreferredLat, setEditPreferredLat] = useState<number | null>(null);
    const [editPreferredLng, setEditPreferredLng] = useState<number | null>(null);
    const [editTimeline, setEditTimeline] = useState('');
    const [editAreaMin, setEditAreaMin] = useState('');
    const [editAreaMax, setEditAreaMax] = useState('');
    const [editAreaUnit, setEditAreaUnit] = useState('sqft');
    const [editAmenities, setEditAmenities] = useState<string[]>([]);
    const [savingReqs, setSavingReqs] = useState(false);
    const [sessionAnswers, setSessionAnswers] = useState<Record<string, any> | null>(null);

    // Convert to Deal
    const [convertingDeal, setConvertingDeal] = useState(false);
    const [dealError, setDealError] = useState('');

    // ── Create modal steps ──
    // DIRECT_OWNER:   1=source → 2=contact search → 3=details form
    // PARTNER_REFERRAL: 1=source → 2=details form (with partner search at top)
    const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);

    // ── Client contact search (Step 2 for DIRECT_OWNER) ──
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [clientSearchResults, setClientSearchResults] = useState<Array<{ phone_number: string; name: string | null; contact_type: string; lead_status: string | null }>>([]);
    const [clientSearching, setClientSearching] = useState(false);
    const clientSearchTimer = useRef<any>(null);
    const [preselectedContact, setPreselectedContact] = useState<{ phone_number: string; name: string | null } | null>(null);

    // ── Lead Type Toggle (create modal) ──
    const [createLeadType, setCreateLeadType] = useState<'DIRECT_OWNER' | 'PARTNER_REFERRAL'>('DIRECT_OWNER');
    const [createPartnerPhone, setCreatePartnerPhone] = useState('');
    const [createPartnerName, setCreatePartnerName] = useState('');

    // ── Partner Search (create modal) ──
    const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
    const [partnerSearchResults, setPartnerSearchResults] = useState<Array<{ id: string; phone_number: string; name: string; email?: string; company_name?: string; city?: string; status: string; verified: boolean; package_type: string }>>([]);
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [partnerSelected, setPartnerSelected] = useState<{ id: string; phone_number: string; name: string; email?: string; city?: string; status: string; verified: boolean } | null>(null);
    const [showPartnerRegister, setShowPartnerRegister] = useState(false);
    const [partnerSearchDone, setPartnerSearchDone] = useState(false);
    const [newPartnerForm, setNewPartnerForm] = useState({ phone: '', name: '', email: '', city: '' });
    const partnerSearchTimer = useRef<any>(null);

    // ── 99acres Sync Status ──
    const [syncStatus, setSyncStatus] = useState<any>(null);
    const [syncLoading, setSyncLoading] = useState(false);

    // ── Visits & Views tab (slide-over) ──
    const [sliderTab, setSliderTab] = useState<'activity' | 'visits'>('activity');
    const [leadAppointments, setLeadAppointments] = useState<AppointmentEntry[]>([]);
    const [appointmentsLoading, setAppointmentsLoading] = useState(false);

    // Google Maps refs for slide-over
    const editLocationRef = useRef<HTMLInputElement>(null);
    const editAcRef = useRef<any>(null);

    // ─── Data Loading ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const [sourceRes, recentRes] = await Promise.all([
                client.get('/api/leads/by-source'),
                client.get('/api/leads/recent-external', {
                    params: {
                        ...(sourceFilter ? { source: sourceFilter } : {}),
                        ...(statusFilter ? { status: statusFilter } : {}),
                        ...(agentFilter ? { agent_id: agentFilter } : {}),
                        intent: intentFilter || undefined,
                        category_id: categorySelection.categoryId || undefined,
                        sub_category_id: categorySelection.subCategoryId || undefined,
                        type_id: categorySelection.typeId || undefined,
                        bhk: categorySelection.bhk.length > 0 ? categorySelection.bhk.join(',') : undefined,
                        lat: locationSelection.lat !== null ? String(locationSelection.lat) : undefined,
                        lng: locationSelection.lng !== null ? String(locationSelection.lng) : undefined,
                        radius_km: (locationSelection.lat !== null && locationSelection.radiusKm > 0) ? String(locationSelection.radiusKm) : undefined,
                        not_contacted_days: notContactedDays > 0 ? String(notContactedDays) : undefined,
                        no_showcase_days: noShowcaseDays > 0 ? String(noShowcaseDays) : undefined,
                    },
                }),
            ]);
            setLeadsBySource(sourceRes.data);
            // Support both new format { leads, total } and legacy flat array
            const recentData = recentRes.data;
            setRecentLeads(Array.isArray(recentData) ? recentData : recentData.leads || []);
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    }, [sourceFilter, statusFilter, agentFilter, intentFilter, categorySelection, locationSelection, notContactedDays, noShowcaseDays]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => {
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    // Load sync status
    const loadSyncStatus = useCallback(async () => {
        try {
            const res = await client.get('/api/integrations/sync-status');
            const acres = res.data?.integrations?.find((i: any) => i.source === '99acres');
            setSyncStatus(acres || null);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadSyncStatus(); }, [loadSyncStatus]);
    useEffect(() => {
        const interval = setInterval(loadSyncStatus, 60000);
        return () => clearInterval(interval);
    }, [loadSyncStatus]);

    const handleManualSync = async () => {
        setSyncLoading(true);
        try {
            await client.post('/api/integrations/99acres/sync');
            await Promise.all([loadData(), loadSyncStatus()]);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Sync failed');
        } finally {
            setSyncLoading(false);
        }
    };

    // Load classification tree once
    useEffect(() => {
        client.get('/public/classification-tree')
            .then(r => {
                setClassificationTree(r.data.categories || []);
                setConfigurations(r.data.configurations || []);
            })
            .catch(() => {});
    }, []);

    // Load team members once
    useEffect(() => {
        client.get('/api/team/members-list').then(r => setTeamMembers(r.data)).catch(() => {});
    }, []);

    // ─── Google Maps Autocomplete Setup ───────────────────────────────────────

    const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

    const attachCreateAutocomplete = useCallback(() => {
        if (!createLocationRef.current || !(window as any).google?.maps?.places) return;
        if (createAcRef.current) return;
        const ac = new (window as any).google.maps.places.Autocomplete(createLocationRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry'],
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const lat = place.geometry?.location?.lat() ?? null;
            const lng = place.geometry?.location?.lng() ?? null;
            setCreateForm(p => ({ ...p, preferred_location: place.formatted_address || p.preferred_location }));
            setCreatePreferredLat(lat);
            setCreatePreferredLng(lng);
        });
        createAcRef.current = ac;
    }, []);

    const attachEditAutocomplete = useCallback((onSelect: (location: string, lat: number, lng: number) => void) => {
        if (!editLocationRef.current || !(window as any).google?.maps?.places) return;
        if (editAcRef.current) {
            (window as any).google.maps.event.clearInstanceListeners(editAcRef.current);
        }
        const ac = new (window as any).google.maps.places.Autocomplete(editLocationRef.current, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry'],
        });
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const lat = place.geometry?.location?.lat() ?? 0;
            const lng = place.geometry?.location?.lng() ?? 0;
            onSelect(place.formatted_address || '', lat, lng);
        });
        editAcRef.current = ac;
    }, []);

    useEffect(() => {
        if (!showCreateModal || !MAPS_KEY) return;
        loadGoogleMaps().then(() => {
            setTimeout(attachCreateAutocomplete, 100);
        });
        return () => {
            if (createAcRef.current) {
                (window as any).google?.maps?.event?.clearInstanceListeners(createAcRef.current);
                createAcRef.current = null;
            }
        };
    }, [showCreateModal, MAPS_KEY, attachCreateAutocomplete]);

    // ─── Partner Search (debounced) ──────────────────────────────────────────

    useEffect(() => {
        if (createLeadType !== 'PARTNER_REFERRAL') return;
        if (partnerSearchQuery.trim().length < 2) {
            setPartnerSearchResults([]);
            setPartnerSearchDone(false);
            return;
        }
        if (partnerSearchTimer.current) clearTimeout(partnerSearchTimer.current);
        partnerSearchTimer.current = setTimeout(async () => {
            setPartnerSearching(true);
            try {
                const res = await client.get('/api/partners/search', { params: { q: partnerSearchQuery.trim() } });
                setPartnerSearchResults(res.data || []);
                setPartnerSearchDone(true);
            } catch {
                setPartnerSearchResults([]);
                setPartnerSearchDone(true);
            } finally {
                setPartnerSearching(false);
            }
        }, 400);
        return () => { if (partnerSearchTimer.current) clearTimeout(partnerSearchTimer.current); };
    }, [partnerSearchQuery, createLeadType]);


    const selectPartner = (p: typeof partnerSearchResults[0]) => {
        setPartnerSelected(p);
        setCreatePartnerPhone(p.phone_number);
        setCreatePartnerName(p.name);
        setPartnerSearchQuery('');
        setPartnerSearchResults([]);
        setPartnerSearchDone(false);
        setShowPartnerRegister(false);
    };

    const clearPartnerSelection = () => {
        setPartnerSelected(null);
        setCreatePartnerPhone('');
        setCreatePartnerName('');
        setPartnerSearchQuery('');
        setShowPartnerRegister(false);
        setPartnerSearchDone(false);
        setNewPartnerForm({ phone: '', name: '', email: '', city: '' });
    };

    const confirmNewPartner = () => {
        if (!newPartnerForm.phone.trim()) return;
        setCreatePartnerPhone(newPartnerForm.phone.trim());
        setCreatePartnerName(newPartnerForm.name.trim());
        setShowPartnerRegister(false);
        setPartnerSearchDone(false);
        // partnerSelected stays null — backend will auto-create via ensurePartnerAgent
    };

    // ─── Lead Detail Slide-Over ───────────────────────────────────────────────

    const effectiveIsMobile = isMobileProp ?? isMobile;

    const openDetail = useCallback(async (phone: string) => {
        setSelectedPhone(phone);
        if (effectiveIsMobile) history.pushState({ view: 'leads', detail: phone }, '');
        setMatches([]);
        setMatchError('');
        setDealError('');
        setSliderTab('activity');
        setLeadAppointments([]);
        setDetailLoading(true);
        setDetailError(null);
        try {
            const res = await client.get(`/api/leads/${encodeURIComponent(phone)}`);
            const d: LeadDetail = res.data;
            setLeadDetail(d);
            setEditNotes(d.notes || '');
            setEditLifecycle(d.lifecycle_stage || 'NEW');
            setEditAgent(d.assigned_agent_id || '');
            setEditBudgetMin(d.budget_min ? String(d.budget_min) : '');
            setEditBudgetMax(d.budget_max ? String(d.budget_max) : '');
            setEditBhk(d.demand_bhk ? String(d.demand_bhk) : '');
            setEditCategoryId(d.category_id || '');
            setEditSubCategoryId(d.sub_category_id || '');
            setEditTypeId((d as any).type_id || '');
            setEditIntent(d.intent || '');
            setEditPreferredLat(d.preferred_lat);
            setEditPreferredLng(d.preferred_lng);
            setEditTimeline((d as any).timeline || '');
            setEditAreaMin(d.area_min ? String(d.area_min) : '');
            setEditAreaMax(d.area_max ? String(d.area_max) : '');
            setEditAreaUnit(d.area_unit || 'sqft');
            setEditAmenities(Array.isArray(d.demand_amenities) ? d.demand_amenities : []);
            setSessionAnswers(null);
        } catch (err: any) {
            setLeadDetail(null);
            const status = err?.response?.status;
            setDetailError(
                status === 404
                    ? 'Lead details not found. The contact may have been deleted or the phone number format changed.'
                    : 'Failed to load lead details. Please try again.'
            );
        } finally {
            setDetailLoading(false);
        }

        // Fetch WhatsApp session answers (non-blocking)
        client.get(`/api/leads/${encodeURIComponent(phone)}/session`)
            .then(r => setSessionAnswers(r.data.answers || null))
            .catch(() => {});

        // Fetch appointments for visit history tab (non-blocking)
        setAppointmentsLoading(true);
        client.get('/api/calendar/appointments', { params: { contact_id: phone } })
            .then(r => setLeadAppointments(r.data.appointments || []))
            .catch(() => {})
            .finally(() => setAppointmentsLoading(false));
    }, []);

    // Attach autocomplete to slide-over location input after it renders
    useEffect(() => {
        if (!selectedPhone || !leadDetail || !MAPS_KEY) return;
        loadGoogleMaps().then(() => {
            setTimeout(() => {
                attachEditAutocomplete((location, lat, lng) => {
                    setLeadDetail(prev => prev ? { ...prev, preferred_location: location } : prev);
                    setEditPreferredLat(lat);
                    setEditPreferredLng(lng);
                });
            }, 200);
        });
    }, [selectedPhone, leadDetail?.phone_number, MAPS_KEY, attachEditAutocomplete]);

    const closeDetail = () => {
        if (editAcRef.current) {
            (window as any).google?.maps?.event?.clearInstanceListeners(editAcRef.current);
            editAcRef.current = null;
        }
        setSelectedPhone(null);
        setLeadDetail(null);
        setMatches([]);
        if (effectiveIsMobile && !closingViaPopState.current) {
            history.back();
        }
    };

    // ─── Universal Search Helpers ──────────────────────────────────────────────

    const _resetCreateModal = () => {
        setCreateStep(1);
        setCreateLeadType('DIRECT_OWNER');
        setCreateForm({ name: '', phone: '', email: '', source: 'manual', intent: '', notes: '', preferred_location: '' });
        setCreateCategoryId(''); setCreateSubCategoryId(''); setCreatePreferredLat(null); setCreatePreferredLng(null); setCreateAssignedAgentId('');
        setCreateBudgetMin(''); setCreateBudgetMax(''); setCreateBhk(''); setCreateTimeline('');
        setCreatePartnerPhone(''); setCreatePartnerName('');
        setPartnerSearchQuery(''); setPartnerSearchResults([]); setPartnerSelected(null); setShowPartnerRegister(false); setPartnerSearchDone(false);
        setNewPartnerForm({ phone: '', name: '', email: '', city: '' });
        setClientSearchQuery(''); setClientSearchResults([]); setClientSearching(false); setPreselectedContact(null);
        setCreateError('');
    };

    const openCreateModal = () => {
        _resetCreateModal();
        setShowCreateModal(true);
        if (effectiveIsMobile) history.pushState({ view: 'leads', modal: 'create' }, '');
    };
    const closeCreateModal = () => {
        setShowCreateModal(false);
        _resetCreateModal();
        if (effectiveIsMobile && !closingViaPopState.current) {
            history.back();
        }
    };

    const handleSourceTypeSelect = (type: 'DIRECT_OWNER' | 'PARTNER_REFERRAL') => {
        setCreateLeadType(type);
        if (type === 'DIRECT_OWNER') {
            clearPartnerSelection();
            setCreateStep(2); // → contact search step
        } else {
            setCreateStep(2); // → details form (partner search at top)
        }
    };

    const handleClientSearchChange = (val: string) => {
        // Strip all non-digits, cap at 10
        const digitsOnly = val.replace(/\D/g, '').slice(0, 10);
        setClientSearchQuery(digitsOnly);
        if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current);
        if (digitsOnly.length < 10 || !/^[6-9]/.test(digitsOnly)) {
            setClientSearchResults([]);
            setClientSearching(false);
            return;
        }
        setClientSearching(true);
        clientSearchTimer.current = setTimeout(async () => {
            try {
                const res = await client.get('/api/leads/search', { params: { q: digitsOnly } });
                setClientSearchResults(res.data || []);
            } catch {
                setClientSearchResults([]);
            } finally {
                setClientSearching(false);
            }
        }, 300);
    };

    const handleSelectExistingClient = (contact: { phone_number: string; name: string | null }) => {
        setPreselectedContact(contact);
        setCreateForm(p => ({ ...p, name: contact.name || '', phone: contact.phone_number.startsWith('TEMP_') ? '' : contact.phone_number }));
        setCreateStep(3);
    };

    const handleCreateNewClient = () => {
        const q = clientSearchQuery.trim();
        // clientSearchQuery is always digits-only, so always treat as phone
        setCreateForm(p => ({ ...p, phone: q }));
        setPreselectedContact(null);
        setCreateStep(3);
    };

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleStatusChange = async (phone: string, newStatus: string) => {
        try {
            setUpdatingPhone(phone);
            await client.patch(`/api/leads/${encodeURIComponent(phone)}/status`, { lead_status: newStatus });
            setRecentLeads(prev => prev.map(l => l.phone_number === phone ? { ...l, lead_status: newStatus } : l));
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to update status');
        } finally {
            setUpdatingPhone(null);
        }
    };

    const handleLifecycleChange = async (newStage: string) => {
        if (!selectedPhone) return;
        setEditLifecycle(newStage);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(selectedPhone)}/requirements`, { lifecycle_stage: newStage });
            setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, lifecycle_stage: newStage } : l));
        } catch {}
    };

    const handleAgentChange = async (agentId: string) => {
        if (!selectedPhone) return;
        setEditAgent(agentId);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(selectedPhone)}/assign`, { agent_id: agentId || null });
            setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, assigned_agent_id: agentId || null } : l));
        } catch {}
    };

    const handleSaveNotes = async () => {
        if (!selectedPhone) return;
        setSavingNotes(true);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(selectedPhone)}/requirements`, { notes: editNotes });
            setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? { ...l, notes: editNotes } : l));
        } catch {} finally { setSavingNotes(false); }
    };

    const handleSaveRequirements = async () => {
        if (!selectedPhone) return;
        setSavingReqs(true);
        try {
            await client.patch(`/api/leads/${encodeURIComponent(selectedPhone)}/requirements`, {
                budget_min: editBudgetMin || null,
                budget_max: editBudgetMax || null,
                demand_bhk: editBhk || null,
                preferred_lat: editPreferredLat,
                preferred_lng: editPreferredLng,
                preferred_location: leadDetail?.preferred_location || null,
                category_id: editCategoryId || null,
                sub_category_id: editSubCategoryId || null,
                type_id: editTypeId || null,
                intent: editIntent || null,
                timeline: editTimeline || null,
                area_min: editAreaMin || null,
                area_max: editAreaMax || null,
                area_unit: editAreaUnit || null,
                demand_amenities: editAmenities.length > 0 ? editAmenities : null,
            });
            setRecentLeads(prev => prev.map(l => l.phone_number === selectedPhone ? {
                ...l,
                budget_min: editBudgetMin || null,
                budget_max: editBudgetMax || null,
                demand_bhk: editBhk ? Number(editBhk) : null,
                category_id: editCategoryId || null,
                sub_category_id: editSubCategoryId || null,
            } : l));
        } catch {} finally { setSavingReqs(false); }
    };

    const handleFindMatches = async () => {
        if (!selectedPhone) return;
        setMatchLoading(true);
        setMatchError('');
        setMatches([]);
        try {
            const res = await client.post(`/api/leads/${encodeURIComponent(selectedPhone)}/match`);
            const m = res.data.matches || [];
            setMatches(m);
            if (m.length === 0) setMatchError('No matching properties found. Try updating the requirements.');
        } catch (err: any) {
            setMatchError(err?.response?.data?.error || 'Matching failed');
        } finally {
            setMatchLoading(false);
        }
    };

    const handleConvertToDeal = async () => {
        if (!leadDetail) return;
        setConvertingDeal(true);
        setDealError('');
        try {
            const intentMap: Record<string, string> = { buy: 'SALE', rent: 'RENT' };
            const dealType = intentMap[leadDetail.intent ?? ''];
            if (!dealType) { setDealError('Lead needs a valid intent (buy or rent) to convert.'); return; }

            await client.post('/api/deals', {
                demand_contact_id: leadDetail.phone_number,
                demand_handler_type: 'DIRECT',
                type: dealType,
                demand_intent: leadDetail.intent,
                demand_location: leadDetail.preferred_location,
                demand_budget_min: leadDetail.budget_min ? Number(leadDetail.budget_min) : undefined,
                demand_budget_max: leadDetail.budget_max ? Number(leadDetail.budget_max) : undefined,
                demand_bedrooms: leadDetail.demand_bhk ? String(leadDetail.demand_bhk) : undefined,
            });
            alert('Deal created successfully! View it in the Deal Pipeline.');
        } catch (err: any) {
            setDealError(err?.response?.data?.error || 'Failed to create deal');
        } finally {
            setConvertingDeal(false);
        }
    };

    const handleExportCSV = () => {
        const headers = ['Name', 'Phone', 'Email', 'Source', 'Status', 'Lifecycle', 'Intent', 'Budget Min', 'Budget Max', 'BHK', 'Location', 'Score', 'Agent', 'Date'];
        const rows = filteredLeads.map(l => [
            l.name || '', l.phone_number, l.email || '', l.source, l.lead_status,
            l.lifecycle_stage || '', l.intent || '', l.budget_min || '', l.budget_max || '',
            l.demand_bhk || '', l.preferred_location || '', l.lead_score?.total_score ?? '',
            l.assigned_agent_id || '', new Date(l.created_at).toLocaleDateString('en-IN'),
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCreateLead = async (e: React.FormEvent) => {
        e.preventDefault();
        if (createLeadType === 'PARTNER_REFERRAL') {
            if (!createPartnerPhone) { setCreateError('Please search and select a partner agent, or register a new one.'); return; }
            if (!createForm.name.trim()) { setCreateError('Client name is required for partner referral leads.'); return; }
        } else {
            if (!createForm.phone.trim()) { setCreateError('Phone number is required'); return; }
        }
        try {
            setCreating(true);
            setCreateError('');
            await client.post('/api/leads', {
                ...createForm,
                category_id: createCategoryId || undefined,
                sub_category_id: createSubCategoryId || undefined,
                preferred_lat: createPreferredLat,
                preferred_lng: createPreferredLng,
                budget_min: createBudgetMin || undefined,
                budget_max: createBudgetMax || undefined,
                demand_bhk: createBhk || undefined,
                timeline: createTimeline || undefined,
                lead_type: createLeadType,
                ...(createLeadType === 'PARTNER_REFERRAL' && createPartnerPhone ? { referral_partner_phone: createPartnerPhone } : {}),
                ...(createLeadType === 'PARTNER_REFERRAL' && createPartnerName ? { referral_partner_name: createPartnerName } : {}),
                ...(isPrivileged && createAssignedAgentId ? { assigned_agent_id: createAssignedAgentId } : {}),
            });
            closeCreateModal();
            loadData();
        } catch (err: any) {
            setCreateError(err?.response?.data?.error || 'Failed to create lead');
        } finally {
            setCreating(false);
        }
    };

    // ─── Derived State ─────────────────────────────────────────────────────────

    const totalAll = leadsBySource.reduce((sum, s) => sum + s._count, 0);

    const activeFilterCount = [
        statusFilter,
        sourceFilter,
        agentFilter,
        dateFrom,
        dateTo,
        intentFilter,
        categorySelection.categoryId,
        categorySelection.subCategoryId,
        locationSelection.lat !== null ? '1' : '',
        notContactedDays > 0 ? '1' : '',
        noShowcaseDays > 0 ? '1' : '',
    ].filter(Boolean).length + (categorySelection.bhk.length > 0 ? 1 : 0);

    const filteredLeads = recentLeads.filter(lead => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const match = (lead.name || '').toLowerCase().includes(q) || lead.phone_number.includes(q) ||
                (lead.email || '').toLowerCase().includes(q) || (lead.preferred_location || '').toLowerCase().includes(q);
            if (!match) return false;
        }
        if (statusFilter && lead.lead_status !== statusFilter) return false;
        if (sourceFilter && lead.source !== sourceFilter) return false;
        if (agentFilter && lead.assigned_agent_id !== agentFilter) return false;
        if (dateFrom) {
            const leadDate = new Date(lead.created_at).toISOString().slice(0, 10);
            if (leadDate < dateFrom) return false;
        }
        if (dateTo) {
            const leadDate = new Date(lead.created_at).toISOString().slice(0, 10);
            if (leadDate > dateTo) return false;
        }
        return true;
    });

    // Cascading subcategories (create modal)
    const createSubCategories = classificationTree.find(c => c.id === createCategoryId)?.subcategories || [];

    // Cascading for slide-over edit
    const editSubCategories = classificationTree.find(c => c.id === editCategoryId)?.subcategories || [];

    // ─── Loading State ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>Loading leads...</div>
                    <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-secondary)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div style={{ flex: 1, display: 'flex', overflowY: 'hidden', position: 'relative' }}>

            {/* ── Main Content ── */}
            <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>

                {/* Header — compact */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '17px' }}>Leads</h2>
                        <span style={{ color: '#3b82f6', fontSize: '14px', fontWeight: 700 }}>{totalAll}</span>
                        {/* 99acres sync status — inline dot */}
                        {syncStatus && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                <div style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    backgroundColor: syncStatus.sync?.status === 'success' ? '#22c55e'
                                        : syncStatus.sync?.status === 'failed' ? '#ef4444'
                                        : syncStatus.sync?.status === 'running' ? '#f59e0b' : '#6b7280',
                                }} />
                                <span>99acres</span>
                                {isPrivileged && syncStatus.configured && (
                                    <button type="button" onClick={handleManualSync} disabled={syncLoading || syncStatus.sync?.status === 'running'}
                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', padding: 0 }}>
                                        {syncLoading ? '...' : 'Sync'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={handleExportCSV} style={{ ...outlineBtn, padding: '5px 10px', fontSize: '12px' }}>Export</button>
                        <button type="button" onClick={loadData} style={{ ...outlineBtn, padding: '5px 10px', fontSize: '12px' }}>Refresh</button>
                        <button type="button" onClick={openCreateModal} style={{ ...primaryBtn, padding: '5px 12px', fontSize: '12px' }}>+ Add Lead</button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ marginBottom: '8px', padding: '6px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{error}</span>
                        <button type="button" onClick={loadData} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #dc2626', backgroundColor: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: '11px' }}>Retry</button>
                    </div>
                )}

                {/* Source Pills — compact horizontal row */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {leadsBySource.map(s => (
                        <button type="button" key={s.source} onClick={() => setSourceFilter(p => p === s.source ? '' : s.source)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: 600, border: sourceFilter === s.source ? '2px solid #3b82f6' : '1px solid var(--border-secondary)', backgroundColor: sourceFilter === s.source ? '#eff6ff' : 'var(--bg-secondary)', color: sourceColors[s.source] || '#6b7280', cursor: 'pointer' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: sourceColors[s.source] || '#6b7280' }} />
                            {sourceLabels[s.source] || s.source} <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{s._count}</span>
                        </button>
                    ))}
                </div>

                {/* ── Filters — mobile: minimalist bar; desktop: full rows ── */}
                {isMobile ? (
                    <div style={{ padding: '4px 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Row 1: Search + Filters button */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search name, phone, email..."
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: '12px',
                                    border: '1px solid var(--border-secondary)',
                                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                    fontSize: '14px', outline: 'none',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowFilterSheet(true)}
                                style={{
                                    padding: '10px 14px', borderRadius: '12px', cursor: 'pointer',
                                    border: activeFilterCount > 0 ? '1.5px solid var(--text-link)' : '1px solid var(--border-secondary)',
                                    backgroundColor: activeFilterCount > 0 ? 'var(--text-link)' : 'var(--bg-secondary)',
                                    color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
                                    fontWeight: 600, fontSize: '13px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                <span>⚙</span>
                                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                            </button>
                        </div>

                        {/* Row 2: Active filter chips (dismissible) */}
                        {activeFilterCount > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {statusFilter && (
                                    <button type="button" onClick={() => setStatusFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {statusFilter} ×
                                    </button>
                                )}
                                {sourceFilter && (
                                    <button type="button" onClick={() => setSourceFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {sourceLabels[sourceFilter] || sourceFilter} ×
                                    </button>
                                )}
                                {agentFilter && (
                                    <button type="button" onClick={() => setAgentFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {teamMembers.find(m => m.id === agentFilter)?.name || 'Agent'} ×
                                    </button>
                                )}
                                {dateFrom && (
                                    <button type="button" onClick={() => setDateFrom('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        From {dateFrom} ×
                                    </button>
                                )}
                                {dateTo && (
                                    <button type="button" onClick={() => setDateTo('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        To {dateTo} ×
                                    </button>
                                )}
                                {intentFilter && (
                                    <button type="button" onClick={() => setIntentFilter('')} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {intentFilter === 'BUYER' ? 'Buy' : 'Rent'} ×
                                    </button>
                                )}
                                {categorySelection.categoryId && (
                                    <button type="button" onClick={() => setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {classificationTree.find(c => c.id === categorySelection.categoryId)?.name || 'Category'} ×
                                    </button>
                                )}
                                {categorySelection.subCategoryId && (
                                    <button type="button" onClick={() => setCategorySelection(prev => ({ ...prev, subCategoryId: '', typeId: '' }))} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        {classificationTree.flatMap(c => c.subcategories).find(s => s.id === categorySelection.subCategoryId)?.name || 'Sub-cat'} ×
                                    </button>
                                )}
                                {locationSelection.lat !== null && (
                                    <button type="button" onClick={() => setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 })} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        📍 {locationSelection.label.substring(0, 20)}{locationSelection.label.length > 20 ? '…' : ''}{locationSelection.radiusKm > 0 ? ` (${locationSelection.radiusKm}km)` : ''} ×
                                    </button>
                                )}
                                {notContactedDays > 0 && (
                                    <button type="button" onClick={() => setNotContactedDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        No contact {notContactedDays}d+ ×
                                    </button>
                                )}
                                {noShowcaseDays > 0 && (
                                    <button type="button" onClick={() => setNoShowcaseDays(0)} className="chip chip-active" style={{ fontSize: '12px', padding: '4px 10px' }}>
                                        No showcase {noShowcaseDays}d+ ×
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setIntentFilter(''); setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] }); setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 }); setNotContactedDays(0); setNoShowcaseDays(0); }}
                                    style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    Clear all
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop: Filters Row */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="text" placeholder="Search name, phone, email..." value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '160px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
                            <select title="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterSelectStyle}>
                                <option value="">Status</option>
                                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                            </select>
                            <select title="Filter by source" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={filterSelectStyle}>
                                <option value="">Source</option>
                                {SOURCES.map(s => <option key={s} value={s}>{sourceLabels[s] || s}</option>)}
                            </select>
                            {isPrivileged && (
                                <select title="Filter by agent" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={filterSelectStyle}>
                                    <option value="">Agent</option>
                                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            )}
                            <input type="date" title="From date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                style={{ ...filterSelectStyle, width: '120px' }} />
                            <input type="date" title="To date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                style={{ ...filterSelectStyle, width: '120px' }} />
                            {(searchQuery || statusFilter || sourceFilter || agentFilter || dateFrom || dateTo || intentFilter || categorySelection.categoryId || locationSelection.lat !== null || notContactedDays > 0 || noShowcaseDays > 0) && (
                                <button type="button" onClick={() => { setSearchQuery(''); setStatusFilter(''); setSourceFilter(''); setAgentFilter(''); setDateFrom(''); setDateTo(''); setIntentFilter(''); setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] }); setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 }); setNotContactedDays(0); setNoShowcaseDays(0); }}
                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                                    Clear
                                </button>
                            )}
                        </div>

                    </>
                )}

                {/* Table */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ padding: '8px 12px', borderBottom: isMobile ? 'none' : '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Showing {filteredLeads.length} leads</span>
                        {!isMobile && selectedPhone && <span style={{ fontSize: '11px', color: '#3b82f6' }}>Click row for details</span>}
                    </div>

                    {/* Mobile Card View */}
                    {isMobile ? (
                        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredLeads.length > 0 ? filteredLeads.map(lead => (
                                <LeadCard
                                    key={lead.phone_number}
                                    lead={lead}
                                    isSelected={selectedPhone === lead.phone_number}
                                    onSelect={openDetail}
                                    onStatusChange={handleStatusChange}
                                    updatingPhone={updatingPhone}
                                    sourceColors={sourceColors}
                                    sourceLabels={sourceLabels}
                                    scoreColor={scoreColor}
                                    formatBudget={formatBudget}
                                />
                            )) : (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px', fontSize: '14px' }}>
                                    {error ? 'Failed to load leads' : 'No leads found'}
                                </div>
                            )}
                        </div>
                    ) : (

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                    {['Name', 'Phone', 'Source', 'Status', 'Budget', 'Score', 'Intent', 'Location', 'Date', ''].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeads.map(lead => {
                                    const score = lead.lead_score?.total_score ?? null;
                                    const isSelected = selectedPhone === lead.phone_number;
                                    return (
                                        <tr key={lead.phone_number} onClick={() => openDetail(lead.phone_number)}
                                            style={{ borderBottom: '1px solid var(--bg-primary)', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : undefined }}>
                                            <td style={compactCell}>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{lead.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                                                    {lead.lead_type === 'PARTNER_REFERRAL' && (
                                                        <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, marginLeft: '4px', whiteSpace: 'nowrap' }}>
                                                            {lead.referral_partner_name || 'Partner'}
                                                        </span>
                                                    )}
                                                    {lead.demand_bhk ? <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px' }}>{lead.demand_bhk}BHK</span> : null}
                                                </div>
                                            </td>
                                            <td style={{ ...compactCell, color: 'var(--text-secondary)', fontSize: '11px' }}>{lead.phone_number.startsWith('TEMP_') ? <span style={{ color: '#d97706', fontSize: '10px' }}>No phone</span> : lead.phone_number}</td>
                                            <td style={compactCell}>
                                                <span style={{ backgroundColor: (sourceColors[lead.source] || '#6b7280') + '20', color: sourceColors[lead.source] || '#6b7280', padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 600 }}>
                                                    {sourceLabels[lead.source] || lead.source}
                                                </span>
                                            </td>
                                            <td style={compactCell} onClick={e => e.stopPropagation()}>
                                                <select title="Lead status" value={lead.lead_status} disabled={updatingPhone === lead.phone_number}
                                                    onChange={e => handleStatusChange(lead.phone_number, e.target.value)}
                                                    style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, border: '1px solid var(--border-secondary)', cursor: 'pointer', backgroundColor: lead.lead_status === 'hot' ? '#fef2f2' : lead.lead_status === 'warm' ? '#fffbeb' : 'var(--bg-primary)', color: lead.lead_status === 'hot' ? '#ef4444' : lead.lead_status === 'warm' ? '#f59e0b' : 'var(--text-primary)' }}>
                                                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ ...compactCell, fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {lead.budget_min || lead.budget_max ? `${formatBudget(lead.budget_min)}–${formatBudget(lead.budget_max)}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={compactCell}>
                                                {score !== null ? (
                                                    <span style={{ backgroundColor: scoreColor(score) + '18', color: scoreColor(score), padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 700 }}>
                                                        {score}
                                                    </span>
                                                ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                                            </td>
                                            <td style={{ ...compactCell, fontSize: '11px', textTransform: 'capitalize' }}>{lead.intent || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td style={{ ...compactCell, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.preferred_location || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td style={{ ...compactCell, color: 'var(--text-muted)', fontSize: '10px', whiteSpace: 'nowrap' }}>{new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                                            <td style={compactCell} onClick={e => e.stopPropagation()}>
                                                {!lead.phone_number.startsWith('TEMP_') && (
                                                    <a href={`tel:${lead.phone_number}`}
                                                        style={{ color: '#22c55e', fontSize: '15px', textDecoration: 'none', lineHeight: 1 }}
                                                        title={`Call ${lead.phone_number}`}>📞</a>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredLeads.length === 0 && (
                                    <tr><td colSpan={10} style={{ ...compactCell, textAlign: 'center', color: 'var(--text-muted)', padding: '20px 10px' }}>
                                        {error ? 'Failed to load leads' : 'No leads found'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    )}
                </div>
            </div>

            {/* ── Lead Detail Slide-Over ── */}
            {selectedPhone && (
                <>
                    <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? '100%' : '480px', maxWidth: isMobile ? '100%' : '95vw', backgroundColor: 'var(--bg-primary)', overflowY: 'auto', display: 'flex', flexDirection: 'column', zIndex: 91, boxShadow: '-4px 0 24px rgba(0,0,0,0.25)', borderLeft: isMobile ? 'none' : '1px solid var(--border-secondary)' }}>
                        {detailLoading ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
                        ) : detailError ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                                <div style={{ maxWidth: '300px', textAlign: 'center', padding: '24px', borderRadius: '12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚠️</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>Could Not Load Lead</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{detailError}</div>
                                    <button onClick={closeDetail} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Close</button>
                                </div>
                            </div>
                        ) : leadDetail ? (
                            <>
                                {/* Slide-over header */}
                                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', marginBottom: '4px' }}>{leadDetail.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            {leadDetail.phone_number}{leadDetail.email ? ` · ${leadDetail.email}` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ backgroundColor: (sourceColors[leadDetail.source] || '#6b7280') + '20', color: sourceColors[leadDetail.source] || '#6b7280', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{sourceLabels[leadDetail.source] || leadDetail.source}</span>
                                            <span style={{ backgroundColor: leadDetail.lead_status === 'hot' ? '#fef2f2' : leadDetail.lead_status === 'warm' ? '#fffbeb' : 'var(--bg-secondary)', color: leadDetail.lead_status === 'hot' ? '#ef4444' : leadDetail.lead_status === 'warm' ? '#f59e0b' : 'var(--text-secondary)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{leadDetail.lead_status.toUpperCase()}</span>
                                            {leadDetail.lead_score && (
                                                <span style={{ backgroundColor: scoreColor(leadDetail.lead_score.total_score) + '18', color: scoreColor(leadDetail.lead_score.total_score), padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>Score: {leadDetail.lead_score.total_score}</span>
                                            )}
                                            {leadDetail.lead_type === 'PARTNER_REFERRAL' && (
                                                <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>🤝 {leadDetail.referral_partner_name || 'Partner'}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={closeDetail} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px', padding: '4px 8px' }}>✕</button>
                                </div>

                                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                    {/* Lifecycle + Agent */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={soLabel}>Lifecycle Stage</label>
                                            <select value={editLifecycle} onChange={e => handleLifecycleChange(e.target.value)} style={soInput}>
                                                {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                                            </select>
                                        </div>
                                        {isPrivileged && (
                                            <div>
                                                <label style={soLabel}>Assigned Agent</label>
                                                <select value={editAgent} onChange={e => handleAgentChange(e.target.value)} style={soInput}>
                                                    <option value="">Unassigned</option>
                                                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* WhatsApp Conversation Answers */}
                                    {sessionAnswers && (
                                        <div style={{ padding: '10px 12px', backgroundColor: 'rgba(37,211,102,0.06)', borderRadius: '8px', border: '1px solid rgba(37,211,102,0.2)', marginBottom: '12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#25d366', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp Conversation Answers</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                {Object.entries(sessionAnswers).filter(([k]) => !k.startsWith('_') && k !== 'buyer_phone').map(([key, val]) => (
                                                    <div key={key} style={{ fontSize: '11px' }}>
                                                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace('buyer_', '').replace(/_/g, ' ')}: </span>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{String(val)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Requirements */}
                                    <div>
                                        <label style={{ ...soLabel, marginBottom: '10px' }}>Buyer Requirements</label>

                                        {/* Intent */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={{ ...soLabel, fontSize: '10px' }}>Intent (Buy / Rent)</label>
                                            <select value={editIntent} onChange={e => setEditIntent(e.target.value)} style={soInput}>
                                                <option value="">Not set</option>
                                                <option value="buy">Buy</option>
                                                <option value="rent">Rent / Lease</option>
                                            </select>
                                        </div>

                                        {/* Property Classification */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Category</label>
                                                <select value={editCategoryId} onChange={e => { setEditCategoryId(e.target.value); setEditSubCategoryId(''); setEditTypeId(''); }} style={soInput}>
                                                    <option value="">Any</option>
                                                    {classificationTree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Sub-Category</label>
                                                <select value={editSubCategoryId} onChange={e => { setEditSubCategoryId(e.target.value); setEditTypeId(''); }} style={soInput} disabled={!editCategoryId}>
                                                    <option value="">Any</option>
                                                    {editSubCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Property Type</label>
                                                <select value={editTypeId} onChange={e => setEditTypeId(e.target.value)} style={soInput} disabled={!editSubCategoryId}>
                                                    <option value="">Any</option>
                                                    {(editSubCategories.find(s => s.id === editSubCategoryId) as any)?.types?.map((t: any) => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* BHK */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={{ ...soLabel, fontSize: '10px' }}>BHK</label>
                                            <select title="BHK configuration" value={editBhk} onChange={e => setEditBhk(e.target.value)} style={soInput}>
                                                <option value="">Any</option>
                                                {configurations.filter(c => BHK_SLUGS.includes(c.slug)).map(c => (
                                                    <option key={c.id} value={c.slug === 'studio' ? '0' : c.name.replace(/[^0-9]/g, '') || c.slug}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Area Requirements */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Area Min</label>
                                                <input type="number" placeholder="500" value={editAreaMin} onChange={e => setEditAreaMin(e.target.value)} style={soInput} />
                                            </div>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Area Max</label>
                                                <input type="number" placeholder="2000" value={editAreaMax} onChange={e => setEditAreaMax(e.target.value)} style={soInput} />
                                            </div>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Unit</label>
                                                <select title="Area unit" value={editAreaUnit} onChange={e => setEditAreaUnit(e.target.value)} style={soInput}>
                                                    <option value="sqft">sqft</option>
                                                    <option value="sqmtr">sqmtr</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Preferred Amenities */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={{ ...soLabel, fontSize: '10px' }}>Preferred Amenities</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                                {AMENITIES_LIST.map(a => {
                                                    const selected = editAmenities.includes(a.value);
                                                    return (
                                                        <button key={a.value} type="button"
                                                            onClick={() => setEditAmenities(prev =>
                                                                selected ? prev.filter(x => x !== a.value) : [...prev, a.value]
                                                            )}
                                                            style={{
                                                                padding: '4px 10px', borderRadius: '16px', fontSize: '11px',
                                                                border: selected ? '1px solid #34d399' : '1px solid #d1d5db',
                                                                background: selected ? '#ecfdf5' : 'transparent',
                                                                color: selected ? '#059669' : '#6b7280',
                                                                cursor: 'pointer',
                                                            }}>
                                                            {selected ? '✓ ' : ''}{a.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Budget */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Budget Min (₹)</label>
                                                <input type="number" placeholder="5000000" value={editBudgetMin} onChange={e => setEditBudgetMin(e.target.value)} style={soInput} />
                                            </div>
                                            <div>
                                                <label style={{ ...soLabel, fontSize: '10px' }}>Budget Max (₹)</label>
                                                <input type="number" placeholder="8000000" value={editBudgetMax} onChange={e => setEditBudgetMax(e.target.value)} style={soInput} />
                                            </div>
                                        </div>

                                        {/* Timeline */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={{ ...soLabel, fontSize: '10px' }}>Timeline</label>
                                            <select title="Purchase timeline" value={editTimeline} onChange={e => setEditTimeline(e.target.value)} style={soInput}>
                                                <option value="">Not set</option>
                                                {TIMELINES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                            </select>
                                        </div>

                                        {/* Location with Maps autocomplete */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <label style={{ ...soLabel, fontSize: '10px' }}>Preferred Location</label>
                                            <input
                                                ref={editLocationRef}
                                                type="text"
                                                placeholder="Search area on Google Maps..."
                                                defaultValue={leadDetail.preferred_location || ''}
                                                style={{ ...soInput, backgroundColor: editPreferredLat ? 'rgba(34,197,94,0.05)' : undefined }}
                                            />
                                            {editPreferredLat && (
                                                <div style={{ fontSize: '10px', color: '#22c55e', marginTop: '2px' }}>
                                                    📍 Geo-tagged: {editPreferredLat.toFixed(4)}, {editPreferredLng?.toFixed(4)}
                                                </div>
                                            )}
                                        </div>

                                        <button onClick={handleSaveRequirements} disabled={savingReqs} style={{ ...primaryBtn, fontSize: '12px', padding: '6px 14px' }}>
                                            {savingReqs ? 'Saving...' : 'Save Requirements'}
                                        </button>
                                    </div>

                                    {/* Find Matches + Multi-Select + WhatsApp Sharing */}
                                    <MatchedPropertiesSection
                                        matches={matches}
                                        matchLoading={matchLoading}
                                        matchError={matchError}
                                        onFindMatches={handleFindMatches}
                                        leadPhone={leadDetail.phone_number}
                                        leadName={leadDetail.name}
                                        scoreColor={scoreColor}
                                    />

                                    {/* Convert to Deal */}
                                    {hasPermission('manage_deals') && (
                                        <div style={{ padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-secondary)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>Convert to Deal</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                        {leadDetail.intent && (leadDetail.budget_min || leadDetail.budget_max) && leadDetail.preferred_location
                                                            ? 'Ready to convert — all requirements filled.'
                                                            : 'Fill intent, budget and location to convert.'}
                                                    </div>
                                                </div>
                                                <button onClick={handleConvertToDeal} disabled={convertingDeal || !leadDetail.intent || (!leadDetail.budget_min && !leadDetail.budget_max) || !leadDetail.preferred_location}
                                                    style={{ ...primaryBtn, backgroundColor: '#10b981', opacity: (!leadDetail.intent || (!leadDetail.budget_min && !leadDetail.budget_max) || !leadDetail.preferred_location) ? 0.5 : 1 }}>
                                                    {convertingDeal ? 'Converting...' : 'Convert'}
                                                </button>
                                            </div>
                                            {dealError && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{dealError}</div>}
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <label style={soLabel}>Notes</label>
                                        <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                                            placeholder="Add notes about this lead..." style={{ ...soInput, resize: 'vertical' }} />
                                        <button onClick={handleSaveNotes} disabled={savingNotes} style={{ ...outlineBtn, fontSize: '12px', padding: '5px 12px', marginTop: '6px' }}>
                                            {savingNotes ? 'Saving...' : 'Save Notes'}
                                        </button>
                                    </div>

                                    {/* Lead Info */}
                                    <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-secondary)' }}>
                                        <label style={{ ...soLabel, marginBottom: '10px' }}>Lead Info</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                            {[['Intent', leadDetail.intent], ['Type', leadDetail.contact_type], ['Source', sourceLabels[leadDetail.source] || leadDetail.source], ['Created', new Date(leadDetail.created_at).toLocaleDateString('en-IN')]].map(([k, v]) => (
                                                <div key={k}>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>{k}</div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{v || '—'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 99acres Source Details */}
                                    {leadDetail.source === '99acres' && (() => {
                                        const meta = leadDetail.recent_interactions.find(i => i.channel === '99acres')?.metadata as Record<string, any> | null | undefined;
                                        if (!meta) return null;
                                        const resComLabel = meta.res_com === 'R' ? 'Residential' : meta.res_com === 'C' ? 'Commercial' : meta.res_com;
                                        const verifiedBadge = (val: string | undefined) => val?.toUpperCase() === 'VERIFIED'
                                            ? <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '12px' }}>✓ VERIFIED</span>
                                            : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{val || 'UNVALIDATED'}</span>;
                                        const priceFormatted = meta.price ? `₹${Number(meta.price).toLocaleString('en-IN')}` : null;
                                        return (
                                            <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-secondary)' }}>
                                                <label style={{ ...soLabel, marginBottom: '10px' }}>99acres Source Details</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                                    {meta.proj_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Project / Society</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.proj_name}</div></div>}
                                                    {meta.city_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>City</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{meta.city_name}</div></div>}
                                                    {priceFormatted && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Listed Price</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{priceFormatted}</div></div>}
                                                    {meta.res_com && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Property Type</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{resComLabel}</div></div>}
                                                    {meta.identity && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Buyer Type</div><div style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', display: 'inline-block', backgroundColor: meta.identity === 'Dealer' ? '#fef3c7' : '#dbeafe', color: meta.identity === 'Dealer' ? '#92400e' : '#1e40af' }}>{meta.identity}</div></div>}
                                                    {meta.sub_user_name && <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Agent's 99acres Email</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{meta.sub_user_name}</div></div>}
                                                    {meta.property_code && (
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>99acres Listing</div>
                                                            <a
                                                                href={`https://www.99acres.com/search/property/buy/property-in-india?prop_id=${meta.property_code}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                    padding: '5px 12px', borderRadius: '8px',
                                                                    backgroundColor: 'rgba(234,88,12,0.1)', color: '#ea580c',
                                                                    border: '1px solid rgba(234,88,12,0.3)',
                                                                    fontSize: '12px', fontWeight: 600, fontFamily: 'monospace',
                                                                    textDecoration: 'none', transition: 'background 0.15s',
                                                                }}
                                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.18)')}
                                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.1)')}
                                                            >
                                                                <span>🔗</span>
                                                                <span>{meta.property_code}</span>
                                                                <span style={{ fontSize: '10px', fontFamily: 'sans-serif', fontWeight: 400, opacity: 0.8 }}>View on 99acres ↗</span>
                                                            </a>
                                                        </div>
                                                    )}
                                                    <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Phone Verified</div>{verifiedBadge(meta.phone_verification_status)}</div>
                                                    <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Email Verified</div>{verifiedBadge(meta.email_verification_status)}</div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Timeline Tabs */}
                                    <div>
                                        <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)', marginBottom: '10px' }}>
                                            {(['activity', 'visits'] as const).map(tab => (
                                                <button key={tab} type="button"
                                                    onClick={() => setSliderTab(tab)}
                                                    style={{ flex: 1, padding: '7px 12px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: sliderTab === tab ? '#3b82f6' : 'var(--bg-secondary)', color: sliderTab === tab ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                                                    {tab === 'activity' ? '📋 Activity' : '🏠 Visits & Views'}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Activity Tab */}
                                        {sliderTab === 'activity' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {leadDetail.recent_interactions.length === 0 && (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No activity yet</div>
                                                )}
                                                {leadDetail.recent_interactions.map(i => (
                                                    <div key={i.id} style={{ display: 'flex', gap: '10px', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                                        <span style={{ fontSize: '16px', flexShrink: 0 }}>{channelIcon(i.channel)}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                                                <span style={{ textTransform: 'capitalize' }}>{i.channel} · {i.direction} · {i.event_type}</span>
                                                                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                            </div>
                                                            {i.content && <div style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.content}</div>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Visits & Views Tab */}
                                        {sliderTab === 'visits' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {appointmentsLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>Loading visits...</div>}

                                                {/* Scheduled visits */}
                                                {leadAppointments.map(appt => (
                                                    <div key={appt.id} style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                📅 {appt.type.replace(/_/g, ' ')}
                                                            </span>
                                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, backgroundColor: appt.status === 'completed' ? '#d1fae5' : appt.status === 'cancelled' ? '#fee2e2' : '#eff6ff', color: appt.status === 'completed' ? '#065f46' : appt.status === 'cancelled' ? '#dc2626' : '#1d4ed8' }}>
                                                                {appt.status}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                            {new Date(appt.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        {appt.property && (
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                🏠 {appt.property.type} {appt.property.location ? `· ${appt.property.location}` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Property views from interactions */}
                                                {leadDetail.recent_interactions
                                                    .filter(i => i.event_type === 'property_view')
                                                    .map(i => (
                                                        <div key={i.id} style={{ padding: '8px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '12px', color: '#065f46' }}>👁 {i.content || 'Viewed property'}</span>
                                                            <span style={{ fontSize: '11px', color: '#6b7280' }}>{new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                        </div>
                                                    ))
                                                }

                                                {!appointmentsLoading && leadAppointments.length === 0 && leadDetail.recent_interactions.filter(i => i.event_type === 'property_view').length === 0 && (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No visits or property views yet</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '8px' }}>
                                <div>Lead not found</div>
                                <button type="button" onClick={closeDetail} style={outlineBtn}>Close</button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Create Lead Modal ── */}
            {showCreateModal && (
                <>
                    <div onClick={closeCreateModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', zIndex: 101, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)', fontSize: '18px' }}>Add New Lead</h3>

                        {/* Step Indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                            {(createLeadType === 'DIRECT_OWNER'
                                ? ['Source', 'Search', 'Details']
                                : ['Source', 'Details']
                            ).map((label, idx) => {
                                const stepNum = idx + 1;
                                const active = createStep >= stepNum;
                                const totalSteps = createLeadType === 'DIRECT_OWNER' ? 3 : 2;
                                return (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < totalSteps - 1 ? 1 : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: active ? '#3b82f6' : 'var(--border-secondary)', color: active ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{stepNum}</div>
                                            <span style={{ fontSize: '12px', color: active ? '#3b82f6' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{label}</span>
                                        </div>
                                        {idx < totalSteps - 1 && <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-secondary)', margin: '0 8px' }} />}
                                    </div>
                                );
                            })}
                        </div>

                        {createError && <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px' }}>{createError}</div>}

                        {/* ── STEP 1: Source Selection ── */}
                        {createStep === 1 && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Where is this lead coming from?</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div onClick={() => handleSourceTypeSelect('DIRECT_OWNER')}
                                        style={{ padding: '20px 16px', borderRadius: '12px', border: '2px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>👤</div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>Client</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Client contacted directly</div>
                                    </div>
                                    <div onClick={() => handleSourceTypeSelect('PARTNER_REFERRAL')}
                                        style={{ padding: '20px 16px', borderRadius: '12px', border: '2px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.backgroundColor = 'rgba(124,58,237,0.06)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🤝</div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>Partner Agent</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Referred by a partner</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2 (DIRECT_OWNER): Contact Search ── */}
                        {createStep === 2 && createLeadType === 'DIRECT_OWNER' && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Search if this client already exists</div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoFocus
                                        value={clientSearchQuery}
                                        onChange={e => handleClientSearchChange(e.target.value)}
                                        placeholder="Enter 10-digit phone number"
                                        maxLength={10}
                                        style={{ ...inputStyle, fontSize: '14px', padding: '10px 14px' }}
                                    />
                                    <span style={{
                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                        fontSize: '12px', fontWeight: 600,
                                        color: clientSearchQuery.length === 10 ? '#22c55e' : 'var(--text-muted)',
                                        pointerEvents: 'none',
                                    }}>
                                        {clientSearchQuery.length}/10
                                    </span>
                                </div>
                                {clientSearchQuery.length > 0 && clientSearchQuery.length < 10 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>
                                        {10 - clientSearchQuery.length} more digits needed
                                    </p>
                                )}
                                {clientSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Searching...</div>}

                                {/* Results */}
                                {clientSearchQuery.trim().length === 10 && !clientSearching && clientSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', border: '1px solid var(--border-secondary)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {clientSearchResults.map(r => {
                                            const isTemp = r.phone_number.startsWith('TEMP_');
                                            const statusColors: Record<string, string> = { cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280' };
                                            const sc = statusColors[r.lead_status || ''] || '#94a3b8';
                                            return (
                                                <div key={r.phone_number} onClick={() => handleSelectExistingClient(r)}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                                                        {(r.name || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{r.name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isTemp ? 'No phone' : r.phone_number}</div>
                                                    </div>
                                                    {r.lead_status && (
                                                        <span style={{ backgroundColor: `${sc}22`, color: sc, padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>{r.lead_status}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Not found — offer to create */}
                                {clientSearchQuery.trim().length === 10 && !clientSearching && clientSearchResults.length === 0 && (
                                    <div style={{ marginTop: '10px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No contact found for "{clientSearchQuery}"</div>
                                        <button type="button" onClick={handleCreateNewClient} style={{ ...primaryBtn, padding: '7px 18px', fontSize: '13px' }}>
                                            + Create New Client
                                        </button>
                                    </div>
                                )}

                                {/* Skip search — go straight to new client form */}
                                {clientSearchQuery.trim().length < 10 && (
                                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                                        <button type="button" onClick={() => { setPreselectedContact(null); setCreateStep(3); }} style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                            Skip — add new client directly
                                        </button>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                                    <button type="button" onClick={() => setCreateStep(1)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2 (PARTNER_REFERRAL) or STEP 3 (DIRECT_OWNER): Details form ── */}
                        {((createStep === 2 && createLeadType === 'PARTNER_REFERRAL') || createStep === 3) && (
                        <form onSubmit={handleCreateLead}>
                            <div style={{ display: 'grid', gap: '12px' }}>

                                {/* Partner Agent Search — only for PARTNER_REFERRAL */}
                                {createLeadType === 'PARTNER_REFERRAL' && (
                                    <div style={{ backgroundColor: '#f5f3ff', borderRadius: '8px', padding: '12px', border: '1px solid #ede9fe' }}>
                                        <label style={labelStyle}>Partner Agent *</label>
                                        {partnerSelected ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ede9fe', borderRadius: '8px', padding: '10px 14px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#5b21b6' }}>{partnerSelected.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#7c3aed' }}>{partnerSelected.phone_number}{partnerSelected.city ? ` | ${partnerSelected.city}` : ''}</div>
                                                    <div style={{ fontSize: '11px', color: partnerSelected.verified ? '#059669' : '#d97706', marginTop: '2px' }}>{partnerSelected.verified ? 'Verified' : `Status: ${partnerSelected.status}`}</div>
                                                </div>
                                                <button type="button" onClick={clearPartnerSelection} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                            </div>
                                        ) : createPartnerPhone && !showPartnerRegister ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef3c7', borderRadius: '8px', padding: '10px 14px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#92400e' }}>{createPartnerName || 'New Partner'}</div>
                                                    <div style={{ fontSize: '12px', color: '#b45309' }}>{createPartnerPhone}</div>
                                                    <div style={{ fontSize: '11px', color: '#d97706', marginTop: '2px' }}>Will be auto-registered on submit</div>
                                                </div>
                                                <button type="button" onClick={clearPartnerSelection} style={{ ...outlineBtn, padding: '4px 10px', fontSize: '12px' }}>Change</button>
                                            </div>
                                        ) : (
                                            <div style={{ position: 'relative' }}>
                                                <input type="text" value={partnerSearchQuery} autoFocus onChange={e => { setPartnerSearchQuery(e.target.value); setShowPartnerRegister(false); }} placeholder="Search partner by name or phone..." style={inputStyle} />
                                                {partnerSearching && <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>Searching...</div>}
                                                {partnerSearchResults.length > 0 && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                                                        {partnerSearchResults.map(p => (
                                                            <div key={p.id} onClick={() => selectPartner(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)' }}
                                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f3ff')}
                                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{p.name}</div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.phone_number}{p.company_name ? ` | ${p.company_name}` : ''}{p.city ? ` | ${p.city}` : ''}</div>
                                                                <div style={{ fontSize: '11px', color: p.verified ? '#059669' : '#d97706', marginTop: '2px' }}>{p.verified ? 'Verified' : p.status} | {p.package_type}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {partnerSearchDone && partnerSearchResults.length === 0 && partnerSearchQuery.trim().length >= 2 && !partnerSearching && (
                                                    <div style={{ marginTop: '8px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                                        <div style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>Partner not registered</div>
                                                        <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#b91c1c' }}>No partner found matching "{partnerSearchQuery}". Register them now:</p>
                                                        <button type="button" onClick={() => { const isPhone = /\d{3,}/.test(partnerSearchQuery); setNewPartnerForm({ phone: isPhone ? partnerSearchQuery : '', name: isPhone ? '' : partnerSearchQuery, email: '', city: '' }); setShowPartnerRegister(true); }} style={{ ...primaryBtn, padding: '6px 14px', fontSize: '12px', backgroundColor: '#7c3aed' }}>+ Register New Partner</button>
                                                    </div>
                                                )}
                                                {showPartnerRegister && (
                                                    <div style={{ marginTop: '8px', padding: '12px', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '10px' }}>Register New Partner Agent</div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Phone *</label><input type="tel" value={newPartnerForm.phone} onChange={e => setNewPartnerForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Name *</label><input type="text" value={newPartnerForm.name} onChange={e => setNewPartnerForm(p => ({ ...p, name: e.target.value }))} placeholder="Partner name" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>Email</label><input type="email" value={newPartnerForm.email} onChange={e => setNewPartnerForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} /></div>
                                                            <div><label style={{ ...labelStyle, fontSize: '11px' }}>City</label><input type="text" value={newPartnerForm.city} onChange={e => setNewPartnerForm(p => ({ ...p, city: e.target.value }))} placeholder="City" style={inputStyle} /></div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                                            <button type="button" onClick={confirmNewPartner} disabled={!newPartnerForm.phone.trim()} style={{ ...primaryBtn, padding: '6px 14px', fontSize: '12px', backgroundColor: '#059669', opacity: newPartnerForm.phone.trim() ? 1 : 0.5 }}>Confirm Partner</button>
                                                            <button type="button" onClick={() => setShowPartnerRegister(false)} style={{ ...outlineBtn, padding: '6px 14px', fontSize: '12px' }}>Cancel</button>
                                                        </div>
                                                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#92400e' }}>Partner will be auto-created with Pending status and notified via WhatsApp + Email.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Preselected contact banner */}
                                {preselectedContact && (
                                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Adding requirements for: <strong>{preselectedContact.name || 'Contact'}</strong> &nbsp;|&nbsp; {preselectedContact.phone_number.startsWith('TEMP_') ? 'No phone' : preselectedContact.phone_number}</span>
                                        <button type="button" onClick={() => { setPreselectedContact(null); setCreateForm(p => ({ ...p, name: '', phone: '' })); }} style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
                                    </div>
                                )}

                                {/* Client Name + Phone */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>{createLeadType === 'PARTNER_REFERRAL' ? 'Client Name' : 'Name *'}</label>
                                        <input type="text" required={createLeadType === 'DIRECT_OWNER' && !preselectedContact} value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" style={{ ...inputStyle, opacity: preselectedContact ? 0.6 : 1 }} disabled={!!preselectedContact} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>{createLeadType === 'PARTNER_REFERRAL' ? 'Client Phone (optional)' : 'Phone *'}</label>
                                        <input type="tel" required={createLeadType === 'DIRECT_OWNER' && !preselectedContact} value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="+918178491914" style={{ ...inputStyle, opacity: preselectedContact ? 0.6 : 1 }} disabled={!!preselectedContact} />
                                    </div>
                                </div>

                                {/* Email + Source */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Email</label>
                                        <input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Source</label>
                                        <select title="Lead source" value={createForm.source} onChange={e => setCreateForm(p => ({ ...p, source: e.target.value }))} style={inputStyle}>
                                            {SOURCES.map(s => <option key={s} value={s}>{sourceLabels[s] || s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Intent — Buy or Rent only */}
                                <div>
                                    <label style={labelStyle}>Intent</label>
                                    <select title="Lead intent" value={createForm.intent} onChange={e => setCreateForm(p => ({ ...p, intent: e.target.value }))} style={inputStyle}>
                                        <option value="">Select Intent</option>
                                        <option value="buy">Buy</option>
                                        <option value="rent">Rent</option>
                                    </select>
                                </div>

                                {/* Property Classification — 3 cascading dropdowns */}
                                <div>
                                    <label style={labelStyle}>Property Type</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                        <select title="Property category" value={createCategoryId} onChange={e => { setCreateCategoryId(e.target.value); setCreateSubCategoryId(''); }} style={inputStyle}>
                                            <option value="">Category</option>
                                            {classificationTree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <select title="Property sub-type" value={createSubCategoryId} onChange={e => setCreateSubCategoryId(e.target.value)} style={inputStyle} disabled={!createCategoryId}>
                                            <option value="">Sub-type</option>
                                            {createSubCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                        <select title="BHK configuration" value={createBhk} onChange={e => setCreateBhk(e.target.value)} style={inputStyle}>
                                            <option value="">BHK</option>
                                            {configurations.filter(c => BHK_SLUGS.includes(c.slug)).map(c => (
                                                <option key={c.id} value={c.slug === 'studio' ? '0' : c.name.replace(/[^0-9]/g, '') || c.slug}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Budget Range */}
                                <div>
                                    <label style={labelStyle}>Budget (₹)</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <input type="number" placeholder="Min budget" value={createBudgetMin}
                                            onChange={e => setCreateBudgetMin(e.target.value)} style={inputStyle} />
                                        <input type="number" placeholder="Max budget" value={createBudgetMax}
                                            onChange={e => setCreateBudgetMax(e.target.value)} style={inputStyle} />
                                    </div>
                                </div>

                                {/* Timeline */}
                                <div>
                                    <label style={labelStyle}>Timeline</label>
                                    <select title="Purchase timeline" value={createTimeline} onChange={e => setCreateTimeline(e.target.value)} style={inputStyle}>
                                        <option value="">Select Timeline</option>
                                        {TIMELINES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                    </select>
                                </div>

                                {/* Location — Google Maps Autocomplete */}
                                <div>
                                    <label style={labelStyle}>Preferred Location</label>
                                    <input
                                        ref={createLocationRef}
                                        type="text"
                                        value={createForm.preferred_location}
                                        onChange={e => setCreateForm(p => ({ ...p, preferred_location: e.target.value }))}
                                        placeholder="Search area on Google Maps..."
                                        style={{ ...inputStyle, backgroundColor: createPreferredLat ? 'rgba(34,197,94,0.05)' : undefined }}
                                    />
                                    {createPreferredLat && (
                                        <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '3px' }}>
                                            📍 Geo-tagged: {createPreferredLat.toFixed(4)}, {createPreferredLng?.toFixed(4)}
                                        </div>
                                    )}
                                </div>

                                {/* Agent Assignment — only for privileged */}
                                {isPrivileged && (
                                    <div>
                                        <label style={labelStyle}>Assign to Agent</label>
                                        <select value={createAssignedAgentId} onChange={e => setCreateAssignedAgentId(e.target.value)} style={inputStyle}>
                                            <option value="">Auto-assign</option>
                                            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <label style={labelStyle}>Notes</label>
                                    <textarea value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '20px' }}>
                                <button type="button" onClick={() => setCreateStep(createLeadType === 'DIRECT_OWNER' ? 2 : 1)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                    <button type="submit" disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.7 : 1 }}>
                                        {creating ? 'Creating...' : 'Create Lead'}
                                    </button>
                                </div>
                            </div>
                        </form>
                        )}

                    </div>
                </>
            )}

            {/* ── Filter Bottom Sheet ── */}
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
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            padding: '0 0 32px',
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                            animation: 'slide-up-in 250ms cubic-bezier(0.34,1.2,0.64,1) forwards',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Sheet handle */}
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-secondary)' }} />
                        </div>

                        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>Filters</span>
                            <button type="button" onClick={() => {
                                setStatusFilter('');
                                setSourceFilter('');
                                setAgentFilter('');
                                setDateFrom('');
                                setDateTo('');
                                setIntentFilter('');
                                setCategorySelection({ categoryId: '', subCategoryId: '', typeId: '', bhk: [] });
                                setLocationSelection({ label: '', lat: null, lng: null, radiusKm: 2 });
                                setNotContactedDays(0);
                                setNoShowcaseDays(0);
                            }} style={{ background: 'none', border: 'none', color: 'var(--text-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Clear All
                            </button>
                        </div>

                        {/* Intent */}
                        <FilterSection title="Intent" defaultOpen badge={intentFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[{ label: 'Buy', value: 'BUYER' }, { label: 'Rent', value: 'TENANT' }].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setIntentFilter(intentFilter === opt.value ? '' : opt.value as 'BUYER' | 'TENANT')}
                                        className={`chip ${intentFilter === opt.value ? 'chip-active' : 'chip-inactive'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        <FilterLocationSection value={locationSelection} onChange={setLocationSelection} />

                        <FilterCategorySection tree={classificationTree} value={categorySelection} onChange={setCategorySelection} />

                        {/* Source */}
                        <FilterSection title="Source" defaultOpen={false} badge={sourceFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {SOURCES.map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setSourceFilter(sourceFilter === s ? '' : s)}
                                        className={`chip ${sourceFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {sourceLabels[s] || s}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Agent (privileged only) */}
                        {isPrivileged && (
                            <FilterSection title="Agent" defaultOpen={false} badge={agentFilter ? 1 : 0}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {teamMembers.map(m => (
                                        <button key={m.id} type="button"
                                            onClick={() => setAgentFilter(agentFilter === m.id ? '' : m.id)}
                                            className={`chip ${agentFilter === m.id ? 'chip-active' : 'chip-inactive'}`}>
                                            {m.name}
                                        </button>
                                    ))}
                                </div>
                            </FilterSection>
                        )}

                        {/* Status */}
                        <FilterSection title="Status" defaultOpen={false} badge={statusFilter ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {LEAD_STATUSES.map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                                        className={`chip ${statusFilter === s ? 'chip-active' : 'chip-inactive'}`}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>

                        {/* Date Range */}
                        <FilterSection title="Date Range" defaultOpen={false} badge={(dateFrom || dateTo) ? 1 : 0}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' }} />
                            </div>
                        </FilterSection>

                        <StalenessSection
                            title="Lead Staleness"
                            label1="Not contacted in"
                            label2="No inventory showcased in"
                            days1={notContactedDays}
                            days2={noShowcaseDays}
                            onDays1Change={setNotContactedDays}
                            onDays2Change={setNoShowcaseDays}
                            badge={(notContactedDays > 0 ? 1 : 0) + (noShowcaseDays > 0 ? 1 : 0)}
                        />

                        {/* Apply button */}
                        <div style={{ padding: '16px 20px 0' }}>
                            <button type="button"
                                onClick={() => setShowFilterSheet(false)}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: 'var(--text-link)', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
                            >
                                Apply Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const compactCell: React.CSSProperties = {
    padding: '6px 10px', color: 'var(--text-bright)', fontSize: '12px',
};
const filterSelectStyle: React.CSSProperties = {
    padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
    marginBottom: '4px', textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};
const outlineBtn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-secondary)',
    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
};
const primaryBtn: React.CSSProperties = {
    padding: '8px 18px', borderRadius: '8px', border: 'none',
    backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
};
const soLabel: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
};
const soInput: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: '7px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
};
