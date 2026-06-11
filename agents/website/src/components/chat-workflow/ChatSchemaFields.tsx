'use client';
import { useState } from 'react';

// Phase 1d v2: per-type dynamic attribute fields (BHK / Rooms / FAR / …) for the post-property chat.
// Renders msg.metadata.schema_fields; submits a JSON object via onSubmit (wired to sendQuickReply).
interface SchemaField { key: string; label: string; input_type: string; required: boolean; options: string[] | null; unit: string | null }

export default function ChatSchemaFields({ fields, onSubmit, sending }: { fields: SchemaField[]; onSubmit: (v: string) => void; sending: boolean }) {
    const [vals, setVals] = useState<Record<string, any>>({});
    const toggle = (key: string, opt: string) => {
        const cur: string[] = Array.isArray(vals[key]) ? vals[key] : [];
        setVals({ ...vals, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] });
    };

    if (!fields || fields.length === 0) {
        return (
            <button
                disabled={sending}
                onClick={() => onSubmit(JSON.stringify({}))}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
                Continue →
            </button>
        );
    }

    const isEmpty = (v: any) => v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0);
    const missingRequired = fields.some((f) => f.required && isEmpty(vals[f.key]));

    return (
        <div className="space-y-3">
            {fields.map((f) => (
                <div key={f.key}>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                        {f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}
                    </label>
                    {f.input_type === 'multiselect' && Array.isArray(f.options) && f.options.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {f.options.map((o) => {
                                const on = Array.isArray(vals[f.key]) && vals[f.key].includes(o);
                                return (
                                    <button
                                        type="button"
                                        key={o}
                                        disabled={sending}
                                        onClick={() => toggle(f.key, o)}
                                        className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'}`}
                                    >
                                        {o}
                                    </button>
                                );
                            })}
                        </div>
                    ) : Array.isArray(f.options) && f.options.length > 0 ? (
                        <select
                            value={vals[f.key] || ''}
                            disabled={sending}
                            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        >
                            <option value="">Select…</option>
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : (
                        <input
                            type={f.input_type === 'number' ? 'number' : 'text'}
                            value={vals[f.key] || ''}
                            disabled={sending}
                            placeholder={f.unit || ''}
                            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        />
                    )}
                </div>
            ))}
            <button
                disabled={missingRequired || sending}
                onClick={() => onSubmit(JSON.stringify(vals))}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
                Continue →
            </button>
        </div>
    );
}
