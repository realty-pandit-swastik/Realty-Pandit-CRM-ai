
import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import { updateInventory, getCategoryTree, uploadInventoryImages, deleteInventoryMedia, getTeamMembersList, transferInventory, uploadInventoryDocument, deleteInventoryDocument, inventoryDocumentUrl, getInventoryItem, getNodeFields } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

import AddressFields, { inferAddressLayout } from '../AddressFields';
import TaxonomyCascade from '../TaxonomyCascade';
import ParkingListField from '../ParkingListField';
import { ContactSearchField, type SelectedContact } from '../ContactSearchField';

interface MobileInventoryEditProps {
    item: any;
    onSaved: () => void;
    onCancel: () => void;
}

const CARD_RADIUS = '12px';

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' };

// AMENITIES_LIST removed Phase 2 dedup (2026-05-28) — amenities now come from the
// taxonomy 'amenities' field (multiselect of labels) rendered in the by-type panel.

// Taxonomy field keys captured by dedicated legacy inputs instead of the per-type render
// (Phase 3 de-dup, 2026-05-27) — keep in sync with InventoryList.tsx.
// Phase 2 dedup (2026-05-28): the taxonomy by-type panel is now the SOLE renderer for
// type-specific fields. Only the universal Area/Bathrooms top inputs stay excluded.
// See InventoryList.tsx for the matching desktop change.
const TAXONOMY_RENDER_EXCLUDE = ['area', 'area_unit', 'bathrooms'];

// ─── Inline Contact Search for Mobile Edit ──────────────────────────────────
function MobileEditContactSection({ currentPhone, currentName, color, onContactSelected }: {
    currentPhone: string; currentName: string; color: string;
    onContactSelected: (contact: SelectedContact) => void;
}) {
    const [searching, setSearching] = useState(false);

    if (searching) {
        return (
            <div style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color }}>Search Contact</span>
                    <button onClick={() => setSearching(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                </div>
                <ContactSearchField
                    label="Search by phone or name"
                    placeholder="Enter phone number or name"
                    onContactSelected={(contact) => { onContactSelected(contact); setSearching(false); }}
                />
            </div>
        );
    }

    return (
        <div style={{ padding: '12px 0' }}>
            {currentPhone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, backgroundColor: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
                        {(currentName || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{currentName || 'Unknown'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentPhone}</div>
                    </div>
                    <button onClick={() => setSearching(true)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: `${color}22`, color, border: `1px solid ${color}44`, cursor: 'pointer' }}>Change</button>
                </div>
            ) : (
                <button onClick={() => setSearching(true)} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px dashed var(--border-secondary)', cursor: 'pointer' }}>
                    + Search & Select Contact
                </button>
            )}
        </div>
    );
}

