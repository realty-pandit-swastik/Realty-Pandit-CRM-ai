'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { scheduleVisit, type Property } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const TIME_SLOTS = [
    { value: 'morning', label: 'Morning', sub: '9AM – 12PM' },
    { value: 'afternoon', label: 'Afternoon', sub: '12 – 4PM' },
    { value: 'evening', label: 'Evening', sub: '4 – 7PM' },
    { value: 'flexible', label: 'Flexible', sub: 'Any time' },
];

const todayStr = new Date().toISOString().split('T')[0];
const maxDateStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
})();

interface Props {
    property: Pick<Property, 'id' | 'intent' | 'category'>;
}

export default function ScheduleVisitForm({ property }: Props) {
    const { toast } = useToast();
    const [form, setForm] = useState({
        name: '',
        phone: '',
        preferred_date: '',
        preferred_time: 'flexible',
        message: '',
    });
    const [showNote, setShowNote] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.phone.trim()) return;
        setSubmitting(true);
        try {
            await scheduleVisit({
                property_id: property.id,
                name: form.name.trim(),
                phone: form.phone.trim(),
                preferred_date: form.preferred_date || undefined,
                preferred_time: form.preferred_time,
                message: form.message.trim() || undefined,
            });
            toast.success("Visit scheduled! We'll confirm on WhatsApp shortly.");
            setDone(true);
        } catch {
            toast.error('Failed to schedule. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center py-4"
            >
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
                <p className="font-semibold text-slate-900 dark:text-white">Visit Scheduled!</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Our agent will confirm on WhatsApp.</p>
            </motion.div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <input
                type="text"
                placeholder="Your Name *"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium whitespace-nowrap">+91</span>
                <input
                    type="tel"
                    placeholder="WhatsApp Number *"
                    required
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
            </div>

            {/* Preferred Date */}
            <input
                type="date"
                min={todayStr}
                max={maxDateStr}
                value={form.preferred_date}
                onChange={e => setForm(f => ({ ...f, preferred_date: e.target.value }))}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />

            {/* Time Slots */}
            <div className="grid grid-cols-2 gap-2">
                {TIME_SLOTS.map(slot => (
                    <button
                        key={slot.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, preferred_time: slot.value }))}
                        className={`px-3 py-2 rounded-xl border text-left transition-all ${
                            form.preferred_time === slot.value
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <div className="text-xs font-semibold">{slot.label}</div>
                        <div className="text-[11px] opacity-70">{slot.sub}</div>
                    </button>
                ))}
            </div>

            {/* Optional Message */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowNote(v => !v)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                    {showNote ? 'Hide note' : '+ Add a note (optional)'}
                </button>
                {showNote && (
                    <textarea
                        rows={2}
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        placeholder="Any specific requirements..."
                        className="w-full mt-2 px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    />
                )}
            </div>

            <motion.button
                type="submit"
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
                {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling...</>
                ) : (
                    'Schedule Visit'
                )}
            </motion.button>
            <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                Our agent will confirm on WhatsApp
            </p>
        </form>
    );
}
