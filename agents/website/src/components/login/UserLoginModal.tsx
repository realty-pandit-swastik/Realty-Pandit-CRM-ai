'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { sendUserOTP, verifyUserOTP } from '@/lib/api';

interface UserLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type LoginStep = 'phone' | 'otp' | 'success';

export default function UserLoginModal({ isOpen, onClose }: UserLoginModalProps) {
    const [step, setStep] = useState<LoginStep>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendOTP = async () => {
        setError('');

        // Validate phone number (basic E.164 validation)
        const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            setError('Please enter a valid 10-digit Indian phone number');
            return;
        }

        setLoading(true);

        try {
            const response = await sendUserOTP({ phone });

            if (response.success) {
                setStep('otp');
            } else {
                setError(response.message || 'Failed to send OTP. Please try again.');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to send OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        setError('');

        if (!otp || otp.length < 4) {
            setError('Please enter a valid OTP');
            return;
        }

        setLoading(true);

        try {
            const response = await verifyUserOTP({ phone, otp });

            if (response.success && response.token) {
                // Store token in localStorage
                localStorage.setItem('user_token', response.token);

                setStep('success');

                // Redirect after 2 seconds
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
            } else {
                setError(response.message || 'Invalid OTP. Please try again.');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Invalid OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep('phone');
        setPhone('');
        setOtp('');
        setError('');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden pointer-events-auto"
                        >
                            {/* Header */}
                            <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20">
                                <button
                                    onClick={handleClose}
                                    className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    aria-label="Close login modal"
                                >
                                    <X className="w-6 h-6" />
                                </button>

                                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                                    {step === 'phone' && 'Welcome Back'}
                                    {step === 'otp' && 'Verify OTP'}
                                    {step === 'success' && 'Success!'}
                                </h2>
                                <p className="text-slate-600 dark:text-slate-400">
                                    {step === 'phone' && 'Enter your phone number to continue'}
                                    {step === 'otp' && `OTP sent to ${phone}`}
                                    {step === 'success' && 'Login successful'}
                                </p>
                            </div>

                            {/* Content */}
                            <div className="p-8">
                                {/* Phone Step */}
                                {step === 'phone' && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-6"
                                    >
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                Phone Number
                                            </label>
                                            <div className="relative">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                                <input
                                                    type="tel"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="+91 98765 43210"
                                                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all"
                                                    onKeyPress={(e) => e.key === 'Enter' && handleSendOTP()}
                                                />
                                            </div>
                                        </div>

                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg"
                                            >
                                                {error}
                                            </motion.div>
                                        )}

                                        <button
                                            onClick={handleSendOTP}
                                            disabled={loading}
                                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3.5 rounded-xl font-semibold transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Sending OTP...
                                                </>
                                            ) : (
                                                'Send OTP'
                                            )}
                                        </button>

                                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                            By continuing, you agree to our{' '}
                                            <a href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
                                                Terms of Service
                                            </a>{' '}
                                            and{' '}
                                            <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                                                Privacy Policy
                                            </a>
                                        </p>
                                    </motion.div>
                                )}

                                {/* OTP Step */}
                                {step === 'otp' && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="space-y-6"
                                    >
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                Enter OTP
                                            </label>
                                            <div className="relative">
                                                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={otp}
                                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    placeholder="123456"
                                                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all"
                                                    maxLength={6}
                                                    onKeyPress={(e) => e.key === 'Enter' && handleVerifyOTP()}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>

                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg"
                                            >
                                                {error}
                                            </motion.div>
                                        )}

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setStep('phone')}
                                                disabled={loading}
                                                className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3.5 rounded-xl font-semibold transition-all disabled:opacity-50"
                                            >
                                                Change Number
                                            </button>
                                            <button
                                                onClick={handleVerifyOTP}
                                                disabled={loading}
                                                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3.5 rounded-xl font-semibold transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {loading ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        Verifying...
                                                    </>
                                                ) : (
                                                    'Verify'
                                                )}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleSendOTP}
                                            className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Didn't receive OTP? Resend
                                        </button>
                                    </motion.div>
                                )}

                                {/* Success Step */}
                                {step === 'success' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-8"
                                    >
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                            className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
                                        >
                                            <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
                                        </motion.div>
                                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                            Welcome!
                                        </h3>
                                        <p className="text-slate-600 dark:text-slate-400">
                                            Redirecting to your dashboard...
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
