'use client';

import { motion } from 'framer-motion';
import { Bot, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ChatMessage } from '@/lib/chatApi';
import QuickReplies from './QuickReplies';

interface ChatBubbleProps {
    message: ChatMessage;
    onQuickReply?: (value: string) => void;
    isLatest?: boolean;
    sending?: boolean;
    children?: React.ReactNode; // Inline widgets (media uploader, location picker, summary card)
}

export default function ChatBubble({ message, onQuickReply, isLatest, sending, children }: ChatBubbleProps) {
    const isUser = message.role === 'user';
    const isError = message.type === 'error';
    const isSuccess = message.type === 'success';
    const isSystem = message.type === 'system';

    return (
        <motion.div
            initial={{ opacity: 0, x: isUser ? 20 : -20, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            {/* Avatar — assistant */}
            {!isUser && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${
                    isError ? 'bg-red-500' : isSuccess ? 'bg-emerald-500' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                }`}>
                    {isError ? <AlertCircle className="w-4 h-4 text-white" /> :
                     isSuccess ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                     <Bot className="w-4 h-4 text-white" />}
                </div>
            )}

            <div className={`flex flex-col ${
                isUser ? 'max-w-[85%] md:max-w-[70%] items-end' : children ? 'w-full items-start' : 'max-w-[90%] md:max-w-[80%] items-start'
            }`}>
                {/* Bubble */}
                <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                    isUser
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : isError
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-tl-sm'
                            : isSuccess
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-tl-sm'
                                : isSystem
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-tl-sm text-xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-sm'
                }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Quick replies (only for latest assistant question) */}
                {isLatest && !isUser && message.quick_replies && message.quick_replies.length > 0 && onQuickReply && (
                    <QuickReplies
                        replies={message.quick_replies}
                        onSelect={onQuickReply}
                        disabled={sending}
                    />
                )}

                {/* Inline widget slot (media uploader, location picker, summary card, etc.) */}
                {isLatest && !isUser && children && (
                    <div className="mt-3 w-full">
                        {children}
                    </div>
                )}

                {/* Timestamp */}
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 px-1">
                    {new Date(message.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>

            {/* Avatar — user */}
            {isUser && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                    <User className="w-4 h-4 text-white" />
                </div>
            )}
        </motion.div>
    );
}
