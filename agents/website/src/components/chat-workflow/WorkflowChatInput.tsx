'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2, Paperclip } from 'lucide-react';

interface WorkflowChatInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
    inputType?: string | null;
    showAttach?: boolean;
    onAttach?: () => void;
    placeholder?: string;
}

function getInputMode(inputType: string | null | undefined): 'text' | 'tel' | 'numeric' {
    if (!inputType) return 'text';
    if (inputType === 'phone') return 'tel';
    if (inputType === 'number' || inputType === 'compound') return 'numeric';
    return 'text';
}

function getPlaceholder(inputType: string | null | undefined, custom?: string): string {
    if (custom) return custom;
    if (!inputType) return 'Type your message...';
    switch (inputType) {
        case 'phone': return 'Enter 10-digit phone number...';
        case 'number': return 'Enter a number...';
        case 'compound': return 'Enter value (e.g., 1200 sqft)...';
        case 'textarea': return 'Type your answer... (Shift+Enter for new line)';
        case 'text': return 'Type your answer...';
        default: return 'Type your message...';
    }
}

export default function WorkflowChatInput({
    onSend,
    disabled = false,
    inputType,
    showAttach,
    onAttach,
    placeholder,
}: WorkflowChatInputProps) {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!disabled) inputRef.current?.focus();
    }, [disabled, inputType]);

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText('');
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.style.height = 'auto';
                }
            }, 50);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const mode = getInputMode(inputType);

    return (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-700/80 px-4 py-3">
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
                {/* Attach button */}
                {showAttach && onAttach && (
                    <button
                        onClick={onAttach}
                        disabled={disabled}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                        aria-label="Attach file"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                )}

                {/* Input */}
                <div className="flex-1">
                    <label htmlFor="workflow-chat-input" className="sr-only">{getPlaceholder(inputType, placeholder)}</label>
                    <textarea
                        id="workflow-chat-input"
                        ref={inputRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder={getPlaceholder(inputType, placeholder)}
                        inputMode={mode}
                        rows={1}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 resize-none min-h-[44px] max-h-28 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                        style={{ height: 'auto', overflowY: text.split('\n').length > 3 ? 'auto' : 'hidden' }}
                        onInput={(e) => {
                            const t = e.target as HTMLTextAreaElement;
                            t.style.height = 'auto';
                            t.style.height = `${t.scrollHeight}px`;
                        }}
                    />
                </div>

                {/* Send */}
                <button
                    onClick={handleSend}
                    disabled={disabled || !text.trim()}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                        text.trim() && !disabled
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                    }`}
                    aria-label="Send message"
                >
                    {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </div>

            {/* Phone hint */}
            {inputType === 'phone' && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1 max-w-3xl mx-auto">
                    Enter mobile number with or without +91 prefix
                </p>
            )}
        </div>
    );
}