export function MobileInventoryEdit({ item, onSaved }: MobileInventoryEditProps) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const specs = item.specs || {};
    const features = item.features || {};
    const [data, setData] = useState({
        category_id: item.category_id || '',
        sub_category_id: item.sub_category_id || '',
        type_id: item.type_id || '',
        configuration_id: item.configuration_id || '',
        usage_type_id: item.usage_type_id || '',
        investment_type_id: item.investment_type_id || '',
        taxonomy_node_id: item.taxonomy_node_id || '',
        intent: item.intent || 'sell',
        status: item.status || 'active',
        roof_rights: item.roof_rights || false, // roof-rights flag (2026-06-28)
        commercial_use: item.commercial_use || false, // 2026-07-29 residential-usable-as-commercial
        commercial_use_type: item.commercial_use_type || '',
        // specs.* is SOLE SoT (Phase 3 dedup, 2026-05-28) — column fallbacks dropped.
        // Note: furnishing/property_age/facing live in editSchemaValues now (Phase 2);
        // kept in `data` here only for back-compat with any code that reads `data.*`.
        // Room count: canonical taxonomy keys (bhk/rooms) → legacy bedrooms/bhk_count.
        bedrooms: specs.bhk ?? specs.rooms ?? specs.bedrooms ?? specs.bhk_count ?? '',
        bathrooms: specs.bathrooms ?? '',
        area: specs.area ?? '',
        area_unit: specs.area_unit || 'sqft',
        flat_no: item.flat_no || '',
        floor_number: item.floor_number ?? '',
        floor_label: item.floor_label ?? '',
        display_floor: item.display_floor ?? '',
        total_floors: item.total_floors ?? '',
        plot_no: item.plot_no || '',
        apartment_name: item.apartment_name || '',
        full_address: item.full_address || '',
        locality: item.locality || '',
        sub_locality: item.sub_locality || '',
        district: item.district || '',
        state: item.state || '',
        pincode: item.pincode || '',
        features: features,
        assigned_agent_id: item.assigned_agent_id || '',
        shared_with_ids: item.shared_with_ids || [],
        price: item.price || '',
        price_unit: item.price_unit || '',
        customer_price: item.customer_price || '',
        display_price: item.display_price || '',
        owner_phone: item.owner_phone || '',
        // owner_name is derived server-side from Contact.name (no Inventory column).
        owner_name: item.owner_name || item.contact?.name || item.source?.name || '',
        uploader_phone: item.uploader_phone || '',
        uploader_name: item.uploader_name || '',
        key_holder_type: item.key_holder_type || '',
        key_holder_name: item.key_holder_name || '',
        key_holder_phone: item.key_holder_phone || '',
        description: item.description || '',
    });

    const [saving, setSaving] = useState(false);
    // Owner railguard rejection, surfaced inline instead of as a transient toast.
    const [ownerError, setOwnerError] = useState('');
    const [nodeFields, setNodeFields] = useState<any[]>([]);
    const [schemaValues, setSchemaValues] = useState<Record<string, any>>({});
    const [classTree, setClassTree] = useState<any>({ categories: [], configurations: [], usage_types: [], investment_types: [] });
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        photos: true, classification: true, details: false, specs: false, amenities: false, address: true, pricing: false, documents: false, owner_contact: false, keyholder: false, assignment: true,
    });
    const [agentsList, setAgentsList] = useState<any[]>([]);
    const [mediaUrls, setMediaUrls] = useState<string[]>(item.media_urls || []);
    const [videoUrls, setVideoUrls] = useState<string[]>(item.video_urls || []);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const docUploadRef = useRef<HTMLInputElement>(null);
    const [editDocuments, setEditDocuments] = useState<any[]>([]);
    const [docUploading, setDocUploading] = useState(false);
    const [newDocType, setNewDocType] = useState('other');
    const [newDocTitle, setNewDocTitle] = useState('');

    useEffect(() => {
        getCategoryTree().then(d => setClassTree({
            categories: d?.categories || [], configurations: d?.configurations || [],
            usage_types: d?.usage_types || [], investment_types: d?.investment_types || [],
        })).catch(() => {});
        getTeamMembersList().then(d => {
            if (Array.isArray(d)) setAgentsList(d);
            else if (d?.members) setAgentsList(d.members);
        }).catch(() => {});
        // Load documents
        getInventoryItem(item.id).then(full => {
            if (full?.documents) setEditDocuments(full.documents);
        }).catch(() => {});
        // Load the taxonomy per-type field schema (prefill from saved specs)
        if (item.taxonomy_node_id) {
            getNodeFields(item.taxonomy_node_id).then((res: any) => {
                const flds = (res?.fields || []).filter((f: any) => !TAXONOMY_RENDER_EXCLUDE.includes(f.key));
                setNodeFields(flds);
                const sp = item.specs || {};
                const init: Record<string, any> = {};
                for (const f of flds) if (sp[f.key] !== undefined) init[f.key] = sp[f.key];
                setSchemaValues(init);
            }).catch(() => {});
        }
    }, []);

    // Re-validate category/subcategory/type IDs once classTree loads (handles deactivated categories)
    useEffect(() => {
        if (!classTree.categories.length) return;
        setData(prev => {
            const catNode = classTree.categories.find((c: any) =>
                c.slug === item.category || c.name?.toLowerCase() === (item.category || '').toLowerCase()
            );
            const validCatId = prev.category_id && classTree.categories.some((c: any) => c.id === prev.category_id);
            const resolvedCatId = validCatId ? prev.category_id : (catNode?.id || '');
            const resolvedCat = classTree.categories.find((c: any) => c.id === resolvedCatId);

            const allTypes = resolvedCat?.subcategories?.flatMap((sc: any) => sc.types || []) || [];
            const typeNode = allTypes.find((t: any) =>
                t.slug === item.type || t.name?.toLowerCase() === (item.type || '').toLowerCase()
            );
            const validSubCatId = prev.sub_category_id && resolvedCat?.subcategories?.some((sc: any) => sc.id === prev.sub_category_id);
            const subCatNode = resolvedCat?.subcategories?.find((sc: any) =>
                sc.types?.some((t: any) => t.id === (prev.type_id || typeNode?.id))
            );
            const resolvedSubCatId = validSubCatId ? prev.sub_category_id : (subCatNode?.id || '');
            const resolvedSubCat = resolvedCat?.subcategories?.find((sc: any) => sc.id === resolvedSubCatId);
            const validTypeId = prev.type_id && resolvedSubCat?.types?.some((t: any) => t.id === prev.type_id);

            return {
                ...prev,
                category_id: resolvedCatId,
                sub_category_id: resolvedSubCatId,
                type_id: validTypeId ? prev.type_id : (typeNode?.id || ''),
            };
        });
    }, [classTree]);

    const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    const set = (field: string, value: any) => setData(prev => ({ ...prev, [field]: value }));

    // Classification cascade picked a (new) taxonomy TYPE node: set it + reload the per-type schema.
    const handleTaxonomyChange = async (nodeId: string | null) => {
        set('taxonomy_node_id', nodeId || '');
        if (!nodeId) { setNodeFields([]); return; }
        try {
            const res = await getNodeFields(nodeId);
            const flds = (res?.fields || []).filter((f: any) => !TAXONOMY_RENDER_EXCLUDE.includes(f.key));
            setNodeFields(flds);
            setSchemaValues(prev => {
                const next: Record<string, any> = {};
                for (const f of flds) if (prev?.[f.key] !== undefined) next[f.key] = prev[f.key];
                return next;
            });
        } catch { /* keep the form usable */ }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Start from ORIGINAL specs so unknown keys aren't dropped on save
            // (Phase 1 dedup, 2026-05-28). Backend PATCH also deep-merges as safety.
            const orig = (item.specs && typeof item.specs === 'object' && !Array.isArray(item.specs))
                ? { ...item.specs } : {};
            const specsObj: Record<string, any> = orig;
            if (data.bathrooms) specsObj.bathrooms = Number(data.bathrooms); else delete specsObj.bathrooms;
            if (data.area) specsObj.area = Number(data.area); else delete specsObj.area;
            if (data.area_unit) specsObj.area_unit = data.area_unit;
            // Room count: write under whichever canonical key the taxonomy uses (bhk/rooms).
            if (data.bedrooms) {
                if (specsObj.rooms !== undefined) specsObj.rooms = Number(data.bedrooms);
                else specsObj.bhk = String(data.bedrooms);
            }
            // Layer taxonomy per-type field values on top
            for (const [k, v] of Object.entries(schemaValues)) {
                if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) specsObj[k] = v;
            }

            // Strip UI-only fields (Phase 3, 2026-05-28): furnishing/facing/property_age
            // are no longer in `data` since Phase 3 read-fallback removal — they live
            // exclusively in schemaValues now and round-trip through specsObj above.
            const payload: Record<string, any> = { ...data, specs: specsObj };
            for (const field of ['bedrooms', 'bathrooms', 'area', 'area_unit', 'features']) delete payload[field];
            await updateInventory(item.id, payload);
            setOwnerError('');
            onSaved();
        } catch (err: any) {
            const message = err?.response?.data?.error || 'Failed to save';
            // Owner railguard: explain inline and keep the sheet open with the form intact.
            if (err?.response?.data?.error_code === 'OWNER_IS_TEAM_MEMBER') {
                setOwnerError(message);
                setExpandedSections(s => ({ ...s, owner_contact: true }));
            }
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadError('');
        try {
            const res = await uploadInventoryImages(item.id, Array.from(files));
            setMediaUrls(prev => [...prev, ...(res.uploaded?.map((u: any) => u.original) || [])]);
        } catch (err: any) {
            setUploadError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteMedia = async (url: string) => {
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        try {
            await deleteInventoryMedia(item.id, filename);
            setMediaUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Delete failed', 'error');
        }
    };

    const handleUploadVideos = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadError('');
        try {
            const result = await uploadInventoryImages(item.id, Array.from(files));
            if (result.video_urls) setVideoUrls(prev => [...prev, ...result.video_urls]);
        } catch (err: any) {
            setUploadError(err.response?.data?.error || 'Video upload failed');
        } finally {
            setUploading(false);
            if (videoInputRef.current) videoInputRef.current.value = '';
        }
    };

    const handleDeleteVideo = async (url: string) => {
        const filename = url.split('/').pop() || '';
        const ok = await confirm('Delete this video?');
        if (!ok) return;
        try {
            await deleteInventoryMedia(item.id, filename);
            setVideoUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) {
            showToast(err.response?.data?.error || 'Failed to delete video', 'error');
        }
    };

    const SectionHeader = ({ title, sectionKey }: { title: string; sectionKey: string }) => (
        <button onClick={() => toggleSection(sectionKey)}
            style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border-secondary)',
            }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#4F46E5' }}>{title}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>{expandedSections[sectionKey] ? '▲' : '▼'}</span>
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                {/* Photos & Videos — First section like desktop */}
                <SectionHeader title={`Media (${mediaUrls.length} photos, ${videoUrls.length} videos)`} sectionKey="photos" />
                {expandedSections.photos && (
                    <div style={{ padding: '12px 0' }}>
                        {/* Existing images grid */}
                        {mediaUrls.length > 0 && (
                            <>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Photos</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                                    {mediaUrls.map((url, i) => (
                                        <div key={i} style={{ position: 'relative', paddingTop: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
                                            <img src={url} alt={`Photo ${i + 1}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button type="button" onClick={() => handleDeleteMedia(url)}
                                                style={{
                                                    position: 'absolute', top: '4px', right: '4px',
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    backgroundColor: 'rgba(239,68,68,0.9)', color: '#fff',
                                                    border: 'none', fontSize: '14px', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                x
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Upload photos button */}
                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
                            title="Upload photos" style={{ display: 'none' }} onChange={handleUploadImages} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                            style={{
                                width: '100%', padding: '14px', borderRadius: '8px',
                                border: '2px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-secondary)', fontSize: '14px', cursor: uploading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                marginBottom: '16px', minHeight: '44px',
                            }}>
                            {uploading ? 'Uploading...' : '+ Add Photos'}
                        </button>

                        {/* Existing videos */}
                        {videoUrls.length > 0 && (
                            <>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Videos</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                    {videoUrls.map((url, i) => (
                                        <div key={i} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
                                            <video src={url} controls style={{ width: '100%', maxHeight: '200px' }} />
                                            <button type="button" onClick={() => handleDeleteVideo(url)}
                                                style={{
                                                    position: 'absolute', top: '4px', right: '4px',
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    backgroundColor: 'rgba(239,68,68,0.9)', color: '#fff',
                                                    border: 'none', fontSize: '14px', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                x
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Upload videos button */}
                        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" multiple
                            title="Upload videos" style={{ display: 'none' }} onChange={handleUploadVideos} />
                        <button type="button" onClick={() => videoInputRef.current?.click()} disabled={uploading}
                            style={{
                                width: '100%', padding: '14px', borderRadius: '8px',
                                border: '2px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-secondary)', fontSize: '14px', cursor: uploading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                minHeight: '44px',
                            }}>
                            {uploading ? 'Uploading...' : '+ Add Videos'}
                        </button>

                        {uploadError && <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px' }}>{uploadError}</div>}
                    </div>
                )}

                {/* Classification */}
                <SectionHeader title="Classification" sectionKey="classification" />
                {expandedSections.classification && (
                    <div style={{ padding: '12px 0' }}>
                        <label style={labelStyle}>Property type (Category → Sub-category → Type)</label>
                        <TaxonomyCascade
                            value={data.taxonomy_node_id}
                            onChange={handleTaxonomyChange}
                            inputStyle={{ ...inputStyle, flex: '1 1 140px', minWidth: '130px' }}
                        />
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            Type-specific fields (BHK, parking, road facing, …) appear under <strong>Specifications</strong>.
                        </p>
                    </div>
                )}

                {/* Property Details */}
                <SectionHeader title="Property Details" sectionKey="details" />
                {expandedSections.details && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0' }}>
                        <div>
                            <label style={labelStyle}>Intent</label>
                            <select style={inputStyle} value={data.intent} onChange={e => set('intent', e.target.value)}>
                                <option value="sell">Sell</option><option value="rent">Rent</option><option value="lease">Lease</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Status</label>
                            <select style={inputStyle} value={data.status} onChange={e => set('status', e.target.value)}>
                                <option value="active">Active</option><option value="inactive">Inactive</option><option value="sold">Sold</option><option value="rented">Rented</option><option value="withdrawn">Withdrawn</option>
                            </select>
                        </div>
                        {/* Roof rights toggle (2026-06-28) — rides data.roof_rights → PATCH */}
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={labelStyle}>Roof Rights</label>
                            <button type="button" onClick={() => set('roof_rights', !data.roof_rights)}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'left',
                                    border: data.roof_rights ? '1.5px solid #f59e0b' : '1px solid var(--border-secondary)',
                                    backgroundColor: data.roof_rights ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)' }}>
                                <div style={{ width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: data.roof_rights ? '2px solid #f59e0b' : '2px solid var(--border-secondary)', backgroundColor: data.roof_rights ? '#f59e0b' : 'transparent' }}>
                                    {data.roof_rights && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: data.roof_rights ? '#f59e0b' : 'var(--text-secondary)' }}>
                                    {data.roof_rights ? 'Roof rights included ✓' : 'Mark roof rights'}
                                </span>
                            </button>
                        </div>
                        {/* Commercial use (2026-07-29) — only for RESIDENTIAL properties usable commercially */}
                        {String(item.category || '').toLowerCase() === 'residential' && (
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={labelStyle}>Commercial Use</label>
                                <button type="button" onClick={() => set('commercial_use', !data.commercial_use)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'left',
                                        border: data.commercial_use ? '1.5px solid #a855f7' : '1px solid var(--border-secondary)',
                                        backgroundColor: data.commercial_use ? 'rgba(168,85,247,0.08)' : 'var(--bg-secondary)' }}>
                                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: data.commercial_use ? '2px solid #a855f7' : '2px solid var(--border-secondary)', backgroundColor: data.commercial_use ? '#a855f7' : 'transparent' }}>
                                        {data.commercial_use && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: data.commercial_use ? '#a855f7' : 'var(--text-secondary)' }}>
                                        {data.commercial_use ? 'Also usable commercially ✓' : 'Mark as commercial-usable'}
                                    </span>
                                </button>
                                {data.commercial_use && (
                                    <select value={data.commercial_use_type || 'office'} onChange={e => set('commercial_use_type', e.target.value)}
                                        style={{ width: '100%', marginTop: '8px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '15px', boxSizing: 'border-box' }}>
                                        <option value="office">Office</option>
                                        <option value="shop">Shop</option>
                                        <option value="showroom">Showroom</option>
                                        <option value="other">Others</option>
                                    </select>
                                )}
                            </div>
                        )}
                        {/* Furnishing / Age / Facing inputs removed Phase 2 dedup (2026-05-28) —
                            rendered by the taxonomy-driven by-type panel inside the Specs section below. */}
                    </div>
                )}

                {/* Specs — Bedrooms input removed Phase 2 dedup (2026-05-28); BHK/Rooms
                    now come from the by-type panel below under the canonical taxonomy key. */}
                <SectionHeader title="Specifications" sectionKey="specs" />
                {expandedSections.specs && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0' }}>
                        <div><label style={labelStyle}>Bathrooms</label><input style={inputStyle} type="number" value={data.bathrooms} onChange={e => set('bathrooms', e.target.value)} placeholder="2" /></div>
                        <div><label style={labelStyle}>Area</label><input style={inputStyle} type="number" value={data.area} onChange={e => set('area', e.target.value)} placeholder="1200" /></div>
                        <div>
                            <label style={labelStyle}>Unit</label>
                            <select style={inputStyle} value={data.area_unit} onChange={e => set('area_unit', e.target.value)}>
                                <option value="sqft">Sq.Ft</option><option value="sqm">Sq.M</option><option value="sqyd">Sq.Yd</option><option value="acre">Acre</option>
                            </select>
                        </div>
                        {nodeFields.length > 0 && (
                            <div style={{ gridColumn: 'span 2', marginTop: '6px', borderTop: '1px solid var(--border-secondary)', paddingTop: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Property Details (by type)</div>
                                {nodeFields.map((f: any) => {
                                    const setV = (v: any) => setSchemaValues({ ...schemaValues, [f.key]: v });
                                    const toggle = (opt: string) => { const cur: string[] = Array.isArray(schemaValues[f.key]) ? schemaValues[f.key] : []; setV(cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]); };
                                    return (
                                        <div key={f.key} style={{ marginBottom: '10px' }}>
                                            <label style={labelStyle}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                                            {f.input_type === 'parking_list' ? (
                                                <ParkingListField value={schemaValues[f.key]} onChange={(v) => setV(v)} />
                                            ) : f.input_type === 'multiselect' && Array.isArray(f.options) && f.options.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {f.options.map((o: string) => {
                                                        const on = Array.isArray(schemaValues[f.key]) && schemaValues[f.key].includes(o);
                                                        return <button key={o} type="button" onClick={() => toggle(o)} style={{ padding: '8px 12px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer', minHeight: '40px', border: on ? '1px solid #6366f1' : '1px solid var(--border-secondary)', background: on ? '#6366f1' : 'transparent', color: on ? '#fff' : 'var(--text-primary)' }}>{o}</button>;
                                                    })}
                                                </div>
                                            ) : Array.isArray(f.options) && f.options.length > 0 ? (
                                                <select style={inputStyle} value={schemaValues[f.key] ?? ''} onChange={e => setV(e.target.value)}>
                                                    <option value="">Select…</option>
                                                    {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            ) : (
                                                <input style={inputStyle} type={f.input_type === 'number' ? 'number' : 'text'} value={schemaValues[f.key] ?? ''} onChange={e => setV(e.target.value)} placeholder={f.unit || ''} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Amenities section removed Phase 2 dedup (2026-05-28) — amenities now live
                    in specs.amenities (label array) and are rendered by the taxonomy-driven
                    by-type panel inside the Specifications section above. */}

                {/* Address */}
                <SectionHeader title="Address" sectionKey="address" />
                {expandedSections.address && (
                    <div style={{ padding: '12px 0' }}>
                        <AddressFields
                            layout={inferAddressLayout({ category: item.category, type: item.type })}
                            mainCategory={item.category}
                            slug={item.type}
                            value={{
                                city: (data as any).city || data.district || '',
                                district: data.district || '',
                                locality: data.locality || '',
                                sub_locality: data.sub_locality || '',
                                state: data.state || '',
                                pincode: data.pincode || '',
                                apartment_name: data.apartment_name || '',
                                flat_no: data.flat_no || '',
                                floor_number: data.floor_number ?? '',
                                floor_label: data.floor_label ?? '',
                                display_floor: data.display_floor ?? '',
                                total_floors: data.total_floors ?? '',
                                plot_no: data.plot_no || '',
                                latitude: ((data as any).latitude == null || (data as any).latitude === '') ? undefined : Number((data as any).latitude),
                                longitude: ((data as any).longitude == null || (data as any).longitude === '') ? undefined : Number((data as any).longitude),
                                full_address: data.full_address || '',
                            }}
                            onChange={(a) => setData((prev: any) => ({ ...prev, ...a, district: a.city || a.district || prev.district }))}
                            inputStyle={inputStyle}
                            labelStyle={labelStyle}
                        />
                    </div>
                )}

                {/* Pricing */}
                <SectionHeader title="Pricing & Margin" sectionKey="pricing" />
                {expandedSections.pricing && (
                    <div style={{ padding: '12px 0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                            <div>
                                <label style={{ ...labelStyle, fontWeight: 700 }}>Demand Price</label>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Owner's expected (internal)</div>
                                <input style={inputStyle} type="number" value={data.customer_price} onChange={e => set('customer_price', e.target.value)} placeholder="e.g. 4500000" />
                            </div>
                            <div>
                                <label style={{ ...labelStyle, fontWeight: 700, color: 'var(--text-link)' }}>Display Price</label>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Shown on website</div>
                                <input style={inputStyle} type="number" value={data.display_price} onChange={e => set('display_price', e.target.value)} placeholder="e.g. 5000000" />
                            </div>
                        </div>
                        {/* Margin display */}
                        {(() => {
                            const demand = parseFloat(data.customer_price) || 0;
                            const display = parseFloat(data.display_price) || 0;
                            if (demand > 0 && display > 0) {
                                const margin = display - demand;
                                const pct = ((margin / demand) * 100).toFixed(1);
                                const fmt = (n: number) => {
                                    const abs = Math.abs(n);
                                    if (abs >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
                                    if (abs >= 100000) return `${(n / 100000).toFixed(1)} L`;
                                    if (abs >= 1000) return `${(n / 1000).toFixed(0)} K`;
                                    return String(n);
                                };
                                return (
                                    <div style={{
                                        padding: '10px', borderRadius: '8px', marginBottom: '10px', textAlign: 'center',
                                        border: `1px solid ${margin < 0 ? '#f8717140' : '#34d39940'}`,
                                        backgroundColor: margin < 0 ? '#f8717108' : '#34d39908',
                                    }}>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Margin: </span>
                                        <strong style={{ fontSize: '15px', color: margin < 0 ? '#f87171' : '#34d399' }}>
                                            {margin > 0 ? '+' : ''}₹{fmt(margin)} ({pct}%)
                                        </strong>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                        <details>
                            <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '8px' }}>Legacy Price Fields</summary>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div><label style={labelStyle}>Price (INR)</label><input style={inputStyle} type="number" value={data.price} onChange={e => set('price', e.target.value)} /></div>
                                <div>
                                    <label style={labelStyle}>Unit</label>
                                    <select style={inputStyle} value={data.price_unit} onChange={e => set('price_unit', e.target.value)}>
                                        <option value="">Raw</option><option value="Lakh">Lakh</option><option value="Crore">Crore</option><option value="Per Month">Per Month</option>
                                    </select>
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {/* Documents */}
                <SectionHeader title={`Documents (${editDocuments.length})`} sectionKey="documents" />
                {expandedSections.documents && (
                    <div style={{ padding: '12px 0' }}>
                        {/* Upload Section */}
                        <div style={{ padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)', marginBottom: '12px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#4F46E5', marginBottom: '8px' }}>Upload Document</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                <div>
                                    <label style={labelStyle}>Type</label>
                                    <select style={inputStyle} value={newDocType} onChange={e => setNewDocType(e.target.value)}>
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
                                    <label style={labelStyle}>Title</label>
                                    <input style={inputStyle} value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} placeholder="e.g. NOC from Builder" />
                                </div>
                            </div>
                            <input
                                ref={docUploadRef}
                                type="file"
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setDocUploading(true);
                                    try {
                                        const doc = await uploadInventoryDocument(item.id, file, newDocType, newDocTitle || file.name);
                                        setEditDocuments(prev => [doc, ...prev]);
                                        setNewDocTitle('');
                                    } catch (err: any) {
                                        showToast(err.response?.data?.error || 'Upload failed', 'error');
                                    } finally {
                                        setDocUploading(false);
                                        if (docUploadRef.current) docUploadRef.current.value = '';
                                    }
                                }}
                            />
                            <button
                                type="button"
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '8px',
                                    border: '2px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                    color: 'var(--text-secondary)', fontSize: '14px',
                                    cursor: docUploading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    minHeight: '44px', opacity: docUploading ? 0.6 : 1,
                                }}
                                disabled={docUploading}
                                onClick={() => docUploadRef.current?.click()}
                            >
                                {docUploading ? 'Uploading...' : '+ Choose File & Upload'}
                            </button>
                        </div>

                        {/* Document List */}
                        {editDocuments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                No documents uploaded yet. Add title deeds, NOCs, layout plans, etc.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {editDocuments.map((doc: any) => {
                                    const DOC_LABELS: Record<string, string> = {
                                        title_deed: 'Title Deed', noc: 'NOC', layout_plan: 'Layout Plan',
                                        sale_agreement: 'Sale Agreement', encumbrance: 'Encumbrance', tax_receipt: 'Tax Receipt', other: 'Other',
                                    };
                                    return (
                                        <div key={doc.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                            borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)',
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {doc.title || doc.file_name}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                                                        {DOC_LABELS[doc.doc_type] || doc.doc_type}
                                                    </span>
                                                    {doc.file_size && (
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            {doc.file_size > 1048576 ? `${(doc.file_size / 1048576).toFixed(1)} MB` : `${Math.round(doc.file_size / 1024)} KB`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <a href={inventoryDocumentUrl(item.id, doc.id)} target="_blank" rel="noreferrer"
                                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-secondary)', fontSize: '12px', color: 'var(--text-link)', textDecoration: 'none', minHeight: '32px', display: 'flex', alignItems: 'center' }}>
                                                View
                                            </a>
                                            <button type="button"
                                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #f87171', fontSize: '12px', color: '#f87171', background: 'none', cursor: 'pointer', minHeight: '32px' }}
                                                onClick={async () => {
                                                    const ok = await confirm('Delete this document?');
                                                    if (!ok) return;
                                                    try {
                                                        await deleteInventoryDocument(item.id, doc.id);
                                                        setEditDocuments(prev => prev.filter((d: any) => d.id !== doc.id));
                                                    } catch (err: any) {
                                                        showToast(err.response?.data?.error || 'Failed to delete', 'error');
                                                    }
                                                }}>
                                                Delete
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Owner / Source Contact */}
                <SectionHeader title="Owner / Source Contact" sectionKey="owner_contact" />
                {expandedSections.owner_contact && (
                    <MobileEditContactSection
                        currentPhone={data.owner_phone}
                        currentName={data.owner_name}
                        color="#34d399"
                        onContactSelected={(contact) => {
                            // Owner-only — the uploader is audit data and stays untouched.
                            setOwnerError('');
                            set('owner_phone', contact.phone);
                            set('owner_name', contact.name);
                        }}
                    />
                )}
                {ownerError && expandedSections.owner_contact && (
                    <div role="alert" style={{
                        padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginTop: '8px',
                        backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
                    }}>{ownerError}</div>
                )}

                {/* Key Holder */}
                <SectionHeader title="Key Holder" sectionKey="keyholder" />
                {expandedSections.keyholder && (
                    <div style={{ padding: '12px 0' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={labelStyle}>Key Holder Type</label>
                            <select style={inputStyle} value={data.key_holder_type} onChange={e => set('key_holder_type', e.target.value)}>
                                <option value="">Not Set</option><option value="UPLOADER">Uploader</option><option value="OWNER">Owner</option><option value="EXTERNAL">External</option>
                            </select>
                        </div>
                        {data.key_holder_type === 'EXTERNAL' && (
                            <MobileEditContactSection
                                currentPhone={data.key_holder_phone}
                                currentName={data.key_holder_name}
                                color="#60a5fa"
                                onContactSelected={(contact) => {
                                    set('key_holder_name', contact.name);
                                    set('key_holder_phone', contact.phone);
                                }}
                            />
                        )}
                    </div>
                )}

                {/* Assignment / Sharing */}
                <SectionHeader title="Assignment & Sharing" sectionKey="assignment" />
                {expandedSections.assignment && (
                    <div style={{ padding: '12px 0' }}>
                        {/* Assigned To */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Assigned To</label>
                            <select style={inputStyle} value={data.assigned_agent_id} onChange={e => set('assigned_agent_id', e.target.value)}>
                                <option value="">Not Assigned</option>
                                {agentsList.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                            </select>
                        </div>

                        {/* Shared With */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ ...labelStyle, marginBottom: '8px' }}>Shared With</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                {agentsList.map((a: any) => (
                                    <label key={a.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer',
                                        padding: '8px 10px', borderRadius: '8px',
                                        border: '1px solid var(--border-secondary)',
                                        background: (data.shared_with_ids || []).includes(a.id) ? 'rgba(99,102,241,0.1)' : 'transparent',
                                        minHeight: '44px',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={(data.shared_with_ids || []).includes(a.id)}
                                            onChange={e => {
                                                const current = data.shared_with_ids || [];
                                                setData(prev => ({
                                                    ...prev,
                                                    shared_with_ids: e.target.checked
                                                        ? [...current, a.id]
                                                        : current.filter((id: string) => id !== a.id)
                                                }));
                                            }}
                                            style={{ width: '18px', height: '18px', flexShrink: 0 }}
                                        />
                                        <span>{a.name} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({a.role})</span></span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Transfer Ownership */}
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', marginBottom: '8px' }}>Transfer Ownership</div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                    Transfer moves primary assignment to another team member.
                                </p>
                                <select id="mobile-transfer-target" title="Transfer to team member" style={{ ...inputStyle, marginBottom: '8px' }}>
                                    <option value="">Select team member...</option>
                                    {agentsList.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                                </select>
                                <button type="button"
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '8px',
                                        backgroundColor: '#f87171', color: '#fff', border: 'none',
                                        fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                                        minHeight: '44px',
                                    }}
                                    onClick={async () => {
                                        const sel = document.getElementById('mobile-transfer-target') as HTMLSelectElement;
                                        const target = sel?.value;
                                        if (!target) { showToast('Select a team member to transfer to', 'info'); return; }
                                        const targetName = agentsList.find((a: any) => a.id === target)?.name || target;
                                        const ok = await confirm(`Transfer this property to ${targetName}?`);
                                        if (!ok) return;
                                        try {
                                            await transferInventory(item.id, target);
                                            set('assigned_agent_id', target);
                                            showToast(`Transferred to ${targetName}`, 'success');
                                        } catch (err: any) {
                                            showToast(err.response?.data?.error || 'Transfer failed', 'error');
                                        }
                                    }}
                                >Transfer Now</button>
                            </div>
                    </div>
                )}

                {/* Description */}
                <div style={{ padding: '12px 0' }}>
                    <label style={labelStyle}>Description</label>
                    <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={data.description} onChange={e => set('description', e.target.value)} />
                </div>

            </div>

            {/* Save Button — Fixed bottom, above 64px nav */}
            <div style={{ padding: '12px 16px', paddingBottom: '80px', borderTop: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                <button type="button" onClick={handleSave} disabled={saving}
                    style={{
                        width: '100%', padding: '14px', borderRadius: CARD_RADIUS,
                        backgroundColor: '#10B981', color: '#fff', border: 'none',
                        fontSize: '16px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                    }}>
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}
