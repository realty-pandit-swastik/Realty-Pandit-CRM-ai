import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getWorkflowDefinition,
    getWorkflowNextStep,
    getWorkflowPreviousStep,
    validateWorkflowStep,
    getWorkflowSummary,
    commitWorkflow,
    uploadWorkflowMedia,
    uploadWorkflowVideo,
    uploadWorkflowDocument,
} from '../api/client';

export interface WorkflowStep {
    id: string;
    group: string;
    question: string;
    question_hi?: string;
    input_type: string;
    field: string;
    placeholder?: string;
    secondary_field?: string;
    secondary_options?: Array<{ value: string; label: string }>;
    options_source?: string;
    static_options?: Array<{ value: string; label: string; label_hi?: string }>;
    required?: boolean;
    validation?: { min?: number; max?: number; pattern?: string; message?: string };
    allow_group_skip?: boolean;
    help_text?: string;
    help_text_hi?: string;
}

export interface WorkflowGroup {
    id: string;
    label: string;
    icon: string;
}

export interface StepOption {
    value: string;
    label: string;
}

export interface DocType {
    value: string;
    label: string;
}

export function useWorkflow() {
    const [loading, setLoading] = useState(true);
    const [stepLoading, setStepLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [groups, setGroups] = useState<WorkflowGroup[]>([]);
    const [documentTypes, setDocumentTypes] = useState<DocType[]>([]);

    const [currentStep, setCurrentStep] = useState<WorkflowStep | null>(null);
    const [currentOptions, setCurrentOptions] = useState<StepOption[]>([]);
    const [stepMetadata, setStepMetadata] = useState<Record<string, any> | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [stepHistory, setStepHistory] = useState<string[]>([]);
    const [done, setDone] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [inventoryId, setInventoryId] = useState('');
    const [displayId, setDisplayId] = useState('');
    const [completionPct, setCompletionPct] = useState(0);
    const [summary, setSummary] = useState<Record<string, string> | null>(null);

    // Enrichment state (v3)
    const [enrichmentMode, setEnrichmentMode] = useState(false);
    const [enrichmentInventoryId, setEnrichmentInventoryId] = useState('');

    const initDone = useRef(false);

    useEffect(() => {
        if (initDone.current) return;
        initDone.current = true;

        (async () => {
            try {
                const def = await getWorkflowDefinition();
                setGroups(def.groups);
                setDocumentTypes(def.document_types);

                const result = await getWorkflowNextStep(null, {}, 'admin');
                if (result.step) {
                    setCurrentStep(result.step);
                    setCurrentOptions(result.options || []);
                    setStepMetadata(result.metadata || null);
                }
            } catch (err: any) {
                setError(err?.response?.data?.error || err?.message || 'Failed to load workflow');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Cleanup on unmount - reset all workflow state
    useEffect(() => {
        return () => {
            setAnswers({});
            setStepHistory([]);
            setCurrentStep(null);
            setCurrentOptions([]);
            setStepMetadata(null);
            setDone(false);
            setSubmitted(false);
            setInventoryId('');
            setDisplayId('');
            setCompletionPct(0);
            setSummary(null);
            setError('');
            setEnrichmentMode(false);
            setEnrichmentInventoryId('');
            initDone.current = false; // Critical: reset the guard
        };
    }, []);

    const answerStep = useCallback(async (value: any, secondaryValue?: any) => {
        if (!currentStep) return;
        setError('');
        setStepLoading(true);

        try {
            // Allow group skip without validation
            if (value !== '__skip__') {
                const validation = await validateWorkflowStep(currentStep.id, value, answers);
                if (!validation.valid) {
                    setError(validation.error || 'Invalid input');
                    setStepLoading(false);
                    return;
                }
            }

            const newAnswers = { ...answers, [currentStep.field]: value };
            if (secondaryValue !== undefined && currentStep.secondary_field) {
                newAnswers[currentStep.secondary_field] = secondaryValue;
            }
            setAnswers(newAnswers);

            const newHistory = [...stepHistory, currentStep.id];
            setStepHistory(newHistory);

            const result = await getWorkflowNextStep(currentStep.id, newAnswers, 'admin');
            if (result.done) {
                setDone(true);
                setCurrentStep(null);
                setCurrentOptions([]);
                setStepMetadata(null);
                try {
                    const s = await getWorkflowSummary(newAnswers);
                    setSummary(s.summary);
                } catch { /* ignore */ }
            } else if (result.step) {
                setCurrentStep(result.step);
                setCurrentOptions(result.options || []);
                setStepMetadata(result.metadata || null);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to advance');
        } finally {
            setStepLoading(false);
        }
    }, [currentStep, answers, stepHistory]);

    /**
     * Skip entire media group (v3).
     * Sets the current step's field to '__skip__' and advances.
     */
    const skipMediaGroup = useCallback(async () => {
        if (!currentStep || !currentStep.allow_group_skip) return;
        await answerStep('__skip__');
    }, [currentStep, answerStep]);

    const goBack = useCallback(async () => {
        if (stepHistory.length === 0) return;
        setError('');
        setStepLoading(true);

        try {
            if (done) {
                // Going back from confirm screen → navigate to the last answered step
                setDone(false);
                setSummary(null);

                const lastStepId = stepHistory[stepHistory.length - 1];
                const result = await getWorkflowPreviousStep(lastStepId, answers, 'admin');
                if (stepHistory.length >= 2) {
                    const secondToLastId = stepHistory[stepHistory.length - 2];
                    const navResult = await getWorkflowNextStep(secondToLastId, answers, 'admin');
                    if (navResult.step) {
                        setCurrentStep(navResult.step);
                        setCurrentOptions(navResult.options || []);
                        setStepMetadata(navResult.metadata || null);
                    }
                } else if (result?.step) {
                    setCurrentStep(result.step);
                    setCurrentOptions(result.options || []);
                    setStepMetadata(null);
                }
            } else {
                // Normal back navigation
                const newHistory = stepHistory.slice(0, -1);
                setStepHistory(newHistory);

                if (currentStep) {
                    const newAnswers = { ...answers };
                    delete newAnswers[currentStep.field];
                    if (currentStep.secondary_field) delete newAnswers[currentStep.secondary_field];
                    setAnswers(newAnswers);
                }

                const prevStepId = currentStep?.id;
                if (!prevStepId) {
                    setStepLoading(false);
                    return;
                }
                const result = await getWorkflowPreviousStep(prevStepId, answers, 'admin');
                if (result.step) {
                    setCurrentStep(result.step);
                    setCurrentOptions(result.options || []);
                    setStepMetadata(null);
                }
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to go back');
        } finally {
            setStepLoading(false);
        }
    }, [stepHistory, currentStep, answers, done]);

    const skipStep = useCallback(async () => {
        if (!currentStep || currentStep.required) return;
        setError('');
        setStepLoading(true);

        try {
            const newHistory = [...stepHistory, currentStep.id];
            setStepHistory(newHistory);

            const result = await getWorkflowNextStep(currentStep.id, answers, 'admin');
            if (result.done) {
                setDone(true);
                setCurrentStep(null);
                setStepMetadata(null);
                try {
                    const s = await getWorkflowSummary(answers);
                    setSummary(s.summary);
                } catch { /* ignore */ }
            } else if (result.step) {
                setCurrentStep(result.step);
                setCurrentOptions(result.options || []);
                setStepMetadata(result.metadata || null);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to skip');
        } finally {
            setStepLoading(false);
        }
    }, [currentStep, answers, stepHistory]);

    const submit = useCallback(async (extras?: Record<string, any>) => {
        setError('');
        setSubmitting(true);
        try {
            // `extras` lets callers inject fields that aren't part of the step-by-step wizard
            // (e.g. source_partner_id / source_partner_phone for the middleman model).
            const payload = extras ? { ...answers, ...extras } : answers;
            const result = await commitWorkflow(payload, 'admin');
            setInventoryId(result.inventory_id);
            setDisplayId(result.display_id || '');
            setCompletionPct(result.completion_pct || 0);
            setSubmitted(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to submit');
        } finally {
            setSubmitting(false);
        }
    }, [answers]);

    const startEnrichment = useCallback((invId?: string) => {
        setEnrichmentMode(true);
        setEnrichmentInventoryId(invId || inventoryId);
    }, [inventoryId]);

    const reset = useCallback(() => {
        setAnswers({});
        setStepHistory([]);
        setCurrentStep(null);
        setCurrentOptions([]);
        setStepMetadata(null);
        setDone(false);
        setSubmitted(false);
        setInventoryId('');
        setDisplayId('');
        setCompletionPct(0);
        setSummary(null);
        setError('');
        setEnrichmentMode(false);
        setEnrichmentInventoryId('');
        initDone.current = false;

        (async () => {
            setLoading(true);
            try {
                const result = await getWorkflowNextStep(null, {}, 'admin');
                if (result.step) {
                    setCurrentStep(result.step);
                    setCurrentOptions(result.options || []);
                    setStepMetadata(result.metadata || null);
                }
            } catch { /* ignore */ }
            setLoading(false);
        })();
    }, []);

    const uploadPhotos = useCallback(async (files: File[]) => {
        const result = await uploadWorkflowMedia(files);
        return result.urls as string[];
    }, []);

    const uploadVideos = useCallback(async (files: File[]) => {
        const result = await uploadWorkflowVideo(files);
        return result.urls as string[];
    }, []);

    const uploadDoc = useCallback(async (file: File, docType: string, title: string) => {
        return uploadWorkflowDocument(file, docType, title);
    }, []);

    return {
        loading, stepLoading, submitting, error,
        groups, documentTypes,
        currentStep, currentOptions, stepMetadata, answers, stepHistory,
        done, submitted, inventoryId, displayId, completionPct, summary,
        answerStep, goBack, skipStep, skipMediaGroup, submit, reset,
        uploadPhotos, uploadVideos, uploadDocument: uploadDoc,
        // Enrichment (v3)
        enrichmentMode, enrichmentInventoryId, startEnrichment,
    };
}
