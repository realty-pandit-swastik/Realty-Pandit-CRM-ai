'use client';

import { useState } from 'react';
import { submitContactForm } from '@/lib/api';
import { CheckCircle, Loader2 } from 'lucide-react';
import RequirementCapture from './RequirementCapture';

interface ContactFormProps {
    propertyId?: string;
    intent?: string;
    dark?: boolean;
    mode?: 'simple' | 'requirements'; // PHASE 7: 'requirements' uses the new funnel
}

export default function ContactForm({ propertyId, intent, dark = false, mode = 'requirements' }: ContactFormProps) {
    const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // PHASE 7: Default to new requirement capture flow
    if (mode === 'requirements') {
        return (
            <RequirementCapture
                dark={dark}
                source="website_contact"
                defaultIntent={intent === 'rent' ? 'rent_lease' : 'buy'}
            />
        );
    }

    // Legacy simple form (still available via mode='simple')
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMsg('');
        try {
            await submitContactForm({ ...form, property_id: propertyId, intent: intent || undefined });
            setStatus('success');
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Something went wrong');
            setStatus('error');
        }
    };

    const inputClass = dark
        ? 'w-full py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400'
        : 'w-full py-3 px-4 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

    if (status === 'success') {
        return (
            <div className="text-center py-6">
                <CheckCircle className={`w-12 h-12 mx-auto mb-3 ${dark ? 'text-green-400' : 'text-green-500'}`} />
                <h4 className={`font-semibold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}>Thank You!</h4>
                <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Panditji will contact you on WhatsApp shortly.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <input type="text" placeholder="Your Name *" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} aria-label="Your name" className={inputClass} />
            <input type="tel" placeholder="Phone Number *" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} aria-label="Phone number" className={inputClass} />
            <input type="email" placeholder="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} aria-label="Email address" className={inputClass} />
            <textarea placeholder="Message (optional)" value={form.message} rows={3} onChange={e => setForm({ ...form, message: e.target.value })} aria-label="Message" className={`${inputClass} resize-none`} />
            {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
            <button type="submit" disabled={status === 'loading'} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                {status === 'loading' ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : 'Send Inquiry'}
            </button>
            <p className={`text-xs text-center ${dark ? 'text-slate-500' : 'text-slate-400'}`}>By submitting, Panditji will reach out to you on WhatsApp</p>
        </form>
    );
}
