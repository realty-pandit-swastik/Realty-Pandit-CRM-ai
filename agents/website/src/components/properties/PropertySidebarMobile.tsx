'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface PropertySidebarMobileProps {
    open: boolean;
    onClose: () => void;
    onApply?: () => void;
    onClear?: () => void;
    children: React.ReactNode;
}

export default function PropertySidebarMobile({ open, onClose, onApply, onClear, children }: PropertySidebarMobileProps) {
    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-40"
                    />
                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-y-0 left-0 w-[300px] max-w-[85vw] bg-slate-50 dark:bg-slate-950 z-50 flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="font-semibold text-slate-900 dark:text-white">Filters</h3>
                            <button
                                onClick={onClose}
                                aria-label="Close filters"
                                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </button>
                        </div>

                        {/* Content — scrollable */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {children}
                        </div>

                        {/* Footer buttons */}
                        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => { onClear?.(); onClose(); }}
                                className="flex-1 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Clear All
                            </button>
                            <button
                                onClick={() => { onApply?.(); onClose(); }}
                                className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                Apply Filters
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
