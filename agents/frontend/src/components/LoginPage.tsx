
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../lib/api';
import realtyPanditLogo from '../../../website/public/logo.png';

// ─── Skyline Buildings SVG (real estate themed login transition) ───
function SkylineOverlay({ onDone }: { onDone: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onDone, 2400);
        return () => clearTimeout(timer);
    }, [onDone]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--bg-secondary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
        }}>
            {/* Welcome text */}
            <div style={{
                textAlign: 'center', marginBottom: '60px', zIndex: 2,
            }}>
                <img src={realtyPanditLogo} alt="Realty Pandit logo" width={160} height={90} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }} />
                <h1 style={{
                    color: 'var(--text-primary)', fontSize: '24px', fontWeight: 600, margin: '16px 0 8px',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    Welcome to Realty Pandit
                </h1>
                <p style={{
                    color: 'var(--text-secondary)', fontSize: '15px', margin: 0,
                }}>
                    Loading your dashboard...
                </p>
                {/* Loading dots */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px' }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)',
                        }} />
                    ))}
                </div>
            </div>

        </div>
    );
}

// ─── Login Page ───
export function LoginPage() {
    const { login } = useAuth();
    const [loginPhone, setLoginPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showTransition, setShowTransition] = useState(false);
    const [cardExiting, setCardExiting] = useState(false);

    // Forgot password states
    const [mode, setMode] = useState<'login' | 'forgot' | 'partner'>('login');
    // Partner-agent sign-in (2026-07-12): partners have no admin password — they authenticate by
    // WhatsApp OTP against their PartnerAgent record, which issues a role:'partner' session cookie.
    const [partnerStep, setPartnerStep] = useState<'phone' | 'otp'>('phone');
    // Partners can sign in three ways: WhatsApp OTP, password (if they've set one), or Google.
    const [partnerAuthMode, setPartnerAuthMode] = useState<'otp' | 'password'>('otp');
    const [partnerPassword, setPartnerPassword] = useState('');
    const [forgotStep, setForgotStep] = useState<'phone' | 'otp' | 'done'>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Resend OTP countdown
    const [resendCountdown, setResendCountdown] = useState(0);
    const [resendLoading, setResendLoading] = useState(false);

    // Particles ref
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-redirect to login after successful reset
    useEffect(() => {
        if (forgotStep === 'done') {
            const timer = setTimeout(() => {
                setMode('login');
                setForgotStep('phone');
                setPhone('');
                setOtp('');
                setNewPassword('');
                setSuccessMessage('');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [forgotStep]);

    // Resend countdown timer
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    // Start countdown when entering OTP step
    useEffect(() => {
        if (forgotStep === 'otp') setResendCountdown(60);
    }, [forgotStep]);

    // Surface a failed Google sign-in (?login_error=...) bounced back by the
    // /auth/google/callback. On success the callback sets cookies + redirects
    // to the dashboard, so this page never renders in that case.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('login_error');
        if (!code) return;
        const msgs: Record<string, string> = {
            google_unlinked: "This Google account isn't linked to a team member. Log in with your phone number, then connect Google from your profile first.",
            google_denied: 'Google sign-in was cancelled.',
            google_expired: 'The Google sign-in link expired. Please try again.',
            google_unavailable: "Google sign-in isn't available right now. Use your phone number.",
            google_error: 'Google sign-in failed. Please try again.',
        };
        setError(msgs[code] || 'Google sign-in failed. Please try again.');
        params.delete('login_error');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }, []);

    const handleGoogleSignIn = () => {
        window.location.href = `${API_BASE_URL}/auth/google`;
    };

    const handleResendOtp = async () => {
        setResendLoading(true);
        setError('');
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/resend-otp`, { phone });
            setSuccessMessage(res.data.message || 'OTP resent to your WhatsApp.');
            setResendCountdown(60);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to resend OTP.');
        } finally {
            setResendLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Start the exit animation on the card
            setCardExiting(true);

            // Small delay for card exit animation, then show skyline
            await new Promise(r => setTimeout(r, 500));
            setShowTransition(true);

            // Perform actual login
            await login(loginPhone, password);
            // Auth context will re-render App to dashboard
        } catch (err: any) {
            setShowTransition(false);
            setCardExiting(false);
            setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
            setLoading(false);
        }
    };

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (forgotStep === 'phone') {
                const resp = await axios.post(`${API_BASE_URL}/auth/forgot-password`, { phone });
                setForgotStep('otp');
                setSuccessMessage(resp.data?.message || 'OTP sent to your WhatsApp number. Check your messages.');
            } else if (forgotStep === 'otp') {
                const res = await axios.post(`${API_BASE_URL}/auth/verify-reset-otp`, { phone, otp, newPassword });
                setSuccessMessage(res.data.message || 'Password reset successfully!');
                setForgotStep('done');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Partner sign-in: phone → WhatsApp OTP → verify. verify-otp sets the HttpOnly session cookie
    // (role:'partner'), so a reload lets AuthContext's /auth/me load the partner identity.
    const handlePartnerSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (partnerAuthMode === 'password') {
                await axios.post(`${API_BASE_URL}/agent/login-password`, { phone, password: partnerPassword }, { withCredentials: true });
                window.location.reload();
                return;
            }
            if (partnerStep === 'phone') {
                await axios.post(`${API_BASE_URL}/agent/login-otp`, { phone }, { withCredentials: true });
                setPartnerStep('otp');
                setSuccessMessage('OTP sent to your WhatsApp.');
            } else {
                await axios.post(`${API_BASE_URL}/agent/verify-otp`, { phone, otp }, { withCredentials: true });
                window.location.reload();
                return;
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Sign-in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Show the skyline transition overlay
    if (showTransition) {
        return <SkylineOverlay onDone={() => {}} />;
    }

    return (
        <div
            ref={containerRef}
            className="rp-login"
            role="main"
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: '100dvh',
                background: 'var(--bg-secondary)',
                fontFamily: 'inherit',
                position: 'relative', overflowY: 'auto',
                padding: '32px 16px', boxSizing: 'border-box' as const,
            }}
        >
            {/* Login Card */}
            <div
                className={cardExiting ? 'login-transitioning' : ''}
                style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: 'var(--rp-radius)',
                    padding: window.innerWidth < 768 ? '28px 20px 24px' : '44px 40px 36px',
                    width: window.innerWidth < 768 ? '100%' : '420px',
                    maxWidth: '420px',
                    boxShadow: 'var(--rp-shadow-near)',
                    border: '1px solid var(--border-secondary)',
                    position: 'relative',
                    zIndex: 1,
                    boxSizing: 'border-box' as const,
                }}
            >
                {/* Logo + Title */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <div className="login-logo login-logo-float" style={{ marginBottom: '12px' }}>
                        <img src={realtyPanditLogo} alt="Realty Pandit logo" width={160} height={90} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }} />
                    </div>
                    <h1 className="login-logo" style={{
                        color: 'var(--text-primary)', fontSize: '28px', fontWeight: 700, margin: '0 0 6px',
                        letterSpacing: '-0.02em',
                    }}>
                        Realty Pandit
                    </h1>
                    <p className="login-subtitle" style={{
                        color: 'var(--text-secondary)', margin: 0, fontSize: '14px',
                    }}>
                        {mode === 'forgot' ? 'Reset Your Password' : mode === 'partner' ? 'Partner Agent Sign-in' : 'Management Dashboard'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div role="alert" className="login-error" style={{
                        backgroundColor: 'var(--rp-danger-bg)', color: 'var(--rp-danger-text)', padding: '12px 16px',
                        borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
                        border: '1px solid var(--rp-danger-line)',
                    }}>
                        {error}
                    </div>
                )}

                {/* Success */}
                {successMessage && (
                    <div className="login-error" style={{
                        backgroundColor: 'var(--rp-success-bg)', color: 'var(--rp-success-text)', padding: '12px 16px',
                        borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
                        border: '1px solid var(--rp-success-line)',
                    }}>
                        {successMessage}
                    </div>
                )}

                {/* LOGIN FORM */}
                {mode === 'login' && (
                    <form onSubmit={handleSubmit}>
                        <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                            <label htmlFor="rp-login-phone" style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                Phone Number
                            </label>
                            <input
                                id="rp-login-phone" autoComplete="username" aria-describedby="rp-login-phone-hint"
                                type="tel" value={loginPhone} onChange={e => setLoginPhone(e.target.value)}
                                required
                                className="login-input"
                                placeholder="e.g. 9876543210"
                                style={{
                                    width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-input)',
                                    border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)', color: 'var(--text-primary)',
                                    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                            <p id="rp-login-phone-hint" className="rp-hint" style={{ marginTop: 8 }}>Use the mobile number registered to your staff account.</p>
                        </div>

                        <div className="login-form-field-2" style={{ marginBottom: '12px' }}>
                            <label htmlFor="rp-login-password" style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                Password
                            </label>
                            <input
                                id="rp-login-password" autoComplete="current-password"
                                type="password" value={password} onChange={e => setPassword(e.target.value)}
                                required minLength={6}
                                className="login-input"
                                placeholder="Enter your password"
                                style={{
                                    width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-input)',
                                    border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)', color: 'var(--text-primary)',
                                    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div className="login-form-field-3" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <button
                                type="button"
                                onClick={() => { setMode('partner'); setError(''); setSuccessMessage(''); setPartnerStep('phone'); setOtp(''); }}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-link)',
                                    cursor: 'pointer', fontSize: '13px', padding: 0, fontWeight: 500,
                                }}
                            >
                                Partner agent? Sign in with OTP
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); setForgotStep('phone'); }}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-link)',
                                    cursor: 'pointer', fontSize: '13px', padding: 0, fontWeight: 500,
                                }}
                            >
                                Forgot Password?
                            </button>
                        </div>

                        <button
                            type="submit" disabled={loading}
                            className={`login-btn ${loading ? 'login-btn-shimmer' : ''}`}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: 'var(--blue-600)',
                                color: 'var(--surface-white)', border: 'none', borderRadius: 'var(--radius-control)', fontSize: '15px',
                                fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                                opacity: loading ? 0.85 : 1,
                                transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                        >
                            {loading ? 'Signing in...' : 'Login'}
                        </button>

                        {/* Divider */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0' }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>or</span>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                        </div>

                        {/* Sign in with Google (P1b) — only works for members who
                            already linked Google from their profile. */}
                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)', border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)',
                                fontSize: '14px', fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                                <path fill="var(--brand-google-blue)" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                                <path fill="var(--brand-google-green)" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                                <path fill="var(--brand-google-yellow)" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                                <path fill="var(--brand-google-red)" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                            </svg>
                            Sign in with Google
                        </button>
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '12px', marginBottom: 0 }}>
                            Works only after you've connected Google in your profile.
                        </p>
                    </form>
                )}

                {/* PARTNER AGENT SIGN-IN (WhatsApp OTP) */}
                {mode === 'partner' && (
                    <form onSubmit={handlePartnerSubmit}>
                        {/* Phone is always needed for OTP + password sign-in */}
                        {(partnerAuthMode === 'password' || partnerStep === 'phone') && (
                            <div style={{ marginBottom: '16px' }}>
                                <label htmlFor="rp-partner-phone" style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>
                                    Your registered WhatsApp number
                                </label>
                                <input
                                    id="rp-partner-phone"
                                    type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                    placeholder="9876543210" required autoFocus
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '15px',
                                        border: '1px solid var(--control-line)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}

                        {partnerAuthMode === 'password' && (
                            <div style={{ marginBottom: '16px' }}>
                                <label htmlFor="rp-partner-password" style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>
                                    Password
                                </label>
                                <input
                                    id="rp-partner-password"
                                    type="password" value={partnerPassword} onChange={e => setPartnerPassword(e.target.value)}
                                    placeholder="Enter your password" required
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '15px',
                                        border: '1px solid var(--control-line)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}

                        {partnerAuthMode === 'otp' && partnerStep === 'otp' && (
                            <div style={{ marginBottom: '16px' }}>
                                <label htmlFor="rp-partner-otp" style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>
                                    Enter the OTP sent to WhatsApp
                                </label>
                                <input
                                    id="rp-partner-otp"
                                    type="tel" inputMode="numeric" value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                    placeholder="••••••" maxLength={6} required autoFocus
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: '10px',
                                        fontSize: '20px', letterSpacing: '6px', textAlign: 'center',
                                        border: '1px solid var(--control-line)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}

                        <button type="submit" disabled={loading} className="login-btn" style={{ width: '100%' }}>
                            {loading ? 'Please wait…'
                                : partnerAuthMode === 'password' ? 'Sign in'
                                    : partnerStep === 'phone' ? 'Send OTP' : 'Verify & Sign in'}
                        </button>

                        {/* Switch between OTP and password */}
                        <button
                            type="button"
                            onClick={() => {
                                setPartnerAuthMode(m => (m === 'otp' ? 'password' : 'otp'));
                                setError(''); setSuccessMessage(''); setOtp(''); setPartnerPassword(''); setPartnerStep('phone');
                            }}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer',
                                fontSize: '13px', padding: '12px 0 0', width: '100%', fontWeight: 500,
                            }}
                        >
                            {partnerAuthMode === 'otp' ? 'Sign in with password instead' : 'Sign in with WhatsApp OTP instead'}
                        </button>

                        {/* Google — works for partners whose Google email is on their partner record */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>or</span>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
                        </div>
                        <button type="button" onClick={handleGoogleSignIn} className="google-btn" style={{ width: '100%' }}>
                            Sign in with Google
                        </button>

                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); setOtp(''); setPartnerPassword(''); setPartnerStep('phone'); setPartnerAuthMode('otp'); }}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer',
                                fontSize: '13px', padding: '12px 0 0', width: '100%', fontWeight: 500,
                            }}
                        >
                            ← Back to team login
                        </button>
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '12px', marginBottom: 0 }}>
                            Not registered? Contact your Realty Pandit coordinator.
                        </p>
                    </form>
                )}

                {/* FORGOT PASSWORD FORM */}
                {mode === 'forgot' && forgotStep !== 'done' && (
                    <form onSubmit={handleForgotSubmit}>
                        {forgotStep === 'phone' && (
                            <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                                <label htmlFor="rp-reset-phone" style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                                    WhatsApp Phone Number
                                </label>
                                <input
                                    id="rp-reset-phone"
                                    type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                    placeholder="e.g. 9876543210"
                                    required
                                    className="login-input"
                                    style={{
                                        width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-input)',
                                        border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)', color: 'var(--text-primary)',
                                        fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                                    We'll send a 6-digit OTP to this number on WhatsApp.
                                </p>
                            </div>
                        )}

                        {forgotStep === 'otp' && (
                            <>
                                <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                                    <label htmlFor="rp-reset-otp" style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                                        Enter OTP
                                    </label>
                                    <input
                                        id="rp-reset-otp"
                                        type="text" value={otp} onChange={e => setOtp(e.target.value)}
                                        placeholder="6-digit OTP" maxLength={6}
                                        required
                                        className="login-input"
                                        style={{
                                            width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-input)',
                                            border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)', color: 'var(--text-primary)',
                                            fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                            letterSpacing: '4px', textAlign: 'center',
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={handleResendOtp}
                                            disabled={resendCountdown > 0 || resendLoading}
                                            style={{
                                                background: 'none', border: 'none', padding: 0,
                                                color: resendCountdown > 0 ? 'var(--text-muted)' : 'var(--text-link)',
                                                cursor: resendCountdown > 0 ? 'default' : 'pointer',
                                                fontSize: '13px', fontWeight: 500,
                                            }}
                                        >
                                            {resendLoading ? 'Sending...' : resendCountdown > 0 ? `Resend OTP (${resendCountdown}s)` : 'Resend OTP'}
                                        </button>
                                    </div>
                                </div>
                                <div className="login-form-field-2" style={{ marginBottom: '18px' }}>
                                    <label htmlFor="rp-reset-password" style={{ color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                                        New Password
                                    </label>
                                    <input
                                        id="rp-reset-password"
                                        type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Min 6 characters" minLength={6}
                                        required
                                        className="login-input"
                                        style={{
                                            width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-input)',
                                            border: '1px solid var(--control-line)', borderRadius: 'var(--radius-control)', color: 'var(--text-primary)',
                                            fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        <button
                            type="submit" disabled={loading}
                            className={`login-btn ${loading ? 'login-btn-shimmer' : ''}`}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: 'var(--blue-600)',
                                color: 'var(--surface-white)', border: 'none', borderRadius: 'var(--radius-control)', fontSize: '15px',
                                fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                                opacity: loading ? 0.85 : 1,
                                transition: 'transform 0.15s',
                            }}
                        >
                            {loading ? 'Please wait...' : forgotStep === 'phone' ? 'Send OTP' : 'Reset Password'}
                        </button>
                    </form>
                )}

                {mode === 'forgot' && forgotStep === 'done' && (
                    <p style={{ color: 'var(--rp-success-text)', textAlign: 'center', fontSize: '14px' }}>
                        Redirecting to login...
                    </p>
                )}

                {/* Footer link */}
                <div className="login-footer" style={{ textAlign: 'center', marginTop: '24px' }}>
                    {mode === 'forgot' ? (
                        <button
                            onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); setForgotStep('phone'); setPhone(''); setOtp(''); setNewPassword(''); }}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-link)',
                                cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                            }}
                        >
                            Back to Login
                        </button>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
                            Powered by Realty Pandit AI
                        </p>
                    )}
                </div>
            </div>

        </div>
    );
}
