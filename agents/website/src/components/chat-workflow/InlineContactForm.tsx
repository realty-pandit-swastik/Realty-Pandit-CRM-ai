'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Phone, Mail, Loader2, Send } from 'lucide-react';

interface InlineContactFormProps {
    mode: 'owner_block' | 'uploader_block';
    onSubmit: (text: string) => void;
    sending?: boolean;
}

export default function InlineContactForm({ mode, onSubmit, sending }: InlineContactFormProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    const isOwner = mode === 'owner_block';
    const title = isOwner ? 'Owner Details' : 'Your Details';

    const handleSubmit = () => {
        if (!isValid) return;
        const data = isOwner
            ? { owner_name: name.trim(), owner_phone: phone.trim() }
            : { name: name.trim(), phone: phone.trim(), email: email.trim() };
        onSubmit(JSON.stringify(data));
    };

    const isValid = name.trim().length >= 2 && /^\d{10}$/.test(phone.replace(/[\s+\-]/g, '').replace(/^91/, ''));

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-4 space-y-3"
        >
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h4>

            {/* Name */}
            <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Full name"
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
            </div>

            {/* Phone */}
            <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="flex-1 flex items-center gap-1">
                    <span className="text-sm text-slate-500 dark:text-slate-400 px-2">+91</span>
                    <input
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile"
                        inputMode="tel"
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                </div>
            </div>

            {/* Email (uploader only) */}
            {!isOwner && (
                <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email (optional)"
                        type="email"
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                </div>
            )}

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={!isValid || sending}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit
            </button>
        </motion.div>
    );
}
