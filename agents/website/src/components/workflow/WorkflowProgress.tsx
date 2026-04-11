'use client';

import { motion } from 'framer-motion';
import type { WorkflowGroup, WorkflowStepDef } from '@/lib/api';

interface Props {
    groups: WorkflowGroup[];
    currentStep: WorkflowStepDef | null;
    stepHistory: string[];
    done: boolean;
}

export default function WorkflowProgress({ groups, currentStep, stepHistory, done }: Props) {
    const currentGroupId = done ? 'confirm' : currentStep?.group;
    const currentGroupIndex = groups.findIndex(g => g.id === currentGroupId);
    const progress = done ? 100 : groups.length > 0 ? ((currentGroupIndex + 1) / groups.length) * 100 : 0;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {done ? 'Review & Confirm' : currentStep?.group ? groups.find(g => g.id === currentStep.group)?.label : 'Loading...'}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-500">
                    {stepHistory.length} answered
                </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                <motion.div
                    className="bg-emerald-500 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
            <div className="hidden md:flex items-center justify-between mt-3 gap-1">
                {groups.map((g, i) => {
                    const isActive = g.id === currentGroupId;
                    const isDone = currentGroupIndex > i || done;
                    return (
                        <div key={g.id} className="flex items-center gap-1.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
                                isDone
                                    ? 'bg-emerald-500 text-white'
                                    : isActive
                                    ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                            }`}>
                                {isDone ? '✓' : g.icon}
                            </div>
                            <span className={`text-xs font-medium hidden lg:inline ${
                                isActive || isDone
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-500'
                            }`}>
                                {g.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
