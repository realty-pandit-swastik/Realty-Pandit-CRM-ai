'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowRight, ArrowLeft, SkipForward, Upload, X, FileText, Plus, Loader2,
    Camera, CheckCircle2, Search, MapPin, Video,
} from 'lucide-react';
import type { WorkflowStepDef, WorkflowStepOption, WorkflowDocType } from '@/lib/api';
import { getStates } from '@/lib/api';
import { FLOOR_PRESETS } from '@/lib/floor';
import { GooglePlacesInput, type PlaceResult } from './GooglePlacesInput';

interface AddressConfig {
    sub_category_slug: string;
    floor_required: boolean;
    bhk_required: boolean;
    plot_area_required: boolean;
}

interface StepRendererProps {
    step: WorkflowStepDef;
    options: WorkflowStepOption[];
    currentValue: any;
    secondaryValue?: any;
    documentTypes?: WorkflowDocType[];
    addressConfig?: AddressConfig | null;
    onAnswer: (value: any, secondaryValue?: any) => void;
    onBack: () => void;
    onSkip: () => void;
    canGoBack: boolean;
    loading: boolean;
    error: string;
    // For media/document upload
    onUploadPhotos?: (files: File[]) => Promise<string[]>;
    onUploadVideos?: (files: File[]) => Promise<string[]>;
    onUploadDocument?: (file: File, docType: string, title: string) => Promise<any>;
}

