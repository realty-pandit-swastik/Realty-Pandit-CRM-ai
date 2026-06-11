'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Cookie, ChevronDown, ChevronUp } from 'lucide-react';
import { submitLead } from '@/lib/api';
import RequirementCapture from './RequirementCapture';

const COOKIE_CONSENT_KEY = 'rp_cookie_consent';
const LEAD_CAPTURED_KEY = 'rp_lead_captured';
const LEAD_POPUP_DELAY = 15000; // 15 seconds — only after cookie consent

export default function LeadCapture() {
    const pathname = usePathname();
    const [showCookieBanner, setShowCookieBanner] = useState(false);
    const [showLeadPopup, setShowLeadPopup] = useState(false);
    const [cookieDetails, setCookieDetails] = useState(false);
    const [leadForm, setLeadForm] = useState({ name: '', phone: '', email: '', interest: 'buy' });
    const [leadStatus, setLeadStatus] = useState<'idle' | 'loading' | 'success'>('idle');
    const [useNewFlow, setUseNewFlow] = useState(true); // PHASE 7: Use RequirementCapture

    useEffect(() => {
        // Check cookie consent
        const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!consent) {
            setShowCookieBanner(true);
        }

        // Only show lead popup AFTER cookie consent is given
        const leadCaptured = localStorage.getItem(LEAD_CAPTURED_KEY);
        const canShowLeadPopup = !!consent && !leadCaptured;
        if (canShowLeadPopup) {
            const timer = setTimeout(() => {
                setShowLeadPopup(true);
            }, LEAD_POPUP_DELAY);
            return () => clearTimeout(timer);
        }
    }, []);

    const acceptCookies = (type: 'all' | 'essential') => {
        const consent = {
            essential: true,
            analytics: type === 'all',
            marketing: type === 'all',
            timestamp: new Date().toISOString(),
        };
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
        setShowCookieBanner(false);
    };

    const handleLeadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLeadStatus('loading');

        try {
            await submitLead({
                name: leadForm.name,
                phone: leadForm.phone,
                email: leadForm.email,
                interest: leadForm.interest,
                source: 'website_popup',
                page_url: window.location.href,
                user_agent: navigator.userAgent,
            });
        } catch (err) {
            console.error('Lead submission failed', err);
            // Still mark as captured locally
        }

        localStorage.setItem(LEAD_CAPTURED_KEY, JSON.stringify({
            ...leadForm,
            captured_at: new Date().toISOString(),
        }));

        setLeadStatus('success');
        setTimeout(() => setShowLeadPopup(false), 2500);
    };

    return (
        <>
            {/* Cookie Consent Banner */}
            <AnimatePresence>
                {showCookieBanner && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-0 left-0 right-0 z-[60] p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                    >
                        <div className="max-w-5xl mx-auto bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 p-3 sm:p-6">
                            <div className="flex items-center sm:items-start gap-3 sm:gap-4">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Cookie className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-slate-900 text-sm sm:text-base sm:mb-1">We value your privacy</h4>
                                    {/* Concise on mobile, full copy on >= sm */}
                                    <p className="text-slate-500 text-xs sm:text-sm mb-2 sm:mb-3">
                                        <span className="sm:hidden">We use cookies to improve your experience.</span>
                                        <span className="hidden sm:inline">
                                            We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.
                                            By clicking &ldquo;Accept All&rdquo;, you consent to our use of cookies for analytics and marketing purposes.
                                        </span>
                                    </p>

                                    <button onClick={() => setCookieDetails(!cookieDetails)} className="hidden sm:flex text-blue-600 text-xs font-medium items-center gap-1 mb-3">
                                        {cookieDetails ? 'Hide' : 'Show'} details
                                        {cookieDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>

                                    {cookieDetails && (
                                        <div className="hidden sm:block text-xs text-slate-500 space-y-2 mb-3 bg-slate-50 p-3 rounded-lg">
                                            <p><strong className="text-slate-700">Essential:</strong> Required for the website to function. Cannot be disabled.</p>
                                            <p><strong className="text-slate-700">Analytics:</strong> Help us understand how visitors use our website (Google Analytics).</p>
                                            <p><strong className="text-slate-700">Marketing:</strong> Used to deliver relevant property listings and offers to you.</p>
                                        </div>
                                    )}

                                    <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
                                        <button onClick={() => acceptCookies('all')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">
                                            Accept All
                                        </button>
                                        <button onClick={() => acceptCookies('essential')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap">
                                            Essential
                                        </button>
                                        <a href="/privacy" className="hidden sm:inline text-slate-500 hover:text-blue-600 px-3 py-2 text-sm transition-colors">
                                            Privacy Policy
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lead Capture Popup */}
            <AnimatePresence>
                {showLeadPopup && pathname === '/' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowLeadPopup(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white relative">
                                <button onClick={() => setShowLeadPopup(false)} className="absolute top-4 right-4 text-white/80 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                                    <Gift className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-1">Get Exclusive Property Deals!</h3>
                                <p className="text-white/80 text-sm">Join 1000+ smart property seekers. Get personalized recommendations from Panditji.</p>
                            </div>

                            {/* Form — PHASE 7: RequirementCapture replaces old simple form */}
                            <div className="p-6">
                                <RequirementCapture
                                    compact
                                    source="website_popup"
                                    onComplete={() => {
                                        localStorage.setItem(LEAD_CAPTURED_KEY, JSON.stringify({
                                            captured_at: new Date().toISOString(),
                                        }));
                                        setTimeout(() => setShowLeadPopup(false), 3000);
                                    }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
