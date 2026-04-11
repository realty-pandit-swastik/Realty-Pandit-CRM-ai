
import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import { updateInventory, getCategoryTree, getStates, uploadInventoryImages, deleteInventoryMedia, getTeamMembersList, transferInventory, uploadInventoryDocument, deleteInventoryDocument, getInventoryItem } from '../../api/client';

import { GooglePlacesInput } from '../GooglePlacesInput';
import { ContactSearchField, type SelectedContact } from '../ContactSearchField';
import type { PlaceResult } from '../GooglePlacesInput';

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

export function MobileInventoryEdit({ item, onSaved, onCancel: _onCancel }: MobileInventoryEditProps) {
    const specs = item.specs || {};
    const features = item.features || {};
    const [data, setData] = useState({
        category_id: item.category_id || '',
        sub_category_id: item.sub_category_id || '',
        type_id: item.type_id || '',
        configuration_id: item.configuration_id || '',
        usage_type_id: item.usage_type_id || '',
        investment_type_id: item.investment_type_id || '',
        intent: item.intent || 'sell',
        status: item.status || 'active',
        furnishing: item.furnishing || '',
        property_age: item.property_age || '',
        facing: item.facing || '',
        bedrooms: specs.bedrooms ?? '',
        bathrooms: specs.bathrooms ?? '',
        area: specs.area ?? '',
        area_unit: specs.area_unit || 'sqft',
        flat_no: item.flat_no || '',
        floor_number: item.floor_number ?? '',
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
        uploader_phone: item.uploader_phone || '',
        uploader_name: item.uploader_name || '',
        key_holder_type: item.key_holder_type || '',
        key_holder_name: item.key_holder_name || '',
        key_holder_phone: item.key_holder_phone || '',
        description: item.description || '',
    });

    const [saving, setSaving] = useState(false);
    const [classTree, setClassTree] = useState<any>({ categories: [], configurations: [], usage_types: [], investment_types: [] });
    const [statesList, setStatesList] = useState<string[]>([]);
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
        getStates().then(d => {
            if (Array.isArray(d)) setStatesList(d.map((s: any) => s.name || s));
            else if (d?.states) setStatesList(d.states.map((s: any) => s.name || s));
        }).catch(() => {});
        getTeamMembersList().then(d => {
            if (Array.isArray(d)) setAgentsList(d);
            else if (d?.members) setAgentsList(d.members);
        }).catch(() => {});
        // Load documents
        getInventoryItem(item.id).then(full => {
            if (full?.documents) setEditDocuments(full.documents);
        }).catch(() => {});
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

    const handleSave = async () => {
        setSaving(true);
        try {
            const specsObj: Record<string, any> = {};
            if (data.bedrooms) specsObj.bedrooms = Number(data.bedrooms);
            if (data.bathrooms) specsObj.bathrooms = Number(data.bathrooms);
            if (data.area) specsObj.area = Number(data.area);
            if (data.area_unit) specsObj.area_unit = data.area_unit;

            const { bedrooms, bathrooms, area, area_unit, features: feat, ...rest } = data;
            await updateInventory(item.id, { ...rest, specs: specsObj, features: feat });
            onSaved();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save');
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
            alert(err.response?.data?.error || 'Delete failed');
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
        if (!confirm('Delete this video?')) return;
        try {
            await deleteInventoryMedia(item.id, filename);
            setVideoUrls(prev => prev.filter(u => u !== url));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete video');
        }
    };

    const subcategories = classTree.categories.find((c: any) => c.id === data.category_id)?.subcategories || [];
    const types = subcategories.find((sc: any) => sc.id === data.sub_category_id)?.types || [];

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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={labelStyle}>Category</label>
                            <select style={inputStyle} value={data.category_id} onChange={e => { set('category_id', e.target.value); set('sub_category_id', ''); set('type_id', ''); }}>
                                <option value="">Select</option>
                                {classTree.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Sub Category</label>
                            <select style={inputStyle} value={data.sub_category_id} onChange={e => { set('sub_category_id', e.target.value); set('type_id', ''); }}>
                                <option value="">Select</option>
                                {subcategories.map((sc: any) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Type</label>
                            <select style={inputStyle} value={data.type_id} onChange={e => set('type_id', e.target.value)}>
                                <option value="">Select</option>
                                {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Configuration</label>
                            <select style={inputStyle} value={data.configuration_id} onChange={e => set('configuration_id', e.target.value)}>
                                <option value="">Select</option>
                                {classTree.configurations.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Usage</label>
                            <select style={inputStyle} value={data.usage_type_id} onChange={e => set('usage_type_id', e.target.value)}>
                                <option value="">Select</option>
                                {classTree.usage_types.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Investment Type</label>
                            <select style={inputStyle} value={data.investment_type_id} onChange={e => set('investment_type_id', e.target.value)}>
                                <option value="">Select</option>
                                {classTree.investment_types.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
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
                        <div>
                            <label style={labelStyle}>Furnishing</label>
                            <select style={inputStyle} value={data.furnishing} onChange={e => set('furnishing', e.target.value)}>
                                <option value="">None</option><option value="unfurnished">Unfurnished</option><option value="semi_furnished">Semi</option><option value="fully_furnished">Full</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Age</label>
                            <select style={inputStyle} value={data.property_age} onChange={e => set('property_age', e.target.value)}>
                                <option value="">Select</option><option value="new_construction">New</option><option value="1-3_years">1-3Y</option><option value="3-5_years">3-5Y</option><option value="5-10_years">5-10Y</option><option value="10+_years">10+Y</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={labelStyle}>Facing</label>
                            <select style={inputStyle} value={data.facing} onChange={e => set('facing', e.target.value)}>
                                <option value="">Select</option>
                                {['north','south','east','west','north_east','north_west','south_east','south_west'].map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Specs */}
                <SectionHeader title="Specifications" sectionKey="specs" />
                {expandedSections.specs && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0' }}>
                        <div><label style={labelStyle}>Bedrooms</label><input style={inputStyle} type="number" value={data.bedrooms} onChange={e => set('bedrooms', e.target.value)} placeholder="2" /></div>
                        <div><label style={labelStyle}>Bathrooms</label><input style={inputStyle} type="number" value={data.bathrooms} onChange={e => set('bathrooms', e.target.value)} placeholder="2" /></div>
                        <div><label style={labelStyle}>Area</label><input style={inputStyle} type="number" value={data.area} onChange={e => set('area', e.target.value)} placeholder="1200" /></div>
                        <div>
                            <label style={labelStyle}>Unit</label>
                            <select style={inputStyle} value={data.area_unit} onChange={e => set('area_unit', e.target.value)}>
                                <option value="sqft">Sq.Ft</option><option value="sqm">Sq.M</option><option value="sqyd">Sq.Yd</option><option value="acre">Acre</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Amenities */}
                <SectionHeader title="Amenities / Features" sectionKey="amenities" />
                {expandedSections.amenities && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '12px 0' }}>
                        {AMENITIES_LIST.map(a => (
                            <label key={a.value} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer',
                                padding: '8px 10px', borderRadius: '8px',
                                border: '1px solid var(--border-secondary)',
                                background: data.features?.[a.value] ? 'rgba(99,102,241,0.1)' : 'transparent',
                                minHeight: '44px',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={!!data.features?.[a.value]}
                                    onChange={e => setData(prev => ({
                                        ...prev,
                                        features: { ...prev.features, [a.value]: e.target.checked }
                                    }))}
                                    style={{ width: '18px', height: '18px', flexShrink: 0 }}
                                />
                                {a.label}
                            </label>
                        ))}
                    </div>
                )}

                {/* Address */}
                <SectionHeader title="Address" sectionKey="address" />
                {expandedSections.address && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px 0' }}>
                        <div><label style={labelStyle}>Flat No</label><input style={inputStyle} value={data.flat_no} onChange={e => set('flat_no', e.target.value)} placeholder="A-1201" /></div>
                        <div><label style={labelStyle}>Floor</label><input style={inputStyle} type="number" value={data.floor_number} onChange={e => set('floor_number', e.target.value)} /></div>
                        <div><label style={labelStyle}>Total Floors</label><input style={inputStyle} type="number" value={data.total_floors} onChange={e => set('total_floors', e.target.value)} /></div>
                        <div><label style={labelStyle}>Plot No</label><input style={inputStyle} value={data.plot_no} onChange={e => set('plot_no', e.target.value)} /></div>
                        <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Society</label><input style={inputStyle} value={data.apartment_name} onChange={e => set('apartment_name', e.target.value)} /></div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={labelStyle}>Search Address</label>
                            <GooglePlacesInput
                                value={data.full_address}
                                onChange={v => set('full_address', v)}
                                onPlaceSelect={(place: PlaceResult) => {
                                    setData(prev => ({
                                        ...prev,
                                        state: place.state || prev.state,
                                        district: place.district || prev.district,
                                        locality: place.locality || prev.locality,
                                        pincode: place.pincode || prev.pincode,
                                        full_address: place.full_address || prev.full_address,
                                    }));
                                }}
                                placeholder="Search location..."
                                style={inputStyle}
                            />
                        </div>
                        <div><label style={labelStyle}>Locality</label><input style={inputStyle} value={data.locality} onChange={e => set('locality', e.target.value)} placeholder="e.g. Sector 150" /></div>
                        <div><label style={labelStyle}>Sub Locality</label><input style={inputStyle} value={data.sub_locality} onChange={e => set('sub_locality', e.target.value)} placeholder="e.g. Block A" /></div>
                        <div><label style={labelStyle}>City</label><input style={inputStyle} value={data.district} onChange={e => set('district', e.target.value)} /></div>
                        <div>
                            <label style={labelStyle}>State</label>
                            <select style={inputStyle} value={data.state} onChange={e => set('state', e.target.value)}>
                                <option value="">Select</option>
                                {statesList.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Pincode</label><input style={inputStyle} value={data.pincode} onChange={e => set('pincode', e.target.value)} maxLength={6} /></div>
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
                                        alert(err.response?.data?.error || 'Upload failed');
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
                                            <a href={doc.file_url} target="_blank" rel="noreferrer"
                                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-secondary)', fontSize: '12px', color: 'var(--text-link)', textDecoration: 'none', minHeight: '32px', display: 'flex', alignItems: 'center' }}>
                                                View
                                            </a>
                                            <button type="button"
                                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #f87171', fontSize: '12px', color: '#f87171', background: 'none', cursor: 'pointer', minHeight: '32px' }}
                                                onClick={async () => {
                                                    if (!confirm('Delete this document?')) return;
                                                    try {
                                                        await deleteInventoryDocument(item.id, doc.id);
                                                        setEditDocuments(prev => prev.filter((d: any) => d.id !== doc.id));
                                                    } catch (err: any) {
                                                        alert(err.response?.data?.error || 'Failed to delete');
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
                        currentName={data.uploader_name}
                        color="#34d399"
                        onContactSelected={(contact) => {
                            set('owner_phone', contact.phone);
                            set('uploader_phone', contact.phone);
                            set('uploader_name', contact.name);
                        }}
                    />
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
                                        if (!target) return alert('Select a team member to transfer to');
                                        const targetName = agentsList.find((a: any) => a.id === target)?.name || target;
                                        if (!confirm(`Transfer this property to ${targetName}?`)) return;
                                        try {
                                            await transferInventory(item.id, target);
                                            set('assigned_agent_id', target);
                                            alert(`Transferred to ${targetName}`);
                                        } catch (err: any) {
                                            alert(err.response?.data?.error || 'Transfer failed');
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
