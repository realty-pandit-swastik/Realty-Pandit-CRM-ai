
import { useState, useEffect } from 'react';
import { validateSetupToken, setupPassword } from '../api/client';

export function SetupPasswordPage() {
    const [step, setStep] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';

    useEffect(() => {
        if (!token) {
            setError('No setup token provided. Please use the link sent to your WhatsApp.');
            setStep('error');
            return;
        }

        validateSetupToken(token)
            .then(data => {
                if (data.valid) {
                    setName(data.name || '');
                    setEmail(data.email || '');
                    setStep('form');
                } else {
                    setError(data.error || 'This setup link has expired or is invalid. Please contact your admin.');
                    setStep('error');
                }
            })
            .catch(() => {
                setError('Unable to validate setup link. Please try again or contact your admin.');
                setStep('error');
            });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            await setupPassword(token, password);
            setStep('success');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to set password. The link may have expired.');
        } finally {
            setSubmitting(false);
        }
    };

    const goToLogin = () => {
        window.location.href = '/';
    };

    const inputStyle = {
        width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-secondary)', borderRadius: '8px', color: 'var(--text-primary)',
        fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
    };

    const labelStyle = { color: 'var(--text-secondary)', fontSize: '13px', display: 'block', marginBottom: '6px' };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', backgroundColor: 'var(--bg-primary)', fontFamily: 'Inter, sans-serif',
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '40px',
                width: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 style={{ color: 'var(--text-primary)', fontSize: '28px', margin: '0 0 8px' }}>
                        Realty Pandit
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
                        Set Up Your Password
                    </p>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', padding: '10px 14px',
                        borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
                    }}>
                        {error}
                    </div>
                )}

                {/* LOADING */}
                {step === 'loading' && (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '14px' }}>
                        Validating your setup link...
                    </p>
                )}

                {/* FORM */}
                {step === 'form' && (
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Name</label>
                            <input type="text" value={name} readOnly style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Email</label>
                            <input type="email" value={email} readOnly style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>New Password</label>
                            <input
                                type="password" value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="Min 6 characters" minLength={6}
                                required style={inputStyle}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Confirm Password</label>
                            <input
                                type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password" minLength={6}
                                required style={inputStyle}
                            />
                        </div>

                        <button
                            type="submit" disabled={submitting}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: '#3b82f6',
                                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px',
                                fontWeight: 600, cursor: submitting ? 'wait' : 'pointer',
                                opacity: submitting ? 0.7 : 1,
                            }}
                        >
                            {submitting ? 'Setting password...' : 'Set Password & Continue'}
                        </button>
                    </form>
                )}

                {/* SUCCESS */}
                {step === 'success' && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            backgroundColor: 'var(--success-bg)', color: 'var(--success-text)', padding: '14px',
                            borderRadius: '8px', marginBottom: '20px', fontSize: '14px',
                        }}>
                            Password set successfully! You can now login.
                        </div>
                        <button
                            onClick={goToLogin}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: '#3b82f6',
                                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px',
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Go to Login
                        </button>
                    </div>
                )}

                {/* ERROR */}
                {step === 'error' && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                            Contact your admin to get a new setup link.
                        </p>
                        <button
                            onClick={goToLogin}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-link)',
                                cursor: 'pointer', fontSize: '13px', marginTop: '8px',
                            }}
                        >
                            Go to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
