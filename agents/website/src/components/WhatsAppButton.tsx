'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { COMPANY_WHATSAPP } from '@/lib/constants';

const WHATSAPP_NUMBER = COMPANY_WHATSAPP;
const DEFAULT_MESSAGE = 'Hi Panditji! I need help with finding a property.';

export default function WhatsAppButton() {
    const [showTooltip, setShowTooltip] = useState(false);

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;

    return (
        <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50">
            <AnimatePresence>
                {showTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="absolute bottom-16 right-0 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                    >
                        <div className="bg-[#075E54] p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                        <MessageCircle className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-white font-semibold text-sm">Panditji</p>
                                        <p className="text-green-200 text-xs">Online now</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowTooltip(false)}
                                    className="text-white/80 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="bg-slate-100 rounded-xl rounded-tl-none p-3 mb-3">
                                <p className="text-slate-700 text-sm">
                                    Namaste! I&apos;m Panditji, your AI property assistant. How can I help you today?
                                </p>
                            </div>
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full bg-[#25D366] hover:bg-[#20BD5A] text-white text-center py-3 rounded-xl text-sm font-medium transition-colors"
                            >
                                Start Chat on WhatsApp
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={() => setShowTooltip(!showTooltip)}
                className="w-14 h-14 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-full shadow-lg flex items-center justify-center transition-all animate-pulse-glow"
                aria-label="Chat on WhatsApp"
            >
                <MessageCircle className="w-7 h-7" />
            </button>
        </div>
    );
}
