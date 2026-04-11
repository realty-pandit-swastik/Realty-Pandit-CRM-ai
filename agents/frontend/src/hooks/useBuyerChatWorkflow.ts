/**
 * useBuyerChatWorkflow Hook — Admin Panel
 *
 * React hook for managing the buyer chat workflow state.
 * Mirrors useChatWorkflow but uses buyer-specific API endpoints.
 */

import { useState, useCallback } from 'react';
import {
    buyerChatStart, buyerChatSendMessage, buyerChatAction, buyerChatBook, buyerChatGetSession,
    type ChatMessage,
} from '../api/client';

const SESSION_KEY = 'rp-admin-buyer-chat-session';

export interface BuyerChatWorkflowState {
    messages: ChatMessage[];
    sessionId: string | null;
    loading: boolean;
    sending: boolean;
    sessionActive: boolean;
    progress: { current: number; total: number; group: string } | null;
    currentInputType: string | null;
    currentStepId: string | null;
    matchingPhase: boolean;

    startSession: () => Promise<void>;
    sendMessage: (text: string) => Promise<void>;
    sendQuickReply: (value: string) => Promise<void>;
    sendAction: (action: string) => Promise<void>;
    bookVisit: (propertyId: string, date?: string, time?: string) => Promise<void>;
    reset: () => void;
}

export function useBuyerChatWorkflow(): BuyerChatWorkflowState {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sessionActive, setSessionActive] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; group: string } | null>(null);
    const [currentInputType, setCurrentInputType] = useState<string | null>(null);
    const [currentStepId, setCurrentStepId] = useState<string | null>(null);
    const [matchingPhase, setMatchingPhase] = useState(false);

    const updateCurrentStep = useCallback((msgs: ChatMessage[]) => {
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant' && msgs[i].type === 'question') {
                setCurrentInputType(msgs[i].input_type || null);
                setCurrentStepId(msgs[i].step_id || null);
                return;
            }
            if (msgs[i].role === 'assistant' && msgs[i].type === 'summary') {
                setCurrentInputType('confirm');
                setCurrentStepId('buyer_summary');
                return;
            }
            if (msgs[i].role === 'assistant' && (msgs[i].type as string) === 'property_card') {
                setCurrentInputType('property_card');
                setCurrentStepId('buyer_matching');
                return;
            }
        }
    }, []);

    const appendMessages = useCallback((newMsgs: ChatMessage[]) => {
        setMessages(prev => [...prev, ...newMsgs]);
        updateCurrentStep(newMsgs);
    }, [updateCurrentStep]);

    const saveSession = useCallback((id: string) => {
        try { localStorage.setItem(SESSION_KEY, id); } catch {}
    }, []);

    const clearSession = useCallback(() => {
        try { localStorage.removeItem(SESSION_KEY); } catch {}
    }, []);

    const startSession = useCallback(async () => {
        setLoading(true);
        try {
            const existingId = localStorage.getItem(SESSION_KEY);
            if (existingId) {
                const status = await buyerChatGetSession(existingId);
                if (status.active) {
                    const result = await buyerChatStart(existingId);
                    setSessionId(result.session_id);
                    setMessages(result.messages);
                    setSessionActive(true);
                    if (status.progress) setProgress(status.progress);
                    if (status.matching_phase) setMatchingPhase(true);
                    updateCurrentStep(result.messages);
                    setLoading(false);
                    return;
                }
                clearSession();
            }
            const result = await buyerChatStart();
            setSessionId(result.session_id);
            setMessages(result.messages);
            setSessionActive(true);
            saveSession(result.session_id);
            updateCurrentStep(result.messages);
            const lastQ = result.messages.find((m: ChatMessage) => m.type === 'question');
            if (lastQ?.metadata?.progress) setProgress(lastQ.metadata.progress);
        } catch (err) {
            console.error('[useBuyerChatWorkflow] startSession error:', err);
            setMessages([{
                id: 'error-start',
                role: 'assistant',
                content: 'Unable to start buyer chat. Please try again.',
                timestamp: new Date().toISOString(),
                type: 'error',
            }]);
        } finally {
            setLoading(false);
        }
    }, [updateCurrentStep, saveSession, clearSession]);

    const sendMessage = useCallback(async (text: string) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await buyerChatSendMessage(sessionId, text);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (result.matching_phase !== undefined) setMatchingPhase(result.matching_phase);
            if (!result.session_active) clearSession();
        } catch (err) {
            console.error('[useBuyerChatWorkflow] sendMessage error:', err);
            appendMessages([{
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Something went wrong. Please try again.',
                timestamp: new Date().toISOString(),
                type: 'error',
            }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession]);

    const sendQuickReply = useCallback(async (value: string) => {
        if (!sessionId || sending) return;

        // Route confirm/edit to message handler
        if (value === '__confirm__' || value === '__edit__') {
            setSending(true);
            try {
                const result = await buyerChatSendMessage(sessionId, value);
                appendMessages(result.messages);
                setSessionActive(result.session_active);
                if (result.progress) setProgress(result.progress);
                if (result.matching_phase !== undefined) setMatchingPhase(result.matching_phase);
                if (!result.session_active) clearSession();
            } catch (err) {
                console.error('[useBuyerChatWorkflow] sendQuickReply error:', err);
            } finally {
                setSending(false);
            }
            return;
        }

        // Route property actions to action handler
        if (['__schedule_visit__', '__next_property__', '__change_requirements__', '__done__', '__back_to_property__'].includes(value)) {
            await sendAction(value);
            return;
        }

        // Regular quick reply
        setSending(true);
        try {
            const result = await buyerChatSendMessage(sessionId, undefined, value);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (result.matching_phase !== undefined) setMatchingPhase(result.matching_phase);
            if (!result.session_active) clearSession();
        } catch (err) {
            console.error('[useBuyerChatWorkflow] sendQuickReply error:', err);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession]);

    const sendAction = useCallback(async (action: string) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await buyerChatAction(sessionId, action);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.matching_phase !== undefined) setMatchingPhase(result.matching_phase);
            if (!result.session_active) clearSession();
        } catch (err) {
            console.error('[useBuyerChatWorkflow] sendAction error:', err);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession]);

    const bookVisit = useCallback(async (propertyId: string, date?: string, time?: string) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await buyerChatBook(sessionId, propertyId, date, time);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
        } catch (err) {
            console.error('[useBuyerChatWorkflow] bookVisit error:', err);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages]);

    const reset = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        setSessionActive(false);
        setProgress(null);
        setCurrentInputType(null);
        setCurrentStepId(null);
        setMatchingPhase(false);
        clearSession();
    }, [clearSession]);

    return {
        messages, sessionId, loading, sending, sessionActive,
        progress, currentInputType, currentStepId, matchingPhase,
        startSession, sendMessage, sendQuickReply, sendAction, bookVisit, reset,
    };
}