export default function StepRenderer({
    step,
    options,
    currentValue,
    secondaryValue,
    documentTypes,
    addressConfig,
    onAnswer,
    onBack,
    onSkip,
    canGoBack,
    loading,
    error,
    onUploadPhotos,
    onUploadVideos,
    onUploadDocument,
}: StepRendererProps) {
    return (
        <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-6 md:p-8"
        >
            {/* Question */}
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{step.question}</h2>
                {step.question_hi && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{step.question_hi}</p>
                )}
            </div>

            {/* Input Area */}
            <div className="mb-6 min-h-[120px]">
                {step.input_type === 'radio' && (
                    <RadioInput options={step.static_options || options} value={currentValue} onSelect={v => onAnswer(v)} />
                )}
                {step.input_type === 'dropdown' && (
                    <DropdownInput options={options.length > 0 ? options : step.static_options || []} value={currentValue} onSelect={v => onAnswer(v)} placeholder={step.placeholder} />
                )}
                {step.input_type === 'number' && (
                    <NumberInput value={currentValue} validation={step.validation} placeholder={step.placeholder} required={step.required} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'text' && (
                    <TextInput value={currentValue} placeholder={step.placeholder} required={step.required} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'phone' && (
                    <PhoneInput value={currentValue} placeholder={step.placeholder} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'textarea' && (
                    <TextAreaInput value={currentValue} placeholder={step.placeholder} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'compound' && (
                    <CompoundInput
                        value={currentValue}
                        secondaryValue={secondaryValue}
                        secondaryOptions={step.secondary_options || []}
                        placeholder={step.placeholder}
                        validation={step.validation}
                        onSubmit={(v, s) => onAnswer(v, s)}
                    />
                )}
                {step.input_type === 'multi_select' && (
                    <MultiSelectInput options={step.static_options || options} value={currentValue} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'media_upload' && (
                    <MediaUploadInput value={currentValue} onSubmit={v => onAnswer(v)} onUpload={onUploadPhotos} />
                )}
                {step.input_type === 'video_upload' && (
                    <VideoUploadInput value={currentValue} onSubmit={v => onAnswer(v)} onUpload={onUploadVideos} />
                )}
                {step.input_type === 'document_upload' && (
                    <DocumentUploadInput value={currentValue} documentTypes={documentTypes || []} onSubmit={v => onAnswer(v)} onUpload={onUploadDocument} />
                )}
                {step.input_type === 'address_block' && (
                    <AddressBlockInput value={currentValue} onSubmit={v => onAnswer(v)} addressConfig={addressConfig} />
                )}
                {step.input_type === 'owner_block' && (
                    <OwnerBlockInput value={currentValue} onSubmit={v => onAnswer(v)} />
                )}
                {step.input_type === 'uploader_block' && (
                    <>
                        {/* Show helper message if user selected External Agent */}
                        {currentValue?.ownership_type === 'EXTERNAL_AGENT' && (
                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                                <span className="text-base">ℹ️</span>
                                <span>We&apos;ll ask for the property owner&apos;s contact details in the next step.</span>
                            </div>
                        )}
                        <UploaderBlockInput value={currentValue} onSubmit={v => onAnswer(v)} />
                    </>
                )}
            </div>

            {/* Error */}
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm"
                >
                    {error}
                </motion.div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-800">
                {canGoBack ? (
                    <button
                        onClick={onBack}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                    {!step.required && step.input_type !== 'radio' && step.input_type !== 'confirm' && (
                        <button
                            onClick={onSkip}
                            disabled={loading}
                            className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            Skip <SkipForward className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {loading && <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RadioInput({ options, value, onSelect }: {
    options: Array<{ value: string; label: string; label_hi?: string }>;
    value: any;
    onSelect: (v: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {options.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => onSelect(opt.value)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                        value === opt.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                >
                    <div className={`text-sm font-bold ${
                        value === opt.value ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                    }`}>
                        {opt.label}
                    </div>
                    {opt.label_hi && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opt.label_hi}</div>
                    )}
                </button>
            ))}
        </div>
    );
}

function DropdownInput({ options, value, onSelect, placeholder }: {
    options: Array<{ value: string; label: string }>;
    value: any;
    onSelect: (v: string) => void;
    placeholder?: string;
}) {
    const [search, setSearch] = useState('');
    const showSearch = options.length > 6;

    const filtered = search
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    // If few options, show as card grid
    if (options.length <= 6) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onSelect(opt.value)}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                            value === opt.value
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <span className={`text-sm font-bold ${
                            value === opt.value ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                        }`}>
                            {opt.label}
                        </span>
                    </button>
                ))}
            </div>
        );
    }

    // Many options — show searchable list
    return (
        <div>
            {showSearch && (
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={placeholder || 'Search...'}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>
            )}
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {filtered.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onSelect(opt.value)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                            value === opt.value
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
                {filtered.length === 0 && (
                    <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No results found</p>
                )}
            </div>
        </div>
    );
}

function NumberInput({ value, validation, placeholder, required, onSubmit }: {
    value: any;
    validation?: { min?: number; max?: number; message?: string };
    placeholder?: string;
    required?: boolean;
    onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');

    return (
        <div className="flex flex-col gap-3">
            <input
                type="number"
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Enter a number'}
                min={validation?.min}
                max={validation?.max}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-lg"
                onKeyDown={e => { if (e.key === 'Enter' && local) onSubmit(local); }}
                autoFocus
            />
            <button
                onClick={() => onSubmit(local)}
                disabled={required && !local}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function TextInput({ value, placeholder, required, onSubmit }: {
    value: any;
    placeholder?: string;
    required?: boolean;
    onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');

    return (
        <div className="flex flex-col gap-3">
            <input
                type="text"
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Type here...'}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-lg"
                onKeyDown={e => { if (e.key === 'Enter' && local) onSubmit(local); }}
                autoFocus
            />
            <button
                onClick={() => onSubmit(local)}
                disabled={required && !local.trim()}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function PhoneInput({ value, placeholder, onSubmit }: {
    value: any;
    placeholder?: string;
    onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');
    const cleaned = local.replace(/\D/g, '');
    const valid = cleaned.length === 10;

    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-lg font-medium">+91</span>
                <input
                    type="tel"
                    inputMode="numeric"
                    value={local}
                    onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                        setLocal(v);
                    }}
                    placeholder={placeholder || 'Enter 10-digit phone number'}
                    className="w-full pl-14 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-lg"
                    onKeyDown={e => { if (e.key === 'Enter' && valid) onSubmit(cleaned); }}
                    autoFocus
                    maxLength={10}
                />
            </div>
            {local && !valid && (
                <p className="text-sm text-amber-600 dark:text-amber-400">Enter a 10-digit phone number</p>
            )}
            <button
                onClick={() => onSubmit(cleaned)}
                disabled={!valid}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function TextAreaInput({ value, placeholder, onSubmit }: {
    value: any;
    placeholder?: string;
    onSubmit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value || '');

    return (
        <div className="flex flex-col gap-3">
            <textarea
                value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder={placeholder || 'Type here...'}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                autoFocus
            />
            <button
                onClick={() => onSubmit(local)}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function CompoundInput({ value, secondaryValue, secondaryOptions, placeholder, validation, onSubmit }: {
    value: any;
    secondaryValue: any;
    secondaryOptions: Array<{ value: string; label: string }>;
    placeholder?: string;
    validation?: { min?: number; max?: number };
    onSubmit: (v: string, s: string) => void;
}) {
    const [primary, setPrimary] = useState(value || '');
    const [secondary, setSecondary] = useState(secondaryValue || secondaryOptions[0]?.value || '');

    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-3">
                <input
                    type="number"
                    value={primary}
                    onChange={e => setPrimary(e.target.value)}
                    placeholder={placeholder || 'Enter value'}
                    min={validation?.min}
                    max={validation?.max}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-lg"
                    onKeyDown={e => { if (e.key === 'Enter' && primary) onSubmit(primary, secondary); }}
                    autoFocus
                />
                <select
                    value={secondary}
                    onChange={e => setSecondary(e.target.value)}
                    className="w-28 px-3 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                    {secondaryOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>
            <button
                onClick={() => onSubmit(primary, secondary)}
                disabled={!primary}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function MultiSelectInput({ options, value, onSubmit }: {
    options: Array<{ value: string; label: string }>;
    value: any;
    onSubmit: (v: Record<string, boolean>) => void;
}) {
    const [selected, setSelected] = useState<Record<string, boolean>>(value || {});

    const toggle = (key: string) => {
        setSelected(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => toggle(opt.value)}
                        className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                            selected[opt.value]
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs ${
                            selected[opt.value]
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                            {selected[opt.value] ? '✓' : ''}
                        </div>
                        <span className={`text-sm font-medium ${
                            selected[opt.value] ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                            {opt.label}
                        </span>
                    </button>
                ))}
            </div>
            <button
                onClick={() => onSubmit(selected)}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function MediaUploadInput({ value, onSubmit, onUpload }: {
    value: any;
    onSubmit: (v: string[]) => void;
    onUpload?: (files: File[]) => Promise<string[]>;
}) {
    const [urls, setUrls] = useState<string[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [rejections, setRejections] = useState<Array<{ file: string; reason: string }>>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0 || !onUpload) return;
        setUploading(true);
        setRejections([]);
        try {
            const result = await onUpload(Array.from(files));
            // result may be a plain string[] or an object with { urls, rejected }
            if (Array.isArray(result)) {
                // Check if the response was wrapped in an object with rejected info
                const asAny = result as any;
                if (asAny.urls && Array.isArray(asAny.urls)) {
                    setUrls(prev => [...prev, ...asAny.urls]);
                    if (asAny.rejected && Array.isArray(asAny.rejected) && asAny.rejected.length > 0) {
                        setRejections(asAny.rejected);
                    }
                } else {
                    setUrls(prev => [...prev, ...result]);
                }
            } else {
                // Object response: { urls: string[], rejected?: Array<{file,reason}> }
                const obj = result as any;
                if (obj.urls) setUrls(prev => [...prev, ...obj.urls]);
                if (obj.rejected && Array.isArray(obj.rejected) && obj.rejected.length > 0) {
                    setRejections(obj.rejected);
                }
            }
        } catch { /* ignore */ }
        setUploading(false);
    }, [onUpload]);

    const removeUrl = (idx: number) => {
        setUrls(prev => prev.filter((_, i) => i !== idx));
    };

    const dismissRejections = () => setRejections([]);

    return (
        <div className="flex flex-col gap-4">
            <div
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
            >
                {uploading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-2" />
                ) : (
                    <Camera className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                )}
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {uploading ? 'Uploading...' : 'Click to upload photos'}
                </p>
                <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP — Max 10MB each, up to 10 photos</p>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={e => handleFiles(e.target.files)}
                />
            </div>

            {urls.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                    {urls.map((url, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                            <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                                onClick={() => removeUrl(idx)}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Image rejection feedback */}
            {rejections.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                {rejections.length} image{rejections.length > 1 ? 's' : ''} rejected
                            </p>
                            <ul className="space-y-1">
                                {rejections.map((r, idx) => (
                                    <li key={idx} className="text-xs text-amber-700 dark:text-amber-400">
                                        <span className="font-medium">{r.file}:</span> {r.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button onClick={dismissRejections} className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 flex-shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}

            <button
                onClick={() => onSubmit(urls)}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                {urls.length > 0 ? `Continue with ${urls.length} photo${urls.length > 1 ? 's' : ''}` : 'Skip Photos'} <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function VideoUploadInput({ value, onSubmit, onUpload }: {
    value: any;
    onSubmit: (v: string[]) => void;
    onUpload?: (files: File[]) => Promise<string[]>;
}) {
    const [urls, setUrls] = useState<string[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0 || !onUpload) return;
        const remaining = 3 - urls.length;
        if (remaining <= 0) return;
        const selected = Array.from(files).slice(0, remaining);
        setUploading(true);
        try {
            const newUrls = await onUpload(selected);
            setUrls(prev => [...prev, ...newUrls]);
        } catch { /* ignore */ }
        setUploading(false);
    }, [onUpload, urls.length]);

    const removeUrl = (idx: number) => {
        setUrls(prev => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="flex flex-col gap-4">
            <div
                onClick={() => urls.length < 3 ? inputRef.current?.click() : undefined}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    urls.length >= 3
                        ? 'border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-60'
                        : 'border-slate-300 dark:border-slate-700 cursor-pointer hover:border-emerald-500'
                }`}
            >
                {uploading ? (
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-2" />
                ) : (
                    <Video className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                )}
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {uploading ? 'Uploading...' : urls.length >= 3 ? 'Maximum 3 videos reached' : 'Click to upload videos'}
                </p>
                <p className="text-xs text-slate-400 mt-1">MP4, WebM, MOV, AVI — Max 50MB each, up to 3 videos</p>
                <input
                    ref={inputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                    multiple
                    className="hidden"
                    onChange={e => handleFiles(e.target.files)}
                />
            </div>

            {urls.length > 0 && (
                <div className="space-y-2">
                    {urls.map((url, idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <Video className="w-5 h-5 text-blue-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Video {idx + 1}</span>
                            </div>
                            <button onClick={() => removeUrl(idx)} className="text-red-400 hover:text-red-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={() => onSubmit(urls)}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                {urls.length > 0 ? `Continue with ${urls.length} video${urls.length > 1 ? 's' : ''}` : 'Skip Videos'} <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function DocumentUploadInput({ value, documentTypes, onSubmit, onUpload }: {
    value: any;
    documentTypes: WorkflowDocType[];
    onSubmit: (v: any[]) => void;
    onUpload?: (file: File, docType: string, title: string) => Promise<any>;
}) {
    const [docs, setDocs] = useState<any[]>(value || []);
    const [uploading, setUploading] = useState(false);
    const [docType, setDocType] = useState(documentTypes[0]?.value || 'other');
    const [title, setTitle] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0 || !onUpload) return;
        const file = files[0];
        setUploading(true);
        try {
            const result = await onUpload(file, docType, title || file.name);
            setDocs(prev => [...prev, result]);
            setTitle('');
        } catch { /* ignore */ }
        setUploading(false);
    }, [onUpload, docType, title]);

    const removeDoc = (idx: number) => {
        setDocs(prev => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <select
                        value={docType}
                        onChange={e => setDocType(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    >
                        {documentTypes.map(dt => (
                            <option key={dt.value} value={dt.value}>{dt.label}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Document title"
                        className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 text-sm"
                    />
                </div>
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={e => handleFile(e.target.files)}
                />
            </div>

            {docs.length > 0 && (
                <div className="space-y-2">
                    {docs.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-500" />
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{doc.title}</p>
                                    <p className="text-xs text-slate-400">{doc.doc_type?.replace(/_/g, ' ')}</p>
                                </div>
                            </div>
                            <button onClick={() => removeDoc(idx)} className="text-red-400 hover:text-red-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={() => onSubmit(docs)}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                {docs.length > 0 ? `Continue with ${docs.length} doc${docs.length > 1 ? 's' : ''}` : 'Skip Documents'} <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function AddressBlockInput({ value, onSubmit, addressConfig }: {
    value: any;
    onSubmit: (v: any) => void;
    addressConfig?: AddressConfig | null;
}) {
    const config = addressConfig || { sub_category_slug: '', floor_required: true, bhk_required: false, plot_area_required: false };

    // Determine which fields to show based on address config
    const showFlatNo = config.floor_required;
    const showFloorNumber = config.floor_required;
    const showApartmentName = config.floor_required || config.bhk_required || (!config.plot_area_required && !config.floor_required);
    const showPlotNo = !config.floor_required;
    const plotNoRequired = config.plot_area_required && !config.floor_required;
    const apartmentRequired = config.floor_required;

    // Contextual labels
    const slug = config.sub_category_slug || '';
    let flatNoLabel = 'Flat / Unit No';
    if (['office'].includes(slug)) flatNoLabel = 'Office No';
    else if (['retail'].includes(slug)) flatNoLabel = 'Shop No';
    else if (['healthcare', 'mixed_development'].includes(slug)) flatNoLabel = 'Unit No';

    let apartmentLabel = 'Society / Apartment';
    if (!config.floor_required && config.bhk_required) apartmentLabel = 'Colony / Society';
    else if (['office'].includes(slug)) apartmentLabel = 'Building / Complex';
    else if (['retail'].includes(slug)) apartmentLabel = 'Mall / Market';
    else if (['industrial', 'manufacturing', 'industrial_park'].includes(slug)) apartmentLabel = 'Complex / Area';
    else if (['educational'].includes(slug)) apartmentLabel = 'Campus';
    else if (['religious'].includes(slug)) apartmentLabel = 'Name';
    else if (['hospitality'].includes(slug)) apartmentLabel = 'Property Name';
    else if (!config.floor_required && !config.bhk_required) apartmentLabel = 'Building / Complex';

    let plotNoLabel = 'Plot No';
    if (config.bhk_required && !config.floor_required) plotNoLabel = 'House / Plot No';

    const [flatNo, setFlatNo] = useState(value?.flat_no || '');
    const [floorNumber, setFloorNumber] = useState(value?.floor_number || '');
    // Named floor levels (Ground/Upper Ground/Basement/Stilt). When set, floor_number holds the sort key.
    const [floorLabel, setFloorLabel] = useState(value?.floor_label || '');
    const [plotNo, setPlotNo] = useState(value?.plot_no || '');
    const [apartmentName, setApartmentName] = useState(value?.apartment_name || '');
    const [locality, setLocality] = useState(value?.locality || '');
    const [city, setCity] = useState(value?.city || value?.district || '');
    const [state, setState] = useState(value?.state || '');
    const [pincode, setPincode] = useState(value?.pincode || '');
    const [fullAddress, setFullAddress] = useState(value?.full_address || '');
    const [latitude, setLatitude] = useState<number | undefined>(value?.latitude);
    const [longitude, setLongitude] = useState<number | undefined>(value?.longitude);
    const [states, setStates] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handlePlaceSelect = useCallback((place: PlaceResult) => {
        if (place.locality) setLocality(place.locality);
        if (place.district) setCity(place.district);
        if (place.state) setState(place.state);
        if (place.pincode) setPincode(place.pincode);
        if (place.full_address) setFullAddress(place.full_address);
        if (place.latitude != null) setLatitude(place.latitude);
        if (place.longitude != null) setLongitude(place.longitude);
    }, []);

    useEffect(() => {
        getStates().then((data) => {
            const list = Array.isArray(data) ? data : data?.states || [];
            setStates(list.map((s: any) => typeof s === 'string' ? s : s.name || s.label || '').filter(Boolean));
        }).catch(() => {});
    }, []);

    // z-index fix for Google Places autocomplete dropdown
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = '.pac-container { z-index: 99999 !important; }';
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const validate = useCallback(() => {
        const errs: Record<string, string> = {};
        if (showFlatNo && !flatNo.trim()) errs.flat_no = `${flatNoLabel} is required`;
        if (showFloorNumber && !String(floorNumber).trim() && !floorLabel.trim()) errs.floor_number = 'Floor is required';
        if (apartmentRequired && !apartmentName.trim()) errs.apartment_name = `${apartmentLabel} is required`;
        if (plotNoRequired && !plotNo.trim()) errs.plot_no = `${plotNoLabel} is required`;
        if (!locality.trim()) errs.locality = 'Locality is required';
        if (!city.trim()) errs.city = 'City is required';
        if (!state.trim()) errs.state = 'State is required';
        if (!pincode.trim() || !/^[1-9][0-9]{5}$/.test(pincode.trim())) errs.pincode = 'Valid 6-digit pincode required';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [flatNo, floorNumber, floorLabel, apartmentName, plotNo, locality, city, state, pincode,
        showFlatNo, showFloorNumber, apartmentRequired, plotNoRequired, flatNoLabel, apartmentLabel, plotNoLabel]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;
        const result: Record<string, any> = {};
        if (showFlatNo && flatNo.trim()) result.flat_no = flatNo.trim();
        if (showFloorNumber && String(floorNumber).trim()) result.floor_number = String(floorNumber).trim();
        if (showFloorNumber && floorLabel.trim()) result.floor_label = floorLabel.trim();
        if (showPlotNo && plotNo.trim()) result.plot_no = plotNo.trim();
        if (showApartmentName && apartmentName.trim()) result.apartment_name = apartmentName.trim();
        result.locality = locality.trim();
        result.city = city.trim();
        result.state = state.trim();
        result.pincode = pincode.trim();

        // Use Google Places full address or build from visible fields
        result.full_address = fullAddress.trim() || [
            result.flat_no,
            result.plot_no,
            result.apartment_name,
            result.locality,
            result.city,
            result.state,
            result.pincode ? `- ${result.pincode}` : '',
        ].filter(Boolean).join(', ').replace(', -', ' -');

        if (latitude != null) result.latitude = latitude;
        if (longitude != null) result.longitude = longitude;

        onSubmit(result);
    }, [flatNo, floorNumber, floorLabel, plotNo, apartmentName, locality, city, state, pincode, fullAddress, latitude, longitude,
        showFlatNo, showFloorNumber, showPlotNo, showApartmentName, validate, onSubmit]);

    const inputCls = 'w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-sm';
    const errCls = 'text-xs text-red-500 dark:text-red-400 mt-1';

    return (
        <div className="flex flex-col gap-4" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
            {/* Google Places Search */}
            <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    <Search className="w-3 h-3" /> Search Location (auto-fills fields below)
                </label>
                <GooglePlacesInput
                    value={fullAddress}
                    onChange={setFullAddress}
                    onPlaceSelect={handlePlaceSelect}
                    placeholder="Type to search (e.g. Gaur City 2, Sector 150, Noida)"
                    className={inputCls}
                />
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                <MapPin className="w-4 h-4" /> Fill in the property address details
            </div>

            {/* Row 1: Flat/Unit No + Floor No (only for floor-required types) */}
            {(showFlatNo || showFloorNumber) && (
                <div className="grid grid-cols-2 gap-3">
                    {showFlatNo && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{flatNoLabel} *</label>
                            <input type="text" value={flatNo} onChange={e => setFlatNo(e.target.value)} placeholder={`e.g. ${slug === 'retail' ? 'S-12' : slug === 'office' ? 'O-501' : 'A-1201'}`} className={`${inputCls} ${errors.flat_no ? 'border-red-500' : ''}`} />
                            {errors.flat_no && <p className={errCls}>{errors.flat_no}</p>}
                        </div>
                    )}
                    {showFloorNumber && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Floor *</label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {FLOOR_PRESETS.map(p => {
                                    const active = floorLabel === p.label;
                                    return (
                                        <button type="button" key={p.label}
                                            onClick={() => { if (active) { setFloorLabel(''); setFloorNumber(''); } else { setFloorLabel(p.label); setFloorNumber(String(p.sort)); } }}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}>
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <input type="number" value={floorLabel ? '' : floorNumber} onChange={e => { setFloorNumber(e.target.value); setFloorLabel(''); }} placeholder="or a number — e.g. 3, or -1" className={`${inputCls} ${errors.floor_number ? 'border-red-500' : ''}`} />
                            {errors.floor_number && <p className={errCls}>{errors.floor_number}</p>}
                        </div>
                    )}
                </div>
            )}

            {/* Plot No + Apartment/Society row */}
            {(showPlotNo || showApartmentName) && (
                <div className={`grid gap-3 ${showPlotNo && showApartmentName ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {showPlotNo && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{plotNoLabel}{plotNoRequired ? ' *' : ''}</label>
                            <input type="text" value={plotNo} onChange={e => setPlotNo(e.target.value)} placeholder="e.g. Plot 42" className={`${inputCls} ${errors.plot_no ? 'border-red-500' : ''}`} />
                            {errors.plot_no && <p className={errCls}>{errors.plot_no}</p>}
                        </div>
                    )}
                    {showApartmentName && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{apartmentLabel}{apartmentRequired ? ' *' : ''}</label>
                            <input type="text" value={apartmentName} onChange={e => setApartmentName(e.target.value)} placeholder={`e.g. ${config.bhk_required ? 'Green Valley Colony' : 'Gaur City 2'}`} className={`${inputCls} ${errors.apartment_name ? 'border-red-500' : ''}`} />
                            {errors.apartment_name && <p className={errCls}>{errors.apartment_name}</p>}
                        </div>
                    )}
                </div>
            )}

            {/* Locality */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Locality *</label>
                <input type="text" value={locality} onChange={e => setLocality(e.target.value)} placeholder="e.g. Sector 150" className={`${inputCls} ${errors.locality ? 'border-red-500' : ''}`} />
                {errors.locality && <p className={errCls}>{errors.locality}</p>}
            </div>

            {/* City + State */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">City *</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Noida" className={`${inputCls} ${errors.city ? 'border-red-500' : ''}`} />
                    {errors.city && <p className={errCls}>{errors.city}</p>}
                </div>
                <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">State *</label>
                    <select value={state} onChange={e => setState(e.target.value)} className={`${inputCls} ${errors.state ? 'border-red-500' : ''}`}>
                        <option value="">Select State</option>
                        {states.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                    {errors.state && <p className={errCls}>{errors.state}</p>}
                </div>
            </div>

            {/* Pincode */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Pincode *</label>
                <input type="text" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 201310" className={`${inputCls} ${errors.pincode ? 'border-red-500' : ''}`} maxLength={6} />
                {errors.pincode && <p className={errCls}>{errors.pincode}</p>}
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function OwnerBlockInput({ value, onSubmit }: {
    value: any;
    onSubmit: (v: any) => void;
}) {
    const [isOwner, setIsOwner] = useState<boolean>(value?.is_owner ?? true);
    const [ownerName, setOwnerName] = useState(value?.owner_name || '');
    const [ownerPhone, setOwnerPhone] = useState(value?.owner_phone || '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = useCallback(() => {
        const errs: Record<string, string> = {};
        if (!ownerName.trim()) errs.owner_name = 'Owner name is required';
        if (!ownerPhone.trim()) {
            errs.owner_phone = 'Owner phone is required';
        } else {
            const clean = ownerPhone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
            if (!/^\d{10,12}$/.test(clean)) errs.owner_phone = 'Enter a valid 10-digit phone number';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [ownerName, ownerPhone]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;
        onSubmit({
            is_owner: isOwner,
            owner_name: ownerName.trim(),
            owner_phone: ownerPhone.trim() || undefined,
        });
    }, [isOwner, ownerName, ownerPhone, validate, onSubmit]);

    const inputCls = 'w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-sm';
    const errCls = 'text-xs text-red-500 dark:text-red-400 mt-1';

    return (
        <div className="flex flex-col gap-4" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
            {/* Toggle */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => setIsOwner(true)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                        isOwner ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                >
                    <span className={`text-sm font-bold ${isOwner ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        Yes, I am the owner
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setIsOwner(false)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                        !isOwner ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                >
                    <span className={`text-sm font-bold ${!isOwner ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        No, someone else
                    </span>
                </button>
            </div>

            {/* Owner Name */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Owner Name *</label>
                <input
                    type="text"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="Full name of the property owner"
                    className={`${inputCls} ${errors.owner_name ? 'border-red-500' : ''}`}
                    autoFocus
                />
                {errors.owner_name && <p className={errCls}>{errors.owner_name}</p>}
            </div>

            {/* Owner Phone */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Owner Phone *</label>
                <input
                    type="tel"
                    value={ownerPhone}
                    onChange={e => setOwnerPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                    placeholder="e.g. 9876543210"
                    className={`${inputCls} ${errors.owner_phone ? 'border-red-500' : ''}`}
                />
                {errors.owner_phone && <p className={errCls}>{errors.owner_phone}</p>}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Owner will be mapped for future property tracking.
                </p>
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function UploaderBlockInput({ value, onSubmit }: {
    value: any;
    onSubmit: (v: any) => void;
}) {
    const [uploaderName, setUploaderName] = useState(value?.uploader_name || '');
    const [uploaderPhone, setUploaderPhone] = useState(value?.uploader_phone || '');
    const [uploaderEmail, setUploaderEmail] = useState(value?.uploader_email || '');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = useCallback(() => {
        const errs: Record<string, string> = {};
        if (!uploaderName.trim()) errs.uploader_name = 'Your name is required';
        if (!uploaderPhone.trim()) {
            errs.uploader_phone = 'Your phone number is required';
        } else {
            const clean = uploaderPhone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
            if (!/^\d{10,12}$/.test(clean)) errs.uploader_phone = 'Enter a valid 10-digit phone number';
        }
        // Email is optional, but if provided, validate format
        if (uploaderEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uploaderEmail.trim())) {
            errs.uploader_email = 'Enter a valid email address';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [uploaderName, uploaderPhone, uploaderEmail]);

    const handleSubmit = useCallback(() => {
        if (!validate()) return;
        onSubmit({
            uploader_name: uploaderName.trim(),
            uploader_phone: uploaderPhone.trim(),
            uploader_email: uploaderEmail.trim() || undefined,
        });
    }, [uploaderName, uploaderPhone, uploaderEmail, validate, onSubmit]);

    const inputCls = 'w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none text-sm';
    const errCls = 'text-xs text-red-500 dark:text-red-400 mt-1';

    return (
        <div className="flex flex-col gap-4" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}>
            {/* Name */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Your Name *</label>
                <input
                    type="text"
                    value={uploaderName}
                    onChange={e => setUploaderName(e.target.value)}
                    placeholder="Full name"
                    className={`${inputCls} ${errors.uploader_name ? 'border-red-500' : ''}`}
                    autoFocus
                />
                {errors.uploader_name && <p className={errCls}>{errors.uploader_name}</p>}
            </div>

            {/* Phone */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Your Phone Number *</label>
                <input
                    type="tel"
                    value={uploaderPhone}
                    onChange={e => setUploaderPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                    placeholder="e.g. 9876543210"
                    className={`${inputCls} ${errors.uploader_phone ? 'border-red-500' : ''}`}
                />
                {errors.uploader_phone && <p className={errCls}>{errors.uploader_phone}</p>}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    We&apos;ll use this to send property updates and confirmations.
                </p>
            </div>

            {/* Email (Optional) */}
            <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Your Email (Optional)</label>
                <input
                    type="email"
                    value={uploaderEmail}
                    onChange={e => setUploaderEmail(e.target.value)}
                    placeholder="e.g. example@gmail.com"
                    className={`${inputCls} ${errors.uploader_email ? 'border-red-500' : ''}`}
                />
                {errors.uploader_email && <p className={errCls}>{errors.uploader_email}</p>}
            </div>

            <button
                type="button"
                onClick={handleSubmit}
                className="self-end flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
                Next <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}
