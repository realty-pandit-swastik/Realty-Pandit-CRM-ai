import React, { useState, useCallback, useRef } from 'react';
import PhoneInput from './PhoneInput';
import { normalizePhoneInput } from '../lib/phone';
import { identifyContactByPhone, ensureContact } from '../api/client';

export interface SelectedContact {
    phone: string;
    name: string;
    role: string; // Workflow user_role value: PROPERTY_OWNER | AGENT_DEALER | FINANCER | BUILDER
    isNew: boolean;
    contactType?: string; // Raw contact_type from DB
    sourceId?: string;
}

interface ContactSearchFieldProps {
    onContactSelected: (contact: SelectedContact) => void;
    label?: string;
    /** @deprecated Phone-only mode; placeholder is fixed and this prop is ignored */
    placeholder?: string;
}

// Map identified contact_type to workflow user_role values
function mapToWorkflowRole(contactType: string, identifiedType?: string): string {
    if (identifiedType) {
        switch (identifiedType) {
            case 'MANAGEMENT': return 'AGENT_DEALER';
            case 'PARTNER_AGENT': return 'AGENT_DEALER';
            case 'REAL_ESTATE_BUILDER': return 'BUILDER';
        }
    }
    switch (contactType) {
        case 'LANDLORD': return 'PROPERTY_OWNER';
        case 'PARTNER_AGENT': return 'AGENT_DEALER';
        case 'REAL_ESTATE_BUILDER': return 'BUILDER';
        case 'MANAGEMENT': return 'AGENT_DEALER';
        default: return 'PROPERTY_OWNER';
    }
}

