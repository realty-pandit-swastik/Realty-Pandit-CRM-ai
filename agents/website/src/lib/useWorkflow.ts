'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getWorkflowDefinition,
    getWorkflowNextStep,
    getWorkflowPreviousStep,
    validateWorkflowStep,
    getWorkflowOptions,
    getWorkflowSummary,
    commitWorkflow,
    uploadWorkflowMedia,
    uploadWorkflowVideo,
    uploadWorkflowDocument,
    type WorkflowStepDef,
    type WorkflowGroup,
    type WorkflowStepOption,
    type WorkflowDocType,
} from './api';

const DRAFT_KEY = 'realty-pandit-workflow-draft-v2';
const SESSION_KEY = 'realty-pandit-workflow-session';
const FRESH_START_FLAG = 'realty-pandit-workflow-fresh';

function generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface WorkflowHookState {
    // Loading
    loading: boolean;
    stepLoading: boolean;
    submitting: boolean;
    error: string;

    // Definition
    groups: WorkflowGroup[];
    documentTypes: WorkflowDocType[];

    // Navigation
    currentStep: WorkflowStepDef | null;
    currentOptions: WorkflowStepOption[];
    stepMetadata: Record<string, any> | null;
    answers: Record<string, any>;
    stepHistory: string[];  // Stack of visited step IDs (for back navigation)
    done: boolean;
    submitted: boolean;
    inventoryId: string;

    // Summary
    summary: Record<string, string> | null;

    // Actions
    answerStep: (value: any, secondaryValue?: any) => Promise<void>;
    goBack: () => Promise<void>;
    skipStep: () => Promise<void>;
    submit: () => Promise<void>;
    reset: () => void;
    uploadPhotos: (files: File[]) => Promise<string[]>;
    uploadVideos: (files: File[]) => Promise<string[]>;
    uploadDocument: (file: File, docType: string, title: string) => Promise<any>;
    fetchSummary: () => Promise<void>;
    fetchOptions: () => Promise<void>;
}

