'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionItem {
    id: string;
    title: string;
    content: string | React.ReactNode;
    defaultOpen?: boolean;
}

interface AccordionProps {
    items: AccordionItem[];
    allowMultiple?: boolean;
    className?: string;
}

export default function Accordion({ items, allowMultiple = false, className }: AccordionProps) {
    const [openIds, setOpenIds] = useState<Set<string>>(new Set());
    const prevItemIdsRef = useRef<string>('');

    // Track new items and apply their defaultOpen state
    const currentItemIds = items.map(i => i.id).join(',');
    if (currentItemIds !== prevItemIdsRef.current) {
        prevItemIdsRef.current = currentItemIds;
        const next = new Set(openIds);
        items.forEach(item => {
            if (item.defaultOpen && !openIds.has(item.id)) next.add(item.id);
        });
        if (next.size !== openIds.size) setOpenIds(next);
    }

    const toggle = (id: string) => {
        setOpenIds(prev => {
            const next = new Set(allowMultiple ? prev : []);
            if (prev.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <div className={cn('space-y-3', className)}>
            {items.map(item => {
                const isOpen = openIds.has(item.id);
                return (
                    <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <button
                            onClick={() => toggle(item.id)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="font-medium text-sm text-slate-900 dark:text-white pr-4">{item.title}</span>
                            <ChevronDown
                                className={cn(
                                    'w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200',
                                    isOpen && 'rotate-180'
                                )}
                            />
                        </button>
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className="px-4 pb-3 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                        {item.content}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}
