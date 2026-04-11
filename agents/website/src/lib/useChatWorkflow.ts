'use client';

/**
 * useChatWorkflow Hook
 *
 * React hook for managing the chat workflow state.
 * Handles session lifecycle, message history, uploads, and progress.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    chatStart,
    chatMessage,
    chatUpload,
    chatConfirm,
    chatGetSession,
    type ChatMessage,
} from './chatApi';

const SESSION_KEY = 'realty-pandit-chat-session';

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

    const scrollTriggerRef = useRef(0);

    // Update current input type from last assistant question message
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

    // Append messages and trigger scroll
    const appendMessages = useCallback((newMsgs: ChatMessage[]) => {
        setMessages(prev => {
            const updated = [...prev, ...newMsgs];
            return updated;
        });
        scrollTriggerRef.current++;
        updateCurrentStep(newMsgs);
    }, [updateCurrentStep]);

    // Save session to localStorage
    const saveSessionToStorage = useCallback((id: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(SESSION_KEY, id);
        }
    }, []);

    const clearSessionStorage = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(SESSION_KEY);
        }
    }, []);

    // Start new session
    const startSession = useCallback(async () => {
        setLoading(true);
        try {
            // Check for existing session
            const existingId = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;

            if (existingId) {
                try {
                    // Try to resume
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
                } catch (resumeErr) {
                    console.warn('[useChatWorkflow] Resume failed, starting fresh:', resumeErr);
                }
                clearSessionStorage();
            }

            // Fresh start
            const result = await chatStart();
            setSessionId(result.session_id);
            setMessages(result.messages);
            setSessionActive(true);
            saveSessionToStorage(result.session_id);
            updateCurrentStep(result.messages);

            // Extract progress from messages
            const lastQuestion = result.messages.find(m => m.type === 'question');
            if (lastQuestion?.metadata?.progress) {
                setProgress(lastQuestion.metadata.progress);
            }
        } catch (err) {
            console.error('[useChatWorkflow] startSession error:', err);
            setMessages([{
                id: 'error-start',
                role: 'assistant',
                content: 'Unable to start chat. Please try again.',
                timestamp: new Date().toISOString(),
                type: 'error',
            }]);
        } finally {
            setLoading(false);
        }
    }, [updateCurrentStep, saveSessionToStorage, clearSessionStorage]);

    // Send text message
    const sendMessage = useCallback(async (text: string) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatMessage(sessionId, text);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSessionStorage();

            // Check for success
            const successMsg = result.messages.find(m => m.type === 'success');
            if (successMsg?.metadata?.inventory_id) {
                setInventoryId(successMsg.metadata.inventory_id);
            }
        } catch (err) {
            console.error('[useChatWorkflow] sendMessage error:', err);
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
    }, [sessionId, sending, appendMessages, clearSessionStorage]);

    // Send quick reply
    const sendQuickReply = useCallback(async (value: string) => {
        if (!sessionId || sending) return;

        // Handle special confirm values
        if (value === '__confirm_yes__') {
            await confirmSubmission(true);
            return;
        }
        if (value === '__confirm_no__') {
            await confirmSubmission(false);
            return;
        }

        setSending(true);
        try {
            const result = await chatMessage(sessionId, undefined, value);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSessionStorage();

            const successMsg = result.messages.find(m => m.type === 'success');
            if (successMsg?.metadata?.inventory_id) {
                setInventoryId(successMsg.metadata.inventory_id);
            }
        } catch (err) {
            console.error('[useChatWorkflow] sendQuickReply error:', err);
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
    }, [sessionId, sending, appendMessages, clearSessionStorage]);

    // Upload files
    const uploadFiles = useCallback(async (files: File[], type: 'photo' | 'video' | 'document') => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatUpload(sessionId, files, type);
            appendMessages(result.messages);
        } catch (err) {
            console.error('[useChatWorkflow] uploadFiles error:', err);
            appendMessages([{
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Upload failed. Please try again.',
                timestamp: new Date().toISOString(),
                type: 'error',
            }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages]);

    // Confirm submission
    const confirmSubmission = useCallback(async (confirmed: boolean) => {
        if (!sessionId || sending) return;
        setSending(true);
        try {
            const result = await chatConfirm(sessionId, confirmed);
            appendMessages(result.messages);
            setSessionActive(result.session_active);
            if (result.progress) setProgress(result.progress);
            if (!result.session_active) clearSessionStorage();

            const successMsg = result.messages.find(m => m.type === 'success');
            if (successMsg?.metadata?.inventory_id) {
                setInventoryId(successMsg.metadata.inventory_id);
            }
        } catch (err) {
            console.error('[useChatWorkflow] confirmSubmission error:', err);
            appendMessages([{
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Submission failed. Please try again.',
                timestamp: new Date().toISOString(),
                type: 'error',
            }]);
        } finally {
            setSending(false);
        }
    }, [sessionId, sending, appendMessages, clearSessionStorage]);

    // Reset
    const reset = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        setSessionActive(false);
        setProgress(null);
        setCurrentInputType(null);
        setCurrentStepId(null);
        setInventoryId(null);
        clearSessionStorage();
    }, [clearSessionStorage]);

    return {
        messages,
        sessionId,
        loading,
        sending,
        sessionActive,
        progress,
        currentInputType,
        currentStepId,
        inventoryId,
        startSession,
        sendMessage,
        sendQuickReply,
        uploadFiles,
        confirmSubmission,
        reset,
    };
}
