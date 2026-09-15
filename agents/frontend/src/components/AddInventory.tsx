import React, { useState, useRef, useCallback, useEffect } from 'react';
import PhoneInput from './PhoneInput';
import { useWorkflow, type WorkflowStep, type StepOption, type DocType } from '../hooks/useWorkflow';
import { EnrichmentPanel } from './EnrichmentPanel';
import ParkingListField from './ParkingListField';
import AddressFields, { type AddressValue, inferAddressLayout } from './AddressFields';
import DuplicateAddressWarning from './DuplicateAddressWarning';
import { getTaxonomyTree } from '../api/client';
import { useConfirm } from '../contexts/ConfirmContext';

interface AddInventoryProps {
    onBack: () => void;
    onCreated: () => void;
}

export const AddInventory: React.FC<AddInventoryProps> = ({ onBack, onCreated }) => {
    const wf = useWorkflow();
    const confirm = useConfirm();

    // Cleanup workflow state when component unmounts
    useEffect(() => {
        return () => {
            wf.reset(); // Clean up workflow state when component unmounts
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps = cleanup only on unmount

    // When submitted, show success with display_id and enrichment options (v3)
    if (wf.submitted && !wf.enrichmentMode) {
        return (
            <div style={s.page}>
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10004;</div>
                    <h2 style={{ ...s.h2, marginBottom: '12px' }}>Property Saved Successfully!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Inventory ID:</p>
                    <p style={{ fontFamily: 'monospace', fontSize: '20px', color: 'var(--text-link)', fontWeight: 'bold', marginBottom: '20px' }}>
                        {wf.displayId || wf.inventoryId}
                    </p>

                    {/* Completion indicator */}
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

                    {/* Enrichment Section — prominent CTA */}
                    <div style={{ background: 'linear-gradient(135deg, #064e3b11, #1e3a5f11)', borderRadius: '12px', padding: '24px', marginBottom: '24px', textAlign: 'left', border: '1px solid #34d39940' }}>
                        <h3 style={{ ...s.h2, fontSize: '16px', marginBottom: '8px', color: '#34d399' }}>Add More Details to Improve Listing</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                            Complete your listing with pricing, amenities, area, and other details. Better details = more visibility.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {['Pricing', 'Amenities', 'Area', 'Facing', 'Floor', 'Furnishing', 'Description', 'Age'].map(label => (
                                <span key={label} style={{
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-muted)',
                                    fontSize: '13px',
                                    border: '1px solid var(--border-color)',
                                }}>{label}</span>
                            ))}
                        </div>
                        <button style={{ ...s.primaryBtn, width: '100%', padding: '12px', fontSize: '15px' }} onClick={() => wf.startEnrichment()}>
                            Add Details Now &rarr;
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button style={s.secondaryBtn} onClick={wf.reset}>Add New Inventory</button>
                        <button style={{ ...s.secondaryBtn, background: 'transparent', border: '1px solid var(--border-color)' }} onClick={onCreated}>
                            Back to List
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Enrichment mode (v3) — show EnrichmentPanel
    if (wf.enrichmentMode && wf.enrichmentInventoryId) {
        return (
            <div style={s.page}>
                <div style={s.header}>
                    <h2 style={s.h2}>Update Details — {wf.displayId || wf.inventoryId}</h2>
                    <button style={s.backBtn} onClick={onCreated}>&larr; Done</button>
                </div>
                <EnrichmentPanel
                    inventoryId={wf.enrichmentInventoryId}
                    onDone={onCreated}
                    onAddNew={wf.reset}
                />
            </div>
        );
    }

    if (wf.loading) {
        return (
            <div style={s.page}>
                <div style={{ textAlign: 'center', padding: '60px' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Loading workflow...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={s.page}>
            {/* Header */}
            <div style={s.header}>
                <h2 style={s.h2}>Add Property (Workflow)</h2>
                <button style={s.backBtn} onClick={async () => {
                    if (wf.stepHistory.length > 0 && !wf.submitted) {
                        const ok = await confirm('Discard current progress?');
                        if (ok) {
                            wf.reset();
                            onBack();
                        }
                    } else {
                        wf.reset();
                        onBack();
                    }
                }}>&larr; Back</button>
            </div>

            {/* Progress */}
            <ProgressBar groups={wf.groups} currentStep={wf.currentStep} done={wf.done} />

            {/* Step Content */}
            {wf.done ? (
                <ConfirmationPanel
                    summary={wf.summary}
                    error={wf.error}
                    submitting={wf.submitting}
                    onConfirm={wf.submit}
                    onBack={wf.goBack}
                />
            ) : wf.currentStep ? (
                <StepPanel
                    step={wf.currentStep}
                    options={wf.currentOptions}
                    metadata={wf.stepMetadata}
                    currentValue={wf.answers[wf.currentStep.field]}
                    secondaryValue={wf.currentStep.secondary_field ? wf.answers[wf.currentStep.secondary_field] : undefined}
                    documentTypes={wf.documentTypes}
                    answers={wf.answers}
                    onAnswer={wf.answerStep}
                    onBack={wf.goBack}
                    onSkip={wf.skipStep}
                    onSkipGroup={wf.skipMediaGroup}
                    canGoBack={wf.stepHistory.length > 0}
                    loading={wf.stepLoading}
                    error={wf.error}
                    onUploadPhotos={wf.uploadPhotos}
                    onUploadVideos={wf.uploadVideos}
                    onUploadDocument={wf.uploadDocument}
                />
            ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading step...</div>
            )}
        </div>
    );
};

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ groups, currentStep, done }: {
    groups: any[];
    currentStep: WorkflowStep | null;
    done: boolean;
}) {
    const currentGroupId = done ? 'confirm' : currentStep?.group;
    const currentGroupIndex = groups.findIndex((g: any) => g.id === currentGroupId);

    return (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {groups.map((g: any, i: number) => {
                const isActive = g.id === currentGroupId;
                const isDone = currentGroupIndex > i || done;
                return (
                    <div key={g.id} style={{
                        flex: 1,
                        minWidth: '60px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 500,
                        backgroundColor: isDone ? '#064e3b' : isActive ? '#1e3a5f' : 'var(--bg-secondary)',
                        color: isDone ? '#34d399' : isActive ? '#60a5fa' : 'var(--text-muted)',
                        border: isActive ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                    }}>
                        {g.icon} {g.label}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Step Panel ──────────────────────────────────────────────────────────────

function StepPanel({ step, options, metadata, currentValue, secondaryValue, documentTypes, answers, onAnswer, onBack, onSkip, onSkipGroup, canGoBack, loading, error, onUploadPhotos, onUploadVideos, onUploadDocument }: {
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
    canGoBack: boolean;
    loading: boolean;
    error: string;
    onUploadPhotos: (files: File[]) => Promise<string[]>;
    onUploadVideos: (files: File[]) => Promise<string[]>;
    onUploadDocument: (file: File, docType: string, title: string) => Promise<any>;
}) {
    return (
        <div style={s.formSection}>
            <h3 style={s.sectionTitle}>{step.question}</h3>
            {step.question_hi && <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>{step.question_hi}</p>}

            <div style={{ marginBottom: '16px', minHeight: '80px' }}>
                {step.input_type === 'radio' && (
                    <OptionCards options={step.static_options || options} value={currentValue} onSelect={onAnswer} />
                )}
                {step.input_type === 'dropdown' && (
                    <OptionCards options={options.length > 0 ? options : step.static_options || []} value={currentValue} onSelect={onAnswer} />
                )}
                {step.input_type === 'number' && (
                    <NumberField value={currentValue} placeholder={step.placeholder} required={step.required} onSubmit={onAnswer} />
                )}
                {step.input_type === 'text' && (
                    <TextField value={currentValue} placeholder={step.placeholder} required={step.required} onSubmit={onAnswer} />
                )}
                {step.input_type === 'phone' && (
                    <TextField
                        value={currentValue}
                        placeholder={step.placeholder || '+919876543210'}
                        required={step.required}
                        onSubmit={onAnswer}
                    />
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
                        {/* Show helper message if External Agent ownership type was selected */}
                        {answers?.ownership_type === 'EXTERNAL_AGENT' && (
                            <div style={{
                                marginBottom: '16px',
                                padding: '12px',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: 'var(--text-primary)',
                                display: 'flex',
                                gap: '8px',
                            }}>
                                <span>ℹ️</span>
                                <span>This is the property owner's contact (different from the agent/uploader).</span>
                            </div>
                        )}
                        <OwnerBlockField value={currentValue} onSubmit={onAnswer} />
                    </>
                )}
            </div>

            {error && <div style={s.error}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                {canGoBack ? (
                    <button style={s.backBtn} onClick={onBack} disabled={loading}>&larr; Back</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '8px' }}>
                    {step.allow_group_skip && onSkipGroup && (
                        <button style={{ ...s.secondaryBtn, background: 'transparent', border: '1px solid var(--border-color)' }} onClick={onSkipGroup} disabled={loading}>
                            Skip (Add Later) &rarr;
                        </button>
                    )}
                    {!step.required && step.input_type !== 'radio' && !step.allow_group_skip && (
                        <button style={s.secondaryBtn} onClick={onSkip} disabled={loading}>Skip &rarr;</button>
                    )}
                    {loading && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</span>}
                </div>
            </div>
        </div>
    );
}

// ─── Confirmation Panel ──────────────────────────────────────────────────────

function ConfirmationPanel({ summary, error, submitting, onConfirm, onBack }: {
    summary: Record<string, string> | null;
    error: string;
    submitting: boolean;
    onConfirm: () => void;
    onBack: () => void;
}) {
    return (
        <div style={s.formSection}>
            <h3 style={s.sectionTitle}>Review & Confirm</h3>

            {summary ? (
                <div style={{ marginBottom: '16px' }}>
                    {Object.entries(summary).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{label}</span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Loading summary...</p>
            )}

            {error && <div style={s.error}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                <button style={s.backBtn} onClick={onBack} disabled={submitting}>&larr; Back</button>
                <button style={s.primaryBtn} onClick={onConfirm} disabled={submitting || !summary}>
                    {submitting ? 'Submitting...' : 'Submit Property'}
                </button>
            </div>
        </div>
    );
}

// ─── Reusable Input Components ───────────────────────────────────────────────

function OptionCards({ options, value, onSelect }: {
    options: Array<{ value: string; label: string }>;
    value: any;
    onSelect: (v: string) => void;
}) {
    const [search, setSearch] = useState('');
    const showSearch = options.length > 8;
    const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

    return (
        <div>
            {showSearch && (
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search..."
                    style={{ ...s.input, marginBottom: '12px' }}
                />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: options.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                {filtered.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onSelect(opt.value)}
                        style={{
                            padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                            fontSize: '13px', fontWeight: value === opt.value ? 700 : 500,
                            backgroundColor: value === opt.value ? '#1e3a5f' : 'var(--bg-primary)',
                            color: value === opt.value ? '#60a5fa' : 'var(--text-secondary)',
                            border: value === opt.value ? '1px solid #3b82f6' : '1px solid var(--border-secondary)',
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function NumberField({ value, placeholder, required, onSubmit }: {
    value: any; placeholder?: string; required?: boolean; onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
                type="number"
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Enter number'}
                style={{ ...s.input, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && local) onSubmit(local); }}
                autoFocus
            />
            <button style={s.primaryBtn} onClick={() => onSubmit(local)} disabled={required && !local}>Next &rarr;</button>
        </div>
    );
}

function TextField({ value, placeholder, required, onSubmit }: {
    value: any; placeholder?: string; required?: boolean; onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
                type="text"
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Type here'}
                style={{ ...s.input, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && local) onSubmit(local); }}
                autoFocus
            />
            <button style={s.primaryBtn} onClick={() => onSubmit(local)} disabled={required && !local.trim()}>Next &rarr;</button>
        </div>
    );
}

function TextAreaField({ value, placeholder, onSubmit }: {
    value: any; placeholder?: string; onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    return (
        <div>
            <textarea
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Type here'}
                rows={4}
                style={{ ...s.input, resize: 'none', minHeight: '100px' }}
                autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button style={s.primaryBtn} onClick={() => onSubmit(local)}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Phase 1d: canonical taxonomy tree picker (admin) ──────────────────────────
interface TaxNode { id: string; name: string; node_kind: string; children?: TaxNode[]; }

function TaxonomyPicker({ value, onSubmit }: { value: any; onSubmit: (v: string) => void }) {
    const [tree, setTree] = useState<TaxNode[]>([]);
    const [path, setPath] = useState<TaxNode[]>([]); // chosen node at each level
    const [loadErr, setLoadErr] = useState('');

    useEffect(() => {
        getTaxonomyTree()
            .then((d: any) => setTree(d.tree || []))
            .catch((e: any) => setLoadErr(e?.message || 'Failed to load taxonomy'));
    }, []);

    // Build the option list for each visible dropdown level from the current path.
    const levels: TaxNode[][] = [];
    let opts: TaxNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }

    const leaf = path.length > 0 ? path[path.length - 1] : null;
    const leafChosen = !!leaf && (!leaf.children || leaf.children.length === 0);

    if (loadErr) return <div style={s.error}>{loadErr}</div>;

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {levels.map((lvl, i) => (
                    <select
                        key={i}
                        value={path[i]?.id || ''}
                        style={{ ...s.input, flex: '1 1 180px', minWidth: '160px' }}
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
                <button
                    style={s.primaryBtn}
                    disabled={!leafChosen}
                    onClick={() => leaf && onSubmit(leaf.id)}
                >
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
        // No per-type schema attached — let the user continue (specs stay empty for this type).
        return (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button style={s.primaryBtn} onClick={() => onSubmit({})}>Next &rarr;</button>
            </div>
        );
    }
    const isEmpty = (v: any) => v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0);
    const missingRequired = fields.some(f => f.required && isEmpty(vals[f.key]));
    return (
        <div>
            {fields.map(f => (
                <div key={f.key} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
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
                                            border: on ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                                            background: on ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: on ? '#fff' : 'var(--text-primary)' }}>
                                        {o}
                                    </button>
                                );
                            })}
                        </div>
                    ) : Array.isArray(f.options) && f.options.length > 0 ? (
                        <select
                            style={s.input}
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals({ ...vals, [f.key]: e.target.value })}
                        >
                            <option value="">Select…</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : (
                        <input
                            style={s.input}
                            type={f.input_type === 'number' ? 'number' : 'text'}
                            value={vals[f.key] ?? ''}
                            placeholder={f.unit || ''}
                            onChange={e => setVals({ ...vals, [f.key]: e.target.value })}
                        />
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button style={s.primaryBtn} disabled={missingRequired} onClick={() => onSubmit(vals)}>Next &rarr;</button>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
                type="number"
                value={primary}
                onChange={e => setPrimary(e.target.value)}
                placeholder={placeholder || 'Value'}
                style={{ ...s.input, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && primary) onSubmit(primary, secondary); }}
                autoFocus
            />
            <select value={secondary} onChange={e => setSecondary(e.target.value)} style={{ ...s.input, width: '100px' }}>
                {secondaryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button style={s.primaryBtn} onClick={() => onSubmit(primary, secondary)} disabled={!primary}>Next &rarr;</button>
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
                    <button
                        key={opt.value}
                        onClick={() => setSelected(prev => ({ ...prev, [opt.value]: !prev[opt.value] }))}
                        style={{
                            padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                            fontSize: '12px', fontWeight: selected[opt.value] ? 700 : 400,
                            backgroundColor: selected[opt.value] ? '#064e3b' : 'var(--bg-primary)',
                            color: selected[opt.value] ? '#34d399' : 'var(--text-secondary)',
                            border: selected[opt.value] ? '1px solid #065f46' : '1px solid var(--border-secondary)',
                        }}
                    >
                        {selected[opt.value] ? '+ ' : ''}{opt.label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button style={s.primaryBtn} onClick={() => onSubmit(selected)}>Next &rarr;</button>
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
        setUploading(true);
        setUploadError('');
        try {
            const newUrls = await onUpload(Array.from(files));
            setUrls(prev => [...prev, ...newUrls]);
        } catch (err: any) {
            console.error('Upload error:', err);
            setUploadError(err?.response?.data?.error || err?.message || 'Upload failed. Please try again.');
        }
        setUploading(false);
    }, [onUpload]);

    return (
        <div>
            <div
                onClick={() => inputRef.current?.click()}
                style={{
                    border: '2px dashed var(--border-secondary)', borderRadius: '12px', padding: '30px',
                    textAlign: 'center', cursor: 'pointer', marginBottom: '12px',
                }}
            >
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    {uploading ? 'Uploading...' : 'Click to upload photos (JPEG, PNG, WebP) — Max 10MB each, up to 10'}
                </p>
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            </div>
            {uploadError && (
                <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
                    {uploadError}
                </div>
            )}
            {urls.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {urls.map((url, i) => (
                        <div key={i} style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                                onClick={() => setUrls(prev => prev.filter((_, idx) => idx !== i))}
                                style={{ position: 'absolute', top: 0, right: 0, width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer' }}
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <button style={s.primaryBtn} onClick={() => onSubmit(urls)}>
                {urls.length > 0 ? `Continue (${urls.length} photos)` : 'Skip Photos'} &rarr;
            </button>
        </div>
    );
}

// ─── Video Upload ─────────────────────────────────────────────────────────────

function VideoUpload({ value, onSubmit, onUpload }: {
    value: any; onSubmit: (v: string[]) => void; onUpload: (files: File[]) => Promise<string[]>;
}) {
    const [urls, setUrls] = useState<string[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadError('');
        try {
            const newUrls = await onUpload(Array.from(files));
            setUrls(prev => [...prev, ...newUrls]);
        } catch (err: any) {
            console.error('Video upload error:', err);
            setUploadError(err?.response?.data?.error || err?.message || 'Upload failed. Please try again.');
        }
        setUploading(false);
    }, [onUpload]);

    return (
        <div>
            <div
                onClick={() => inputRef.current?.click()}
                style={{
                    border: '2px dashed var(--border-secondary)', borderRadius: '12px', padding: '30px',
                    textAlign: 'center', cursor: 'pointer', marginBottom: '12px',
                }}
            >
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    {uploading ? 'Uploading...' : 'Click to upload videos (MP4, WebM, MOV, AVI) — Max 50MB each, up to 3'}
                </p>
                <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            </div>
            {uploadError && (
                <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
                    {uploadError}
                </div>
            )}
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
            <button style={s.primaryBtn} onClick={() => onSubmit(urls)}>
                {urls.length > 0 ? `Continue (${urls.length} videos)` : 'Skip Videos'} &rarr;
            </button>
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
        setUploading(true);
        setUploadError('');
        try {
            const result = await onUpload(files[0], docType, title || files[0].name);
            setDocs(prev => [...prev, result]);
            setTitle('');
        } catch (err: any) {
            console.error('Document upload error:', err);
            setUploadError(err?.response?.data?.error || err?.message || 'Upload failed. Please try again.');
        }
        setUploading(false);
    }, [onUpload, docType, title]);

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select value={docType} onChange={e => setDocType(e.target.value)} style={{ ...s.input, flex: 1 }}>
                    {documentTypes.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                </select>
                <button style={s.secondaryBtn} onClick={() => inputRef.current?.click()} disabled={uploading}>
                    {uploading ? '...' : '+ Upload'}
                </button>
            </div>
            <input ref={inputRef} type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={e => handleFile(e.target.files)} />
            {uploadError && (
                <div style={{ padding: '12px', marginBottom: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
                    {uploadError}
                </div>
            )}
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
            <button style={s.primaryBtn} onClick={() => onSubmit(docs)}>
                {docs.length > 0 ? `Continue (${docs.length} docs)` : 'Skip Documents'} &rarr;
            </button>
        </div>
    );
}

// ─── Address Block (Composite — Adaptive based on property type) ─────────────

interface AddressConfig {
    sub_category_slug: string;
    floor_required: boolean;
    bhk_required: boolean;
    plot_area_required: boolean;
    main_category?: string;
}

function AddressBlockField({ value, onSubmit, addressConfig }: {
    value: any;
    onSubmit: (v: any) => void;
    addressConfig?: AddressConfig;
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
                <button type="button" style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: '#059669', color: '#fff', border: 'none' }} onClick={handleSubmit}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Owner Block (Composite) ─────────────────────────────────────────────────

function OwnerBlockField({ value, onSubmit }: {
    value: any;
    onSubmit: (v: any) => void;
}) {
    const [isOwner, setIsOwner] = useState<boolean>(value?.is_owner ?? true);
    const [ownerName, setOwnerName] = useState(value?.owner_name || '');
    const [ownerPhone, setOwnerPhone] = useState(value?.owner_phone || '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Admin panel = team member, phone is always required
    const phoneRequired = true;

    const validate = useCallback(() => {
        const errs: Record<string, string> = {};
        if (!ownerName.trim()) errs.owner_name = 'Owner name is required';
        if (phoneRequired && !ownerPhone.trim()) errs.owner_phone = 'Owner phone is required for team uploads';
        if (ownerPhone.trim()) {
            const clean = ownerPhone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
            if (!/^\d{10,12}$/.test(clean)) errs.owner_phone = 'Enter a valid 10-digit phone number';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [ownerName, ownerPhone, phoneRequired]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;
        onSubmit({
            is_owner: isOwner,
            owner_name: ownerName.trim(),
            owner_phone: ownerPhone.trim() || undefined,
        });
    }, [isOwner, ownerName, ownerPhone, validate, onSubmit]);

    const fieldStyle: React.CSSProperties = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box',
    };
    const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 };
    const errStyle: React.CSSProperties = { fontSize: '11px', color: '#fca5a5', marginTop: '2px' };

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    }, []);

    return (
        <div onKeyDown={handleKeyDown}>
            {/* Are you the owner? Toggle */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button
                    type="button"
                    onClick={() => setIsOwner(true)}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                        fontSize: '14px', fontWeight: isOwner ? 700 : 500,
                        backgroundColor: isOwner ? '#064e3b' : 'var(--bg-primary)',
                        color: isOwner ? '#34d399' : 'var(--text-secondary)',
                        border: isOwner ? '2px solid #065f46' : '1px solid var(--border-secondary)',
                    }}
                >
                    Yes, I am the owner
                </button>
                <button
                    type="button"
                    onClick={() => setIsOwner(false)}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                        fontSize: '14px', fontWeight: !isOwner ? 700 : 500,
                        backgroundColor: !isOwner ? '#1e3a5f' : 'var(--bg-primary)',
                        color: !isOwner ? '#60a5fa' : 'var(--text-secondary)',
                        border: !isOwner ? '2px solid #3b82f6' : '1px solid var(--border-secondary)',
                    }}
                >
                    No, someone else
                </button>
            </div>

            {/* Owner Name */}
            <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Owner Name *</label>
                <input
                    type="text"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="Full name of the property owner"
                    style={fieldStyle}
                    autoFocus
                />
                {errors.owner_name && <div style={errStyle}>{errors.owner_name}</div>}
            </div>

            {/* Owner Phone */}
            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Owner Phone {phoneRequired ? '*' : '(Optional)'}</label>
                <PhoneInput
                    value={ownerPhone}
                    onChange={setOwnerPhone}
                    placeholder="e.g. 9876543210"
                    style={fieldStyle}
                />
                {errors.owner_phone && <div style={errStyle}>{errors.owner_phone}</div>}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Phone is mandatory for team uploads. Owner will be mapped in SSOT for future tracking.
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, backgroundColor: '#059669', color: '#fff', border: 'none' }} onClick={handleSubmit}>Next &rarr;</button>
            </div>
        </div>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
    page: { padding: '24px', overflowY: 'auto', flex: 1, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    h2: { margin: 0, fontSize: '20px', color: 'var(--text-primary)' },
    backBtn: {
        background: 'none', border: '1px solid var(--border-secondary)', color: 'var(--text-link)',
        padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
    },
    formSection: {
        backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px',
        border: '1px solid var(--border-secondary)', marginBottom: '16px',
    },
    sectionTitle: { fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' },
    input: {
        width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none', boxSizing: 'border-box' as const,
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
    error: {
        padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
        backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b',
        marginBottom: '12px',
    },
};
