import React, { useState, useEffect, useCallback, useRef } from 'react';
import PhoneInput from './PhoneInput';
import { useWorkflow, type WorkflowStep, type StepOption, type DocType } from '../hooks/useWorkflow';
import { EnrichmentPanel } from './EnrichmentPanel';
import ParkingListField from './ParkingListField';
import AddressFields, { type AddressValue, inferAddressLayout } from './AddressFields';
import DuplicateAddressWarning from './DuplicateAddressWarning';
import { ContactSearchField, type SelectedContact } from './ContactSearchField';
import { PartnerSourceAutocomplete, type SourcePartnerValue } from './PartnerSourceAutocomplete';
import { getTaxonomyTree, cloneInventory } from '../api/client';
import { useConfirm } from '../contexts/ConfirmContext';
import { useAuth } from '../contexts/AuthContext';

interface InventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    onEditInventory?: (invId: string) => void;
}

type ModalPhase = 'contact' | 'prefilling' | 'workflow' | 'confirm' | 'success' | 'enrichment';

// Steps that are auto-filled from contact selection
const PREFILL_STEPS = ['user_role', 'uploader_phone', 'uploader_name'];

/**
 * Translate the UI's SourcePartnerValue into the flat fields the workflow engine expects
 * in the commit payload. Returns {} when no partner selected (no field injection).
 */
function buildSourcePartnerExtras(partner: SourcePartnerValue): Record<string, string> {
    if (partner.partner_id) return { source_partner_id: partner.partner_id };
    if (partner.phone) {
        const extras: Record<string, string> = { source_partner_phone: partner.phone };
        if (partner.name) extras.source_partner_name = partner.name;
        return extras;
    }
    return {};
}

type PreRentedValue = { pre_rented: boolean; rent: string };

