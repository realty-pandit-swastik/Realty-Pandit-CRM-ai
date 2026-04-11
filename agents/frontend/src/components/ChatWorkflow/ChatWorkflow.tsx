/**
 * ChatWorkflow — Admin Panel
 *
 * Conversational chat UI for inventory upload workflow.
 * All inline styles with CSS variables matching admin panel patterns.
 */

import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, ArrowLeft, X, Camera, Video, FileText, Check, Edit3, MapPin, Phone, User, Mail, CheckCircle2 } from 'lucide-react';
import { useChatWorkflow, type ChatWorkflowState } from '../../hooks/useChatWorkflow';
import { GooglePlacesInput, type PlaceResult } from '../GooglePlacesInput';
import type { ChatMessage } from '../../api/client';

// ─── Price Formatter ─────────────────────────────────────────────────────────

function formatIndianPrice(amount: number): string {
    if (amount >= 10000000) {
        const cr = amount / 10000000;
        return cr % 1 === 0 ? `₹${cr} Cr` : `₹${cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
    }
    if (amount >= 100000) {
        const l = amount / 100000;
        return l % 1 === 0 ? `₹${l} L` : `₹${l.toFixed(2).replace(/\.?0+$/, '')} L`;
    }
    if (amount >= 1000) {
        const k = amount / 1000;
        return k % 1 === 0 ? `₹${k} K` : `₹${k.toFixed(1).replace(/\.?0+$/, '')} K`;
    }
    return `₹${amount}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ChatWorkflowPanelProps {
    onBack: () => void;
    onCreated: () => void;
    onEditInventory?: (inventoryId: string) => void;
}

export const ChatWorkflowPanel: React.FC<ChatWorkflowPanelProps> = ({ onBack, onCreated, onEditInventory }) => {
    const chat = useChatWorkflow();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chat.startSession();
        return () => { chat.reset(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat.messages, chat.sending]);

    const lastQuestionIdx = findLastQuestionIdx(chat.messages);
    const showTextInput = !isWidgetOnly(chat.currentInputType);

    // Show success screen when inventory is created
    if (chat.inventoryId && !chat.sessionActive) {
        const detailTags = ['Amenities', 'Photos', 'Videos', 'Floor Plan', 'Furnishing', 'Parking', 'Age', 'Description', 'Facing', 'Balcony'];
        return (
            <div style={s.container}>
                <div style={s.header}>
                    <button onClick={() => { chat.reset(); onCreated(); }} style={s.backBtn}><ArrowLeft size={16} /></button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} style={{ color: '#059669' }} />
                        <span style={{ fontWeight: 600, fontSize: '16px', color: '#059669' }}>Property Saved!</span>
                    </div>
                </div>
                <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#10004;</div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Property Saved Successfully!</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '4px' }}>Inventory ID:</p>
                    <p style={{ fontFamily: 'monospace', fontSize: '20px', color: '#059669', fontWeight: 'bold', marginBottom: '24px' }}>
                        {chat.displayId || chat.inventoryId}
                    </p>

                    <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '2px solid #059669', borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'left' }}>
                        <p style={{ fontWeight: 600, fontSize: '15px', color: '#059669', marginBottom: '8px' }}>
                            Want to improve this listing?
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                            Add more details to make your listing stand out and attract more buyers:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                            {detailTags.map(tag => (
                                <span key={tag} style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', backgroundColor: '#d1fae5', color: '#065f46' }}>{tag}</span>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                const invId = chat.inventoryId;
                                chat.reset();
                                if (invId && onEditInventory) {
                                    onEditInventory(invId);
                                } else {
                                    onCreated();
                                }
                            }}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#059669', color: '#fff', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer' }}
                        >
                            Add More Details
                        </button>
                    </div>

                    <button
                        onClick={() => { chat.reset(); onCreated(); }}
                        style={{ padding: '10px 24px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 500, fontSize: '13px', border: '1px solid var(--border-secondary)', cursor: 'pointer' }}
                    >
                        Back to Inventory List
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={s.container}>
            {/* Header */}
            <div style={s.header}>
                <button onClick={onBack} style={s.backBtn}><ArrowLeft size={16} /></button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={18} style={{ color: '#059669' }} />
                    <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>Add Property (Chat)</span>
                </div>
                <ProgressBadge progress={chat.progress} />
            </div>

            {/* Messages */}
            <div style={s.messagesArea}>
                {chat.loading && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: '8px', fontSize: '13px' }}>Starting chat...</p>
                    </div>
                )}

                {chat.messages.map((msg, idx) => (
                    <ChatBubble
                        key={msg.id}
                        message={msg}
                        isLatest={idx === lastQuestionIdx}
                        sending={chat.sending}
                        onQuickReply={chat.sendQuickReply}
                        chat={chat}
                    />
                ))}

                {chat.sending && <TypingDots />}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {chat.sessionActive && showTextInput && (
                <ChatInputBar
                    onSend={chat.sendMessage}
                    disabled={chat.sending || chat.loading}
                    inputType={chat.currentInputType}
                />
            )}
        </div>
    );
};

