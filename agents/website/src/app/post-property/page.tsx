'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    Home, CheckCircle2, ChevronRight, Sparkles, Loader2, MessageSquare,
} from 'lucide-react';
import { useChatWorkflow } from '@/lib/useChatWorkflow';
import ChatWorkflow from '@/components/chat-workflow/ChatWorkflow';
import { useEffect } from 'react';

export default function PostPropertyPage() {
    const chat = useChatWorkflow();

    // Start session on mount
    useEffect(() => {
        chat.startSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Loading state
    if (chat.loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    // Success Screen
    if (chat.inventoryId && !chat.sessionActive) {
        return (
            <div className="min-h-screen pt-20 bg-slate-50 dark:bg-slate-950">
                <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-8"
                    >
                        <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4"
                    >
                        Property Submitted Successfully!
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-lg text-slate-600 dark:text-slate-400 mb-2"
                    >
                        Your property has been submitted! Panditji will verify and list it within 24 hours.
                    </motion.p>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-sm text-slate-500 mb-8"
                    >
                        Property ID: <span className="font-mono text-blue-600 dark:text-blue-400">{chat.inventoryId}</span>
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex flex-col sm:flex-row gap-4 justify-center"
                    >
                        <Link
                            href="/"
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors inline-flex items-center justify-center gap-2"
                        >
                            <Home className="w-4 h-4" /> Back to Home
                        </Link>
                        <Link
                            href="/properties"
                            className="px-6 py-3 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors inline-flex items-center justify-center gap-2"
                        >
                            <ChevronRight className="w-4 h-4" /> Browse Properties
                        </Link>
                        <button
                            onClick={chat.reset}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors inline-flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" /> Post Another
                        </button>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex flex-col pt-20 bg-slate-50 dark:bg-slate-950 overflow-hidden z-10">
            {/* Compact Hero */}
            <div className="relative flex-shrink-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 dark:from-emerald-900 dark:via-emerald-950 dark:to-teal-950 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-400/20 via-transparent to-transparent" />
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-10 right-10 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
                </div>
                <div className="relative max-w-4xl mx-auto px-4 py-6 md:py-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-emerald-100 text-sm mb-3">
                            <MessageSquare className="w-4 h-4" /> AI-Powered Property Listing
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                            Post Your Property
                        </h1>
                        <p className="text-emerald-100/80 text-sm max-w-xl mx-auto">
                            Chat with Panditji to list your property. Just answer simple questions!
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Chat UI — fills remaining height */}
            <ChatWorkflow chat={chat} />
        </div>
    );
}