function getRoleBadge(contactType: string, identifiedType?: string): { label: string; color: string; bg: string } {
    const type = identifiedType || contactType;
    switch (type) {
        case 'MANAGEMENT': return { label: 'Team Member', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' };
        case 'PARTNER_AGENT': return { label: 'Agent / Dealer', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
        case 'REAL_ESTATE_BUILDER': return { label: 'Builder', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' };
        case 'LANDLORD': return { label: 'Owner', color: '#34d399', bg: 'rgba(52,211,153,0.15)' };
        case 'BUYER': return { label: 'Buyer', color: '#fb923c', bg: 'rgba(251,146,60,0.15)' };
        case 'TENANT': return { label: 'Tenant', color: '#c084fc', bg: 'rgba(192,132,252,0.15)' };
        default: return { label: 'Contact', color: 'var(--text-muted)', bg: 'var(--bg-secondary)' };
    }
}

export const ContactSearchField: React.FC<ContactSearchFieldProps> = ({
    onContactSelected,
    label = 'Search contact by phone number',
}) => {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<any>(null); // { contact, identified }
    const [notFound, setNotFound] = useState(false);

    // New contact form (when not found)
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const searchTimeout = useRef<any>(null);

    // Phone search
    const doPhoneSearch = useCallback(async (phoneVal: string) => {
        const clean = phoneVal.replace(/\D/g, '');
        if (clean.length < 10) return;

        setSearching(true);
        setError('');
        setNotFound(false);
        setSearchResult(null);

        try {
            const result = await identifyContactByPhone(clean);
            if (result.contact || result.identified) {
                setSearchResult(result);
                setNotFound(false);
            } else {
                setNotFound(true);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Search failed');
        } finally {
            setSearching(false);
        }
    }, []);

    const handleInputChange = useCallback((val: string) => {
        // Normalise ANY pasted format (+91 / spaces / 91-prefix) to the accepted 10-digit number
        const digitsOnly = normalizePhoneInput(val);
        setQuery(digitsOnly);
        setSearchResult(null);
        setNotFound(false);
        setError('');

        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
            searchTimeout.current = setTimeout(() => doPhoneSearch(digitsOnly), 300);
        }
    }, [doPhoneSearch]);

    // Select an existing contact (from phone search result)
    const handleSelectFound = useCallback(() => {
        if (!searchResult) return;
        const { contact, identified } = searchResult;
        const name = identified?.name || contact?.name || '';
        const contactType = contact?.contact_type || 'UNKNOWN';
        const identifiedType = identified?.contact_type;
        const phoneNum = (contact?.phone_number || query).replace(/^\+91/, '').replace(/^91/, '');
        onContactSelected({
            phone: phoneNum,
            name,
            role: mapToWorkflowRole(contactType, identifiedType),
            isNew: false,
            contactType,
            sourceId: identified?.source_id,
        });
    }, [searchResult, query, onContactSelected]);

    // Create new contact
    const handleCreateContact = useCallback(async () => {
        if (!newName.trim() || !newRole) {
            setError('Please enter name and select role');
            return;
        }
        setCreating(true);
        setError('');

        // Map role selection to contact_type for DB
        const contactTypeMap: Record<string, string> = {
            'PROPERTY_OWNER': 'LANDLORD',
            'AGENT_DEALER': 'PARTNER_AGENT',
            'FINANCER': 'LANDLORD',
        };

        try {
            const phoneNum = query.replace(/\D/g, '').replace(/^91(\d{10})$/, '$1');
            await ensureContact(phoneNum, newName.trim(), contactTypeMap[newRole] || 'UNKNOWN');
            onContactSelected({
                phone: phoneNum,
                name: newName.trim(),
                role: newRole,
                isNew: true,
            });
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to create contact');
        } finally {
            setCreating(false);
        }
    }, [query, newName, newRole, onContactSelected]);

    const badge = searchResult
        ? getRoleBadge(searchResult.contact?.contact_type, searchResult.identified?.contact_type)
        : null;

    return (
        <div>
            {/* Search Input — accepts phone digits only */}
            <label style={styles.label}>{label}</label>
            <div style={{ position: 'relative' }}>
                <PhoneInput
                    value={query}
                    onChange={handleInputChange}
                    placeholder="Enter phone number (any format)"
                    style={styles.input}
                    autoFocus
                />
                {searching ? (
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px' }}>
                        Searching...
                    </span>
                ) : (
                    <span style={{
                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: '12px', color: query.length === 10 ? 'var(--success-text)' : 'var(--text-muted)',
                        fontWeight: 600, pointerEvents: 'none',
                    }}>
                        {query.length}/10
                    </span>
                )}
            </div>
            {query.length > 0 && query.length < 10 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', paddingLeft: '4px' }}>
                    {10 - query.length} more digits needed
                </div>
            )}

            {error && <div style={styles.error}>{error}</div>}

            {/* Contact Found Card */}
            {searchResult && (
                <div style={styles.foundCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={styles.avatar}>
                            {(searchResult.identified?.name || searchResult.contact?.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {searchResult.identified?.name || searchResult.contact?.name || 'Unknown'}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                {searchResult.contact?.phone_number || query}
                            </div>
                        </div>
                        {badge && (
                            <span style={{
                                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                color: badge.color, backgroundColor: badge.bg,
                            }}>
                                {badge.label}
                            </span>
                        )}
                    </div>
                    {searchResult.identified?.department && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            Dept: {searchResult.identified.department} | Role: {searchResult.identified.role}
                        </div>
                    )}
                    <button style={styles.primaryBtn} onClick={handleSelectFound}>
                        Use This Contact &rarr;
                    </button>
                </div>
            )}

            {/* Not Found — Create New */}
            {notFound && (
                <div style={styles.notFoundCard}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        No contact found for <strong style={{ color: 'var(--text-primary)' }}>+91 {query}</strong>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={styles.label}>Name *</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Enter contact name"
                            style={styles.input}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={styles.label}>This contact is:</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {[
                                { value: 'PROPERTY_OWNER', label: 'Owner' },
                                { value: 'AGENT_DEALER', label: 'Agent / Dealer' },
                                { value: 'FINANCER', label: 'Financer' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setNewRole(opt.value)}
                                    style={{
                                        padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                                        fontSize: '13px', fontWeight: newRole === opt.value ? 700 : 500,
                                        backgroundColor: newRole === opt.value ? '#1e3a5f' : 'var(--bg-primary)',
                                        color: newRole === opt.value ? '#60a5fa' : 'var(--text-secondary)',
                                        border: newRole === opt.value ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button style={styles.primaryBtn} onClick={handleCreateContact} disabled={creating || !newName.trim() || !newRole}>
                        {creating ? 'Creating...' : 'Create & Continue'} &rarr;
                    </button>
                </div>
            )}
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    label: {
        fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)',
        marginBottom: '6px', display: 'block',
    },
    input: {
        width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '15px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box' as const,
    },
    error: {
        padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
        backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b',
        marginTop: '8px',
    },
    foundCard: {
        marginTop: '16px', padding: '16px', borderRadius: '12px',
        backgroundColor: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.3)',
    },
    notFoundCard: {
        marginTop: '16px', padding: '20px', borderRadius: '12px',
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
    },
    avatar: {
        width: '40px', height: '40px', borderRadius: '50%',
        backgroundColor: '#1e3a5f', color: '#60a5fa',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', fontWeight: 700, flexShrink: 0,
    },
    primaryBtn: {
        width: '100%', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
        fontSize: '14px', fontWeight: 600,
        backgroundColor: '#059669', color: '#fff', border: 'none',
    },
};