export function useWorkflow(): WorkflowHookState {
    const [loading, setLoading] = useState(true);
    const [stepLoading, setStepLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [groups, setGroups] = useState<WorkflowGroup[]>([]);
    const [documentTypes, setDocumentTypes] = useState<WorkflowDocType[]>([]);

    const [currentStep, setCurrentStep] = useState<WorkflowStepDef | null>(null);
    const [currentOptions, setCurrentOptions] = useState<WorkflowStepOption[]>([]);
    const [stepMetadata, setStepMetadata] = useState<Record<string, any> | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [stepHistory, setStepHistory] = useState<string[]>([]);
    const [done, setDone] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [inventoryId, setInventoryId] = useState('');
    const [summary, setSummary] = useState<Record<string, string> | null>(null);

    const initDone = useRef(false);

    // Load draft + definition on mount
    useEffect(() => {
        if (initDone.current) return;
        initDone.current = true;

        (async () => {
            try {
                // Check for fresh start flag
                const forceFresh = sessionStorage.getItem(FRESH_START_FLAG);
                const currentSession = sessionStorage.getItem(SESSION_KEY);

                // Load saved draft (unless forced fresh start)
                let savedAnswers: Record<string, any> = {};
                let savedHistory: string[] = [];
                let savedStepId: string | null = null;

                if (forceFresh === 'true' || !currentSession) {
                    // Start fresh - clear draft and create new session
                    localStorage.removeItem(DRAFT_KEY);
                    sessionStorage.removeItem(FRESH_START_FLAG);
                    const newSession = generateSessionId();
                    sessionStorage.setItem(SESSION_KEY, newSession);
                } else {
                    // Resume from draft
                    try {
                        const raw = localStorage.getItem(DRAFT_KEY);
                        if (raw) {
                            const draft = JSON.parse(raw);
                            if (draft.answers) savedAnswers = draft.answers;
                            if (draft.stepHistory) savedHistory = draft.stepHistory;
                            if (draft.currentStepId) savedStepId = draft.currentStepId;
                        }
                    } catch { /* ignore */ }
                }

                // Fetch definition
                const def = await getWorkflowDefinition();
                setGroups(def.groups);
                setDocumentTypes(def.document_types);
                setAnswers(savedAnswers);
                setStepHistory(savedHistory);

                // Resume from saved step or start fresh
                if (savedStepId && Object.keys(savedAnswers).length > 0) {
                    // We have a draft — fetch the current step
                    const result = await getWorkflowNextStep(
                        savedHistory.length > 0 ? savedHistory[savedHistory.length - 1] : null,
                        savedAnswers
                    );
                    if (result.done) {
                        setDone(true);
                    } else if (result.step) {
                        setCurrentStep(result.step);
                        setCurrentOptions(result.options || []);
                        setStepMetadata(result.metadata || null);
                    }
                } else {
                    // Start fresh — get first step
                    const result = await getWorkflowNextStep(null, {});
                    if (result.step) {
                        setCurrentStep(result.step);
                        setCurrentOptions(result.options || []);
                        setStepMetadata(result.metadata || null);
                    }
                }
            } catch (err: any) {
                setError(err?.response?.data?.error || err?.message || 'Failed to load workflow');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Cleanup on unmount - only clear session if workflow is incomplete
    useEffect(() => {
        return () => {
            if (!submitted && !done) {
                sessionStorage.removeItem(SESSION_KEY);
            }
        };
    }, [submitted, done]);

    // Save draft whenever answers change
    const saveDraft = useCallback(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                answers,
                stepHistory,
                currentStepId: currentStep?.id || null,
            }));
        } catch { /* ignore */ }
    }, [answers, stepHistory, currentStep]);

    useEffect(() => {
        if (!loading && currentStep) saveDraft();
    }, [answers, stepHistory, currentStep, loading, saveDraft]);

    // Answer current step and advance
    const answerStep = useCallback(async (value: any, secondaryValue?: any) => {
        if (!currentStep) return;
        setError('');
        setStepLoading(true);

        try {
            // Validate
            const validation = await validateWorkflowStep(currentStep.id, value, answers);
            if (!validation.valid) {
                setError(validation.error || 'Invalid input');
                setStepLoading(false);
                return;
            }

            // Store answer
            const newAnswers = { ...answers, [currentStep.field]: value };
            if (secondaryValue !== undefined && currentStep.secondary_field) {
                newAnswers[currentStep.secondary_field] = secondaryValue;
            }
            setAnswers(newAnswers);

            // Track history
            const newHistory = [...stepHistory, currentStep.id];
            setStepHistory(newHistory);

            // Get next step
            const result = await getWorkflowNextStep(currentStep.id, newAnswers);
            if (result.done) {
                setDone(true);
                setCurrentStep(null);
                setCurrentOptions([]);
                setStepMetadata(null);
                // Auto-fetch summary
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

    // Go back one step
    const goBack = useCallback(async () => {
        if (stepHistory.length === 0) return;
        setError('');
        setStepLoading(true);

        try {
            if (done) {
                // Going back from confirm screen → navigate to the last answered step
                setDone(false);
                setSummary(null);

                if (stepHistory.length >= 2) {
                    const secondToLastId = stepHistory[stepHistory.length - 2];
                    const navResult = await getWorkflowNextStep(secondToLastId, answers);
                    if (navResult.step) {
                        setCurrentStep(navResult.step);
                        setCurrentOptions(navResult.options || []);
                        setStepMetadata(navResult.metadata || null);
                    }
                } else {
                    // Only 1 step in history — go to first step
                    const navResult = await getWorkflowNextStep(null, answers);
                    if (navResult.step) {
                        setCurrentStep(navResult.step);
                        setCurrentOptions(navResult.options || []);
                        setStepMetadata(navResult.metadata || null);
                    }
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

                const result = await getWorkflowPreviousStep(
                    currentStep?.id || stepHistory[stepHistory.length - 1],
                    answers
                );

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

    // Skip optional step
    const skipStep = useCallback(async () => {
        if (!currentStep || currentStep.required) return;
        // Advance without providing a value
        setError('');
        setStepLoading(true);

        try {
            const newHistory = [...stepHistory, currentStep.id];
            setStepHistory(newHistory);

            const result = await getWorkflowNextStep(currentStep.id, answers);
            if (result.done) {
                setDone(true);
                setCurrentStep(null);
                setCurrentOptions([]);
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

    // Submit/commit
    const submit = useCallback(async () => {
        setError('');
        setSubmitting(true);

        try {
            const result = await commitWorkflow(answers, 'web');
            setInventoryId(result.inventory_id);
            setSubmitted(true);
            localStorage.removeItem(DRAFT_KEY);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to submit');
        } finally {
            setSubmitting(false);
        }
    }, [answers]);

    // Reset entire workflow
    const reset = useCallback(() => {
        // Set fresh start flag and clear session
        sessionStorage.setItem(FRESH_START_FLAG, 'true');
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(DRAFT_KEY);

        // Reset state
        setAnswers({});
        setStepHistory([]);
        setCurrentStep(null);
        setCurrentOptions([]);
        setStepMetadata(null);
        setDone(false);
        setSubmitted(false);
        setInventoryId('');
        setSummary(null);
        setError('');

        // Critical: Reset initDone so next mount can reinitialize
        initDone.current = false;

        // Re-fetch first step
        (async () => {
            setLoading(true);
            try {
                const newSession = generateSessionId();
                sessionStorage.setItem(SESSION_KEY, newSession);
                sessionStorage.removeItem(FRESH_START_FLAG);

                const result = await getWorkflowNextStep(null, {});
                if (result.step) {
                    setCurrentStep(result.step);
                    setCurrentOptions(result.options || []);
                    setStepMetadata(result.metadata || null);
                }
            } catch (err: any) {
                setError(err?.message || 'Failed to reset');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Upload photos
    const uploadPhotos = useCallback(async (files: File[]): Promise<string[]> => {
        const result = await uploadWorkflowMedia(files);
        return result.urls;
    }, []);

    // Upload videos
    const uploadVideos = useCallback(async (files: File[]): Promise<string[]> => {
        const result = await uploadWorkflowVideo(files);
        return result.urls;
    }, []);

    // Upload document
    const uploadDoc = useCallback(async (file: File, docType: string, title: string) => {
        return uploadWorkflowDocument(file, docType, title);
    }, []);

    // Fetch summary on demand
    const fetchSummary = useCallback(async () => {
        try {
            const s = await getWorkflowSummary(answers);
            setSummary(s.summary);
        } catch { /* ignore */ }
    }, [answers]);

    // Fetch options for current step on demand
    const fetchOptions = useCallback(async () => {
        if (!currentStep) return;
        try {
            const result = await getWorkflowOptions(currentStep.id, answers);
            setCurrentOptions(result.options);
        } catch { /* ignore */ }
    }, [currentStep, answers]);

    return {
        loading,
        stepLoading,
        submitting,
        error,
        groups,
        documentTypes,
        currentStep,
        currentOptions,
        stepMetadata,
        answers,
        stepHistory,
        done,
        submitted,
        inventoryId,
        summary,
        answerStep,
        goBack,
        skipStep,
        submit,
        reset,
        uploadPhotos,
        uploadVideos,
        uploadDocument: uploadDoc,
        fetchSummary,
        fetchOptions,
    };
}
