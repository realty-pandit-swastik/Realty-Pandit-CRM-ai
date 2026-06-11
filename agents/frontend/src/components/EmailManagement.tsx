/**
 * Email Management Component - Super Admin Dashboard
 * Create/Modify/Reset emails with Panditji AI integration
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Email {
    id: string;
    from_email: string;
    to_email: string;
    subject: string;
    body: string;
    direction: string;
    status: string;
    ai_processed: boolean;
    ai_response?: string;
    created_at: string;
    contact?: {
        phone_number: string;
        name?: string;
        email?: string;
    };
}

export function EmailManagement() {
    const { hasPermission } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [showComposeModal, setShowComposeModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'inbox' | 'sent'>('all');

    // Compose email form
    const [composeForm, setComposeForm] = useState({
        to: '',
        subject: '',
        body: '',
        generateWithAI: false
    });

    // Bulk email form
    const [bulkForm, setBulkForm] = useState({
        recipients: '',
        subject: '',
        body: '',
        generateWithAI: false
    });

    useEffect(() => {
        loadEmails();
    }, [page, activeTab]);

    const loadEmails = async () => {
        try {
            setLoading(true);
            let url = `/api/email/all?page=${page}&limit=20`;
            if (activeTab === 'inbox') url += '&direction=inbound';
            else if (activeTab === 'sent') url += '&direction=outbound';
            const response = await client.get(url);
            // Guard: a missing/renamed pagination object used to throw here and
            // blank the whole tab even when emails came back fine (T9a, 2026-05-16).
            setEmails(Array.isArray(response.data?.emails) ? response.data.emails : []);
            setTotal(response.data?.pagination?.total ?? response.data?.emails?.length ?? 0);
        } catch (error) {
            console.error('Error loading emails:', error);
            showToast('Failed to load emails', 'error');
        } finally {
            setLoading(false);
        }
    };

    const searchEmails = async () => {
        if (!searchQuery.trim()) {
            loadEmails();
            return;
        }

        try {
            setLoading(true);
            const response = await client.get(`/api/email/search?q=${encodeURIComponent(searchQuery)}`);
            setEmails(response.data.emails);
            setTotal(response.data.count);
        } catch (error) {
            console.error('Error searching emails:', error);
            showToast('Failed to search emails', 'error');
        } finally {
            setLoading(false);
        }
    };

    const sendEmail = async () => {
        try {
            if (!composeForm.to || !composeForm.subject) {
                showToast('Please fill in recipient and subject', 'info');
                return;
            }

            await client.post('/api/email/send', composeForm);
            showToast('Email sent successfully!', 'success');
            setShowComposeModal(false);
            setComposeForm({ to: '', subject: '', body: '', generateWithAI: false });
            loadEmails();
        } catch (error: any) {
            console.error('Error sending email:', error);
            showToast('Failed to send email: ' + (error.response?.data?.error || error.message), 'error');
        }
    };

    const sendBulkEmail = async () => {
        try {
            if (!bulkForm.recipients || !bulkForm.subject) {
                showToast('Please fill in recipients and subject', 'info');
                return;
            }

            const recipientsList = bulkForm.recipients
                .split('\n')
                .map(r => r.trim())
                .filter(r => r);

            const response = await client.post('/api/email/bulk-send', {
                recipients: recipientsList,
                subject: bulkForm.subject,
                body: bulkForm.body,
                generateWithAI: bulkForm.generateWithAI
            });

            showToast(`Bulk email sent! Success: ${response.data.success}, Failed: ${response.data.failed}`, 'success');
            setShowBulkModal(false);
            setBulkForm({ recipients: '', subject: '', body: '', generateWithAI: false });
            loadEmails();
        } catch (error: any) {
            console.error('Error sending bulk email:', error);
            showToast('Failed to send bulk email: ' + (error.response?.data?.error || error.message), 'error');
        }
    };

    const deleteEmail = async (id: string) => {
        const ok = await confirm('Are you sure you want to delete this email?');
        if (!ok) return;

        try {
            await client.delete(`/api/email/${id}`);
            showToast('Email deleted', 'success');
            loadEmails();
        } catch (error: any) {
            console.error('Error deleting email:', error);
            showToast('Failed to delete email: ' + (error.response?.data?.error || error.message), 'error');
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'sent': return '#22c55e';
            case 'delivered': return '#3b82f6';
            case 'failed': return '#ef4444';
            case 'pending': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', height: '100vh' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--bg-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '24px', fontWeight: 600 }}>📧 Email Management</h2>
                        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '14px' }}>
                            Powered by Panditji AI • Total: {total} emails
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {/* Inbox / Sent / All Tabs */}
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
                            {(['all', 'inbox', 'sent'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => { setActiveTab(tab); setPage(1); }}
                                    style={{
                                        backgroundColor: activeTab === tab ? '#3b82f6' : 'transparent',
                                        color: activeTab === tab ? 'white' : 'var(--text-secondary)',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: activeTab === tab ? 600 : 400,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {tab === 'all' ? 'All' : tab === 'inbox' ? 'Inbox' : 'Sent'}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowComposeModal(true)}
                            style={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '10px 20px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500
                            }}
                        >
                            ✉️ Compose Email
                        </button>
                        {hasPermission('manage_agents') && (
                            <button
                                onClick={() => setShowBulkModal(true)}
                                style={{
                                    backgroundColor: '#8b5cf6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                📨 Bulk Send
                            </button>
                        )}
                    </div>
                </div>

                {/* Search Bar */}
                <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchEmails()}
                        placeholder="Search emails by sender, recipient, subject, or content..."
                        style={{
                            flex: 1,
                            padding: '10px 16px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-secondary)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '14px'
                        }}
                    />
                    <button
                        onClick={searchEmails}
                        style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '10px 24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        🔍 Search
                    </button>
                    <button
                        onClick={() => { setSearchQuery(''); loadEmails(); }}
                        style={{
                            backgroundColor: 'var(--border-secondary)',
                            color: 'var(--text-secondary)',
                            border: 'none',
                            padding: '10px 24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Email List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        Loading emails...
                    </div>
                ) : emails.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No emails found
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {emails.map((email) => (
                            <div
                                key={email.id}
                                style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => setSelectedEmail(email)}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                            <span style={{
                                                backgroundColor: email.direction === 'inbound' ? '#3b82f6' : '#8b5cf6',
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600
                                            }}>
                                                {email.direction === 'inbound' ? '📥 IN' : '📤 OUT'}
                                            </span>
                                            <span style={{
                                                backgroundColor: getStatusColor(email.status),
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600
                                            }}>
                                                {email.status.toUpperCase()}
                                            </span>
                                            {email.ai_processed && (
                                                <span style={{
                                                    backgroundColor: '#10b981',
                                                    color: 'white',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600
                                                }}>
                                                    🤖 AI
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
                                            {email.subject || '(No Subject)'}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                            <span style={{ fontWeight: 500 }}>From:</span> {email.from_email}
                                            <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>→</span>
                                            <span style={{ fontWeight: 500 }}>To:</span> {email.to_email}
                                        </div>
                                        {email.contact && (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                                Contact: {email.contact.name || email.contact.phone_number}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                                            {formatDate(email.created_at)}
                                        </div>
                                        {hasPermission('manage_agents') && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteEmail(email.id);
                                                }}
                                                style={{
                                                    backgroundColor: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '4px 12px',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px'
                                                }}
                                            >
                                                🗑️ Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {email.body && (
                                    <div style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: '14px',
                                        borderTop: '1px solid var(--border-secondary)',
                                        paddingTop: '12px',
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '100px',
                                        overflow: 'hidden'
                                    }}>
                                        {email.body.substring(0, 200)}{email.body.length > 200 ? '...' : ''}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{
                            backgroundColor: page === 1 ? 'var(--bg-secondary)' : '#3b82f6',
                            color: page === 1 ? 'var(--text-muted)' : 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: page === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        ← Previous
                    </button>
                    <span style={{ color: 'var(--text-secondary)', padding: '8px 16px', fontSize: '14px' }}>
                        Page {page} of {Math.ceil(total / 20)}
                    </span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={page >= Math.ceil(total / 20)}
                        style={{
                            backgroundColor: page >= Math.ceil(total / 20) ? 'var(--bg-secondary)' : '#3b82f6',
                            color: page >= Math.ceil(total / 20) ? 'var(--text-muted)' : 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: page >= Math.ceil(total / 20) ? 'not-allowed' : 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Next →
                    </button>
                </div>
            </div>

            {/* Compose Modal */}
            {showComposeModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        padding: '24px',
                        width: '600px',
                        maxHeight: '80vh',
                        overflowY: 'auto'
                    }}>
                        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 20px 0', fontSize: '20px' }}>✉️ Compose Email</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                To (email address):
                            </label>
                            <input
                                type="email"
                                value={composeForm.to}
                                onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
                                placeholder="customer@example.com"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                Subject:
                            </label>
                            <input
                                type="text"
                                value={composeForm.subject}
                                onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                                placeholder="Email subject"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                Message:
                            </label>
                            <textarea
                                value={composeForm.body}
                                onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                                placeholder="Email content..."
                                rows={8}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={composeForm.generateWithAI}
                                    onChange={(e) => setComposeForm({ ...composeForm, generateWithAI: e.target.checked })}
                                />
                                🤖 Generate content with Panditji AI
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={sendEmail}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                📤 Send Email
                            </button>
                            <button
                                onClick={() => {
                                    setShowComposeModal(false);
                                    setComposeForm({ to: '', subject: '', body: '', generateWithAI: false });
                                }}
                                style={{
                                    backgroundColor: 'var(--border-secondary)',
                                    color: 'var(--text-secondary)',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Send Modal */}
            {showBulkModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        padding: '24px',
                        width: '600px',
                        maxHeight: '80vh',
                        overflowY: 'auto'
                    }}>
                        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 20px 0', fontSize: '20px' }}>📨 Bulk Email Send</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                Recipients (one email per line):
                            </label>
                            <textarea
                                value={bulkForm.recipients}
                                onChange={(e) => setBulkForm({ ...bulkForm, recipients: e.target.value })}
                                placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                                rows={6}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                Subject:
                            </label>
                            <input
                                type="text"
                                value={bulkForm.subject}
                                onChange={(e) => setBulkForm({ ...bulkForm, subject: e.target.value })}
                                placeholder="Email subject"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                Message:
                            </label>
                            <textarea
                                value={bulkForm.body}
                                onChange={(e) => setBulkForm({ ...bulkForm, body: e.target.value })}
                                placeholder="Email content..."
                                rows={8}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--border-secondary)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={bulkForm.generateWithAI}
                                    onChange={(e) => setBulkForm({ ...bulkForm, generateWithAI: e.target.checked })}
                                />
                                🤖 Generate content with Panditji AI
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={sendBulkEmail}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#8b5cf6',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                📨 Send to All
                            </button>
                            <button
                                onClick={() => {
                                    setShowBulkModal(false);
                                    setBulkForm({ recipients: '', subject: '', body: '', generateWithAI: false });
                                }}
                                style={{
                                    backgroundColor: 'var(--border-secondary)',
                                    color: 'var(--text-secondary)',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Detail Modal */}
            {selectedEmail && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}
                    onClick={() => setSelectedEmail(null)}
                >
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        padding: '24px',
                        width: '700px',
                        maxHeight: '80vh',
                        overflowY: 'auto'
                    }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '20px' }}>
                                {selectedEmail.subject || '(No Subject)'}
                            </h3>
                            <button
                                onClick={() => setSelectedEmail(null)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '0 8px'
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px' }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                                <strong>From:</strong> {selectedEmail.from_email}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                                <strong>To:</strong> {selectedEmail.to_email}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                <strong>Date:</strong> {formatDate(selectedEmail.created_at)}
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                {selectedEmail.body || '(No content)'}
                            </div>
                        </div>

                        {selectedEmail.ai_processed && selectedEmail.ai_response && (
                            <div style={{
                                backgroundColor: 'var(--bg-primary)',
                                border: '2px solid #10b981',
                                borderRadius: '8px',
                                padding: '16px',
                                marginTop: '16px'
                            }}>
                                <div style={{ color: '#10b981', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                                    🤖 Panditji AI Analysis:
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                    {selectedEmail.ai_response}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
