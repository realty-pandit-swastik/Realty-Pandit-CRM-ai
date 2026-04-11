'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

type LoginMethod = 'OTP' | 'PASSWORD';
type Step = 'PHONE' | 'OTP' | 'PASSWORD';

const FEATURES = [
    { icon: '🏠', title: 'Manage Listings', desc: 'Add and track your property inventory' },
    { icon: '📊', title: 'Track Leads', desc: 'Follow up with buyers and sellers' },
    { icon: '💬', title: 'WhatsApp Integration', desc: 'Engage clients via AI-powered chat' },
    { icon: '📈', title: 'Grow Your Business', desc: 'Analytics and performance insights' },
];

export default function AgentLogin() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [method, setMethod] = useState<LoginMethod>('OTP');
    const [step, setStep] = useState<Step>('PHONE');
    const [phone, setPhone] = useState('');
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resendTimer, setResendTimer] = useState(0);
    const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (searchParams.get('expired') === '1') {
            setError('Your session has expired. Please log in again.');
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const startResendTimer = () => {
        setResendTimer(30);
        timerRef.current = setInterval(() => {
            setResendTimer(prev => {
                if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/agent/login-otp', { phone });
            setStep('OTP');
            startResendTimer();
            setTimeout(() => digitRefs.current[0]?.focus(), 100);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const otp = digits.join('');
        if (otp.length < 6) { setError('Please enter all 6 digits'); return; }
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/agent/verify-otp', { phone, otp });
            const data = res.data;
            localStorage.setItem('agent_token', data.token);
            localStorage.setItem('agent_info', JSON.stringify(data.agent));
            router.push('/agent/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Invalid OTP');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/agent/login-password', { phone, password });
            const data = res.data;
            localStorage.setItem('agent_token', data.token);
            localStorage.setItem('agent_info', JSON.stringify(data.agent));
            router.push('/agent/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const switchMethod = (m: LoginMethod) => {
        setMethod(m);
        setStep(m === 'OTP' ? 'PHONE' : 'PASSWORD');
        setError('');
        setDigits(['', '', '', '', '', '']);
        setPassword('');
    };

    const handleDigitChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        const newDigits = [...digits];
        newDigits[index] = digit;
        setDigits(newDigits);
        if (digit && index < 5) digitRefs.current[index + 1]?.focus();
    };

    const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            digitRefs.current[index - 1]?.focus();
        }
    };

    const handleDigitPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setDigits(pasted.split(''));
            digitRefs.current[5]?.focus();
        }
    };

    return (
        <div className="min-h-screen flex overflow-hidden">
            {/* Left Panel — Branded */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
                {/* Animated background blobs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
                </div>

                {/* Logo */}
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                            RP
                        </div>
                        <span className="text-white text-xl font-bold">Realty Pandit</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 bg-green-500/20 border border-green-500/30 text-green-400 text-xs px-3 py-1 rounded-full font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Partner Agent Portal
                    </span>
                </div>

                {/* Headline */}
                <div className="relative z-10 space-y-6">
                    <div>
                        <h1 className="text-4xl font-bold text-white leading-tight">
                            Grow Your<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                                Real Estate Business
                            </span>
                        </h1>
                        <p className="mt-3 text-slate-400 text-base leading-relaxed">
                            Access your partner dashboard to manage listings, track leads, and connect with clients.
                        </p>
                    </div>

                    {/* Feature list */}
                    <div className="space-y-4">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-lg flex-shrink-0">
                                    {f.icon}
                                </div>
                                <div>
                                    <p className="text-white text-sm font-semibold">{f.title}</p>
                                    <p className="text-slate-400 text-xs">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10">
                    <p className="text-slate-500 text-xs">
                        &copy; {new Date().getFullYear()} Realty Pandit. All rights reserved.
                    </p>
                </div>
            </div>

            {/* Right Panel — Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 bg-white">
                {/* Mobile logo */}
                <div className="flex items-center gap-2 mb-8 lg:hidden">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                        RP
                    </div>
                    <span className="text-slate-800 font-bold">Realty Pandit</span>
                </div>

                <div className="max-w-sm w-full mx-auto">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
                        <p className="mt-1 text-sm text-slate-500">Sign in to your partner agent account</p>
                    </div>

                    {/* Method Toggle */}
                    <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
                        <button
                            type="button"
                            onClick={() => switchMethod('OTP')}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                                method === 'OTP'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            WhatsApp OTP
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMethod('PASSWORD')}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                                method === 'PASSWORD'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Password
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <span className="text-red-500 text-sm mt-0.5">⚠</span>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* OTP Flow: Phone Entry */}
                    {method === 'OTP' && step === 'PHONE' && (
                        <form className="space-y-4" onSubmit={handleSendOtp}>
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Phone Number
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                                    placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Sending OTP...
                                    </>
                                ) : (
                                    'Send OTP via WhatsApp'
                                )}
                            </button>
                        </form>
                    )}

                    {/* OTP Flow: OTP Verification */}
                    {method === 'OTP' && step === 'OTP' && (
                        <form className="space-y-5" onSubmit={handleVerifyOtp}>
                            <div>
                                <p className="text-sm text-slate-600 mb-4">
                                    OTP sent to <span className="font-semibold text-slate-900">{phone}</span>
                                </p>
                                <label className="block text-sm font-medium text-slate-700 mb-3">
                                    Enter 6-digit OTP
                                </label>
                                <div className="flex gap-2 justify-between" onPaste={handleDigitPaste}>
                                    {digits.map((d, i) => (
                                        <input
                                            key={i}
                                            ref={el => { digitRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={d}
                                            onChange={(e) => handleDigitChange(i, e.target.value)}
                                            onKeyDown={(e) => handleDigitKeyDown(i, e)}
                                            aria-label={`OTP digit ${i + 1}`}
                                            className={`w-11 h-[52px] text-center text-lg font-bold rounded-xl border-2 focus:outline-none transition-all ${
                                                d
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-400'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading || digits.join('').length < 6}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify & Sign In'
                                )}
                            </button>
                            <div className="flex items-center justify-between text-sm">
                                <button
                                    type="button"
                                    onClick={() => { setStep('PHONE'); setDigits(['', '', '', '', '', '']); setError(''); }}
                                    className="text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    ← Change number
                                </button>
                                {resendTimer > 0 ? (
                                    <span className="text-slate-400">Resend in {resendTimer}s</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setLoading(true);
                                            try {
                                                await api.post('/agent/login-otp', { phone });
                                                setDigits(['', '', '', '', '', '']);
                                                startResendTimer();
                                                digitRefs.current[0]?.focus();
                                            } catch (err: any) {
                                                setError(err.response?.data?.error || 'Failed to resend');
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                                    >
                                        Resend OTP
                                    </button>
                                )}
                            </div>
                        </form>
                    )}

                    {/* Password Flow */}
                    {method === 'PASSWORD' && (
                        <form className="space-y-4" onSubmit={handlePasswordLogin}>
                            <div>
                                <label htmlFor="phone-pw" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Phone Number
                                </label>
                                <input
                                    id="phone-pw"
                                    type="tel"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                                    placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all"
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? '🙈' : '👁'}
                                    </button>
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                            <p className="text-center text-xs text-slate-400">
                                No password yet? Use WhatsApp OTP to sign in, then set a password from your dashboard.
                            </p>
                        </form>
                    )}

                    <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                            ← Back to main site
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
