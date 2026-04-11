/**
 * BuyerChatWorkflow — Admin Panel
 *
 * Conversational chat UI for buyer/tenant lead capture.
 * Two phases:
 *   Phase A: Requirement capture (structured steps with quick replies)
 *   Phase B: Property matching (property cards with action buttons)
 *
 * Admin sees full owner info (unlike website/agent portals).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, ArrowLeft, MapPin, Calendar, ChevronRight, Search } from 'lucide-react';
import { useBuyerChatWorkflow } from '../hooks/useBuyerChatWorkflow';
import type { ChatMessage } from '../api/client';

// ─── Main Component ─────────────────────────────────────────────────────────

interface BuyerChatWorkflowPanelProps {
    onBack: () => void;
}

export const BuyerChatWorkflowPanel: React.FC<BuyerChatWorkflowPanelProps> = ({ onBack }) => {
    const chat = useBuyerChatWorkflow();
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

    return (
        <div style={s.container}>
            {/* Header */}
            <div style={s.header}>
                <button onClick={onBack} style={s.backBtn}><ArrowLeft size={16} /></button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={18} style={{ color: '#2563eb' }} />
                    <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>Buyer Lead (Chat)</span>
                </div>
                <ProgressBadge progress={chat.progress} matching={chat.matchingPhase} />
            </div>

            {/* Messages */}
            <div style={s.messagesArea}>
                {chat.loading && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: '8px', fontSize: '13px' }}>Starting buyer chat...</p>
                    </div>
                )}

                {chat.messages.map((msg, idx) => (
                    <BuyerChatBubble
                        key={msg.id}
                        message={msg}
                        isLatest={idx === lastQuestionIdx}
                        sending={chat.sending}
                        onQuickReply={chat.sendQuickReply}
                        onAction={chat.sendAction}
                    />
                ))}

                {chat.sending && <TypingDots />}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {chat.sessionActive && (
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
    contact: 'Contact', intent: 'Intent', classification: 'Type',
    specs: 'Specs', location: 'Location', budget: 'Budget',
};

function ProgressBadge({ progress, matching }: { progress: { current: number; total: number; group: string } | null; matching: boolean }) {
    if (matching) {
        return (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>Matching Properties</span>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
        );
    }
    if (!progress) return null;
    const pct = Math.round((progress.current / progress.total) * 100);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {GROUP_LABELS[progress.group] || progress.group} · {pct}%
            </span>
            <div style={{ width: '60px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2563eb', borderRadius: '2px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

// ─── Chat Bubble ────────────────────────────────────────────────────────────

interface BuyerChatBubbleProps {
    message: ChatMessage;
    isLatest: boolean;
    sending: boolean;
    onQuickReply: (value: string) => void;
    onAction: (action: string) => void;
}

function BuyerChatBubble({ message, isLatest, sending, onQuickReply, onAction }: BuyerChatBubbleProps) {
    const isUser = message.role === 'user';
    const isError = message.type === 'error';
    const isSuccess = message.type === 'success';
    const isPropertyCard = (message.type as string) === 'property_card';

    const bubbleStyle: React.CSSProperties = isUser
        ? { ...s.bubble, backgroundColor: '#2563eb', color: '#fff', marginLeft: 'auto', borderTopRightRadius: '4px' }
        : isError
            ? { ...s.bubble, backgroundColor: '#fef2f2', color: '#dc2626', borderTopLeftRadius: '4px' }
            : isSuccess
                ? { ...s.bubble, backgroundColor: '#f0fdf4', color: '#16a34a', borderTopLeftRadius: '4px' }
                : { ...s.bubble, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderTopLeftRadius: '4px' };

    return (
        <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
            <div style={{ maxWidth: isPropertyCard ? '100%' : '80%', width: isPropertyCard ? '100%' : undefined }}>
                {/* Text content */}
                {!isPropertyCard && (
                    <div style={bubbleStyle}>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{message.content}</p>
                    </div>
                )}

                {/* Property Card */}
                {isPropertyCard && message.metadata?.property && (
                    <PropertyCard
                        property={message.metadata.property}
                        matchIndex={message.metadata?.match_index || 0}
                        totalAvailable={message.metadata?.total_available || 0}
                        onAction={onAction}
                        sending={sending}
                    />
                )}

                {/* Summary Card */}
                {message.type === 'summary' && message.metadata?.summary && (
                    <SummaryCard summary={message.metadata.summary} />
                )}

                {/* Quick replies */}
                {isLatest && !isUser && message.quick_replies && message.quick_replies.length > 0 && !isPropertyCard && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {message.quick_replies.map(qr => (
                            <button
                                key={qr.value}
                                onClick={() => !sending && onQuickReply(qr.value)}
                                disabled={sending}
                                style={{
                                    padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                                    border: '1px solid #2563eb', backgroundColor: 'transparent', color: '#2563eb',
                                    cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { if (!sending) { (e.target as HTMLElement).style.backgroundColor = '#2563eb'; (e.target as HTMLElement).style.color = '#fff'; } }}
                                onMouseLeave={e => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; (e.target as HTMLElement).style.color = '#2563eb'; }}
                            >
                                {qr.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
}

// ─── Property Card ──────────────────────────────────────────────────────────

interface PropertyCardProps {
    property: any;
    matchIndex: number;
    totalAvailable: number;
    onAction: (action: string) => void;
    sending: boolean;
}

function PropertyCard({ property, matchIndex, totalAvailable, onAction, sending }: PropertyCardProps) {
    const title = [property.bhk, property.type].filter(Boolean).join(' ');
    const images: string[] = property.images || [];
    const [imgIdx, setImgIdx] = useState(0);

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';
    const getUrl = (p: string) => {
        if (!p) return '';
        if (p.startsWith('http')) return p;
        return `${apiBase}/${p.startsWith('/') ? p.slice(1) : p}`;
    };

    return (
        <div style={{ borderRadius: '12px', border: '1px solid var(--border-secondary)', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
            {/* Image */}
            {images.length > 0 && (
                <div style={{ position: 'relative', height: '180px', backgroundColor: '#f1f5f9', cursor: 'pointer' }}
                    onClick={() => setImgIdx(prev => (prev + 1) % images.length)}
                >
                    <img
                        src={getUrl(images[imgIdx])}
                        alt={title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Badges */}
                    <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '6px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(37,99,235,0.9)', color: '#fff' }}>
                            #{matchIndex + 1}{totalAvailable > 0 ? ` of ${totalAvailable}` : ''}
                        </span>
                        {property.match_score > 0 && (
                            <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(22,163,74,0.9)', color: '#fff' }}>
                                {property.match_score}% match
                            </span>
                        )}
                    </div>
                    {images.length > 1 && (
                        <span style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                            {imgIdx + 1}/{images.length}
                        </span>
                    )}
                </div>
            )}

            {/* Details */}
            <div style={{ padding: '12px 16px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                    <MapPin size={12} /> {property.location}
                </div>

                {/* Specs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {property.area && <span>{property.area}</span>}
                    {property.furnishing && <span>· {property.furnishing}</span>}
                    {property.floor && <span>· Floor {property.floor}</span>}
                </div>

                {/* Price */}
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#2563eb', marginBottom: '12px' }}>
                    {property.display_price_formatted || `₹${property.display_price?.toLocaleString('en-IN')}`}
                </div>

                {/* Admin: Owner info (full visibility) */}
                {(property.owner_name || property.owner_phone) && (
                    <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', marginBottom: '12px', fontSize: '12px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Owner: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{property.owner_name || 'N/A'} · {property.owner_phone || 'N/A'}</span>
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => onAction('__schedule_visit__')}
                        disabled={sending}
                        style={{ ...s.actionBtn, backgroundColor: '#16a34a', color: '#fff', flex: 1 }}
                    >
                        <Calendar size={14} /> Schedule Visit
                    </button>
                    <button
                        onClick={() => onAction('__next_property__')}
                        disabled={sending}
                        style={{ ...s.actionBtn, backgroundColor: '#2563eb', color: '#fff', flex: 1 }}
                    >
                        Next <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => onAction('__change_requirements__')}
                        disabled={sending}
                        style={{ ...s.actionBtn, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                    >
                        Edit
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: Record<string, string> }) {
    return (
        <div style={{ ...s.widget, marginTop: '8px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Requirements Summary</h4>
            {Object.entries(summary).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{key}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{val}</span>
                </div>
            ))}
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

function ChatInputBar({ onSend, disabled, inputType }: { onSend: (text: string) => void; disabled: boolean; inputType: string | null }) {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (!disabled) inputRef.current?.focus(); }, [disabled, inputType]);

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const placeholder = inputType === 'phone' ? 'Enter 10-digit phone...'
        : inputType === 'number' ? 'Enter a number...'
        : inputType === 'property_card' ? 'Type next, visit, or change...'
        : 'Type your answer...';

    return (
        <div style={s.inputBar}>
            <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={disabled}
                placeholder={placeholder}
                rows={1}
                style={s.textInput}
            />
            <button
                onClick={handleSend}
                disabled={disabled || !text.trim()}
                style={{
                    ...s.sendBtn,
                    backgroundColor: text.trim() && !disabled ? '#2563eb' : 'var(--bg-tertiary)',
                    color: text.trim() && !disabled ? '#fff' : 'var(--text-muted)',
                    cursor: text.trim() && !disabled ? 'pointer' : 'not-allowed',
                }}
            >
                {disabled ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findLastQuestionIdx(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' &&
            (messages[i].type === 'question' || messages[i].type === 'summary' || (messages[i].type as string) === 'property_card')) {
            return i;
        }
    }
    return -1;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex', flexDirection: 'column', height: '100%',
        backgroundColor: 'var(--bg-primary)', borderRadius: '12px',
        border: '1px solid var(--border-primary)', overflow: 'hidden',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', borderBottom: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)',
    },
    backBtn: {
        width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-secondary)',
        backgroundColor: 'transparent', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
    },
    messagesArea: {
        flex: 1, overflowY: 'auto', padding: '16px',
    },
    bubble: {
        borderRadius: '16px', padding: '10px 14px', maxWidth: '100%',
    },
    widget: {
        padding: '12px', borderRadius: '10px', border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-primary)',
    },
    inputBar: {
        display: 'flex', alignItems: 'flex-end', gap: '8px',
        padding: '12px 16px', borderTop: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)',
    },
    textInput: {
        flex: 1, resize: 'none', border: '1px solid var(--border-secondary)',
        borderRadius: '10px', padding: '10px 12px', fontSize: '13px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        outline: 'none', minHeight: '40px', maxHeight: '100px',
        fontFamily: 'inherit', lineHeight: '1.4',
    },
    sendBtn: {
        width: '40px', height: '40px', borderRadius: '10px', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
    },
    actionBtn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        padding: '8px 12px', borderRadius: '8px', border: 'none', fontSize: '12px',
        fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s',
    },
};
