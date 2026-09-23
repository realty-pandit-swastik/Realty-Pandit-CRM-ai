                                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < totalSteps - 1 ? 1 : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: active ? '#3b82f6' : 'var(--border-secondary)', color: active ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{stepNum}</div>
                                            <span style={{ fontSize: '12px', color: active ? '#3b82f6' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{label}</span>
                                        </div>
                                        {idx < totalSteps - 1 && <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-secondary)', margin: '0 8px' }} />}
                                    </div>
                                );
                            })}
                        </div>

                        {createError && <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px' }}>{createError}</div>}

                        {/* ── STEP 1: Source Selection ── */}
                        {createStep === 1 && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Where is this lead coming from?</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div onClick={() => handleSourceTypeSelect('DIRECT_OWNER')}
                                        style={{ padding: '20px 16px', borderRadius: '12px', border: '2px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>👤</div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>Client</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Client contacted directly</div>
                                    </div>
                                    <div onClick={() => handleSourceTypeSelect('PARTNER_REFERRAL')}
                                        style={{ padding: '20px 16px', borderRadius: '12px', border: '2px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.backgroundColor = 'rgba(124,58,237,0.06)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🤝</div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>Partner Agent</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Referred by a partner</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2 (DIRECT_OWNER): Contact Search ── */}
                        {createStep === 2 && createLeadType === 'DIRECT_OWNER' && (
                            <div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Search if this client already exists</div>
                                <div style={{ position: 'relative' }}>
                                    <PhoneInput
                                        autoFocus
                                        value={clientSearchQuery}
                                        onChange={handleClientSearchChange}
                                        placeholder="Enter phone number (any format)"
                                        style={{ ...inputStyle, fontSize: '14px', padding: '10px 14px' }}
                                    />
                                    <span style={{
                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                        fontSize: '12px', fontWeight: 600,
                                        color: clientSearchQuery.length === 10 ? '#22c55e' : 'var(--text-muted)',
                                        pointerEvents: 'none',
                                    }}>
                                        {clientSearchQuery.length}/10
                                    </span>
                                </div>
                                {clientSearchQuery.length > 0 && clientSearchQuery.length < 10 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0 4px' }}>
                                        {10 - clientSearchQuery.length} more digits needed
                                    </p>
                                )}
                                {clientSearching && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Searching...</div>}

                                {/* Results */}
                                {clientSearchQuery.trim().length === 10 && !clientSearching && clientSearchResults.length > 0 && (
                                    <div style={{ marginTop: '8px', border: '1px solid var(--border-secondary)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {clientSearchResults.map(r => {
                                            const isTemp = isPlaceholderPhone(r.phone_number);
                                            const statusColors: Record<string, string> = { cold: '#94a3b8', warm: '#f59e0b', hot: '#ef4444', closed: '#22c55e', lost: '#6b7280' };
                                            const sc = statusColors[r.lead_status || ''] || '#94a3b8';
                                            return (
                                                <div key={r.phone_number} onClick={() => handleSelectExistingClient(r)}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                                                        {(r.name || '?')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{r.name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isTemp ? 'No phone' : r.phone_number}</div>
                                                    </div>
                                                    {r.lead_status && (
                                                        <span style={{ backgroundColor: `${sc}22`, color: sc, padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>{r.lead_status}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Not found — offer to create */}
                                {clientSearchQuery.trim().length === 10 && !clientSearching && clientSearchResults.length === 0 && (
                                    <div style={{ marginTop: '10px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-secondary)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No contact found for "{clientSearchQuery}"</div>
                                        <button type="button" onClick={handleCreateNewClient} style={{ ...primaryBtn, padding: '7px 18px', fontSize: '13px' }}>
                                            + Create New Client
                                        </button>
                                    </div>
                                )}

                                {/* Skip search — go straight to new client form */}
                                {clientSearchQuery.trim().length < 10 && (
                                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                                        <button type="button" onClick={() => { setPreselectedContact(null); setCreateStep(3); }} style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                            Skip — add new client directly
                                        </button>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                                    <button type="button" onClick={() => setCreateStep(1)} style={{ ...outlineBtn, fontSize: '12px' }}>← Back</button>
                                    <button type="button" onClick={closeCreateModal} style={outlineBtn}>Cancel</button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2 (PARTNER_REFERRAL) or STEP 3 (DIRECT_OWNER): Details form ── */}
                        {((createStep === 2 && createLeadType === 'PARTNER_REFERRAL') || createStep === 3) && (
                        <div>
                            <div style={{ display: 'grid', gap: '12px' }}>

                                {/* Partner Agent Search — only for PARTNER_REFERRAL */}
                                {createLeadType === 'PARTNER_REFERRAL' && (
                                    <div style={{ backgroundColor: '#f5f3ff', borderRadius: '8px', padding: '12px', border: '1px solid #ede9fe' }}>
                                        <label style={labelStyle}>Partner Agent *</label>
                                        {partnerSelected ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ede9fe', borderRadius: '8px', padding: '10px 14px' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#5b21b6' }}>{partnerSelected.name}</div>
