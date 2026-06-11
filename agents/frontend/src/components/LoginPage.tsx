
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../lib/api';

// ─── Skyline Buildings SVG (real estate themed login transition) ───
function SkylineOverlay({ onDone }: { onDone: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onDone, 2400);
        return () => clearTimeout(timer);
    }, [onDone]);

    const buildings = [
        { x: 0, w: 60, h: 180, delay: 0, color: '#1e3a5f' },
        { x: 55, w: 45, h: 260, delay: 0.08, color: '#2563eb' },
        { x: 95, w: 70, h: 200, delay: 0.15, color: '#1e40af' },
        { x: 160, w: 50, h: 300, delay: 0.1, color: '#3b82f6' },
        { x: 205, w: 65, h: 230, delay: 0.2, color: '#1d4ed8' },
        { x: 265, w: 55, h: 280, delay: 0.05, color: '#2563eb' },
        { x: 315, w: 70, h: 190, delay: 0.18, color: '#1e3a5f' },
        { x: 380, w: 50, h: 320, delay: 0.12, color: '#3b82f6' },
        { x: 425, w: 60, h: 240, delay: 0.22, color: '#1e40af' },
        { x: 480, w: 55, h: 270, delay: 0.07, color: '#1d4ed8' },
        { x: 530, w: 70, h: 210, delay: 0.16, color: '#2563eb' },
        { x: 595, w: 45, h: 290, delay: 0.03, color: '#1e3a5f' },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'linear-gradient(180deg, #0c1929 0%, #0f172a 40%, #1a1a2e 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
        }}>
            {/* Stars */}
            {Array.from({ length: 20 }).map((_, i) => (
                <div key={`star-${i}`} style={{
                    position: 'absolute',
                    width: Math.random() > 0.5 ? '2px' : '1px',
                    height: Math.random() > 0.5 ? '2px' : '1px',
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    top: `${Math.random() * 50}%`,
                    left: `${Math.random() * 100}%`,
                    opacity: 0.3 + Math.random() * 0.5,
                    animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
                    animationDelay: `${Math.random() * 2}s`,
                }} />
            ))}

            {/* Welcome text */}
            <div style={{
                animation: 'bounceIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                textAlign: 'center', marginBottom: '60px', zIndex: 2,
            }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏠</div>
                <h1 style={{
                    color: '#f8fafc', fontSize: '32px', fontWeight: 700, margin: '0 0 8px',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    Welcome to Realty Pandit
                </h1>
                <p style={{
                    color: '#94a3b8', fontSize: '15px', margin: 0,
                    animation: 'slideUp 0.5s ease-out 0.4s both',
                }}>
                    Loading your dashboard...
                </p>
                {/* Loading dots */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px' }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6',
                            animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                    ))}
                </div>
            </div>

            {/* Skyline at bottom */}
            <svg
                viewBox="0 0 640 340"
                style={{
                    position: 'absolute', bottom: 0, width: '100%', maxHeight: '45vh',
                }}
                preserveAspectRatio="xMidYMax meet"
            >
                {buildings.map((b, i) => (
                    <g key={i}>
                        <rect
                            x={b.x} y={340 - b.h} width={b.w} height={b.h}
                            fill={b.color} rx={2}
                            className="building-bar"
                            style={{ animationDelay: `${b.delay + 0.3}s` }}
                        />
                        {/* Windows */}
                        {Array.from({ length: Math.floor(b.h / 30) }).map((_, wi) => (
                            Array.from({ length: Math.floor(b.w / 18) }).map((_, wj) => (
                                <rect
                                    key={`w-${wi}-${wj}`}
                                    x={b.x + 8 + wj * 16}
                                    y={340 - b.h + 12 + wi * 28}
                                    width={8} height={12} rx={1}
                                    fill={Math.random() > 0.4 ? '#fbbf24' : '#1e293b'}
                                    opacity={Math.random() > 0.4 ? 0.8 : 0.3}
                                    className="building-bar"
                                    style={{ animationDelay: `${b.delay + 0.5 + wi * 0.05}s` }}
                                />
                            ))
                        ))}
                    </g>
                ))}
                {/* Ground line */}
                <rect x={0} y={338} width={640} height={2} fill="#334155" />
            </svg>
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
    const [mode, setMode] = useState<'login' | 'forgot'>('login');
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

    // Show the skyline transition overlay
    if (showTransition) {
        return <SkylineOverlay onDone={() => {}} />;
    }

    return (
        <div
            ref={containerRef}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh',
                background: 'linear-gradient(135deg, #0c1929 0%, #0f172a 50%, #1a1a2e 100%)',
                fontFamily: 'Inter, sans-serif',
                position: 'relative', overflow: 'hidden',
                padding: '0 16px', boxSizing: 'border-box' as const,
            }}
        >
            {/* Subtle background grid */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `
                    linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px',
            }} />

            {/* Floating particles */}
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={`p-${i}`}
                    className="login-particle"
                    style={{
                        bottom: '-20px',
                        left: `${10 + i * 15}%`,
                        width: '4px', height: '4px',
                        backgroundColor: i % 2 === 0 ? '#3b82f6' : '#f59e0b',
                        borderRadius: '50%',
                        animationDuration: `${6 + i * 2}s`,
                        animationDelay: `${i * 1.5}s`,
                        opacity: 0.4,
                    }}
                />
            ))}

            {/* Login Card */}
            <div
                className={cardExiting ? 'login-transitioning' : ''}
                style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '16px',
                    padding: window.innerWidth < 768 ? '28px 20px 24px' : '44px 40px 36px',
                    width: window.innerWidth < 768 ? '100%' : '420px',
                    maxWidth: '420px',
                    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), 0 0 80px rgba(59, 130, 246, 0.08)',
                    border: '1px solid #334155',
                    position: 'relative',
                    zIndex: 1,
                    boxSizing: 'border-box' as const,
                }}
            >
                {/* Logo + Title */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <div className="login-logo login-logo-float" style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '52px', display: 'inline-block' }}>🏠</span>
                    </div>
                    <h1 className="login-logo" style={{
                        color: '#f8fafc', fontSize: '28px', fontWeight: 700, margin: '0 0 6px',
                        letterSpacing: '-0.02em',
                    }}>
                        Realty Pandit
                    </h1>
                    <p className="login-subtitle" style={{
                        color: '#64748b', margin: 0, fontSize: '14px',
                    }}>
                        {mode === 'forgot' ? 'Reset Your Password' : 'Management Dashboard'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="login-error" style={{
                        backgroundColor: '#7f1d1d', color: '#fca5a5', padding: '10px 14px',
                        borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
                        border: '1px solid #991b1b',
                    }}>
                        {error}
                    </div>
                )}

                {/* Success */}
                {successMessage && (
                    <div className="login-error" style={{
                        backgroundColor: '#14532d', color: '#86efac', padding: '10px 14px',
                        borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
                        border: '1px solid #166534',
                    }}>
                        {successMessage}
                    </div>
                )}

                {/* LOGIN FORM */}
                {mode === 'login' && (
                    <form onSubmit={handleSubmit}>
                        <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                Phone Number
                            </label>
                            <input
                                type="tel" value={loginPhone} onChange={e => setLoginPhone(e.target.value)}
                                required
                                className="login-input"
                                placeholder="e.g. 9876543210"
                                style={{
                                    width: '100%', padding: '11px 14px', backgroundColor: '#0f172a',
                                    border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc',
                                    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div className="login-form-field-2" style={{ marginBottom: '12px' }}>
                            <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                Password
                            </label>
                            <input
                                type="password" value={password} onChange={e => setPassword(e.target.value)}
                                required minLength={6}
                                className="login-input"
                                placeholder="Enter your password"
                                style={{
                                    width: '100%', padding: '11px 14px', backgroundColor: '#0f172a',
                                    border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc',
                                    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div className="login-form-field-3" style={{ textAlign: 'right', marginBottom: '20px' }}>
                            <button
                                type="button"
                                onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); setForgotStep('phone'); }}
                                style={{
                                    background: 'none', border: 'none', color: '#f59e0b',
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
                                width: '100%', padding: '13px', backgroundColor: '#3b82f6',
                                color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px',
                                fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                                opacity: loading ? 0.85 : 1,
                                transition: 'transform 0.15s, box-shadow 0.15s',
                                boxShadow: '0 2px 12px rgba(59, 130, 246, 0.3)',
                            }}
                            onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4)'; } }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(59, 130, 246, 0.3)'; }}
                        >
                            {loading ? 'Signing in...' : 'Login'}
                        </button>

                        {/* Divider */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0' }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
                            <span style={{ color: '#64748b', fontSize: '12px' }}>or</span>
                            <div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
                        </div>

                        {/* Sign in with Google (P1b) — only works for members who
                            already linked Google from their profile. */}
                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: '#fff',
                                color: '#1f2937', border: '1px solid #e5e7eb', borderRadius: '10px',
                                fontSize: '14px', fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                            </svg>
                            Sign in with Google
                        </button>
                        <p style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', marginTop: '10px', marginBottom: 0 }}>
                            Works only after you've connected Google in your profile.
                        </p>
                    </form>
                )}

                {/* FORGOT PASSWORD FORM */}
                {mode === 'forgot' && forgotStep !== 'done' && (
                    <form onSubmit={handleForgotSubmit}>
                        {forgotStep === 'phone' && (
                            <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                    WhatsApp Phone Number
                                </label>
                                <input
                                    type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                    placeholder="e.g. 9876543210"
                                    required
                                    className="login-input"
                                    style={{
                                        width: '100%', padding: '11px 14px', backgroundColor: '#0f172a',
                                        border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc',
                                        fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                                <p style={{ color: '#64748b', fontSize: '12px', marginTop: '6px' }}>
                                    We'll send a 6-digit OTP to this number on WhatsApp.
                                </p>
                            </div>
                        )}

                        {forgotStep === 'otp' && (
                            <>
                                <div className="login-form-field-1" style={{ marginBottom: '18px' }}>
                                    <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                        Enter OTP
                                    </label>
                                    <input
                                        type="text" value={otp} onChange={e => setOtp(e.target.value)}
                                        placeholder="6-digit OTP" maxLength={6}
                                        required
                                        className="login-input"
                                        style={{
                                            width: '100%', padding: '11px 14px', backgroundColor: '#0f172a',
                                            border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc',
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
                                                color: resendCountdown > 0 ? '#475569' : '#f59e0b',
                                                cursor: resendCountdown > 0 ? 'default' : 'pointer',
                                                fontSize: '13px', fontWeight: 500,
                                            }}
                                        >
                                            {resendLoading ? 'Sending...' : resendCountdown > 0 ? `Resend OTP (${resendCountdown}s)` : 'Resend OTP'}
                                        </button>
                                    </div>
                                </div>
                                <div className="login-form-field-2" style={{ marginBottom: '18px' }}>
                                    <label style={{ color: '#94a3b8', fontSize: '13px', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                                        New Password
                                    </label>
                                    <input
                                        type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Min 6 characters" minLength={6}
                                        required
                                        className="login-input"
                                        style={{
                                            width: '100%', padding: '11px 14px', backgroundColor: '#0f172a',
                                            border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc',
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
                                width: '100%', padding: '13px', backgroundColor: '#f59e0b',
                                color: '#0f172a', border: 'none', borderRadius: '10px', fontSize: '15px',
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
                    <p style={{ color: '#86efac', textAlign: 'center', fontSize: '14px' }}>
                        Redirecting to login...
                    </p>
                )}

                {/* Footer link */}
                <div className="login-footer" style={{ textAlign: 'center', marginTop: '24px' }}>
                    {mode === 'forgot' ? (
                        <button
                            onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); setForgotStep('phone'); setPhone(''); setOtp(''); setNewPassword(''); }}
                            style={{
                                background: 'none', border: 'none', color: '#60a5fa',
                                cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                            }}
                        >
                            Back to Login
                        </button>
                    ) : (
                        <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>
                            Powered by Realty Pandit AI
                        </p>
                    )}
                </div>
            </div>

            {/* Decorative bottom skyline (subtle) */}
            <svg
                viewBox="0 0 640 100"
                style={{
                    position: 'absolute', bottom: 0, width: '100%', height: '100px',
                    opacity: 0.15,
                }}
                preserveAspectRatio="xMidYMax meet"
            >
                <rect x={0} y={40} width={40} height={60} fill="#3b82f6" rx={1} />
                <rect x={45} y={20} width={30} height={80} fill="#1d4ed8" rx={1} />
                <rect x={80} y={50} width={50} height={50} fill="#2563eb" rx={1} />
                <rect x={135} y={10} width={35} height={90} fill="#3b82f6" rx={1} />
                <rect x={175} y={35} width={45} height={65} fill="#1e40af" rx={1} />
                <rect x={225} y={55} width={35} height={45} fill="#2563eb" rx={1} />
                <rect x={265} y={25} width={40} height={75} fill="#1d4ed8" rx={1} />
                <rect x={310} y={45} width={50} height={55} fill="#3b82f6" rx={1} />
                <rect x={365} y={15} width={30} height={85} fill="#1e40af" rx={1} />
                <rect x={400} y={40} width={45} height={60} fill="#2563eb" rx={1} />
                <rect x={450} y={55} width={35} height={45} fill="#3b82f6" rx={1} />
                <rect x={490} y={20} width={40} height={80} fill="#1d4ed8" rx={1} />
                <rect x={535} y={35} width={50} height={65} fill="#2563eb" rx={1} />
                <rect x={590} y={50} width={50} height={50} fill="#1e40af" rx={1} />
            </svg>
        </div>
    );
}
