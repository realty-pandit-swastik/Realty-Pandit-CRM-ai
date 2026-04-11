'use client';

import { X, ArrowLeft } from 'lucide-react';

interface ChatHeaderProps {
    isAuthenticated: boolean;
    userPhone: string | null;
    onClose: () => void;
}

export default function ChatHeader({
    isAuthenticated,
    userPhone,
    onClose
}: ChatHeaderProps) {
    return (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700/80 px-4 md:px-6 py-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shadow-lg">
                        <span className="text-white text-xl">🙏</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            Panditji
                        </h2>
                        {isAuthenticated && userPhone && (
                            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                                    {userPhone}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
                    aria-label="Back to site"
                >
                    <span className="hidden md:inline">Back to site</span>
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
