'use client';

import { motion } from 'framer-motion';

interface ChatProgressProps {
    progress: { current: number; total: number; group: string } | null;
}

const GROUP_LABELS: Record<string, string> = {
    classification: 'Property Type',
    specs: 'Specifications',
    pricing: 'Pricing',
    address: 'Location',
    features: 'Features',
    media: 'Photos & Videos',
    contact: 'Contact Details',
    optional: 'Additional Info',
    confirm: 'Confirmation',
};

export default function ChatProgress({ progress }: ChatProgressProps) {
    if (!progress) return null;

    const pct = Math.round((progress.current / progress.total) * 100);
    const label = GROUP_LABELS[progress.group] || progress.group;

    return (
        <div className="px-4 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-700/60">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {label}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                        {progress.current}/{progress.total} steps · {pct}%
                    </span>
                </div>
                <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
            </div>
        </div>
    );
}
