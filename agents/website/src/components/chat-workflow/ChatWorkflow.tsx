'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ChatWorkflowState } from '@/lib/useChatWorkflow';
import type { ChatMessage } from '@/lib/chatApi';
import ChatProgress from './ChatProgress';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import WorkflowChatInput from './WorkflowChatInput';
import ChatMediaUploader from './ChatMediaUploader';
import ChatLocationPicker from './ChatLocationPicker';
import ChatSummaryCard from './ChatSummaryCard';
import MultiSelectGrid from './MultiSelectGrid';
import InlineContactForm from './InlineContactForm';
import ChatTaxonomyPicker from './ChatTaxonomyPicker';
import ChatSchemaFields from './ChatSchemaFields';

interface ChatWorkflowProps {
    chat: ChatWorkflowState;
}

export default function ChatWorkflow({ chat }: ChatWorkflowProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat.messages, chat.sending]);

    // Determine what inline widget to show for the latest assistant message
    const lastAssistantIdx = findLastAssistantQuestionIdx(chat.messages);

    const showTextInput = !isWidgetOnlyStep(chat.currentInputType);
    const showAttach = chat.currentInputType === 'media_upload' || chat.currentInputType === 'video_upload' || chat.currentInputType === 'document_upload';

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-slate-950">
            {/* Progress bar */}
            <ChatProgress progress={chat.progress} />

            {/* Messages area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
            >
                <div className="max-w-3xl mx-auto space-y-4">
                    {chat.messages.map((msg, idx) => {
                        const isLatest = idx === lastAssistantIdx;
                        return (
                            <ChatBubble
                                key={msg.id}
                                message={msg}
                                isLatest={isLatest}
                                sending={chat.sending}
                                onQuickReply={chat.sendQuickReply}
                            >
                                {/* Inline widgets for the latest question only */}
                                {isLatest && renderInlineWidget(msg, chat)}
                            </ChatBubble>
                        );
                    })}

                    {/* Typing indicator */}
                    <AnimatePresence>
                        {chat.sending && <TypingIndicator />}
                    </AnimatePresence>

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input bar */}
            {chat.sessionActive && showTextInput && (
                <WorkflowChatInput
                    onSend={chat.sendMessage}
                    disabled={chat.sending || chat.loading}
                    inputType={chat.currentInputType}
                    showAttach={showAttach}
                />
            )}
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findLastAssistantQuestionIdx(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && (messages[i].type === 'question' || messages[i].type === 'summary')) {
            return i;
        }
    }
    return -1;
}

function isWidgetOnlyStep(inputType: string | null): boolean {
    // These input types have their own inline widget and don't need the text input
    return inputType === 'media_upload' || inputType === 'video_upload' || inputType === 'document_upload' ||
           inputType === 'address_block' || inputType === 'confirm' ||
           inputType === 'owner_block' || inputType === 'uploader_block' ||
           inputType === 'taxonomy' || inputType === 'schema_fields';
}

function renderInlineWidget(
    msg: ChatMessage,
    chat: ChatWorkflowState,
): React.ReactNode {
    const inputType = msg.input_type;

    // Media uploads
    if (inputType === 'media_upload') {
        return (
            <ChatMediaUploader
                mode="photo"
                onUpload={(files) => chat.uploadFiles(files, 'photo')}
                sending={chat.sending}
            />
        );
    }
    if (inputType === 'video_upload') {
        return (
            <ChatMediaUploader
                mode="video"
                onUpload={(files) => chat.uploadFiles(files, 'video')}
                sending={chat.sending}
            />
        );
    }
    if (inputType === 'document_upload') {
        return (
            <ChatMediaUploader
                mode="document"
                onUpload={(files) => chat.uploadFiles(files, 'document')}
                sending={chat.sending}
                documentTypes={msg.metadata?.document_types}
            />
        );
    }

    // Address / location picker — sends structured JSON via quickReply
    if (inputType === 'address_block') {
        return (
            <ChatLocationPicker
                onSubmit={chat.sendQuickReply}
                sending={chat.sending}
                addressConfig={msg.metadata?.address_config}
            />
        );
    }

    // Multi-select
    if (inputType === 'multi_select' && msg.metadata?.options) {
        return (
            <MultiSelectGrid
                options={msg.metadata.options.map(o => ({ label: o.label, value: o.value }))}
                onDone={(selected) => {
                    // Send each selection, then 'done'
                    selected.forEach(v => chat.sendQuickReply(v));
                    setTimeout(() => chat.sendMessage('done'), 300);
                }}
                sending={chat.sending}
            />
        );
    }

    // Summary / confirm
    if (msg.type === 'summary' && msg.metadata?.summary) {
        return (
            <ChatSummaryCard
                summary={msg.metadata.summary}
                onConfirm={() => chat.confirmSubmission(true)}
                onEdit={() => chat.confirmSubmission(false)}
                sending={chat.sending}
            />
        );
    }

    // Owner / uploader contact form — sends structured JSON via quickReply
    if (inputType === 'owner_block' || inputType === 'uploader_block') {
        return (
            <InlineContactForm
                mode={inputType}
                onSubmit={chat.sendQuickReply}
                sending={chat.sending}
            />
        );
    }

    // Taxonomy tree picker — submits the leaf node id as a plain string
    if (inputType === 'taxonomy') {
        return <ChatTaxonomyPicker onSubmit={chat.sendQuickReply} sending={chat.sending} />;
    }

    // Per-type dynamic schema fields — submits a JSON object
    if (inputType === 'schema_fields') {
        return <ChatSchemaFields fields={msg.metadata?.schema_fields || []} onSubmit={chat.sendQuickReply} sending={chat.sending} />;
    }

    return null;
}
