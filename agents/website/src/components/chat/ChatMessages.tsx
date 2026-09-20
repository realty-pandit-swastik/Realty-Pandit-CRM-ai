'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Message } from './AIChatModal';
import PropertyChatCard from './PropertyChatCard';
import PropertyMatchCard from './PropertyMatchCard';
import { Bot, User } from 'lucide-react';

interface ChatMessagesProps {
    messages: Message[];
    isTyping: boolean;
    onQuickReply?: (value: string) => void;
    onPropertyAction?: (action: string) => void;
    viewerActive?: boolean;
}

export default function ChatMessages({ messages, isTyping, onQuickReply, onPropertyAction, viewerActive = false }: ChatMessagesProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="h-full overflow-y-auto px-4 md:px-6 py-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className={`mx-auto space-y-6 ${viewerActive ? 'max-w-full px-2' : 'max-w-4xl'}`}>
                {messages.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-12"
                    >
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
                            <span className="text-4xl">🙏</span>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                            Namaste! I&apos;m Panditji
                        </h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            Your AI property assistant. Ask me anything about properties!
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                            {[
                                '2 BHK flat in Vaishali under 60 lakhs',
                                '3 BHK ready to move in Noida',
                                'Commercial property near metro',
                                'Independent house with garden',
                            ].map((example, i) => (
                                <button
                                    key={i}
                                    className="text-left p-3 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all text-sm text-slate-700 dark:text-slate-300"
                                >
                                    💡 {example}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {messages.map((message, index) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, x: message.role === 'user' ? 20 : -20, y: 10 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        transition={{
                            delay: index * 0.05,
                            type: "spring",
                            damping: 20,
                            stiffness: 300
                        }}
                        layout
                        className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {message.role === 'ai' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-md">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                        )}

                        <div className={`flex flex-col ${
                            message.role === 'user'
                                ? 'max-w-[85%] md:max-w-[70%] items-end'
                                : 'max-w-[90%] md:max-w-[80%] items-start'
                        }`}>
                            <div
                                className={`rounded-2xl px-4 py-3 shadow-sm ${
                                    message.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-sm'
                                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-sm'
                                }`}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                            </div>

                            {/* Property Cards (for AI messages only) */}
                            {message.role === 'ai' && message.properties && message.properties.length > 0 && (
                                viewerActive ? (
                                    <div className="mt-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                                        Found {message.properties.length} {message.properties.length === 1 ? 'property' : 'properties'} — showing in viewer panel
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-3 w-full max-w-full">
                                        {message.properties.map((property) => (
                                            <PropertyChatCard key={property.id} property={property} />
                                        ))}
                                    </div>
                                )
                            )}

                            {/* Buyer Workflow: Property Match Card */}
                            {message.role === 'ai' && message.matchProperty && onPropertyAction && (
                                viewerActive ? (
                                    <div className="mt-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                                        Property #{(message.matchIndex || 0) + 1} — viewing in panel
                                    </div>
                                ) : (
                                    <div className="mt-3 w-full">
                                        <PropertyMatchCard
                                            property={message.matchProperty}
                                            matchIndex={message.matchIndex || 0}
                                            totalAvailable={message.totalAvailable || 0}
                                            onAction={onPropertyAction}
                                        />
                                    </div>
                                )
                            )}

                            {/* Buyer Workflow: Quick Reply Buttons (only on the last AI message) */}
                            {message.role === 'ai' && message.quick_replies && message.quick_replies.length > 0 && onQuickReply && !message.matchProperty && index === messages.length - 1 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {message.quick_replies.map((qr) => (
                                        <button
                                            key={qr.value}
                                            onClick={() => onQuickReply(qr.value)}
                                            className="px-3 py-1.5 text-sm rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
                                        >
                                            {qr.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                                {new Date(message.timestamp).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>

                        {message.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md">
                                <User className="w-5 h-5 text-white" />
                            </div>
                        )}
                    </motion.div>
                ))}

                {/* Typing Indicator with Wave Animation */}
                {isTyping && (
                    <motion.div
                        initial={{ opacity: 0, x: -20, y: 10 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        transition={{
                            type: "spring",
                            damping: 20,
                            stiffness: 300
                        }}
                        className="flex gap-3 justify-start"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-md">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        animate={{
                                            y: [0, -8, 0],
                                            scale: [1, 1.2, 1]
                                        }}
                                        transition={{
                                            duration: 0.6,
                                            repeat: Infinity,
                                            delay: i * 0.1,
                                            ease: "easeInOut"
                                        }}
                                        className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500"
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
