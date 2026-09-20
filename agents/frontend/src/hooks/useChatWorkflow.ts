/**
 * useChatWorkflow Hook — Admin Panel
 *
 * React hook for managing the chat workflow state in the admin panel.
 */

import { useState, useCallback } from 'react';
import {
    chatStart, chatSendMessage, chatUploadMedia, chatConfirm, chatGetSession,
    type ChatMessage,
} from '../api/client';

const SESSION_KEY = 'rp-admin-chat-session';

export interface ChatWorkflowState {
    messages: ChatMessage[];
    sessionId: string | null;
    loading: boolean;
    sending: boolean;
    sessionActive: boolean;
    progress: { current: number; total: number; group: string } | null;
    currentInputType: string | null;
    currentStepId: string | null;
    inventoryId: string | null;
    displayId: string | null;

    startSession: () => Promise<void>;
    sendMessage: (text: string) => Promise<void>;
    sendQuickReply: (value: string) => Promise<void>;
    uploadFiles: (files: File[], type: 'photo' | 'video' | 'document') => Promise<void>;
    confirmSubmission: (confirmed: boolean) => Promise<void>;
    reset: () => void;
}

export function useChatWorkflow(): ChatWorkflowState {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sessionActive, setSessionActive] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; group: string } | null>(null);
    const [currentInputType, setCurrentInputType] = useState<string | null>(null);
    const [currentStepId, setCurrentStepId] = useState<string | null>(null);
    const [inventoryId, setInventoryId] = useState<string | null>(null);
    const [displayId, setDisplayId] = useState<string | null>(null);

    const updateCurrentStep = useCallback((msgs: ChatMessage[]) => {
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant' && msgs[i].type === 'question') {
                setCurrentInputType(msgs[i].input_type || null);
                setCurrentStepId(msgs[i].step_id || null);
                return;
            }
            if (msgs[i].role === 'assistant' && msgs[i].type === 'summary') {
                setCurrentInputType('confirm');
                setCurrentStepId('summary_confirmation');
                return;
            }
        }
    }, []);

    const appendMessages = useCallback((newMsgs: ChatMessage[]) => {
        setMessages(prev => [...prev, ...newMsgs]);
        updateCurrentStep(newMsgs);
    }, [updateCurrentStep]);

    const saveSession = useCallback((id: string) => {
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* Session persistence is best effort. */ }
    }, []);

    const clearSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Session persistence is best effort. */ }
    }, []);

    const extractSuccess = useCallback((msgs: ChatMessage[]) => {
        const s = msgs.find(m => m.type === 'success');
        if (s?.metadata?.inventory_id) setInventoryId(s.metadata.inventory_id);
        if (s?.metadata?.display_id) setDisplayId(s.metadata.display_id);
    }, []);

    const startSession = useCallback(async () => {
        setLoading(true);
        try {
            const existingId = localStorage.getItem(SESSION_KEY);
            if (existingId) {
                const status = await chatGetSession(existingId);
                if (status.active) {
                    const result = await chatStart(existingId);
                    setSessionId(result.session_id);
                    setMessages(result.messages);
                    setSessionActive(true);
                    if (status.progress) setProgress(status.progress);
                    updateCurrentStep(result.messages);
                    setLoading(false);
                    return;
                }
                clearSession();
            }
            const result = await chatStart();
            setSessionId(result.session_id);
            setMessages(result.messages);
            setSessionActive(true);
            saveSession(result.session_id);
            updateCurrentStep(result.messages);
            const lastQ = result.messages.find(m => m.type === 'question');
            if (lastQ?.metadata?.progress) setProgress(lastQ.metadata.progress);
        } catch (err) {
            console.error('[useChatWorkflow] startSession error:', err);
            setMessages([{ id: 'error-start', role: 'assistant', content: 'Unable to start chat. Please try again.', timestamp: new Date().toISOString(), type: 'error' }]);
        } finally {
            setLoading(false);
        }
    }, [updateCurrentStep, saveSession, clearSession]);

    const sendMessage = useCallback(async (text: string) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatSendMessage(sessionId, text);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSession();
            extractSuccess(result.messages);
        } catch (err) {
            console.error('[useChatWorkflow] sendMessage error:', err);
            appendMessages([{ id: `error-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.', timestamp: new Date().toISOString(), type: 'error' }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession, extractSuccess]);

    const sendQuickReply = useCallback(async (value: string) => {
        if (!sessionId || sending) return;
        if (value === '__confirm_yes__') { await confirmSubmission(true); return; }
        if (value === '__confirm_no__') { await confirmSubmission(false); return; }
        setSending(true);
        try {
            const result = await chatSendMessage(sessionId, undefined, value);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSession();
            extractSuccess(result.messages);
        } catch (err) {
            console.error('[useChatWorkflow] sendQuickReply error:', err);
            appendMessages([{ id: `error-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.', timestamp: new Date().toISOString(), type: 'error' }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession, extractSuccess]);

    const uploadFiles = useCallback(async (files: File[], type: 'photo' | 'video' | 'document') => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatUploadMedia(sessionId, files, type);
            appendMessages(result.messages);
        } catch (err) {
            console.error('[useChatWorkflow] uploadFiles error:', err);
            appendMessages([{ id: `error-${Date.now()}`, role: 'assistant', content: 'Upload failed. Please try again.', timestamp: new Date().toISOString(), type: 'error' }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages]);

    const confirmSubmission = useCallback(async (confirmed: boolean) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatConfirm(sessionId, confirmed);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSession();
            extractSuccess(result.messages);
        } catch (err) {
            console.error('[useChatWorkflow] confirmSubmission error:', err);
            appendMessages([{ id: `error-${Date.now()}`, role: 'assistant', content: 'Submission failed. Please try again.', timestamp: new Date().toISOString(), type: 'error' }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSession, extractSuccess]);

    const reset = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        setSessionActive(false);
        setProgress(null);
        setCurrentInputType(null);
        setCurrentStepId(null);
        setInventoryId(null);
        setDisplayId(null);
        clearSession();
    }, [clearSession]);

    return {
        messages, sessionId, loading, sending, sessionActive,
        progress, currentInputType, currentStepId, inventoryId, displayId,
        startSession, sendMessage, sendQuickReply, uploadFiles, confirmSubmission, reset,
    };
}
