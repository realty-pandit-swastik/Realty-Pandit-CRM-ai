'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, MessageCircle, CheckCircle } from 'lucide-react';
import { type Property, sharePropertyWhatsApp } from '@/lib/api';

interface ShareWhatsAppModalProps {
    property: Property;
    onClose: () => void;
}

export default function ShareWhatsAppModal({ property, onClose }: ShareWhatsAppModalProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const locationText = [property.locality, property.city].filter(Boolean).join(', ') || property.location || '';
    const propertyTitle = property.apartment_name || property.type?.replace(/_/g, ' ') || 'Property';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) return;
        setLoading(true);
        setError('');
        try {
            const result = await sharePropertyWhatsApp({
                name: name.trim(),
                phone: phone.trim(),
                property_id: property.id,
            });
            if (!result.whatsapp_sent) throw new Error(result.message);
            setSubmitted(true);
        } catch (err) {
            setError((err as Error).message || 'WhatsApp delivery could not be started. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Share on WhatsApp</h3>
                    <button type="button" onClick={onClose} aria-label="Close share modal" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Property summary */}
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm">
                    <p className="font-medium text-slate-900 dark:text-white capitalize">{propertyTitle}</p>
                    <p className="text-slate-500 dark:text-slate-400">{locationText}</p>
                </div>

                {submitted ? (
                    <div className="p-6 text-center">
                        <div className="mx-auto w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
                        </div>
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Details Sent!</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Property details have been sent to your WhatsApp. This property is also saved to your favorites.
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-5 space-y-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Enter your details to receive this property&apos;s information on WhatsApp.
                        </p>
                        <input
                            type="text"
                            placeholder="Your Name *"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        />
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">+91</span>
                            <input
                                type="tel"
                                placeholder="Phone Number *"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                required
                                minLength={10}
                                maxLength={10}
                                className="w-full pl-12 pr-4 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || phone.length < 10}
                            className="w-full py-2.5 bg-[#25D366] hover:bg-[#20BD5A] disabled:bg-[#25D366]/60 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <MessageCircle className="w-4 h-4" />
                            {loading ? 'Sending...' : 'Send to My WhatsApp'}
                        </button>
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
                    </form>
                )}
            </motion.div>
        </div>
    );
}
