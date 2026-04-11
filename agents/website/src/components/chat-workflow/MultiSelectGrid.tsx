'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { QuickReply } from '@/lib/chatApi';

interface MultiSelectGridProps {
    options: QuickReply[];
    selected?: string[];
    onDone: (selected: string[]) => void;
    sending?: boolean;
}

export default function MultiSelectGrid({ options, selected: initialSelected, onDone, sending }: MultiSelectGridProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected || []));

    const toggle = (value: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {options.map((opt, i) => {
                    const isSelected = selected.has(opt.value);
                    return (
                        <motion.button
                            key={opt.value}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => toggle(opt.value)}
                            disabled={sending}
                            className={`px-3 py-2 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                                isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
                            } disabled:opacity-40`}
                        >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                            {opt.label}
                        </motion.button>
                    );
                })}
            </div>
            <button
                onClick={() => onDone(Array.from(selected))}
                disabled={sending || selected.size === 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
                Done ({selected.size} selected)
            </button>
        </div>
    );
}
