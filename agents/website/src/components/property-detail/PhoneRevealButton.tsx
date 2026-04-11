'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, User, MessageCircle, Copy, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071';

type Step = 'idle' | 'phone' | 'otp' | 'revealed';

interface AgentInfo {
    agent_name: string;
    phone: string;
}

interface Props {
    propertyId: string;
}

export default function PhoneRevealButton({ propertyId }: Props) {
    const { toast } = useToast();
    const [step, setStep] = useState<Step>('idle');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [agent, setAgent] = useState<AgentInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);
    const [otpError, setOtpError] = useState('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Check session storage for already-revealed state
    useEffect(() => {
        const stored = sessionStorage.getItem(`rp_agent_revealed_${propertyId}`);
        if (stored) {
            try {
                setAgent(JSON.parse(stored));
                setStep('revealed');
            } catch {}
        }
    }, [propertyId]);

    const startResendTimer = () => {
        setResendCountdown(60);
        timerRef.current = setInterval(() => {
            setResendCountdown(c => {
                if (c <= 1) { clearInterval(timerRef.current!); return 0; }
                return c - 1;
            });
        }, 1000);
    };

    const handleRequestOtp = async () => {
        if (!phone || phone.length < 10) {
            toast.error('Enter a valid 10-digit phone number');
            return;
        }
        setLoading(true);
        setOtpError('');
        try {
            const res = await fetch(`${API_BASE}/public/properties/${propertyId}/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
            toast.info('OTP sent to your WhatsApp');
            setStep('otp');
            startResendTimer();
        } catch (err: any) {
            toast.error(err.message || 'Failed to send OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            setOtpError('Enter the 6-digit OTP');
            return;
        }
        setLoading(true);
        setOtpError('');
        try {
            const res = await fetch(`${API_BASE}/public/properties/${propertyId}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid OTP');
            setAgent(data);
            sessionStorage.setItem(`rp_agent_revealed_${propertyId}`, JSON.stringify(data));
            setStep('revealed');
        } catch (err: any) {
            setOtpError(err.message || 'Invalid OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyPhone = () => {
        if (!agent) return;
        navigator.clipboard.writeText(agent.phone);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
            <AnimatePresence mode="wait">
                {step === 'idle' && (
                    <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <button
                            type="button"
                            onClick={() => setStep('phone')}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        >
                            <Phone className="w-4 h-4" /> Contact Agent
                        </button>
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500 mt-2">Talk to our property expert</p>
                    </motion.div>
                )}

                {step === 'phone' && (
                    <motion.div
                        key="phone"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-3"
                    >
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enter your WhatsApp number</p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500 dark:text-slate-400 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium whitespace-nowrap">+91</span>
                            <input
                                type="tel"
                                value={phone}
                                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="10-digit number"
                                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                        <motion.button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={loading || phone.length < 10}
                            whileTap={{ scale: 0.97 }}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send OTP'}
                        </motion.button>
                        <button onClick={() => setStep('idle')} className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                            Cancel
                        </button>
                    </motion.div>
                )}

                {step === 'otp' && (
                    <motion.div
                        key="otp"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-3"
                    >
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enter OTP sent to +91 {phone}</p>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otp}
                            onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                            placeholder="6-digit OTP"
                            autoFocus
                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 tracking-widest text-center font-mono"
                        />
                        {otpError && <p className="text-red-500 text-xs">{otpError}</p>}
                        <motion.button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={loading || otp.length < 6}
                            whileTap={{ scale: 0.97 }}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify OTP'}
                        </motion.button>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                            <button onClick={() => { setStep('phone'); setOtp(''); setOtpError(''); }} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Change number</button>
                            {resendCountdown > 0 ? (
                                <span>Resend in {resendCountdown}s</span>
                            ) : (
                                <button onClick={handleRequestOtp} className="text-blue-500 hover:underline">Resend OTP</button>
                            )}
                        </div>
                    </motion.div>
                )}

                {step === 'revealed' && agent && (
                    <motion.div
                        key="revealed"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800"
                    >
                        <p className="text-xs text-slate-500 dark:text-slate-400">Your Realty Pandit Agent</p>
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-semibold text-slate-800 dark:text-white text-sm">{agent.agent_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300 text-sm">{agent.phone}</span>
                            <button onClick={handleCopyPhone} className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <a
                                href={`https://wa.me/${agent.phone.replace(/[^\d]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                                aria-label="WhatsApp agent"
                            >
                                <MessageCircle className="w-4 h-4" />
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
