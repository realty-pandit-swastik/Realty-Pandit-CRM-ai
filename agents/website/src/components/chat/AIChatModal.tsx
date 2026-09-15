'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import PropertyViewerPanel from './PropertyViewerPanel';
import { usePropertyViewer } from './usePropertyViewer';
import { Property, sendAIChatMessage, startBuyerWorkflow, sendBuyerMessage, buyerAction, bookBuyerVisit, bookPropertyVisit } from '@/lib/api';
import { PropertyMatchData } from './PropertyMatchCard';

const UPLOAD_INTENT_PATTERNS = [
    /\b(sell|bechna|bech|list|upload|post)\b.*\b(property|makan|ghar|flat|plot|house|apartment|dukan|shop)\b/i,
    /\b(property|makan|ghar|flat|plot|house|apartment)\b.*\b(sell|bechna|bech|list|upload|post)\b/i,
    /mujhe\s+(apna|apni|mera|meri)?\s*(makan|ghar|flat|property|plot)\s*(bechna|bech|dena|list|upload)/i,
    /i\s+want\s+to\s+(sell|list|upload|post)\s+(my\s+)?(property|house|flat|apartment)/i,
    /\b(apna|apni|mera|meri)\s+(makan|ghar|flat|property|plot)\s+(bechna|bech)/i,
];

const BUYER_INTENT_PATTERNS = [
    /\b(buy|kharidna|rent|kiraya|lease)\b.*\b(property|makan|ghar|flat|plot|house|apartment|dukan|shop)\b/i,
    /\b(property|makan|ghar|flat|plot|house|apartment)\b.*\b(buy|kharidna|rent|kiraya|lena|chahiye)\b/i,
    /\b(looking\s+for|find|search|dhundh|chahiye)\b.*\b(property|makan|ghar|flat|plot|house|apartment|bhk)\b/i,
    /\b(\d\s*bhk|2bhk|3bhk|1bhk|4bhk)\b/i,
    /mujhe\s+.*\s*(chahiye|lena|dhundhna|dekhna)/i,
    /\b(flat|ghar|makan|property)\s+(chahiye|lena|dekhna)/i,
];

export interface QuickReply {
    label: string;
    value: string;
}

export interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: Date;
    properties?: Property[];
    quick_replies?: QuickReply[];
    matchProperty?: PropertyMatchData;
    matchIndex?: number;
    totalAvailable?: number;
    messageType?: 'text' | 'question' | 'summary' | 'property_card' | 'success' | 'error' | 'system';
    step_id?: string;
    input_type?: string;
    metadata?: Record<string, any>;
}

export interface FilterState {
    city: string;
    propertyType: string;
    bhk: string;
    budget: { min: number; max: number };
    intent: 'buy' | 'rent' | 'lease';
}

interface AIChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialQuery?: string;
}

