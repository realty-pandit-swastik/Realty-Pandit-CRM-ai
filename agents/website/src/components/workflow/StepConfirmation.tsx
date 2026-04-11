'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
    summary: Record<string, string> | null;
    onConfirm: () => void;
    onBack: () => void;
    submitting: boolean;
    error: string;
}

export default function StepConfirmation({ summary, onConfirm, onBack, submitting, error }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-6 md:p-8"
        >
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Review & Confirm</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Please review your property details and confirm to submit
                </p>
            </div>

            {summary ? (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 space-y-3 border border-slate-200 dark:border-slate-700 mb-6">
                    {Object.entries(summary).map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between gap-4">
                            <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-white text-right">{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="ml-2 text-sm text-slate-500">Loading summary...</span>
                </div>
            )}

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm"
                >
                    {error}
                </motion.div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800">
                <button
                    onClick={onBack}
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <button
                    onClick={onConfirm}
                    disabled={submitting || !summary}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 dark:disabled:bg-emerald-800 text-white transition-colors shadow-md"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                        </>
                    ) : (
                        <>
                            Submit Property <CheckCircle2 className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </motion.div>
    );
}