// ─── Progress Badge ─────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
    classification: 'Type', specs: 'Specs', pricing: 'Pricing', address: 'Location',
    features: 'Features', media: 'Media', contact: 'Contact', optional: 'Info', confirm: 'Confirm',
};

function ProgressBadge({ progress }: { progress: { current: number; total: number; group: string } | null }) {
    if (!progress) return null;
    const pct = Math.round((progress.current / progress.total) * 100);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {GROUP_LABELS[progress.group] || progress.group} · {pct}%
            </span>
            <div style={{ width: '60px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#059669', borderRadius: '2px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

// ─── Chat Bubble ────────────────────────────────────────────────────────────

interface ChatBubbleProps {
    message: ChatMessage;
    isLatest: boolean;
    sending: boolean;
    onQuickReply: (value: string) => void;
    chat: ChatWorkflowState;
}

function ChatBubble({ message, isLatest, sending, onQuickReply, chat }: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const isError = message.type === 'error';
    const isSuccess = message.type === 'success';

    const bubbleStyle: React.CSSProperties = isUser
        ? { ...s.bubble, backgroundColor: '#059669', color: '#fff', marginLeft: 'auto', borderTopRightRadius: '4px' }
        : isError
            ? { ...s.bubble, backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error-text, #dc2626)', borderTopLeftRadius: '4px' }
            : isSuccess
                ? { ...s.bubble, backgroundColor: 'var(--success-bg, #f0fdf4)', color: 'var(--success-text, #16a34a)', borderTopLeftRadius: '4px' }
                : { ...s.bubble, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderTopLeftRadius: '4px' };

    return (
        <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
            <div style={{ maxWidth: '80%' }}>
                <div style={bubbleStyle}>
                    <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{message.content}</p>
                </div>

                {/* Quick replies */}
                {isLatest && !isUser && message.quick_replies && message.quick_replies.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {message.quick_replies.map(qr => (
                            <button
                                key={qr.value}
                                onClick={() => !sending && onQuickReply(qr.value)}
                                disabled={sending}
                                style={{
                                    padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                                    border: '1px solid #059669', backgroundColor: 'transparent', color: '#059669',
                                    cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { if (!sending) { (e.target as HTMLElement).style.backgroundColor = '#059669'; (e.target as HTMLElement).style.color = '#fff'; } }}
                                onMouseLeave={e => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; (e.target as HTMLElement).style.color = '#059669'; }}
                            >
                                {qr.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Inline widgets */}
                {isLatest && !isUser && renderWidget(message, chat)}

                {/* Timestamp */}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
}

// ─── Typing Dots ────────────────────────────────────────────────────────────

function TypingDots() {
    return (
        <div style={{ display: 'flex', gap: '4px', padding: '8px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '16px', width: 'fit-content', border: '1px solid var(--border-secondary)' }}>
            {[0, 1, 2].map(i => (
                <div key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-muted)',
                    animation: `typingBounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                }} />
            ))}
        </div>
    );
}

// ─── Chat Input Bar ─────────────────────────────────────────────────────────

interface ChatInputBarProps {
    onSend: (text: string) => void;
    disabled: boolean;
    inputType: string | null;
}

function ChatInputBar({ onSend, disabled, inputType }: ChatInputBarProps) {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (!disabled) inputRef.current?.focus(); }, [disabled, inputType]);

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText('');
            setTimeout(() => { inputRef.current?.focus(); }, 50);
        }
    };

    const placeholder = inputType === 'phone' ? 'Enter 10-digit phone...'
        : inputType === 'number' ? 'Enter a number (e.g., 5500000 or 55 lakh)...'
        : inputType === 'compound' ? 'Enter value (e.g., 1200 sqft)...'
        : 'Type your message...';

    const inputMode: 'text' | 'tel' | 'numeric' = inputType === 'phone' ? 'tel' : inputType === 'number' || inputType === 'compound' ? 'numeric' : 'text';

    // Live price preview
    const pricePreview = inputType === 'number' && text.trim() ? (() => {
        const num = parseFloat(text.trim().replace(/,/g, ''));
        return !isNaN(num) && num > 0 ? formatIndianPrice(num) : null;
    })() : null;

    return (
        <div style={{ ...s.inputBar, flexDirection: 'column', gap: '4px' }}>
            {pricePreview && (
                <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600, padding: '0 4px' }}>
                    {pricePreview}
                </div>
            )}
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={disabled}
                placeholder={placeholder}
                inputMode={inputMode}
                rows={1}
                style={s.textInput}
            />
            <button
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                style={{
                    ...s.sendBtn,
                    backgroundColor: text.trim() && !disabled ? '#059669' : 'var(--bg-tertiary)',
                    color: text.trim() && !disabled ? '#fff' : 'var(--text-muted)',
                    cursor: text.trim() && !disabled ? 'pointer' : 'not-allowed',
                }}
            >
                {disabled ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
            </div>
        </div>
    );
}

// ─── Media Uploader Widget ──────────────────────────────────────────────────

interface MediaUploaderProps {
    mode: 'photo' | 'video' | 'document';
    onUpload: (files: File[]) => Promise<void>;
    sending: boolean;
}

function MediaUploaderWidget({ mode, onUpload, sending }: MediaUploaderProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const accept = mode === 'photo' ? 'image/*' : mode === 'video' ? 'video/*' : 'application/pdf,image/*,.doc,.docx';
    const limit = mode === 'photo' ? 10 : mode === 'video' ? 2 : 5;
    const Icon = mode === 'photo' ? Camera : mode === 'video' ? Video : FileText;
    const label = mode === 'photo' ? 'Photos' : mode === 'video' ? 'Videos' : 'Documents';

    const addFiles = (fl: FileList) => setFiles(prev => [...prev, ...Array.from(fl)].slice(0, limit));
    const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

    const handleUpload = async () => {
        if (!files.length || uploading) return;
        setUploading(true);
        try { await onUpload(files); setDone(true); } catch {} finally { setUploading(false); }
    };

    if (done) {
        return (
            <div style={{ ...s.widget, display: 'flex', alignItems: 'center', gap: '8px', color: '#059669' }}>
                <CheckCircle2 size={16} /> {files.length} {label.toLowerCase()} uploaded
            </div>
        );
    }

    return (
        <div style={s.widget}>
            <div
                onClick={() => inputRef.current?.click()}
                style={{ padding: '16px', textAlign: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
                <Icon size={24} style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>Upload {label}</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px' }}>Click to select (max {limit})</p>
                <input ref={inputRef} type="file" accept={accept} multiple={limit > 1} onChange={e => e.target.files && addFiles(e.target.files)} style={{ display: 'none' }} />
            </div>

            {files.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-secondary)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {files.map((f, i) => (
                            <div key={i} style={{ position: 'relative', padding: '4px 24px 4px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.name}
                                <button onClick={() => removeFile(i)} style={{ position: 'absolute', right: '2px', top: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleUpload} disabled={uploading || sending} style={{ ...s.primaryBtn, width: '100%', opacity: uploading || sending ? 0.6 : 1 }}>
                        {uploading ? 'Uploading...' : `Upload ${files.length} ${label.toLowerCase()}`}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Location Picker Widget ─────────────────────────────────────────────────

function LocationPickerWidget({ onSubmit, sending }: { onSubmit: (json: string) => void; sending: boolean }) {
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

    const handlePlaceSelect = (p: PlaceResult) => {
        setPlace(p);
        setSubLocality(p.sub_locality || '');
        setLocality(p.locality || '');
        setDistrict(p.district || '');
        setState(p.state || '');
        setPincode(p.pincode || '');
    };

    const handleConfirm = () => {
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

    const fieldRow = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ width: '80px', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...s.textField, flex: 1 }} />
        </div>
    );

    return (
        <div style={s.widget}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={16} style={{ color: '#059669', flexShrink: 0 }} />
                <GooglePlacesInput
                    value={searchText}
                    onChange={setSearchText}
                    onPlaceSelect={handlePlaceSelect}
                    placeholder="Search property address..."
                    style={s.textField}
                />
            </div>
            {place && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-secondary)' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{place.full_address}</p>
                    <div style={{ marginBottom: '8px' }}>
                        {fieldRow('Flat / Unit', flatNo, setFlatNo, 'e.g., A-101')}
                        {fieldRow('Floor No.', floorNumber, setFloorNumber, 'e.g., 2')}
                        {fieldRow('Society / Bldg', apartmentName, setApartmentName, 'e.g., Seemant Vihar')}
                        {fieldRow('Plot No.', plotNo, setPlotNo, 'e.g., Plot 42')}
                        {fieldRow('Sub Locality', subLocality, setSubLocality, 'Sector, Area')}
                        {fieldRow('Locality', locality, setLocality, 'City / Town')}
                        {fieldRow('District / City', district, setDistrict, 'e.g., Ghaziabad')}
                        {fieldRow('State', state, setState, 'e.g., Uttar Pradesh')}
                        {fieldRow('Pincode', pincode, setPincode, '6-digit pincode')}
                    </div>
                    {place.latitude && place.longitude && (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>Lat: {place.latitude.toFixed(6)}</span>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>Lng: {place.longitude.toFixed(6)}</span>
                        </div>
                    )}
                    {(!locality.trim() || !district.trim() || !state.trim()) && (
                        <p style={{ fontSize: '11px', color: '#dc2626', margin: '0 0 6px' }}>Locality, District/City, and State are required</p>
                    )}
                    <button onClick={handleConfirm} disabled={sending || !locality.trim() || !district.trim() || !state.trim()} style={{ ...s.primaryBtn, width: '100%', opacity: sending || !locality.trim() || !district.trim() || !state.trim() ? 0.6 : 1 }}>
                        <Check size={14} style={{ marginRight: '4px' }} /> Confirm Address
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Summary Card Widget ────────────────────────────────────────────────────

function SummaryCardWidget({ summary, onConfirm, onEdit, sending }: { summary: Record<string, string>; onConfirm: () => void; onEdit: () => void; sending: boolean }) {
    return (
        <div style={s.widget}>
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--success-bg, #f0fdf4)', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} style={{ color: '#059669' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>Property Summary</span>
            </div>
            <div>
                {Object.entries(summary).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', padding: '6px 14px', borderBottom: '1px solid var(--bg-tertiary)', fontSize: '12px' }}>
                        <span style={{ width: '40%', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px' }}>
                <button onClick={onConfirm} disabled={sending} style={{ ...s.primaryBtn, flex: 1, opacity: sending ? 0.6 : 1 }}>
                    {sending ? 'Submitting...' : 'Confirm & Submit'}
                </button>
                <button onClick={onEdit} disabled={sending} style={{ ...s.secondaryBtn, opacity: sending ? 0.6 : 1 }}>
                    <Edit3 size={14} /> Edit
                </button>
            </div>
        </div>
    );
}

// ─── Multi-Select Widget ────────────────────────────────────────────────────

function MultiSelectWidget({ options, onDone, sending }: { options: Array<{ value: string; label: string }>; onDone: (selected: string[]) => void; sending: boolean }) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const toggle = (v: string) => setSelected(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

    return (
        <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {options.map(o => (
                    <button
                        key={o.value}
                        onClick={() => toggle(o.value)}
                        disabled={sending}
                        style={{
                            padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                            border: '1px solid ' + (selected.has(o.value) ? '#059669' : 'var(--border-secondary)'),
                            backgroundColor: selected.has(o.value) ? '#059669' : 'transparent',
                            color: selected.has(o.value) ? '#fff' : 'var(--text-secondary)',
                            cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                    >
                        {selected.has(o.value) && <Check size={12} />} {o.label}
                    </button>
                ))}
            </div>
            <button onClick={() => onDone(Array.from(selected))} disabled={sending || selected.size === 0} style={{ ...s.primaryBtn, opacity: selected.size === 0 || sending ? 0.5 : 1 }}>
                Done ({selected.size} selected)
            </button>
        </div>
    );
}

// ─── Contact Form Widget ────────────────────────────────────────────────────

function ContactFormWidget({ mode, onSubmit, sending }: { mode: 'owner_block' | 'uploader_block'; onSubmit: (text: string) => void; sending: boolean }) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const isOwner = mode === 'owner_block';
    const isValid = name.trim().length >= 2 && /^\d{10}$/.test(phone.replace(/[\s+\-]/g, '').replace(/^91/, ''));

    const handleSubmit = () => {
        if (!isValid) return;
        const data = isOwner
            ? { owner_name: name.trim(), owner_phone: phone.trim() }
            : { name: name.trim(), phone: phone.trim(), email: email.trim() };
        onSubmit(JSON.stringify(data));
    };

    return (
        <div style={{ ...s.widget, padding: '12px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isOwner ? 'Owner Details' : 'Your Details'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={s.textField} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Phone size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>+91</span>
                <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" inputMode="tel" style={s.textField} />
            </div>
            {!isOwner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Mail size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" type="email" style={s.textField} />
                </div>
            )}
            <button onClick={handleSubmit} disabled={!isValid || sending} style={{ ...s.primaryBtn, width: '100%', opacity: !isValid || sending ? 0.5 : 1 }}>
                Submit
            </button>
        </div>
    );
}

// ─── Render Widget Helper ───────────────────────────────────────────────────

function renderWidget(msg: ChatMessage, chat: ChatWorkflowState): React.ReactNode {
    const t = msg.input_type;

    if (t === 'media_upload') return <MediaUploaderWidget mode="photo" onUpload={f => chat.uploadFiles(f, 'photo')} sending={chat.sending} />;
    if (t === 'video_upload') return <MediaUploaderWidget mode="video" onUpload={f => chat.uploadFiles(f, 'video')} sending={chat.sending} />;
    if (t === 'document_upload') return <MediaUploaderWidget mode="document" onUpload={f => chat.uploadFiles(f, 'document')} sending={chat.sending} />;
    if (t === 'address_block') return <LocationPickerWidget onSubmit={chat.sendQuickReply} sending={chat.sending} />;
    if (t === 'multi_select' && msg.metadata?.options) {
        return <MultiSelectWidget options={msg.metadata.options} onDone={sel => { sel.forEach(v => chat.sendQuickReply(v)); setTimeout(() => chat.sendMessage('done'), 300); }} sending={chat.sending} />;
    }
    if (msg.type === 'summary' && msg.metadata?.summary) {
        return <SummaryCardWidget summary={msg.metadata.summary} onConfirm={() => chat.confirmSubmission(true)} onEdit={() => chat.confirmSubmission(false)} sending={chat.sending} />;
    }
    if (t === 'owner_block' || t === 'uploader_block') return <ContactFormWidget mode={t} onSubmit={chat.sendQuickReply} sending={chat.sending} />;

    return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findLastQuestionIdx(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && (messages[i].type === 'question' || messages[i].type === 'summary')) return i;
    }
    return -1;
}

function isWidgetOnly(inputType: string | null): boolean {
    return inputType === 'media_upload' || inputType === 'video_upload' || inputType === 'document_upload' ||
           inputType === 'address_block' || inputType === 'confirm' || inputType === 'owner_block' || inputType === 'uploader_block';
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
    },
    backBtn: {
        background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-link)',
        padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    },
    messagesArea: {
        flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column',
    },
    bubble: {
        borderRadius: '16px', padding: '10px 14px', maxWidth: '100%',
    },
    inputBar: {
        display: 'flex', gap: '8px', padding: '10px 16px', borderTop: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)',
    },
    textInput: {
        flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '13px', resize: 'none' as const,
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', minHeight: '36px', maxHeight: '80px',
        fontFamily: 'inherit',
    },
    sendBtn: {
        width: '36px', height: '36px', borderRadius: '8px', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        transition: 'all 0.15s',
    },
    widget: {
        marginTop: '8px', borderRadius: '10px', border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', overflow: 'hidden',
    },
    textField: {
        width: '100%', padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box' as const,
    },
    primaryBtn: {
        padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        backgroundColor: '#059669', color: '#fff', border: 'none', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '4px',
    },
    secondaryBtn: {
        padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '4px',
    },
};

export default ChatWorkflowPanel;