export default function AIChatModal({ isOpen, onClose, initialQuery = '' }: AIChatModalProps) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId] = useState<string>(() => `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);

    // Authentication state (OPTIONAL - only needed for booking)
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userPhone, setUserPhone] = useState<string | null>(null);
    const [showPhoneModal, setShowPhoneModal] = useState(false);

    // Buyer workflow state
    const [chatMode, setChatMode] = useState<'ai' | 'buyer'>('ai');
    const [buyerSessionId, setBuyerSessionId] = useState<string | null>(null);
    const [lastBuyerPhone, setLastBuyerPhone] = useState<string | null>(null);

    // Property viewer (split-panel)
    const viewer = usePropertyViewer();
    const [mobileTab, setMobileTab] = useState<'chat' | 'properties'>('chat');

    // Auth polling ref — cleared on unmount to prevent memory leak
    const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Load session from localStorage on mount
    useEffect(() => {
        if (isOpen) {
            const savedSession = localStorage.getItem('rp-chat-session');
            let restored = false;
            if (savedSession) {
                try {
                    const parsed = JSON.parse(savedSession);
                    const lastActive = new Date(parsed.lastActive);
                    const now = new Date();
                    const hoursDiff = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60);

                    if (hoursDiff < 24) {
                        setMessages(parsed.messages.map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp),
                        })));
                        restored = true;
                        if (parsed.isAuthenticated && parsed.userPhone) {
                            setIsAuthenticated(true);
                            setUserPhone(parsed.userPhone);
                        }
                        if (parsed.chatMode === 'buyer' && parsed.buyerSessionId) {
                            setChatMode('buyer');
                            setBuyerSessionId(parsed.buyerSessionId);
                        }
                        if (parsed.lastBuyerPhone) {
                            setLastBuyerPhone(parsed.lastBuyerPhone);
                        }
                    }
                } catch {
                    // ignore malformed session data
                }
            }

            if (!restored && messages.length === 0) {
                // Phase 3 (2026-07-28): don't assume every visitor is a buyer. On a fresh open, ask ONE
                // deterministic question — List vs Find — with one-tap chips (handled in handleQuickReply).
                const welcomeMessage: Message = initialQuery
                    ? {
                        id: `msg_${Date.now()}`,
                        role: 'ai',
                        content: `Namaste! I'm Panditji, your AI property assistant. I see you're looking for: "${initialQuery}". Let me search for you!`,
                        timestamp: new Date(),
                    }
                    : {
                        id: `msg_${Date.now()}`,
                        role: 'ai',
                        content: `Namaste! I'm Panditji 🙏 your AI property assistant. What would you like to do?`,
                        timestamp: new Date(),
                        quick_replies: [
                            { label: '🏠 List a property', value: '__list_property__' },
                            { label: '🔍 Find a property', value: '__find_property__' },
                        ],
                    };
                setMessages([welcomeMessage]);
            }
        }
    }, [isOpen]);

    // Save session to localStorage
    useEffect(() => {
        if (messages.length > 0 || isAuthenticated) {
            const sessionData = {
                sessionId,
                messages,
                isAuthenticated,
                userPhone,
                chatMode,
                buyerSessionId,
                lastBuyerPhone,
                lastActive: new Date(),
            };
            localStorage.setItem('rp-chat-session', JSON.stringify(sessionData));
        }
    }, [messages, isAuthenticated, userPhone, sessionId, chatMode, buyerSessionId]);

    // ─── Convert backend buyer messages to UI messages ─────────────────────
    const convertBuyerMessages = useCallback((apiMessages: any[]): { messages: Message[]; propertyData?: { property: PropertyMatchData; matchIndex: number; totalAvailable: number } } => {
        let propertyData: { property: PropertyMatchData; matchIndex: number; totalAvailable: number } | undefined;

        const msgs = apiMessages
            .filter((m: any) => m.role === 'assistant')
            .map((m: any) => {
                const msg: Message = {
                    id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    role: 'ai',
                    content: m.content,
                    timestamp: new Date(m.timestamp || Date.now()),
                    messageType: m.type,
                    step_id: m.step_id,
                    input_type: m.input_type,
                    quick_replies: m.quick_replies,
                    metadata: m.metadata,
                };
                if (m.type === 'property_card' && m.metadata?.property) {
                    msg.matchProperty = m.metadata.property;
                    msg.matchIndex = m.metadata.match_index || 0;
                    msg.totalAvailable = m.metadata.total_available || 0;
                    propertyData = {
                        property: m.metadata.property,
                        matchIndex: m.metadata.match_index || 0,
                        totalAvailable: m.metadata.total_available || 0,
                    };
                }
                return msg;
            });

        return { messages: msgs, propertyData };
    }, []);

    // ─── Start buyer workflow ────────────────────────────────────────────────
    const startBuyerFlow = useCallback(async () => {
        setIsTyping(true);
        try {
            const prefill: { phone?: string; name?: string } = {};
            if (lastBuyerPhone || userPhone) prefill.phone = lastBuyerPhone || userPhone || undefined;
            const result = await startBuyerWorkflow(undefined, 'web', Object.keys(prefill).length > 0 ? prefill : undefined);
            setBuyerSessionId(result.session_id);
            setChatMode('buyer');
            const { messages: newMessages } = convertBuyerMessages(result.messages);
            setMessages((prev) => [...prev, ...newMessages]);
        } catch (err: any) {
            setMessages((prev) => [...prev, {
                id: `msg_err_${Date.now()}`,
                role: 'ai',
                content: 'Sorry, I could not start the property search. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsTyping(false);
        }
    }, [lastBuyerPhone, userPhone, convertBuyerMessages]);

    // ─── Handle buyer workflow message ───────────────────────────────────────
    const handleBuyerMessage = useCallback(async (text?: string, quickReplyValue?: string) => {
        if (!buyerSessionId) return;

        if (text) {
            const phoneMatch = text.match(/(\+91|91)?([6-9]\d{9})/);
            if (phoneMatch) {
                const phone = phoneMatch[0].startsWith('+') ? phoneMatch[0] : phoneMatch[0].startsWith('91') ? `+${phoneMatch[0]}` : `+91${phoneMatch[0]}`;
                setLastBuyerPhone(phone);
                if (!userPhone) {
                    setUserPhone(phone);
                    setIsAuthenticated(true);
                }
            }
        }

        setIsTyping(true);
        try {
            const result = await sendBuyerMessage(buyerSessionId, text, quickReplyValue);
            const { messages: newMessages, propertyData } = convertBuyerMessages(result.messages);
            setMessages((prev) => [...prev, ...newMessages]);

            // Update viewer if property card received
            if (propertyData) {
                viewer.setBuyerProperty(propertyData.property, propertyData.matchIndex, propertyData.totalAvailable);
                setMobileTab('properties');
            }

            if (!result.session_active) {
                setChatMode('ai');
                setBuyerSessionId(null);
            }
        } catch (err: any) {
            setMessages((prev) => [...prev, {
                id: `msg_err_${Date.now()}`,
                role: 'ai',
                content: 'Something went wrong. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsTyping(false);
        }
    }, [buyerSessionId, convertBuyerMessages, viewer]);

    // ─── Handle buyer property action ────────────────────────────────────────
    const handleBuyerAction = useCallback(async (action: string) => {
        if (!buyerSessionId) return;
        setIsTyping(true);
        try {
            const result = await buyerAction(buyerSessionId, action);
            const { messages: newMessages, propertyData } = convertBuyerMessages(result.messages);
            setMessages((prev) => [...prev, ...newMessages]);

            // Update viewer if property card received
            if (propertyData) {
                viewer.setBuyerProperty(propertyData.property, propertyData.matchIndex, propertyData.totalAvailable);
                setMobileTab('properties');
            }

            if (!result.session_active) {
                setChatMode('ai');
                setBuyerSessionId(null);
            }
        } catch {
            // buyer action error
        } finally {
            setIsTyping(false);
        }
    }, [buyerSessionId, convertBuyerMessages, viewer]);

    // ─── Handle quick reply click ────────────────────────────────────────────
    const handleQuickReply = useCallback((value: string) => {
        // Phase 3 (2026-07-28): deterministic List-vs-Find choice from the welcome chips.
        if (value === '__list_property__') {
            setMessages((prev) => [...prev,
                { id: `msg_${Date.now()}_user`, role: 'user', content: 'List a property', timestamp: new Date() },
                { id: `msg_${Date.now()}_ai`, role: 'ai', content: 'Bilkul! Aapki property list karte hain. Main aapko Property Upload page par le ja raha hoon...', timestamp: new Date() },
            ]);
            setTimeout(() => { onClose(); router.push('/post-property'); }, 1200);
            return;
        }
        if (value === '__find_property__') {
            setMessages((prev) => [...prev,
                { id: `msg_${Date.now()}_user`, role: 'user', content: 'Find a property', timestamp: new Date() },
            ]);
            startBuyerFlow();
            return;
        }
        if (!buyerSessionId && (value === '__change_requirements__' || value === '__edit__')) {
            setMessages((prev) => [...prev, {
                id: `msg_${Date.now()}_user`,
                role: 'user',
                content: 'Change Requirements',
                timestamp: new Date(),
            }]);
            startBuyerFlow();
            return;
        }

        if (!buyerSessionId) return;

        setMessages((prev) => [...prev, {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: value.replace(/__/g, '').replace(/_/g, ' '),
            timestamp: new Date(),
        }]);

        if (value.startsWith('__') && ['__schedule_visit__', '__next_property__', '__change_requirements__', '__done__', '__back_to_property__'].includes(value)) {
            handleBuyerAction(value);
        } else if (value === '__confirm__' || value === '__edit__') {
            handleBuyerMessage(value);
        } else {
            handleBuyerMessage(undefined, value);
        }
    }, [buyerSessionId, handleBuyerAction, handleBuyerMessage, startBuyerFlow, onClose, router]);

    // ─── Main send handler ───────────────────────────────────────────────────
    const handleSendMessage = async (content: string) => {
        const userMessage: Message = {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Auto-switch to chat tab on mobile when user sends message
        setMobileTab('chat');

        if (chatMode === 'buyer' && buyerSessionId) {
            await handleBuyerMessage(content);
            return;
        }

        const isUploadIntent = UPLOAD_INTENT_PATTERNS.some(p => p.test(content));
        if (isUploadIntent) {
            const redirectMsg: Message = {
                id: `msg_redirect_${Date.now()}`,
                role: 'ai',
                content: 'Bilkul! Aapki property list karte hain. Main aapko Property Upload page par le ja raha hoon...',
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, redirectMsg]);
            setTimeout(() => {
                onClose();
                router.push('/post-property');
            }, 1500);
            return;
        }

        const isBuyerIntent = BUYER_INTENT_PATTERNS.some(p => p.test(content));
        if (isBuyerIntent) {
            await startBuyerFlow();
            return;
        }

        setIsTyping(true);

        try {
            const phoneMatch = content.match(/(\+91|91)?([6-9]\d{9})/);
            if (phoneMatch && !userPhone) {
                let phone = phoneMatch[0];
                if (!phone.startsWith('+')) {
                    phone = phone.startsWith('91') ? `+${phone}` : `+91${phone}`;
                }
                setUserPhone(phone);
                setIsAuthenticated(true);
            }

            const response = await sendAIChatMessage({
                message: content,
                sessionId,
                phone: userPhone || undefined,
            });

            if (response.success) {
                const aiMessage: Message = {
                    id: `msg_${Date.now()}_ai`,
                    role: 'ai',
                    content: response.reply,
                    timestamp: new Date(),
                    properties: response.properties && response.properties.length > 0 ? response.properties : undefined,
                };
                setMessages((prev) => [...prev, aiMessage]);

                // Open property viewer if properties found
                if (response.properties && response.properties.length > 0) {
                    viewer.setAIProperties(response.properties);
                    setMobileTab('properties');
                }

                if (response.action === 'redirect_upload') {
                    const redirectMsg: Message = {
                        id: `msg_redirect_${Date.now()}`,
                        role: 'ai',
                        content: 'Bilkul! Aapki property list karte hain. Main aapko Property Upload page par le ja raha hoon...',
                        timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, redirectMsg]);
                    setTimeout(() => {
                        onClose();
                        router.push('/post-property');
                    }, 1500);
                    return;
                }

                if (response.action === 'request_phone' && !userPhone) {
                    setShowPhoneModal(true);
                }
            } else {
                setMessages((prev) => [...prev, {
                    id: `msg_${Date.now()}_ai`,
                    role: 'ai',
                    content: 'I apologize, but I encountered an error. Please try again.',
                    timestamp: new Date(),
                }]);
            }
        } catch (error: any) {
            setMessages((prev) => [...prev, {
                id: `msg_${Date.now()}_ai`,
                role: 'ai',
                content: 'Sorry, I had trouble processing your message. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    // ─── Viewer navigation handlers ──────────────────────────────────────────
    const handleViewerNext = useCallback(() => {
        if (viewer.source === 'buyer') {
            handleBuyerAction('__next_property__');
        } else {
            viewer.goNext();
        }
    }, [viewer.source, handleBuyerAction, viewer]);

    const handleViewerPrevious = useCallback(() => {
        if (viewer.source === 'buyer') {
            handleBuyerAction('__back_to_property__');
        } else {
            viewer.goPrevious();
        }
    }, [viewer.source, handleBuyerAction, viewer]);

    const handleViewerBookVisit = useCallback(async () => {
        if (viewer.source === 'buyer' && buyerSessionId) {
            handleBuyerAction('__schedule_visit__');
            return;
        }

        const currentProp = viewer.currentProperty;
        if (!currentProp) return;

        const phone = lastBuyerPhone || userPhone;

        // If we already have the phone number, book directly via API
        if (phone) {
            setIsTyping(true);
            setMobileTab('chat');
            try {
                const result = await bookPropertyVisit({
                    phone,
                    propertyId: currentProp.id,
                    message: `Site visit request for ${currentProp.title} at ${currentProp.location}`,
                });
                setMessages((prev) => [...prev, {
                    id: `msg_${Date.now()}_ai`,
                    role: 'ai',
                    content: result.message || `Site visit booked for "${currentProp.title}" at ${currentProp.location}. Our team will contact you shortly on ${phone}.`,
                    timestamp: new Date(),
                }]);
            } catch (err: any) {
                setMessages((prev) => [...prev, {
                    id: `msg_${Date.now()}_ai`,
                    role: 'ai',
                    content: `Site visit request received for "${currentProp.title}" at ${currentProp.location}. Our team will contact you shortly on ${phone}.`,
                    timestamp: new Date(),
                }]);
            } finally {
                setIsTyping(false);
            }
        } else {
            // No phone available — ask for it
            setMessages((prev) => [...prev, {
                id: `msg_${Date.now()}_ai`,
                role: 'ai',
                content: `To book a site visit for "${currentProp.title}" at ${currentProp.location}, please share your phone number.`,
                timestamp: new Date(),
            }]);
            setMobileTab('chat');
        }
    }, [viewer.source, viewer.currentProperty, buyerSessionId, handleBuyerAction, lastBuyerPhone, userPhone]);

    // Handle WhatsApp confirmation
    const handleSendConfirmation = async (phone: string) => {
        const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auth/send-confirmation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: normalizedPhone }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to send confirmation');
            }

            setUserPhone(normalizedPhone);

            const systemMessage: Message = {
                id: `msg_${Date.now()}_system`,
                role: 'ai',
                content: `✅ Confirmation sent to WhatsApp: ${normalizedPhone}\n\nPlease check your WhatsApp and reply *"Yes"* or *"Agree"* to instantly connect!\n\nYour conversation will be automatically synced across all channels.`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, systemMessage]);

            startAuthPolling(normalizedPhone);

        } catch (error: any) {
            throw new Error(error.message || 'Failed to send confirmation');
        }
    };

    const startAuthPolling = (phone: string) => {
        if (authPollRef.current) clearInterval(authPollRef.current);

        authPollRef.current = setInterval(async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/auth/check-status?phone=${encodeURIComponent(phone)}`);
                const data = await response.json();

                if (data.authenticated) {
                    clearInterval(authPollRef.current!);
                    authPollRef.current = null;
                    setIsAuthenticated(true);

                    const welcomeMessage: Message = {
                        id: `msg_${Date.now()}_system`,
                        role: 'ai',
                        content: `Connected Successfully!\n\nYour WhatsApp is now synced! All conversations will be saved across all channels.\n\nHow can I help you find your perfect property today?`,
                        timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, welcomeMessage]);
                }
            } catch {
                // polling error — silently continue
            }
        }, 3000);

        setTimeout(() => {
            if (authPollRef.current) {
                clearInterval(authPollRef.current);
                authPollRef.current = null;
            }
        }, 5 * 60 * 1000);
    };

    // Cleanup polling interval on unmount
    useEffect(() => {
        return () => {
            if (authPollRef.current) {
                clearInterval(authPollRef.current);
                authPollRef.current = null;
            }
        };
    }, []);

    const handleClose = () => {
        onClose();
    };

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{
                        type: "spring",
                        damping: 30,
                        stiffness: 300,
                        mass: 0.8
                    }}
                    className="fixed inset-0 z-[9999] bg-gradient-to-br from-blue-50/98 via-purple-50/98 to-pink-50/98 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Chat with Panditji"
                >
                    {/* Mobile Tabs (only when viewer has properties) */}
                    {viewer.isOpen && (
                        <div className="md:hidden flex border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
                            <button
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    mobileTab === 'chat'
                                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                }`}
                                onClick={() => setMobileTab('chat')}
                            >
                                Chat
                            </button>
                            <button
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    mobileTab === 'properties'
                                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                }`}
                                onClick={() => setMobileTab('properties')}
                            >
                                Properties ({viewer.totalCount})
                            </button>
                        </div>
                    )}

                    {/* ── Desktop Layout: Side-by-side ── */}
                    <div className="hidden md:flex flex-1 overflow-hidden">
                        {/* Chat Panel */}
                        <motion.div
                            layout
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className={`flex flex-col overflow-hidden ${
                                viewer.isOpen ? 'w-[40%] border-r border-slate-200 dark:border-slate-700' : 'w-full'
                            }`}
                        >
                            <ChatHeader
                                isAuthenticated={isAuthenticated}
                                userPhone={userPhone}
                                onClose={handleClose}
                            />
                            <div className="flex-1 overflow-hidden">
                                <ChatMessages
                                    messages={messages}
                                    isTyping={isTyping}
                                    onQuickReply={handleQuickReply}
                                    onPropertyAction={handleBuyerAction}
                                    viewerActive={viewer.isOpen}
                                />
                            </div>
                            <ChatInput onSend={handleSendMessage} disabled={isTyping} compact={viewer.isOpen} />
                        </motion.div>

                        {/* Property Viewer Panel */}
                        <AnimatePresence>
                            {viewer.isOpen && viewer.currentProperty && (
                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: '60%', opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                    className="overflow-hidden"
                                >
                                    <PropertyViewerPanel
                                        property={viewer.currentProperty}
                                        currentIndex={viewer.displayIndex}
                                        totalCount={viewer.totalCount}
                                        onNext={handleViewerNext}
                                        onPrevious={handleViewerPrevious}
                                        onBookVisit={handleViewerBookVisit}
                                        onClose={viewer.closeViewer}
                                        source={viewer.source}
                                        isLoading={isTyping}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Mobile Layout: Tab-based ── */}
                    <div className="md:hidden flex flex-col flex-1 overflow-hidden">
                        {/* Chat tab content */}
                        {(mobileTab === 'chat' || !viewer.isOpen) && (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <ChatHeader
                                    isAuthenticated={isAuthenticated}
                                    userPhone={userPhone}
                                    onClose={handleClose}
                                />
                                <div className="flex-1 overflow-hidden">
                                    <ChatMessages
                                        messages={messages}
                                        isTyping={isTyping}
                                        onQuickReply={handleQuickReply}
                                        onPropertyAction={handleBuyerAction}
                                        viewerActive={viewer.isOpen}
                                    />
                                </div>
                                <ChatInput onSend={handleSendMessage} disabled={isTyping} />
                            </div>
                        )}

                        {/* Properties tab content */}
                        {mobileTab === 'properties' && viewer.isOpen && viewer.currentProperty && (
                            <div className="flex-1 overflow-hidden">
                                <PropertyViewerPanel
                                    property={viewer.currentProperty}
                                    currentIndex={viewer.displayIndex}
                                    totalCount={viewer.totalCount}
                                    onNext={handleViewerNext}
                                    onPrevious={handleViewerPrevious}
                                    onBookVisit={handleViewerBookVisit}
                                    onClose={viewer.closeViewer}
                                    source={viewer.source}
                                    isLoading={isTyping}
                                />
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
