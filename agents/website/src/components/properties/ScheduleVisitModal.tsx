'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CalendarPlus, CheckCircle } from 'lucide-react';
import { type Property, scheduleVisit } from '@/lib/api';
import { formatType, formatAddress } from '@/lib/propertyUtils';

interface ScheduleVisitModalProps {
    property: Property;
    onClose: () => void;
}

export default function ScheduleVisitModal({ property, onClose }: ScheduleVisitModalProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const locationText = formatAddress(property) || property.location || '';
    const propertyTitle = property.apartment_name || formatType(property.type);

    // Min date = today
    const today = new Date().toISOString().split('T')[0];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim() || !date) return;
        setLoading(true);
        try {
            await scheduleVisit({
                property_id: property.id,
                name: name.trim(),
                phone: phone.trim(),
                preferred_date: date,
                preferred_time: time || undefined,
            });
            setSubmitted(true);
        } catch {
            setSubmitted(true);
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
                    <h3 className="font-semibold text-slate-900 dark:text-white">Schedule a Visit</h3>
                    <button type="button" onClick={onClose} aria-label="Close schedule visit" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
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
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Visit Request Sent!</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Panditji will confirm your visit on WhatsApp shortly.
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
                            Enter your details to schedule a property visit.
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
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Preferred Date *</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    min={today}
                                    required
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Preferred Time</label>
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || phone.length < 10 || !date}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <CalendarPlus className="w-4 h-4" />
                            {loading ? 'Submitting...' : 'Schedule Visit'}
                        </button>
                    </form>
                )}
            </motion.div>
        </div>
    );
}
