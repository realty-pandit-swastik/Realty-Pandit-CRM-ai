/**
 * ChatWorkflow — Admin Panel
 *
 * Conversational chat UI for inventory upload workflow.
 * Styles live in ChatWorkflow.module.css (CSS variables matching admin panel patterns).
 */

import React, { useEffect, useRef, useState } from 'react';
import PhoneInput from '../PhoneInput';
import { MessageSquare, Send, Loader2, ArrowLeft, X, Camera, Video, FileText, Check, Edit3, MapPin, Phone, User, Mail, CheckCircle2 } from 'lucide-react';
import { useChatWorkflow, type ChatWorkflowState } from '../../hooks/useChatWorkflow';
import { GooglePlacesInput, type PlaceResult } from '../GooglePlacesInput';
import type { ChatMessage } from '../../api/client';
import styles from './ChatWorkflow.module.css';

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
            <div className={styles.container}>
                <div className={styles.header}>
                    <button
                        type="button"
                        aria-label="Go back"
                        onClick={() => { chat.reset(); onCreated(); }}
                        className={styles.backBtn}
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div className={styles.headerInfo}>
                        <CheckCircle2 size={18} style={{ color: '#059669' }} />
                        <span className={styles.headerTitleSuccess}>Property Saved!</span>
                    </div>
                </div>
                <div className={styles.successBody}>
                    <div className={styles.successCheckmark}>&#10004;</div>
                    <h2 className={styles.successTitle}>Property Saved Successfully!</h2>
                    <p className={styles.successSubtitle}>Inventory ID:</p>
                    <p className={styles.successId}>{chat.displayId || chat.inventoryId}</p>

                    <div className={styles.successCard}>
                        <p className={styles.successCardTitle}>Want to improve this listing?</p>
                        <p className={styles.successCardText}>
                            Add more details to make your listing stand out and attract more buyers:
                        </p>
                        <div className={styles.successTagsRow}>
                            {detailTags.map(tag => (
                                <span key={tag} className={styles.successTag}>{tag}</span>
                            ))}
                        </div>
                        <button
                            type="button"
                            className={styles.successPrimaryBtn}
                            onClick={() => {
                                const invId = chat.inventoryId;
                                chat.reset();
                                if (invId && onEditInventory) {
                                    onEditInventory(invId);
                                } else {
                                    onCreated();
                                }
                            }}
                        >
                            Add More Details
                        </button>
                    </div>

                    <button
                        type="button"
                        className={styles.successSecondaryBtn}
                        onClick={() => { chat.reset(); onCreated(); }}
                    >
                        Back to Inventory List
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <button
                    type="button"
                    aria-label="Back"
                    onClick={onBack}
                    className={styles.backBtn}
                >
                    <ArrowLeft size={16} />
                </button>
                <div className={styles.headerInfo}>
                    <MessageSquare size={18} style={{ color: '#059669' }} />
                    <span className={styles.headerTitlePrimary}>Add Property (Chat)</span>
                </div>
                <ProgressBadge progress={chat.progress} />
            </div>

            {/* Messages */}
            <div className={styles.messagesArea}>
                {chat.loading && (
                    <div className={styles.loadingState}>
                        <Loader2 size={24} className={styles.spinAnimation} />
                        <p className={styles.loadingText}>Starting chat...</p>
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
        <div className={styles.progressBadge}>
            <span className={styles.progressText}>
                {GROUP_LABELS[progress.group] || progress.group} · {pct}%
            </span>
            <progress
                value={pct}
                max={100}
                aria-label="Upload progress"
                className={styles.progressBar}
            />
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

    const bubbleVariant = isUser
        ? styles.bubbleUser
        : isError
            ? styles.bubbleError
            : isSuccess
                ? styles.bubbleSuccess
                : styles.bubbleAssistant;

    return (
        <div className={`${styles.bubbleWrapper} ${isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}>
            <div className={styles.bubbleInner}>
                <div className={`${styles.bubble} ${bubbleVariant}`}>
                    <p className={styles.bubbleText}>{message.content}</p>
                </div>

                {/* Quick replies */}
                {isLatest && !isUser && message.quick_replies && message.quick_replies.length > 0 && (
                    <div className={styles.quickRepliesRow}>
                        {message.quick_replies.map(qr => (
                            <button
                                key={qr.value}
                                type="button"
                                onClick={() => !sending && onQuickReply(qr.value)}
                                disabled={sending}
                                className={styles.quickReplyBtn}
                            >
                                {qr.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Inline widgets */}
                {isLatest && !isUser && renderWidget(message, chat)}

                {/* Timestamp */}
                <span className={styles.bubbleTimestamp}>
                    {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
}

// ─── Typing Dots ────────────────────────────────────────────────────────────

function TypingDots() {
    return (
        <div className={styles.typingDots}>
            {[styles.typingDot, `${styles.typingDot} ${styles.typingDot1}`, `${styles.typingDot} ${styles.typingDot2}`].map((cls, i) => (
                <div key={i} className={cls} />
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

    const isActive = !!text.trim() && !disabled;

    return (
        <div className={styles.inputBar}>
            {pricePreview && (
                <div className={styles.pricePreview}>{pricePreview}</div>
            )}
            <div className={styles.inputBarRow}>
                <textarea
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={disabled}
                    placeholder={placeholder}
                    inputMode={inputMode}
                    rows={1}
                    aria-label="Message input"
                    className={styles.textInput}
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={disabled || !text.trim()}
                    aria-label="Send message"
                    className={`${styles.sendBtn} ${isActive ? styles.sendBtnActive : ''}`}
                >
                    {disabled ? <Loader2 size={16} className={styles.spinAnimation} /> : <Send size={16} />}
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
        try { await onUpload(files); setDone(true); } catch (err) { console.error('[ChatWorkflow] Upload failed:', err); } finally { setUploading(false); }
    };

    if (done) {
        return (
            <div className={`${styles.widget} ${styles.widgetDone}`}>
                <CheckCircle2 size={16} /> {files.length} {label.toLowerCase()} uploaded
            </div>
        );
    }

    return (
        <div className={styles.widget}>
            <label
                htmlFor={`file-upload-${mode}`}
                tabIndex={0}
                className={styles.widgetDropzone}
            >
                <Icon size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                <p className={styles.widgetDropzoneTitle}>Upload {label}</p>
                <p className={styles.widgetDropzoneHint}>Click to select (max {limit})</p>
                <input
                    ref={inputRef}
                    id={`file-upload-${mode}`}
                    type="file"
                    accept={accept}
                    multiple={limit > 1}
                    aria-label={`Select ${label} to upload`}
                    onChange={e => e.target.files && addFiles(e.target.files)}
                    className={styles.fileInputHidden}
                />
            </label>

            {files.length > 0 && (
                <div className={styles.widgetFileList}>
                    <div className={styles.fileChipsRow}>
                        {files.map((f, i) => (
                            <div key={i} className={styles.fileChip}>
                                {f.name}
                                <button
                                    type="button"
                                    onClick={() => removeFile(i)}
                                    aria-label={`Remove ${f.name}`}
                                    className={styles.fileChipRemove}
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleUpload}
                        disabled={uploading || sending}
                        className={`${styles.primaryBtn} ${styles.widgetFullWidth}`}
                    >
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

    const fieldRow = (lbl: string, value: string, onChange: (v: string) => void, placeholder: string) => (
        <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{lbl}</span>
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={lbl}
                className={styles.textField}
            />
        </div>
    );

    const isIncomplete = !locality.trim() || !district.trim() || !state.trim();

    return (
        <div className={styles.widget}>
            <div className={styles.locationSearchRow}>
                <MapPin size={16} style={{ color: '#059669', flexShrink: 0 }} />
                <GooglePlacesInput
                    value={searchText}
                    onChange={setSearchText}
                    onPlaceSelect={handlePlaceSelect}
                    placeholder="Search property address..."
                    className={styles.textField}
                />
            </div>
            {place && (
                <div className={styles.locationBody}>
                    <p className={styles.locationAddressTitle}>{place.full_address}</p>
                    <div className={styles.locationFields}>
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
                        <div className={styles.coordsRow}>
                            <span className={styles.coordChip}>Lat: {place.latitude.toFixed(6)}</span>
                            <span className={styles.coordChip}>Lng: {place.longitude.toFixed(6)}</span>
                        </div>
                    )}
                    {isIncomplete && (
                        <p className={styles.locationWarning}>Locality, District/City, and State are required</p>
                    )}
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={sending || isIncomplete}
                        className={`${styles.primaryBtn} ${styles.fullWidth}`}
                    >
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
        <div className={styles.widget}>
            <div className={styles.summaryCardHeader}>
                <CheckCircle2 size={14} style={{ color: '#059669' }} />
                <span className={styles.summaryCardTitle}>Property Summary</span>
            </div>
            <div>
                {Object.entries(summary).map(([lbl, value]) => (
                    <div key={lbl} className={styles.summaryRow}>
                        <span className={styles.summaryLabel}>{lbl}</span>
                        <span className={styles.summaryValue}>{value}</span>
                    </div>
                ))}
            </div>
            <div className={styles.summaryActions}>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={sending}
                    className={`${styles.primaryBtn} ${styles.flex1}`}
                >
                    {sending ? 'Submitting...' : 'Confirm & Submit'}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    disabled={sending}
                    className={styles.secondaryBtn}
                >
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
        <div className={styles.multiSelectContainer}>
            <div className={styles.multiSelectOptions}>
                {options.map(o => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => toggle(o.value)}
                        disabled={sending}
                        className={`${styles.multiSelectBtn} ${selected.has(o.value) ? styles.multiSelectBtnSelected : ''}`}
                    >
                        {selected.has(o.value) && <Check size={12} />} {o.label}
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={() => onDone(Array.from(selected))}
                disabled={sending || selected.size === 0}
                className={styles.primaryBtn}
            >
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
        <div className={`${styles.widget} ${styles.contactFormPadded}`}>
            <p className={styles.contactFormTitle}>
                {isOwner ? 'Owner Details' : 'Your Details'}
            </p>
            <div className={styles.contactFormRow}>
                <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Full name"
                    aria-label="Full name"
                    className={styles.textField}
                />
            </div>
            <div className={styles.contactFormRow}>
                <Phone size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span className={styles.countryCode}>+91</span>
                <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    placeholder="10-digit mobile"
                    aria-label="Phone number"
                    className={styles.textField}
                />
            </div>
            {!isOwner && (
                <div className={styles.contactFormRow}>
                    <Mail size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email (optional)"
                        type="email"
                        aria-label="Email address"
                        className={styles.textField}
                    />
                </div>
            )}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || sending}
                className={`${styles.primaryBtn} ${styles.fullWidth}`}
            >
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

export default ChatWorkflowPanel;
