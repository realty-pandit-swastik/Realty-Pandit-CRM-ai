'use client';

import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    compact?: boolean;
}

export default function ChatInput({ onSend, disabled = false, compact = false }: ChatInputProps) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        const trimmed = message.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setMessage('');
            // Fix: Refocus textarea immediately and after a delay to ensure focus
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    // Reset height after clearing message
                    textareaRef.current.style.height = 'auto';
                }
            }, 50);
        }
    };

    // Auto-focus on mount
    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-700/80 px-4 md:px-6 py-4">
            <div className={compact ? 'max-w-full' : 'max-w-4xl mx-auto'}>
                <div className="flex gap-3 items-end">
                    {/* Text Input */}
                    <div className="flex-1 relative">
                        <textarea
                            ref={textareaRef}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={disabled}
                            placeholder="Type your query here... (e.g., 2 BHK flat in Vaishali)"
                            rows={1}
                            className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none min-h-[48px] max-h-32 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            style={{
                                height: 'auto',
                                overflowY: message.split('\n').length > 3 ? 'auto' : 'hidden',
                            }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${target.scrollHeight}px`;
                            }}
                        />

                        {/* Character count (optional - show when approaching limit) */}
                        {message.length > 400 && (
                            <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-500">
                                {message.length}/500
                            </div>
                        )}
                    </div>

                    {/* Send Button */}
                    <button
                        onClick={handleSend}
                        disabled={disabled || !message.trim()}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                            message.trim() && !disabled
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                        }`}
                        aria-label="Send message"
                    >
                        {disabled ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {/* Helper Text */}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 px-1">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono">Enter</kbd> to send,
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono ml-1">Shift+Enter</kbd> for new line
                </p>
            </div>
        </div>
    );
}
