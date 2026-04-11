'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ToastItem } from '@/components/ui/Toast';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    toasts: Toast[];
    toast: {
        success: (message: string, duration?: number) => void;
        error: (message: string, duration?: number) => void;
        info: (message: string, duration?: number) => void;
        warning: (message: string, duration?: number) => void;
    };
    dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const add = useCallback((type: ToastType, message: string, duration = 4000) => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => {
            const next = [...prev, { id, type, message, duration }];
            return next.slice(-3); // max 3 stacked
        });
        if (duration > 0) {
            setTimeout(() => dismiss(id), duration);
        }
    }, [dismiss]);

    const toast = {
        success: (message: string, duration?: number) => add('success', message, duration),
        error: (message: string, duration?: number) => add('error', message, duration),
        info: (message: string, duration?: number) => add('info', message, duration),
        warning: (message: string, duration?: number) => add('warning', message, duration),
    };

    return (
        <ToastContext.Provider value={{ toasts, toast, dismiss }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map(t => (
                        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');
    return ctx;
}
