import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
    undoFn?: () => void;
    duration?: number;
}

export interface SnackbarItem {
    id: string;
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, undoFn?: () => void, duration?: number) => void;
    showSnackbar: (message: string) => void;
    toasts: ToastItem[];
    snackbar: SnackbarItem | null;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
    showToast: () => {},
    showSnackbar: () => {},
    toasts: [],
    snackbar: null,
    dismissToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [snackbar, setSnackbar] = useState<SnackbarItem | null>(null);

    const showToast = useCallback((
        message: string,
        type: ToastType = 'success',
        undoFn?: () => void,
        duration = 3500,
    ) => {
        const id = `toast-${Date.now()}`;
        setToasts(prev => [...prev, { id, type, message, undoFn, duration }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const showSnackbar = useCallback((message: string) => {
        const id = `snack-${Date.now()}`;
        setSnackbar({ id, message });
        setTimeout(() => setSnackbar(null), 2500);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, showSnackbar, toasts, snackbar, dismissToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
