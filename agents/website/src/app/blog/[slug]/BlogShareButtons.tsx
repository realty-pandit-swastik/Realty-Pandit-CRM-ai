'use client';

import { useState } from 'react';
import { Share2, MessageCircle, Copy } from 'lucide-react';

interface BlogShareButtonsProps {
    title: string;
}

export default function BlogShareButtons({ title }: BlogShareButtonsProps) {
    const [copied, setCopied] = useState(false);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleWhatsAppShare = () => {
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(title);
        window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
    };

    return (
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Share this article
            </p>
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={handleWhatsAppShare}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                </button>
                <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
            </div>
        </div>
    );
}