/** Pre-rented (pre-lease) — inject the flag + rent into the commit payload, only for FOR-SALE listings. */
function buildPreRentedExtras(pr: PreRentedValue, intent: any): Record<string, string> {
    const isSale = ['sell', 'sale'].includes(String(intent || '').toLowerCase());
    if (!isSale || !pr.pre_rented) return {};
    const extras: Record<string, string> = { pre_rented: 'true' };
    if (pr.rent && String(pr.rent).trim()) extras.pre_rented_monthly_rent = String(pr.rent).trim();
    return extras;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ isOpen, onClose, onCreated, onEditInventory }) => {
    const wf = useWorkflow();
    const confirm = useConfirm();
    const { agent } = useAuth();
    const [phase, setPhase] = useState<ModalPhase>('contact');
    const [sourceContact, setSourceContact] = useState<SelectedContact | null>(null);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [keyHolderMode, setKeyHolderMode] = useState<'search' | null>(null);
    const [keyHolderPhone, setKeyHolderPhone] = useState<string | null>(null);
    const [ownerHoldsKey, setOwnerHoldsKey] = useState(false);
    const [prefilling, setPrefilling] = useState(false);
    // Middleman model (2026-04-17): optional partner source for this listing.
    // Captured on the confirmation step and merged into the commit payload.
    const [sourcePartner, setSourcePartner] = useState<SourcePartnerValue>({});
    // Pre-rented (pre-lease) — captured on the confirm step, only for for-sale listings.
    const [preRented, setPreRented] = useState<PreRentedValue>({ pre_rented: false, rent: '' });
    // Task 4b: clone-this-listing checklist (which unit-level fields the agent will re-enter).
    const [showCloneChecklist, setShowCloneChecklist] = useState(false);
    const [cloneOpts, setCloneOpts] = useState({ unit: true, floor: true, price: true, photos: false });
    const [cloning, setCloning] = useState(false);
    const [cloneError, setCloneError] = useState<string | null>(null);

    // Body scroll lock
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Escape key to close
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, phase]);

    // Prefill workflow steps from contact selection
    useEffect(() => {
        if (phase !== 'prefilling' || !sourceContact || !wf.currentStep || prefilling || wf.stepLoading) return;
        // If previous prefill attempt failed, stop auto-filling and let user handle it manually
        if (wf.error) {
            setPhase('workflow');
            return;
        }
        const stepId = wf.currentStep.id;
        if (stepId === 'user_role') {
            setPrefilling(true);
            wf.answerStep(sourceContact.role).finally(() => setPrefilling(false));
        } else if (stepId === 'uploader_phone') {
            setPrefilling(true);
            wf.answerStep(sourceContact.phone).finally(() => setPrefilling(false));
        } else if (stepId === 'uploader_name') {
            setPrefilling(true);
            wf.answerStep(sourceContact.name).finally(() => setPrefilling(false));
        } else if (!PREFILL_STEPS.includes(stepId)) {
            // Prefill is done — we've passed the contact steps
            setPhase('workflow');
        }
    }, [phase, sourceContact, wf.currentStep?.id, prefilling, wf.stepLoading, wf.error]);

    // Detect when workflow reaches done state
    useEffect(() => {
        if (wf.done && (phase === 'workflow' || phase === 'prefilling')) {
            setPhase('confirm');
        }
    }, [phase, wf.done]);

    // Detect submission success
    useEffect(() => {
        if (wf.submitted && phase !== 'success' && phase !== 'enrichment') {
            setPhase('success');
        }
    }, [wf.submitted, phase]);

    // Auto-fill key holder phone when step appears and we have stored phone from contact search
    useEffect(() => {
        if (keyHolderPhone && wf.currentStep?.id === 'key_holder_phone' && !wf.stepLoading) {
            const phone = keyHolderPhone;
            setKeyHolderPhone(null);
            setKeyHolderMode(null);
            wf.answerStep(phone);
        }
    }, [keyHolderPhone, wf.currentStep?.id, wf.stepLoading]);

    const handleContactSelected = useCallback((contact: SelectedContact) => {
        // (2026-06-20) A team member may NOT list their OWN number as the owner/partner source.
        const d10 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);
        if (agent?.phone && contact.phone && d10(contact.phone) === d10(agent.phone)) {
            setSourceError('You cannot use your own number as the property owner or partner agent. Select the owner (their direct number) or the partner agent — not yourself.');
            return;
        }
        setSourceError(null);
        setSourceContact(contact);
        setPrefilling(false);
        setPhase('prefilling');
    }, [agent]);

    const handleClose = useCallback(async () => {
        if (phase === 'workflow' || phase === 'confirm') {
            const ok = await confirm('Discard current progress?');
            if (!ok) return;
        }
        wf.reset();
        setPhase('contact');
        setSourceContact(null);
        setKeyHolderMode(null);
        setKeyHolderPhone(null);
        setOwnerHoldsKey(false);
        onClose();
    }, [phase, wf, onClose]);

    const handleBack = useCallback(() => {
        if (phase === 'confirm' || (phase === 'workflow' && wf.done)) {
            setPhase('workflow');
            wf.goBack();
        } else if (phase === 'workflow') {
            // Check if going back would take us before the intent step
            if (wf.stepHistory.length <= PREFILL_STEPS.length + 1) {
                // Going back to contact selection
                wf.reset();
                setPhase('contact');
                setSourceContact(null);
                setKeyHolderMode(null);
                setOwnerHoldsKey(false);
            } else {
                setKeyHolderMode(null);
                setOwnerHoldsKey(false);
                wf.goBack();
            }
        }
    }, [phase, wf]);

    const handleAddNew = useCallback(() => {
        wf.reset();
        setPhase('contact');
        setSourceContact(null);
        setKeyHolderMode(null);
        setKeyHolderPhone(null);
        setOwnerHoldsKey(false);
    }, [wf]);

    // Task 4a: "Add another — same owner". Keep sourceContact (the owner just used), reset the
    // wizard, and re-enter the prefill phase so the prefilling effect re-feeds role/phone/name —
    // the user skips contact entry and lands straight in the property steps for the same owner.
    const handleAddNewSameOwner = useCallback(() => {
        setKeyHolderMode(null);
        setKeyHolderPhone(null);
        setOwnerHoldsKey(false);
        setPrefilling(false);
        wf.reset();
        setPhase('prefilling');
    }, [wf]);

    // Task 4b: clone the just-saved listing — clears the ticked unit-level fields, copies building +
    // features (+ owner), then opens Edit on the new clone so the agent fills the differing fields.
    const handleClone = useCallback(async () => {
        if (!wf.inventoryId || cloning) return;
        setCloning(true);
        setCloneError(null);
        try {
            const clear: string[] = [];
            if (cloneOpts.unit) clear.push('flat_no', 'plot_no');
            if (cloneOpts.floor) clear.push('floor_number', 'floor_label', 'display_floor');
            if (cloneOpts.price) clear.push('price', 'customer_price', 'display_price');
            const res = await cloneInventory(wf.inventoryId, { clear, copy_media: cloneOpts.photos });
            setShowCloneChecklist(false);
            if (onEditInventory && res.inventory_id) {
                onEditInventory(res.inventory_id);
            } else {
                onCreated();
                handleClose();
            }
        } catch (e: any) {
            setCloneError(e?.response?.data?.error || 'Failed to clone the listing. Please try again.');
        } finally {
            setCloning(false);
        }
    }, [wf.inventoryId, cloning, cloneOpts, onEditInventory, onCreated]);

    const handleStartEnrichment = useCallback(() => {
        wf.startEnrichment();
        setPhase('enrichment');
    }, [wf]);

    // Key holder: when user selects "Owner holds the key", auto-fill from sourceContact
    const handleKeyHolderOwner = useCallback(async () => {
        if (!sourceContact) return;
        setOwnerHoldsKey(true);
        await wf.answerStep('SOMEONE_ELSE');
    }, [wf, sourceContact]);

    // Auto-fill key holder name/phone when "Owner holds the key" was chosen
    useEffect(() => {
        if (phase !== 'workflow' || !sourceContact || !ownerHoldsKey || wf.stepLoading) return;
        const stepId = wf.currentStep?.id;
        if (stepId === 'key_holder_name') {
            wf.answerStep(sourceContact.name);
        } else if (stepId === 'key_holder_phone') {
            setOwnerHoldsKey(false);
            wf.answerStep(sourceContact.phone);
        }
    }, [phase, sourceContact, ownerHoldsKey, wf.currentStep?.id, wf.stepLoading]);

    if (!isOpen) return null;

    // Current progress section name for header
    const getCurrentSectionLabel = () => {
        if (phase === 'contact') return 'Contact Lookup';
        if (phase === 'prefilling') return 'Setting Up...';
        if (phase === 'confirm') return 'Review & Submit';
        if (phase === 'success') return 'Success';
        if (phase === 'enrichment') return 'Add Details';
        if (wf.currentStep) {
            const group = wf.groups.find((g: any) => g.id === wf.currentStep?.group);
            return group ? `${group.icon} ${group.label}` : 'Property Details';
        }
        return 'Add Inventory';
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>Add Inventory</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{getCurrentSectionLabel()}</span>
                        <button style={styles.closeBtn} onClick={handleClose}>&times;</button>
                    </div>
                </div>

                {/* Progress Bar */}
                {phase !== 'contact' && phase !== 'prefilling' && phase !== 'success' && phase !== 'enrichment' && (
                    <ProgressBar groups={wf.groups} currentStep={wf.currentStep} done={wf.done} stepCount={wf.stepHistory.length} />
                )}

                {/* Body */}
                <div style={styles.body}>
                    {/* Phase: Contact Selection */}
                    {phase === 'contact' && (
                        <div style={styles.phaseContainer}>
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                                    Who is this inventory from?
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                    Search by phone to find existing contact or create new
                                </p>
                            </div>
                            <ContactSearchField onContactSelected={handleContactSelected} />
                            {sourceError && (
                                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontSize: 13, lineHeight: 1.4 }}>
                                    ⚠ {sourceError}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Phase: Prefilling */}
                    {phase === 'prefilling' && (
                        <div style={{ ...styles.phaseContainer, textAlign: 'center', padding: '60px 20px' }}>
                            <div style={{ fontSize: '24px', marginBottom: '12px' }}>&#8987;</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Setting up workflow...</p>
                        </div>
                    )}

                    {/* Phase: Workflow Steps */}
                    {phase === 'workflow' && wf.currentStep && !wf.done && (
                        <div style={styles.phaseContainer}>
                            {/* Special handling for key_holder_type */}
                            {wf.currentStep.id === 'key_holder_type' && keyHolderMode !== 'search' ? (
                                <KeyHolderStep
                                    onSelectUploader={() => wf.answerStep('UPLOADER')}
                                    onSelectOwner={handleKeyHolderOwner}
                                    onSelectSomeoneElse={() => {
                                        setKeyHolderMode('search');
                                        wf.answerStep('SOMEONE_ELSE');
                                    }}
                                    loading={wf.stepLoading}
                                    sourceContactName={sourceContact?.name}
                                />
                            ) : keyHolderMode === 'search' && wf.currentStep.id === 'key_holder_name' ? (
                                <KeyHolderContactSearch
                                    onContactFound={async (name, phone) => {
                                        setKeyHolderPhone(phone);
                                        await wf.answerStep(name);
                                    }}
                                />
                            ) : wf.currentStep.input_type === 'confirm' ? (
                                <ConfirmStep
                                    answers={wf.answers}
                                    summary={wf.summary}
                                    error={wf.error}
                                    loading={wf.stepLoading || wf.submitting}
                                    onSubmit={async () => {
                                        await wf.answerStep(true);
                                        await wf.submit({ ...buildSourcePartnerExtras(sourcePartner), ...buildPreRentedExtras(preRented, wf.answers.intent) });
                                    }}
                                    onBack={handleBack}
                                    sourcePartner={sourcePartner}
                                    onSourcePartnerChange={setSourcePartner}
                                    preRented={preRented}
                                    onPreRentedChange={setPreRented}
                                />
                            ) : (
                                <StepPanel
                                    step={wf.currentStep}
                                    options={wf.currentOptions}
                                    metadata={wf.stepMetadata}
                                    currentValue={wf.answers[wf.currentStep.field]}
                                    secondaryValue={wf.currentStep.secondary_field ? wf.answers[wf.currentStep.secondary_field] : undefined}
                                    documentTypes={wf.documentTypes}
                                    answers={wf.answers}
                                    onAnswer={wf.answerStep}
                                    onBack={handleBack}
                                    onSkip={wf.skipStep}
                                    onSkipGroup={wf.skipMediaGroup}
                                    loading={wf.stepLoading}
                                    error={wf.error}
                                    onUploadPhotos={wf.uploadPhotos}
                                    onUploadVideos={wf.uploadVideos}
                                    onUploadDocument={wf.uploadDocument}
                                />
                            )}
                        </div>
                    )}

                    {/* Phase: Confirmation — covers all cases: phase=confirm, wf.done=true, or no step left */}
                    {(phase === 'confirm' || wf.done || (phase === 'workflow' && !wf.currentStep)) && !wf.submitted && (
                        <div style={styles.phaseContainer}>
                            <ConfirmationPanel
                                summary={wf.summary}
                                answers={wf.answers}
                                error={wf.error}
                                submitting={wf.submitting}
                                onConfirm={() => wf.submit({ ...buildSourcePartnerExtras(sourcePartner), ...buildPreRentedExtras(preRented, wf.answers.intent) })}
                                onBack={handleBack}
                                sourcePartner={sourcePartner}
                                onSourcePartnerChange={setSourcePartner}
                                preRented={preRented}
                                onPreRentedChange={setPreRented}
                            />
                        </div>
                    )}

                    {/* Phase: Success */}
                    {phase === 'success' && !wf.enrichmentMode && (
                        <div style={{ ...styles.phaseContainer, textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10004;</div>
                            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                                Property Saved Successfully!
                            </h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Inventory ID:</p>
                            <p style={{ fontFamily: 'monospace', fontSize: '20px', color: 'var(--text-link)', fontWeight: 'bold', marginBottom: '20px' }}>
                                {wf.displayId || wf.inventoryId}
                            </p>

                            {wf.completionPct !== undefined && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                                        Listing Completion: <strong style={{ color: wf.completionPct > 60 ? '#34d399' : '#f59e0b' }}>{wf.completionPct}%</strong>
                                    </p>
                                    <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)' }}>
                                        <div style={{
                                            width: `${wf.completionPct}%`, height: '100%', borderRadius: '3px',
                                            background: wf.completionPct > 60 ? '#34d399' : '#f59e0b',
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                </div>
                            )}

                            <div style={{ background: 'rgba(52,211,153,0.05)', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid rgba(52,211,153,0.2)' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
                                    Add pricing, amenities, area, and more to improve listing visibility.
                                </p>
                                <button style={{ ...styles.primaryBtn, width: '100%', padding: '12px' }} onClick={handleStartEnrichment}>
                                    Add Details Now &rarr;
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {sourceContact && (
                                    <button style={styles.primaryBtn} onClick={handleAddNewSameOwner}>
                                        + Add another &mdash; same owner{sourceContact.name ? ` (${sourceContact.name})` : sourceContact.phone ? ` (${sourceContact.phone})` : ''}
                                    </button>
                                )}
                                {wf.inventoryId && (
                                    <button style={styles.secondaryBtn} onClick={() => setShowCloneChecklist(true)}>
                                        Clone this listing
                                    </button>
                                )}
                                <button style={styles.secondaryBtn} onClick={handleAddNew}>Add new &mdash; different owner</button>
                                {onEditInventory && wf.inventoryId && (
                                    <button style={styles.secondaryBtn} onClick={() => { onEditInventory(wf.inventoryId); }}>
                                        Edit Details
                                    </button>
                                )}
                                <button style={{ ...styles.secondaryBtn, background: 'transparent' }} onClick={() => { onCreated(); handleClose(); }}>
                                    Back to List
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Task 4b: Clone checklist overlay */}
                    {showCloneChecklist && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => !cloning && setShowCloneChecklist(false)}>
                            <div style={{ background: 'var(--bg-primary)', borderRadius: '14px', padding: '24px', maxWidth: '440px', width: '100%', border: '1px solid var(--border-secondary)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
                                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Clone this listing</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
                                    The same building &amp; features are copied. Tick what differs for the new unit &mdash; those fields start blank and the Edit screen opens so you can fill them in (including a different owner if needed).
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                    {([
                                        { key: 'unit', label: "I'll re-enter the unit / flat number" },
                                        { key: 'floor', label: "I'll re-enter the floor" },
                                        { key: 'price', label: "I'll re-enter the price" },
                                        { key: 'photos', label: 'Also copy the photos' },
                                    ] as const).map(opt => (
                                        <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={(cloneOpts as any)[opt.key]} onChange={e => setCloneOpts(o => ({ ...o, [opt.key]: e.target.checked }))} />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>
                                {cloneError && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 14px' }}>{cloneError}</p>}
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button style={{ ...styles.secondaryBtn, background: 'transparent' }} onClick={() => setShowCloneChecklist(false)} disabled={cloning}>Cancel</button>
                                    <button style={styles.primaryBtn} onClick={handleClone} disabled={cloning}>{cloning ? 'Cloning…' : 'Clone & edit new unit'}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Phase: Enrichment */}
                    {phase === 'enrichment' && wf.enrichmentInventoryId && (
                        <div style={styles.phaseContainer}>
                            <EnrichmentPanel
                                inventoryId={wf.enrichmentInventoryId}
                                onDone={() => { onCreated(); handleClose(); }}
                                onAddNew={handleAddNew}
                            />
                        </div>
                    )}
                </div>

                {/* Loading indicator */}
                {wf.stepLoading && (
                    <div style={{ padding: '8px 24px', textAlign: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ groups, currentStep, done, stepCount }: {
    groups: any[];
    currentStep: WorkflowStep | null;
    done: boolean;
    stepCount: number;
}) {
    const currentGroupId = done ? 'confirm' : currentStep?.group;
    const currentGroupIndex = groups.findIndex((g: any) => g.id === currentGroupId);
    const visibleGroups = groups.filter((g: any) => g.id !== 'identity' && g.id !== 'contact');
    const activeRef = useRef<HTMLDivElement>(null);

    // Auto-scroll active pill into view
    useEffect(() => {
        if (activeRef.current) {
            activeRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [currentGroupId]);

    // Active group label for step counter
    const activeGroup = visibleGroups.find((g: any) => g.id === currentGroupId);
    const activeLabel = done ? 'Confirm' : activeGroup?.label?.replace(/^\d+\s*/, '') || '';

    return (
        <div style={{ padding: '0 24px 12px', flexShrink: 0 }}>
            {/* Scrollable pill bar */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
                {visibleGroups.map((g: any) => {
                    const origIndex = groups.findIndex((og: any) => og.id === g.id);
                    const isActive = g.id === currentGroupId;
                    const isDone = currentGroupIndex > origIndex || done;
                    const shortLabel = g.label?.replace(/^\d+\s*/, '') || '';
                    return (
                        <div
                            key={g.id}
                            ref={isActive ? activeRef : null}
                            style={{
                                padding: '6px 14px', borderRadius: '16px', flexShrink: 0,
                                whiteSpace: 'nowrap', fontSize: '12px', fontWeight: isActive ? 700 : 500,
                                backgroundColor: isDone ? '#064e3b' : isActive ? '#1e3a5f' : 'var(--bg-secondary)',
                                color: isDone ? '#34d399' : isActive ? '#60a5fa' : 'var(--text-muted)',
                                border: isActive ? '1px solid #3b82f6' : '1px solid transparent',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {isActive ? `${g.icon} ${shortLabel}` : isDone ? `${g.icon} ${shortLabel}` : shortLabel}
                        </div>
                    );
                })}
            </div>
            {/* Step counter */}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Step {stepCount + (done ? 0 : 1)} &middot; {activeLabel}
            </div>
        </div>
    );
}

// ─── Key Holder Step (Custom) ────────────────────────────────────────────────

function KeyHolderStep({ onSelectUploader, onSelectOwner, onSelectSomeoneElse, loading, sourceContactName }: {
    onSelectUploader: () => void;
    onSelectOwner: () => void;
    onSelectSomeoneElse: () => void;
    loading: boolean;
    sourceContactName?: string;
}) {
    return (
        <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Who holds the key to this property?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Property ki chaabi kiske paas hai?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button style={styles.optionBtn} onClick={onSelectUploader} disabled={loading}>
                    <span style={{ fontSize: '18px' }}>&#128273;</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>I hold the key</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mere paas hai</div>
                    </div>
                </button>
                <button style={styles.optionBtn} onClick={onSelectOwner} disabled={loading}>
                    <span style={{ fontSize: '18px' }}>&#127968;</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>Owner holds the key</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {sourceContactName ? `${sourceContactName} (from contact)` : 'Malik ke paas hai'}
                        </div>
                    </div>
                </button>
                <button style={styles.optionBtn} onClick={onSelectSomeoneElse} disabled={loading}>
                    <span style={{ fontSize: '18px' }}>&#128100;</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>Someone else</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kisi aur ke paas hai</div>
                    </div>
                </button>
            </div>
        </div>
    );
}

// ─── Key Holder Search (Contact Search for "Someone Else") ──────────────────

function KeyHolderContactSearch({ onContactFound }: {
    onContactFound: (name: string, phone: string) => void;
}) {
    return (
        <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Who holds the key?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Search for the key holder by phone or name
            </p>
            <ContactSearchField
                label="Search key holder"
                placeholder="Enter phone number or name"
                onContactSelected={(contact) => {
                    onContactFound(contact.name, contact.phone);
                }}
            />
        </div>
    );
}

// ─── Confirm Step (input_type: 'confirm' — final review + submit) ───────────

// Pre-rented (pre-lease) capture — shown on the confirm step ONLY for for-sale listings.
function PreRentedField({ value, onChange, intent }: {
    value: PreRentedValue;
    onChange: (v: PreRentedValue) => void;
    intent: any;
}) {
    const isSale = ['sell', 'sale'].includes(String(intent || '').toLowerCase());
    if (!isSale) return null;
    return (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={value.pre_rented}
                    onChange={e => onChange({ pre_rented: e.target.checked, rent: e.target.checked ? value.rent : '' })} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Pre-rented — already has a tenant paying rent</span>
            </label>
            {value.pre_rented && (
                <input type="number" min={0} value={value.rent}
                    onChange={e => onChange({ ...value, rent: e.target.value })}
                    placeholder="Current rent ₹ / month (e.g. 25000)"
                    style={{ ...styles.input, marginTop: 10 }} />
            )}
        </div>
    );
}

function ConfirmStep({ answers, summary, error, loading, onSubmit, onBack, sourcePartner, onSourcePartnerChange, preRented, onPreRentedChange }: {
    answers: Record<string, any>;
    summary: Record<string, string> | null;
    error: string;
    loading: boolean;
    onSubmit: () => void;
    onBack: () => void;
    sourcePartner?: SourcePartnerValue;
    onSourcePartnerChange?: (v: SourcePartnerValue) => void;
    preRented?: PreRentedValue;
    onPreRentedChange?: (v: PreRentedValue) => void;
}) {
    const displayData = summary || flattenAnswers(answers);
    const hasData = Object.keys(displayData).length > 0;

    return (
        <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
                Review & Save Inventory
            </h3>

            {hasData ? (
                <div style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-secondary)' }}>
                    {Object.entries(displayData).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{label}</span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Loading summary...
                </div>
            )}

            {/* Middleman model (2026-04-17) — optional source partner for this listing */}
            {onSourcePartnerChange && (
                <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <PartnerSourceAutocomplete
                        value={sourcePartner || {}}
                        onChange={onSourcePartnerChange}
                        label="Did a partner agent refer this property?"
                    />
                </div>
            )}

            {onPreRentedChange && (
                <PreRentedField value={preRented || { pre_rented: false, rent: '' }} onChange={onPreRentedChange} intent={answers.intent} />
            )}

            {error && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '12px' }}>
                <button style={styles.backBtn} onClick={onBack} disabled={loading}>&larr; Back</button>
                <button style={{ ...styles.primaryBtn, flex: 1, padding: '14px', fontSize: '15px' }} onClick={onSubmit} disabled={loading}>
                    {loading ? 'Submitting...' : 'Submit Property'}
                </button>
            </div>
        </div>
    );
}

// ─── Phase 1d: canonical taxonomy tree picker (admin) ──────────────────────────
interface TaxNode { id: string; name: string; node_kind: string; children?: TaxNode[]; }

function TaxonomyPicker({ value, onSubmit }: { value: any; onSubmit: (v: string) => void }) {
    const [tree, setTree] = useState<TaxNode[]>([]);
    const [path, setPath] = useState<TaxNode[]>([]);
    const [loadErr, setLoadErr] = useState('');

    useEffect(() => {
        getTaxonomyTree()
            .then((d: any) => setTree(d.tree || []))
            .catch((e: any) => setLoadErr(e?.message || 'Failed to load taxonomy'));
    }, []);

    const levels: TaxNode[][] = [];
    let opts: TaxNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }
    const leaf = path.length > 0 ? path[path.length - 1] : null;
    const leafChosen = !!leaf && (!leaf.children || leaf.children.length === 0);

    if (loadErr) return <div style={{ color: '#fca5a5', fontSize: '13px' }}>{loadErr}</div>;

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {levels.map((lvl, i) => (
                    <select
                        key={i}
                        value={path[i]?.id || ''}
                        style={{ ...styles.input, flex: '1 1 180px', minWidth: '160px', cursor: 'pointer' }}
                        onChange={e => {
                            const node = lvl.find(n => n.id === e.target.value) || null;
                            const np = path.slice(0, i);
                            if (node) np.push(node);
                            setPath(np);
                        }}
                    >
                        <option value="">{i === 0 ? 'Category…' : 'Select…'}</option>
                        {lvl.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button style={{ ...styles.primaryBtn, opacity: leafChosen ? 1 : 0.5 }} disabled={!leafChosen} onClick={() => leaf && onSubmit(leaf.id)}>
                    {leafChosen ? 'Next →' : 'Pick a property type'}
                </button>
            </div>
            {value && <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>Selected: {leaf?.name || value}</p>}
        </div>
    );
}

// ─── Phase 1d: dynamic per-type field schema (BHK / Rooms / FAR / …) ───────────
interface SchemaField { key: string; label: string; input_type: string; required: boolean; options: string[] | null; unit: string | null; }

function SchemaFields({ fields, value, onSubmit }: { fields: SchemaField[]; value: any; onSubmit: (v: Record<string, any>) => void }) {
    const [vals, setVals] = useState<Record<string, any>>(value || {});
    const toggle = (key: string, opt: string) => {
        const cur: string[] = Array.isArray(vals[key]) ? vals[key] : [];
        setVals({ ...vals, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] });
    };
    if (!fields || fields.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button style={styles.primaryBtn} onClick={() => onSubmit({})}>Next &rarr;</button>
            </div>
        );
    }
    const isEmpty = (v: any) => v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0);
    const missingRequired = fields.some(f => f.required && isEmpty(vals[f.key]));
    return (
        <div>
            {fields.map(f => (
                <div key={f.key} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        {f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}
                    </label>
                    {f.input_type === 'parking_list' ? (
                        <ParkingListField value={vals[f.key]} onChange={(v) => setVals({ ...vals, [f.key]: v })} />
                    ) : f.input_type === 'multiselect' && Array.isArray(f.options) && f.options.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {f.options.map(o => {
                                const on = Array.isArray(vals[f.key]) && vals[f.key].includes(o);
                                return (
                                    <button key={o} type="button" onClick={() => toggle(f.key, o)}
                                        style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
                                            border: on ? '1px solid #059669' : '1px solid var(--border-secondary)',
                                            backgroundColor: on ? '#059669' : 'var(--bg-primary)', color: on ? '#fff' : 'var(--text-primary)' }}>
                                        {o}
                                    </button>
                                );
                            })}
                        </div>
                    ) : Array.isArray(f.options) && f.options.length > 0 ? (
                        <select style={{ ...styles.input, cursor: 'pointer' }} value={vals[f.key] ?? ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })}>
                            <option value="">Select…</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : (
                        <input style={styles.input} type={f.input_type === 'number' ? 'number' : 'text'} value={vals[f.key] ?? ''} placeholder={f.unit || ''} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button style={{ ...styles.primaryBtn, opacity: missingRequired ? 0.5 : 1 }} disabled={missingRequired} onClick={() => onSubmit(vals)}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Step Panel (reused from AddInventory pattern) ──────────────────────────

function StepPanel({ step, options, metadata, currentValue, secondaryValue, documentTypes, answers, onAnswer, onBack, onSkip, onSkipGroup, loading, error, onUploadPhotos, onUploadVideos, onUploadDocument }: {
    step: WorkflowStep;
    options: StepOption[];
    metadata: Record<string, any> | null;
    currentValue: any;
    secondaryValue?: any;
    documentTypes: DocType[];
    answers: Record<string, any>;
    onAnswer: (v: any, s?: any) => void;
    onBack: () => void;
    onSkip: () => void;
    onSkipGroup?: () => void;
    loading: boolean;
    error: string;
    onUploadPhotos: (files: File[]) => Promise<string[]>;
    onUploadVideos: (files: File[]) => Promise<string[]>;
    onUploadDocument: (file: File, docType: string, title: string) => Promise<any>;
}) {
    return (
        <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                {step.question}
            </h3>
            {step.question_hi && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>{step.question_hi}</p>}

            <div style={{ marginBottom: '16px', minHeight: '60px' }}>
                {step.input_type === 'radio' && (
                    <OptionCards options={step.static_options || options} value={currentValue} onSelect={onAnswer} />
                )}
                {step.input_type === 'dropdown' && (
                    <OptionCards options={options.length > 0 ? options : step.static_options || []} value={currentValue} onSelect={onAnswer} />
                )}
                {step.input_type === 'number' && (
                    <InlineField type="number" value={currentValue} placeholder={step.placeholder} required={step.required} onSubmit={onAnswer} />
                )}
                {step.input_type === 'text' && (
                    <InlineField type="text" value={currentValue} placeholder={step.placeholder} required={step.required} onSubmit={onAnswer} />
                )}
                {step.input_type === 'phone' && (
                    <InlineField type="tel" value={currentValue} placeholder={step.placeholder || '9876543210'} required={step.required} onSubmit={onAnswer} />
                )}
                {step.input_type === 'textarea' && (
                    <TextAreaField value={currentValue} placeholder={step.placeholder} onSubmit={onAnswer} />
                )}
                {step.input_type === 'compound' && (
                    <CompoundField value={currentValue} secondaryValue={secondaryValue} secondaryOptions={step.secondary_options || []} placeholder={step.placeholder} onSubmit={onAnswer} />
                )}
                {step.input_type === 'multi_select' && (
                    <MultiSelectField options={step.static_options || options} value={currentValue} onSubmit={onAnswer} />
                )}
                {step.input_type === 'media_upload' && (
                    <MediaUpload value={currentValue} onSubmit={onAnswer} onUpload={onUploadPhotos} />
                )}
                {step.input_type === 'video_upload' && (
                    <VideoUpload value={currentValue} onSubmit={onAnswer} onUpload={onUploadVideos} />
                )}
                {step.input_type === 'document_upload' && (
                    <DocumentUpload value={currentValue} documentTypes={documentTypes} onSubmit={onAnswer} onUpload={onUploadDocument} />
                )}
                {step.input_type === 'address_block' && (
                    <AddressBlockField value={currentValue} onSubmit={onAnswer} addressConfig={metadata?.address_config} />
                )}
                {step.input_type === 'taxonomy' && (
                    <TaxonomyPicker value={currentValue} onSubmit={onAnswer} />
                )}
                {step.input_type === 'schema_fields' && (
                    <SchemaFields fields={metadata?.schema_fields || []} value={currentValue} onSubmit={onAnswer} />
                )}
                {step.input_type === 'owner_block' && (
                    <>
                        {answers?.ownership_type === 'EXTERNAL_AGENT' && (
                            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', gap: '8px' }}>
                                <span>&#8505;&#65039;</span>
                                <span>This is the property owner's contact (different from the agent/uploader).</span>
                            </div>
                        )}
                        <OwnerBlockField value={currentValue} onSubmit={onAnswer} />
                    </>
                )}
            </div>

            {error && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', marginBottom: '12px' }}>{error}</div>}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button style={styles.backBtn} onClick={onBack} disabled={loading}>&larr; Back</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {step.allow_group_skip && onSkipGroup && (
                        <button style={styles.secondaryBtn} onClick={onSkipGroup} disabled={loading}>
                            Skip (Add Later) &rarr;
                        </button>
                    )}
                    {!step.required && step.input_type !== 'radio' && !step.allow_group_skip && (
                        <button style={styles.secondaryBtn} onClick={onSkip} disabled={loading}>Skip &rarr;</button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Confirmation Panel ─────────────────────────────────────────────────────

function flattenAnswers(answers: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    const labelMap: Record<string, string> = {
        user_role: 'Reference', uploader_phone: 'Phone', uploader_name: 'Name',
        intent: 'Intent', main_category: 'Category', flat_property_type_id: 'Property Type',
        configuration_id: 'Configuration', customer_price: 'Price', area: 'Area',
        area_unit: 'Area Unit', property_age: 'Property Age', key_holder_type: 'Key Holder',
        key_holder_name: 'Key Holder Name', key_holder_phone: 'Key Holder Phone',
    };
    for (const [key, val] of Object.entries(answers)) {
        if (val == null || val === '' || val === '__skip__') continue;
        const label = labelMap[key] || key.replace(/_/g, ' ');
        if (typeof val === 'object' && !Array.isArray(val)) {
            if (key === 'features' || key === 'amenities') {
                const selected = Object.entries(val).filter(([_, v]) => v === true).map(([k]) => k.replace(/_/g, ' ')).join(', ');
                if (selected) result[label] = selected;
            } else if (key === 'address_block') {
                if (val.locality) result['Locality'] = val.locality;
                if (val.district) result['City'] = val.district;
                if (val.state) result['State'] = val.state;
                if (val.pincode) result['Pincode'] = val.pincode;
                if (val.apartment_name) result['Society'] = val.apartment_name;
                if (val.flat_no) result['Flat No'] = val.flat_no;
            } else if (key === 'owner_block') {
                if (val.owner_name) result['Owner Name'] = val.owner_name;
                if (val.owner_phone) result['Owner Phone'] = val.owner_phone;
            } else {
                for (const [sk, sv] of Object.entries(val)) {
                    if (sv != null && sv !== '' && typeof sv !== 'object') result[`${label} - ${sk.replace(/_/g, ' ')}`] = String(sv);
                }
            }
        } else if (Array.isArray(val)) {
            if (val.length > 0) result[label] = `${val.length} file(s)`;
        } else {
            result[label] = String(val);
        }
    }
    return result;
}

function ConfirmationPanel({ summary, answers, error, submitting, onConfirm, onBack, sourcePartner, onSourcePartnerChange, preRented, onPreRentedChange }: {
    summary: Record<string, string> | null;
    answers: Record<string, any>;
    error: string;
    submitting: boolean;
    onConfirm: () => void;
    onBack: () => void;
    sourcePartner?: SourcePartnerValue;
    onSourcePartnerChange?: (v: SourcePartnerValue) => void;
    preRented?: PreRentedValue;
    onPreRentedChange?: (v: PreRentedValue) => void;
}) {
    const displayData = summary || flattenAnswers(answers);
    const hasData = Object.keys(displayData).length > 0;

    return (
        <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
                Review & Confirm
            </h3>

            {/* Source Contact Highlight */}
            {(answers.uploader_name || answers.uploader_phone) && (
                <div style={{
                    padding: '14px 16px', borderRadius: '10px', marginBottom: '16px',
                    backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)',
                }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                        Source Contact / Owner
                    </div>
                    {answers.uploader_name && (
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{answers.uploader_name}</div>
                    )}
                    {answers.uploader_phone && (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{answers.uploader_phone}</div>
                    )}
                    {answers.user_role && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Role: {answers.user_role === 'PROPERTY_OWNER' ? 'Property Owner' : answers.user_role === 'AGENT_DEALER' ? 'Agent / Dealer' : answers.user_role}
                        </div>
                    )}
                </div>
            )}

            {hasData ? (
                <div style={{ marginBottom: '16px', maxHeight: '400px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border-secondary)' }}>
                    {Object.entries(displayData).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{label}</span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Loading summary...
                </div>
            )}

            {/* Middleman model (2026-04-17) — optional source partner for this listing */}
            {onSourcePartnerChange && (
                <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <PartnerSourceAutocomplete
                        value={sourcePartner || {}}
                        onChange={onSourcePartnerChange}
                        label="Did a partner agent refer this property?"
                    />
                </div>
            )}

            {onPreRentedChange && (
                <PreRentedField value={preRented || { pre_rented: false, rent: '' }} onChange={onPreRentedChange} intent={answers.intent} />
            )}

            {error && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '12px' }}>
                <button style={styles.backBtn} onClick={onBack} disabled={submitting}>&larr; Back</button>
                <button style={{ ...styles.primaryBtn, flex: 1, padding: '14px', fontSize: '15px' }} onClick={onConfirm} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Property'}
                </button>
            </div>
        </div>
    );
}

// ─── Reusable Input Components ──────────────────────────────────────────────

function OptionCards({ options, value, onSelect }: {
    options: Array<{ value: string; label: string }>; value: any; onSelect: (v: string) => void;
}) {
    const [search, setSearch] = useState('');
    const showSearch = options.length > 8;
    const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

    // Use list layout for 5+ options (subcategories, configs), grid for <=4 (intent, category)
    const useList = options.length > 4;

    return (
        <div>
            {showSearch && (
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ ...styles.input, marginBottom: '12px' }} />
            )}
            {useList ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                    {filtered.map(opt => (
                        <button key={opt.value} onClick={() => onSelect(opt.value)} style={{
                            padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                            fontSize: '14px', fontWeight: value === opt.value ? 700 : 500,
                            backgroundColor: value === opt.value ? '#1e3a5f' : 'var(--bg-secondary)',
                            color: value === opt.value ? '#60a5fa' : 'var(--text-primary)',
                            border: value === opt.value ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span>{opt.label}</span>
                            {value === opt.value && <span style={{ fontSize: '16px' }}>&#10003;</span>}
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {filtered.map(opt => (
                        <button key={opt.value} onClick={() => onSelect(opt.value)} style={{
                            padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                            fontSize: '14px', fontWeight: value === opt.value ? 700 : 500,
                            backgroundColor: value === opt.value ? '#1e3a5f' : 'var(--bg-secondary)',
                            color: value === opt.value ? '#60a5fa' : 'var(--text-primary)',
                            border: value === opt.value ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                        }}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function InlineField({ type, value, placeholder, required, onSubmit }: {
    type: string; value: any; placeholder?: string; required?: boolean; onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    return (
        <div>
            <input
                type={type}
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Enter here'}
                style={styles.input}
                onKeyDown={e => { if (e.key === 'Enter' && local) onSubmit(local); }}
                autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button style={styles.primaryBtn} onClick={() => onSubmit(local)} disabled={required && !String(local).trim()}>Next &rarr;</button>
            </div>
        </div>
    );
}

function TextAreaField({ value, placeholder, onSubmit }: {
    value: any; placeholder?: string; onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    return (
        <div>
            <textarea value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder || 'Type here'} rows={4} style={{ ...styles.input, resize: 'none', minHeight: '100px' }} autoFocus />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button style={styles.primaryBtn} onClick={() => onSubmit(local)}>Next &rarr;</button>
            </div>
        </div>
    );
}

function CompoundField({ value, secondaryValue, secondaryOptions, placeholder, onSubmit }: {
    value: any; secondaryValue: any; secondaryOptions: Array<{ value: string; label: string }>; placeholder?: string;
    onSubmit: (v: string, s: string) => void;
}) {
    const [primary, setPrimary] = useState(value || '');
    const [secondary, setSecondary] = useState(secondaryValue || secondaryOptions[0]?.value || '');
    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <input type="number" value={primary} onChange={e => setPrimary(e.target.value)} placeholder={placeholder || 'Enter value'} style={{ ...styles.input, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter' && primary) onSubmit(primary, secondary); }} autoFocus />
                <select value={secondary} onChange={e => setSecondary(e.target.value)} style={{ ...styles.input, width: '130px', flexShrink: 0 }}>
                    {secondaryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button style={styles.primaryBtn} onClick={() => onSubmit(primary, secondary)} disabled={!primary}>Next &rarr;</button>
            </div>
        </div>
    );
}

function MultiSelectField({ options, value, onSubmit }: {
    options: Array<{ value: string; label: string }>; value: any; onSubmit: (v: Record<string, boolean>) => void;
}) {
    const [selected, setSelected] = useState<Record<string, boolean>>(value || {});
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {options.map(opt => (
                    <button key={opt.value} onClick={() => setSelected(prev => ({ ...prev, [opt.value]: !prev[opt.value] }))} style={{
                        padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                        fontSize: '12px', fontWeight: selected[opt.value] ? 700 : 400,
                        backgroundColor: selected[opt.value] ? '#064e3b' : 'var(--bg-primary)',
                        color: selected[opt.value] ? '#34d399' : 'var(--text-secondary)',
                        border: selected[opt.value] ? '1px solid #065f46' : '1px solid var(--border-secondary)',
                    }}>
                        {selected[opt.value] ? '+ ' : ''}{opt.label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button style={styles.primaryBtn} onClick={() => onSubmit(selected)}>Next &rarr;</button>
            </div>
        </div>
    );
}

function MediaUpload({ value, onSubmit, onUpload }: {
    value: any; onSubmit: (v: string[]) => void; onUpload: (files: File[]) => Promise<string[]>;
}) {
    const [urls, setUrls] = useState<string[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true); setUploadError('');
        try { const newUrls = await onUpload(Array.from(files)); setUrls(prev => [...prev, ...newUrls]); }
        catch (err: any) { setUploadError(err?.response?.data?.error || err?.message || 'Upload failed.'); }
        setUploading(false);
    }, [onUpload]);

    return (
        <div>
            <div onClick={() => inputRef.current?.click()} style={{ border: '2px dashed var(--border-secondary)', borderRadius: '12px', padding: '30px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{uploading ? 'Uploading...' : 'Click to upload photos (JPEG, PNG, WebP) — Max 10MB each, up to 10'}</p>
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            </div>
            {uploadError && <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{uploadError}</div>}
            {urls.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {urls.map((url, i) => (
                        <div key={i} style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button onClick={() => setUrls(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 0, right: 0, width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer' }}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
            <button style={styles.primaryBtn} onClick={() => onSubmit(urls)}>{urls.length > 0 ? `Continue (${urls.length} photos)` : 'Skip Photos'} &rarr;</button>
        </div>
    );
}

function VideoUpload({ value, onSubmit, onUpload }: {
    value: any; onSubmit: (v: string[]) => void; onUpload: (files: File[]) => Promise<string[]>;
}) {
    const [urls, setUrls] = useState<string[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true); setUploadError('');
        try { const newUrls = await onUpload(Array.from(files)); setUrls(prev => [...prev, ...newUrls]); }
        catch (err: any) { setUploadError(err?.response?.data?.error || err?.message || 'Upload failed.'); }
        setUploading(false);
    }, [onUpload]);

    return (
        <div>
            <div onClick={() => inputRef.current?.click()} style={{ border: '2px dashed var(--border-secondary)', borderRadius: '12px', padding: '30px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{uploading ? 'Uploading...' : 'Click to upload videos (MP4, WebM, MOV, AVI) — Max 50MB each, up to 3'}</p>
                <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            </div>
            {uploadError && <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{uploadError}</div>}
            {urls.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    {urls.map((_url, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', marginBottom: '4px', border: '1px solid var(--border-secondary)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Video {i + 1}</span>
                            <button onClick={() => setUrls(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
            <button style={styles.primaryBtn} onClick={() => onSubmit(urls)}>{urls.length > 0 ? `Continue (${urls.length} videos)` : 'Skip Videos'} &rarr;</button>
        </div>
    );
}

function DocumentUpload({ value, documentTypes, onSubmit, onUpload }: {
    value: any; documentTypes: DocType[]; onSubmit: (v: any[]) => void;
    onUpload: (file: File, docType: string, title: string) => Promise<any>;
}) {
    const [docs, setDocs] = useState<any[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [docType, setDocType] = useState(documentTypes[0]?.value || 'other');
    const [title, setTitle] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFile = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true); setUploadError('');
        try { const result = await onUpload(files[0], docType, title || files[0].name); setDocs(prev => [...prev, result]); setTitle(''); }
        catch (err: any) { setUploadError(err?.response?.data?.error || err?.message || 'Upload failed.'); }
        setUploading(false);
    }, [onUpload, docType, title]);

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select value={docType} onChange={e => setDocType(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {documentTypes.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                </select>
                <button style={styles.secondaryBtn} onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? '...' : '+ Upload'}</button>
            </div>
            <input ref={inputRef} type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={e => handleFile(e.target.files)} />
            {uploadError && <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{uploadError}</div>}
            {docs.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    {docs.map((doc, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', marginBottom: '4px', border: '1px solid var(--border-secondary)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{doc.title} ({doc.doc_type?.replace(/_/g, ' ')})</span>
                            <button onClick={() => setDocs(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
            <button style={styles.primaryBtn} onClick={() => onSubmit(docs)}>{docs.length > 0 ? `Continue (${docs.length} docs)` : 'Skip Documents'} &rarr;</button>
        </div>
    );
}

// ─── Address Block ──────────────────────────────────────────────────────────

interface AddressConfig {
    sub_category_slug: string;
    floor_required: boolean;
    bhk_required: boolean;
    plot_area_required: boolean;
    main_category?: string;
}

function AddressBlockField({ value, onSubmit, addressConfig }: {
    value: any; onSubmit: (v: any) => void; addressConfig?: AddressConfig;
}) {
    const cfg = addressConfig || { sub_category_slug: '', floor_required: true, bhk_required: false, plot_area_required: false, main_category: '' };
    const layout = inferAddressLayout({ slug: cfg.sub_category_slug, type: cfg.sub_category_slug, mainCategory: cfg.main_category, floorRequired: cfg.floor_required, plotAreaRequired: cfg.plot_area_required });
    const [addr, setAddr] = useState<AddressValue>({
        city: value?.city || value?.district || '',
        district: value?.district || value?.city || '',
        locality: value?.locality || '',
        sub_locality: value?.sub_locality || '',
        state: value?.state || '',
        pincode: value?.pincode || '',
        apartment_name: value?.apartment_name || '',
        flat_no: value?.flat_no || '',
        floor_number: value?.floor_number ?? '',
        floor_label: value?.floor_label ?? '',
        display_floor: value?.display_floor ?? '',
        total_floors: value?.total_floors ?? '',
        plot_no: value?.plot_no || '',
        latitude: value?.latitude,
        longitude: value?.longitude,
        full_address: value?.full_address || '',
    });
    const [error, setError] = useState('');

    const handleSubmit = useCallback(() => {
        if (!(addr.city || '').toString().trim()) { setError('City is required'); return; }
        if (!(addr.locality || '').toString().trim()) { setError('Locality is required'); return; }
        const out: Record<string, any> = { ...addr, district: (addr.city || addr.district || '').toString().trim() };
        if (!out.full_address) {
            out.full_address = [addr.flat_no, addr.plot_no, addr.apartment_name, addr.locality, addr.sub_locality, addr.city, addr.state, addr.pincode ? `- ${addr.pincode}` : '']
                .filter(Boolean).join(', ').replace(', -', ' -');
        }
        onSubmit(out);
    }, [addr, onSubmit]);

    return (
        <div>
            <AddressFields value={addr} onChange={setAddr} layout={layout} mainCategory={cfg.main_category} slug={cfg.sub_category_slug} />
            <DuplicateAddressWarning value={addr} />
            {error && <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.primaryBtn} onClick={handleSubmit}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Owner Block ────────────────────────────────────────────────────────────

function OwnerBlockField({ value, onSubmit }: { value: any; onSubmit: (v: any) => void; }) {
    const [isOwner, setIsOwner] = useState<boolean>(value?.is_owner ?? true);
    const [ownerName, setOwnerName] = useState(value?.owner_name || '');
    const [ownerPhone, setOwnerPhone] = useState(value?.owner_phone || '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = useCallback(() => {
        const errs: Record<string, string> = {};
        if (!ownerName.trim()) errs.owner_name = 'Owner name is required';
        if (!ownerPhone.trim()) errs.owner_phone = 'Owner phone is required for team uploads';
        if (ownerPhone.trim()) {
            const clean = ownerPhone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
            if (!/^\d{10,12}$/.test(clean)) errs.owner_phone = 'Enter a valid 10-digit phone number';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [ownerName, ownerPhone]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;
        onSubmit({ is_owner: isOwner, owner_name: ownerName.trim(), owner_phone: ownerPhone.trim() || undefined });
    }, [isOwner, ownerName, ownerPhone, validate, onSubmit]);

    const fieldStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box' };
    const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 };
    const errStyle: React.CSSProperties = { fontSize: '11px', color: '#fca5a5', marginTop: '2px' };

    return (
        <div onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button type="button" onClick={() => setIsOwner(true)} style={{ flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '14px', fontWeight: isOwner ? 700 : 500, backgroundColor: isOwner ? '#064e3b' : 'var(--bg-primary)', color: isOwner ? '#34d399' : 'var(--text-secondary)', border: isOwner ? '2px solid #065f46' : '1px solid var(--border-secondary)' }}>
                    Yes, I am the owner
                </button>
                <button type="button" onClick={() => setIsOwner(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '14px', fontWeight: !isOwner ? 700 : 500, backgroundColor: !isOwner ? '#1e3a5f' : 'var(--bg-primary)', color: !isOwner ? '#60a5fa' : 'var(--text-secondary)', border: !isOwner ? '2px solid #3b82f6' : '1px solid var(--border-secondary)' }}>
                    No, someone else
                </button>
            </div>
            <div style={{ marginBottom: '12px' }}><label style={labelStyle}>Owner Name *</label><input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Full name of the property owner" style={fieldStyle} autoFocus />{errors.owner_name && <div style={errStyle}>{errors.owner_name}</div>}</div>
            <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Owner Phone *</label><PhoneInput value={ownerPhone} onChange={setOwnerPhone} placeholder="e.g. 9876543210" style={fieldStyle} />{errors.owner_phone && <div style={errStyle}>{errors.owner_phone}</div>}<div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Phone is mandatory for team uploads. Owner will be mapped in SSOT for future tracking.</div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={styles.primaryBtn} onClick={handleSubmit}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    modal: {
        width: '80vw', maxWidth: '1000px', height: '85vh',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '16px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        border: '1px solid var(--border-secondary)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid var(--border-secondary)',
        flexShrink: 0,
    },
    title: {
        margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)',
    },
    closeBtn: {
        width: '32px', height: '32px', borderRadius: '8px',
        border: '1px solid var(--border-secondary)', background: 'none',
        color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    body: {
        flex: 1, overflowY: 'auto', padding: '24px',
    },
    footer: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', borderTop: '1px solid var(--border-secondary)',
        flexShrink: 0,
    },
    phaseContainer: {
        maxWidth: '700px', margin: '0 auto',
    },
    backBtn: {
        background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-link)',
        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
    },
    primaryBtn: {
        padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
        backgroundColor: '#059669', color: '#fff', border: 'none', whiteSpace: 'nowrap' as const,
    },
    secondaryBtn: {
        padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)', whiteSpace: 'nowrap' as const,
    },
    input: {
        width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box' as const,
    },
    optionBtn: {
        display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
        padding: '16px 20px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left' as const,
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)',
    },
};
