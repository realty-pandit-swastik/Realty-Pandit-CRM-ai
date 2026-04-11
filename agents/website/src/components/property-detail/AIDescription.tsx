'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { getAIDescription } from '@/lib/api';

type Lang = 'english' | 'hindi';

interface AIDescriptionProps {
    propertyId: string;
    originalDescription?: string | null;
}

export default function AIDescription({ propertyId, originalDescription }: AIDescriptionProps) {
    const [lang, setLang] = useState<Lang>('english');
    const [descriptions, setDescriptions] = useState<Record<Lang, string | null>>({ english: null, hindi: null });
    const [loading, setLoading] = useState(true);
    const [showOriginal, setShowOriginal] = useState(false);

    const fetchDescription = useCallback(async (language: Lang) => {
        // Already cached locally
        if (descriptions[language] !== null) return;

        setLoading(true);
        const desc = await getAIDescription(propertyId, language);
        setDescriptions(prev => ({ ...prev, [language]: desc || '' }));
        setLoading(false);
    }, [propertyId, descriptions]);

    // Fetch English on mount
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getAIDescription(propertyId, 'english').then(desc => {
            if (!cancelled) {
                setDescriptions(prev => ({ ...prev, english: desc || '' }));
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [propertyId]);

    // Fetch Hindi when toggled
    const switchLang = (newLang: Lang) => {
        setLang(newLang);
        if (descriptions[newLang] === null) {
            fetchDescription(newLang);
        }
    };

    const currentText = descriptions[lang];
    const isLoading = loading || currentText === null;
    const aiAvailable = !isLoading && descriptions.english !== '';

    // Don't render if AI failed and no original description to fall back to
    if (!isLoading && descriptions.english === '' && !originalDescription) return null;

    return (
        <div id="ai-description" className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900 dark:text-white font-semibold text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    About This Property
                </h3>

                {/* Language Toggle — only shown when AI has content */}
                {aiAvailable && (
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                        <button
                            type="button"
                            onClick={() => switchLang('english')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                lang === 'english'
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            English
                        </button>
                        <button
                            type="button"
                            onClick={() => switchLang('hindi')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                lang === 'hindi'
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            हिन्दी
                        </button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-full" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-5/6" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-4/6" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-full mt-4" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-3/4" />
                </div>
            ) : currentText ? (
                <motion.div
                    key={lang}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="bg-gradient-to-br from-white to-amber-50/30 dark:from-slate-900 dark:to-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-xl p-5 shadow-sm">
                        <div className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                            {currentText}
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                            <Sparkles className="w-3 h-3" />
                            Generated by Panditji AI
                        </div>
                    </div>

                    {/* Original description accordion */}
                    {originalDescription && (
                        <div className="mt-3">
                            <button
                                onClick={() => setShowOriginal(prev => !prev)}
                                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                                {showOriginal ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                {showOriginal ? 'Hide' : 'Show'} original description
                            </button>
                            {showOriginal && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4"
                                >
                                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                                        {originalDescription}
                                    </p>
                                </motion.div>
                            )}
                        </div>
                    )}
                </motion.div>
            ) : originalDescription ? (
                /* Fallback: AI unavailable — show raw description */
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                    <div className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {originalDescription}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
