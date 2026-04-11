'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Edit3, Loader2 } from 'lucide-react';

interface ChatSummaryCardProps {
    summary: Record<string, string>;
    onConfirm: () => void;
    onEdit: () => void;
    sending?: boolean;
}

export default function ChatSummaryCard({ summary, onConfirm, onEdit, sending }: ChatSummaryCardProps) {
    const entries = Object.entries(summary);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Property Summary
                </h3>
            </div>

            {/* Summary table */}
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {entries.map(([label, value], i) => (
                    <motion.div
                        key={label}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex px-4 py-2.5 text-sm"
                    >
                        <span className="w-2/5 text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
                        <span className="w-3/5 text-slate-900 dark:text-white font-medium">{value}</span>
                    </motion.div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                <button
                    onClick={onConfirm}
                    disabled={sending}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    {sending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                    ) : (
                        <><CheckCircle2 className="w-4 h-4" /> Confirm & Submit</>
                    )}
                </button>
                <button
                    onClick={onEdit}
                    disabled={sending}
                    className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
            </div>
        </motion.div>
    );
}
