/**
 * Chat Workflow API Client
 *
 * Axios functions for the /api/chat/* endpoints.
 */

import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071',
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuickReply {
    label: string;
    value: string;
}

export interface ChatMessage {
    id: string;
    role: 'assistant' | 'user';
    content: string;
    timestamp: string;
    type: 'text' | 'question' | 'summary' | 'success' | 'error' | 'system';
    step_id?: string;
    input_type?: string;
    quick_replies?: QuickReply[];
    metadata?: {
        options?: Array<{ value: string; label: string }>;
        secondary_options?: Array<{ value: string; label: string }>;
        summary?: Record<string, string>;
        media_count?: number;
        doc_count?: number;
        inventory_id?: string;
        progress?: { current: number; total: number; group: string };
        address_config?: any;
        document_types?: Array<{ value: string; label: string }>;
        schema_fields?: Array<{ key: string; label: string; input_type: string; required: boolean; options: string[] | null; unit: string | null }>;
    };
}

export interface ChatStartResponse {
    session_id: string;
    messages: ChatMessage[];
}

export interface ChatMessageResponse {
    messages: ChatMessage[];
    session_active: boolean;
    progress?: { current: number; total: number; group: string };
}

export interface ChatUploadResponse {
    messages: ChatMessage[];
    urls: string[];
}

export interface ChatSessionStatus {
    active: boolean;
    state?: string;
    step_id?: string;
    progress?: { current: number; total: number; group: string };
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function chatStart(sessionId?: string): Promise<ChatStartResponse> {
    const { data } = await api.post('/api/chat/start', { session_id: sessionId });
    return data;
}

export async function chatMessage(
    sessionId: string,
    text?: string,
    quickReplyValue?: string,
): Promise<ChatMessageResponse> {
    const { data } = await api.post('/api/chat/message', {
        session_id: sessionId,
        text,
        quick_reply_value: quickReplyValue,
    });
    return data;
}

export async function chatUpload(
    sessionId: string,
    files: File[],
    type: 'photo' | 'video' | 'document',
): Promise<ChatUploadResponse> {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('type', type);
    files.forEach(f => formData.append('files', f));

    const { data } = await api.post('/api/chat/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5 * 60 * 1000, // 5 minutes for large video uploads
    });
    return data;
}

export async function chatConfirm(
    sessionId: string,
    confirmed: boolean,
): Promise<ChatMessageResponse> {
    const { data } = await api.post(
        '/api/chat/confirm',
        { session_id: sessionId, confirmed },
    );
    return data;
}

export async function chatGetSession(sessionId: string): Promise<ChatSessionStatus> {
    const { data } = await api.get(`/api/chat/session/${sessionId}`);
    return data;
}
