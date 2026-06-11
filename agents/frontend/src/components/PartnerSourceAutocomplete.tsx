import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Uses the same axios client conventions as api/client.ts (cookie auth + CSRF).
// Duplicating the setup here keeps the component dependency-free from larger API modules.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

export interface SourcePartnerValue {
    /** When set, references an existing registered partner. */
    partner_id?: string;
    /** Phone (10-digit India; normalized server-side). Either partner_id OR phone must be set. */
    phone?: string;
    /** Display name — shown inline; also used as the partner's name when auto-creating. */
    name?: string;
}

interface PartnerSearchResult {
    id: string;
    phone_number: string;
    name: string;
    email?: string | null;
    company_name?: string | null;
    city?: string | null;
    status?: string;
    verified?: boolean;
    package_type?: string;
}

interface Props {
    value: SourcePartnerValue;
    onChange: (v: SourcePartnerValue) => void;
    label?: string;
    /** Optional — if true, renders without the containing label (for compact inline use). */
    hideLabel?: boolean;
}

/**
 * PartnerSourceAutocomplete
 *
 * Middleman model (2026-04-17): when admins create a lead/inventory on behalf of a partner
 * agent, they tag the source here. Behaviour:
 *   - Type name or phone (2+ chars) → searches /api/partners/search.
 *   - If a match is found, click to select → sets { partner_id, phone, name }.
 *   - If no match, an "+ Add new partner {phone}" button appears (requires 10-digit phone).
 *     Clicking it leaves partner_id blank but stores { phone, name } — the backend will
 *     auto-create the partner and assign it to the current admin user via ensurePartnerAgent.
 *   - Clear button resets the field.
 */
export const PartnerSourceAutocomplete: React.FC<Props> = ({ value, onChange, label, hideLabel }) => {
    const [query, setQuery] = useState(value.name || value.phone || '');
    const [results, setResults] = useState<PartnerSearchResult[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [searching, setSearching] = useState(false);
    const [nameInput, setNameInput] = useState(value.name || '');
    const [creatingNew, setCreatingNew] = useState(false);
    const debounceRef = useRef<any>(null);

    // When value is set externally (e.g., after a selection), reflect it in the display.
    useEffect(() => {
        if (value.name && value.name !== query) setQuery(value.name);
        if (value.partner_id) setCreatingNew(false);
    }, [value.partner_id, value.name]);

    const runSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setResults([]);
            setShowDropdown(false);
            return;
        }
        setSearching(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/partners/search`, {
                params: { q: q.trim() },
                withCredentials: true,
            });
            setResults(res.data || []);
            setShowDropdown(true);
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
        }
    }, []);

    const handleQueryChange = (v: string) => {
        setQuery(v);
        // Clearing breaks the previous selection
        if (value.partner_id || value.phone) onChange({});
        setCreatingNew(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(v), 250);
    };

    const handleSelect = (p: PartnerSearchResult) => {
        onChange({ partner_id: p.id, phone: p.phone_number, name: p.name });
        setQuery(`${p.name} — ${p.phone_number}`);
        setShowDropdown(false);
        setResults([]);
        setCreatingNew(false);
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setShowDropdown(false);
        setCreatingNew(false);
        setNameInput('');
        onChange({});
    };

    // Extract a 10-digit Indian phone from the query (if present)
    const phoneDigits = query.replace(/\D/g, '').slice(-10);
    const hasValidPhone = /^[6-9]\d{9}$/.test(phoneDigits);
    const selected = Boolean(value.partner_id);
    const showAddNew = !selected && showDropdown && results.length === 0 && hasValidPhone && query.length >= 10 && !searching;

    const startAddNew = () => {
        setCreatingNew(true);
        setNameInput(value.name || '');
        setShowDropdown(false);
    };

    const confirmAddNew = () => {
        if (!hasValidPhone) return;
        const trimmedName = nameInput.trim();
        onChange({ phone: `+91${phoneDigits}`, name: trimmedName || undefined });
        setQuery(trimmedName ? `${trimmedName} — +91${phoneDigits} (new)` : `+91${phoneDigits} (new)`);
        setCreatingNew(false);
    };

    return (
        <div style={{ position: 'relative' }}>
            {!hideLabel && (
                <label style={styles.label}>{label || 'Source partner (optional)'}</label>
            )}
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
                    placeholder="Partner name or 10-digit phone"
                    style={styles.input}
                    autoComplete="off"
                />
                {selected && (
                    <button
                        type="button"
                        onClick={handleClear}
                        style={styles.clearBtn}
                        aria-label="Clear partner"
                    >
                        ×
                    </button>
                )}
                {searching && !selected && (
                    <span style={styles.searching}>Searching...</span>
                )}
            </div>

            {showDropdown && results.length > 0 && (
                <ul style={styles.dropdown} role="listbox">
                    {results.map((p) => (
                        <li key={p.id} style={styles.item} onClick={() => handleSelect(p)} role="option">
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {p.phone_number}{p.company_name ? ` · ${p.company_name}` : ''}{p.city ? ` · ${p.city}` : ''}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {showAddNew && (
                <div style={styles.addNew}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 8 }}>
                        No partner found for <b style={{ color: 'var(--text-primary)' }}>+91 {phoneDigits}</b>.
                    </div>
                    <button type="button" style={styles.addBtn} onClick={startAddNew}>
                        + Add new partner
                    </button>
                </div>
            )}

            {creatingNew && (
                <div style={styles.addNew}>
                    <label style={styles.label}>New partner name</label>
                    <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="e.g. Raj Sharma"
                        style={styles.input}
                    />
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 10px' }}>
                        Will be created as a partner agent and assigned to you as their manager.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" style={styles.primaryBtn} onClick={confirmAddNew}>
                            Confirm
                        </button>
                        <button type="button" style={styles.secondaryBtn} onClick={() => setCreatingNew(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {selected && (
                <div style={styles.selectedBadge}>
                    Selected partner{value.partner_id ? '' : ' (new — will be auto-created)'}
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
        width: '100%', padding: '10px 36px 10px 12px', borderRadius: '8px', fontSize: '14px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box',
    },
    searching: {
        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-muted)', fontSize: '12px',
    },
    clearBtn: {
        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
        background: 'transparent', color: 'var(--text-muted)', border: 'none',
        fontSize: '20px', cursor: 'pointer', padding: '0 6px', lineHeight: 1,
    },
    dropdown: {
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
        listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 50,
        backgroundColor: 'var(--bg-secondary)', borderRadius: '8px',
        border: '1px solid var(--border-secondary)', maxHeight: '260px', overflowY: 'auto',
        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
    },
    item: {
        padding: '8px 12px', cursor: 'pointer',
    },
    addNew: {
        marginTop: '8px', padding: '12px', borderRadius: '8px',
        backgroundColor: 'var(--bg-secondary)', border: '1px dashed var(--border-secondary)',
    },
    addBtn: {
        padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
        backgroundColor: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6',
        fontSize: '13px', fontWeight: 600,
    },
    primaryBtn: {
        padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
        backgroundColor: '#059669', color: '#fff', border: 'none',
        fontSize: '13px', fontWeight: 600,
    },
    secondaryBtn: {
        padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
        backgroundColor: 'transparent', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)',
        fontSize: '13px', fontWeight: 600,
    },
    selectedBadge: {
        marginTop: '6px', fontSize: '12px', color: 'var(--success-text, #34d399)',
        fontWeight: 600,
    },
};
