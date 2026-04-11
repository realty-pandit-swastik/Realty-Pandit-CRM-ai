'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

const config: Record<ToastType, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
    success: {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
        bg: 'bg-white dark:bg-slate-800',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-slate-800 dark:text-slate-100',
    },
    error: {
        icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
        bg: 'bg-white dark:bg-slate-800',
        border: 'border-red-200 dark:border-red-800',
        text: 'text-slate-800 dark:text-slate-100',
    },
    info: {
        icon: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
        bg: 'bg-white dark:bg-slate-800',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'text-slate-800 dark:text-slate-100',
    },
    warning: {
        icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
        bg: 'bg-white dark:bg-slate-800',
        border: 'border-amber-200 dark:border-amber-800',
        text: 'text-slate-800 dark:text-slate-100',
    },
};

interface ToastItemProps {
    toast: Toast;
    onDismiss: (id: string) => void;
}

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const { icon, bg, border, text } = config[toast.type];
    return (
        <motion.div
            layout
            initial={{ x: 120, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 120, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] rounded-2xl border shadow-lg px-4 py-3 ${bg} ${border}`}
        >
            {icon}
            <p className={`flex-1 text-sm font-medium leading-snug ${text}`}>{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-0.5"
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>
        </motion.div>
    );
}
