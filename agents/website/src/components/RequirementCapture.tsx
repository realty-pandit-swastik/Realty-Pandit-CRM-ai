'use client';

import { useState, useEffect } from 'react';
import { submitLeadRequirements, getTaxonomyTree, type LeadRequirementsData, type TaxonomyTreeNode } from '@/lib/api';
import { CheckCircle, Loader2, ArrowLeft, ArrowRight, Home, Building2, Landmark, Search } from 'lucide-react';

interface RequirementCaptureProps {
    onComplete?: (matches: any[]) => void;
    onClose?: () => void;
    compact?: boolean; // For popup mode
    dark?: boolean;
    source?: string;
    defaultIntent?: 'buy' | 'rent_lease';
}

type Step = 1 | 2 | 3;

// Category icon keyed by the taxonomy top-level node slug (best-effort; defaults to Home).
const CATEGORY_ICON: Record<string, typeof Home> = {
    residential: Home, commercial: Building2,
    agricultural: Landmark, agriculture: Landmark, land: Landmark,
};
// Flatten a taxonomy node to its selectable leaf types (nodes with no children).
const leavesUnder = (n: TaxonomyTreeNode): TaxonomyTreeNode[] =>
    n.children?.length ? n.children.flatMap(leavesUnder) : [n];

export default function RequirementCapture({
    onComplete,
    onClose,
    compact = false,
    dark = false,
    source = 'website',
    defaultIntent,
}: RequirementCaptureProps) {
    const [step, setStep] = useState<Step>(1);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    const [loadingTree, setLoadingTree] = useState(false);
    const [catNodeId, setCatNodeId] = useState('');
    const [matches, setMatches] = useState<any[]>([]);

    // Form state
    const [form, setForm] = useState<LeadRequirementsData>({
        intent: defaultIntent || 'buy',
        taxonomy_node_id: '',
        type_slug: '',
        budget_min: undefined,
        budget_max: undefined,
        budget_type: undefined,
        location: '',
        name: '',
        phone: '',
        source,
    });

    // Load the canonical taxonomy tree once (SoT — same as inventory + post-property flow).
    useEffect(() => {
        getTaxonomyTree().then(setTree).catch(() => setTree([])).finally(() => setLoadingTree(false));
    }, []);

    const catNode = tree.find((n) => n.id === catNodeId) || null;
    const typeLeaves = catNode ? leavesUnder(catNode) : [];

    // Auto-set budget_type based on intent
    useEffect(() => {
        const syncBudgetType = window.setTimeout(() => setForm(prev => ({
            ...prev,
            budget_type: prev.intent === 'buy' ? 'one_time' : 'per_month',
        })));
        return () => window.clearTimeout(syncBudgetType);
    }, [form.intent]);

    const canProceedStep1 = form.intent && catNodeId;
    const canProceedStep2 = form.taxonomy_node_id && form.location;

    const handleSubmit = async () => {
        setStatus('loading');
        setErrorMsg('');
        try {
            const result = await submitLeadRequirements({
                ...form,
                budget_min: form.budget_min || undefined,
                budget_max: form.budget_max || undefined,
            });
            setMatches(result.matches || []);
            setStatus('success');
            onComplete?.(result.matches || []);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Something went wrong. Please try again.');
            setStatus('error');
        }
    };

    const inputClass = dark
        ? 'w-full py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400'
        : 'w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

    const labelClass = dark ? 'text-sm font-medium text-slate-300 mb-1.5' : 'text-sm font-medium text-slate-700 mb-1.5';

    if (status === 'success') {
        return (
            <div className="text-center py-6">
                <CheckCircle className={`w-14 h-14 mx-auto mb-3 ${dark ? 'text-green-400' : 'text-green-500'}`} />
                <h4 className={`text-lg font-semibold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}>
                    {matches.length > 0 ? `${matches.length} Properties Found!` : 'Requirements Saved!'}
                </h4>
                <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {matches.length > 0
                        ? 'Panditji will contact you on WhatsApp with details.'
                        : 'Panditji will notify you when matching properties are available.'}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                            step >= s
                                ? 'bg-blue-600 text-white'
                                : dark ? 'bg-white/10 text-slate-400' : 'bg-slate-100 text-slate-400'
                        }`}>
                            {s}
                        </div>
                        {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-blue-600' : dark ? 'bg-white/10' : 'bg-slate-200'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 1: Intent + Category */}
            {step === 1 && (
                <div className="space-y-4">
                    <div>
                        <p className={labelClass}>What are you looking for?</p>
                        <div className="grid grid-cols-2 gap-3">
                            {(['buy', 'rent_lease'] as const).map((intent) => (
                                <button
                                    key={intent}
                                    type="button"
                                    onClick={() => setForm({ ...form, intent })}
                                    className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                                        form.intent === intent
                                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                                            : dark
                                                ? 'border-white/20 bg-white/5 text-slate-300 hover:border-white/40'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    }`}
                                >
                                    {intent === 'buy' ? 'Buy' : 'Rent / Lease'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className={labelClass}>Property Category</p>
                        <div className="grid grid-cols-1 gap-2">
                            {loadingTree ? (
                                <div className="flex items-center gap-2 py-3 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading categories...</div>
                            ) : tree.map((node) => {
                                const Icon = CATEGORY_ICON[node.slug] || Home;
                                const active = catNodeId === node.id;
                                const sample = leavesUnder(node).slice(0, 3).map((l) => l.name).join(', ');
                                return (
                                    <button
                                        key={node.id}
                                        type="button"
                                        onClick={() => { setCatNodeId(node.id); setForm({ ...form, category: node.slug as any, taxonomy_node_id: '', type_slug: '' }); }}
                                        className={`flex items-center gap-3 py-3 px-4 rounded-xl text-left border-2 transition-all ${
                                            active
                                                ? 'border-blue-600 bg-blue-50'
                                                : dark
                                                    ? 'border-white/20 bg-white/5 hover:border-white/40'
                                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : dark ? 'text-slate-400' : 'text-slate-500'}`} />
                                        <div>
                                            <span className={`text-sm font-medium ${active ? 'text-blue-700' : dark ? 'text-white' : 'text-slate-900'}`}>{node.name}</span>
                                            {sample && <span className={`text-xs block ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{sample}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={!canProceedStep1}
                        onClick={() => setStep(2)}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        Next <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Step 2: Type + Budget + Location */}
            {step === 2 && (
                <div className="space-y-4">
                    <div>
                        <p className={labelClass}>Property Type</p>
                        {loadingTree ? (
                            <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading types...
                            </div>
                        ) : (
                            <select
                                value={form.taxonomy_node_id}
                                onChange={(e) => { const leaf = typeLeaves.find((l) => l.id === e.target.value); setForm({ ...form, taxonomy_node_id: e.target.value, type_slug: leaf?.slug || '' }); }}
                                className={inputClass}
                            >
                                <option value="">Select type...</option>
                                {typeLeaves.map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <p className={labelClass}>
                            Budget Range ({form.intent === 'buy' ? 'Total Cost' : 'Per Month'})
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="number"
                                placeholder="Min (₹)"
                                value={form.budget_min || ''}
                                onChange={(e) => setForm({ ...form, budget_min: e.target.value ? Number(e.target.value) : undefined })}
                                className={inputClass}
                            />
                            <input
                                type="number"
                                placeholder="Max (₹)"
                                value={form.budget_max || ''}
                                onChange={(e) => setForm({ ...form, budget_max: e.target.value ? Number(e.target.value) : undefined })}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <p className={labelClass}>Preferred Location</p>
                        <input
                            type="text"
                            placeholder="e.g. Sector 150, Noida"
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className={inputClass}
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className={`py-3 px-4 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                                dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                            type="button"
                            disabled={!canProceedStep2}
                            onClick={() => setStep(3)}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            Next <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Name + Phone */}
            {step === 3 && (
                <div className="space-y-4">
                    <div>
                        <p className={labelClass}>Your Name</p>
                        <input
                            type="text"
                            placeholder="Enter your name"
                            value={form.name || ''}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <p className={labelClass}>Phone Number (for WhatsApp)</p>
                        <input
                            type="tel"
                            placeholder="+91 9876543210"
                            required
                            value={form.phone || ''}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className={inputClass}
                        />
                    </div>

                    {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className={`py-3 px-4 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                                dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                            type="button"
                            disabled={status === 'loading' || !form.phone}
                            onClick={handleSubmit}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Finding Properties...</>
                            ) : (
                                <><Search className="w-4 h-4" /> Find Properties</>
                            )}
                        </button>
                    </div>

                    <p className={`text-xs text-center ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        Panditji will send matching properties on WhatsApp
                    </p>
                </div>
            )}
        </div>
    );
}
