'use client';

import { motion } from 'framer-motion';
import type { QuickReply } from '@/lib/chatApi';

interface QuickRepliesProps {
    replies: QuickReply[];
    onSelect: (value: string) => void;
    disabled?: boolean;
}

export default function QuickReplies({ replies, onSelect, disabled }: QuickRepliesProps) {
    if (!replies.length) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-3">
            {replies.map((reply, i) => (
                <motion.button
                    key={reply.value}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => !disabled && onSelect(reply.value)}
                    disabled={disabled}
                    className="px-3.5 py-2 text-sm font-medium rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                    {reply.label}
                </motion.button>
            ))}
        </div>
    );
}
