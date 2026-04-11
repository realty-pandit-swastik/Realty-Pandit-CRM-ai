'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getMediaUrl, formatPrice } from '@/lib/api';
import type { CompareItem } from './CompareButton';

interface CompareModalProps {
    items: CompareItem[];
    onClose: () => void;
}

interface CompareRow {
    label: string;
    getValue: (item: CompareItem) => string;
    highlight?: 'lowest' | 'highest';
}

const ROWS: CompareRow[] = [
    { label: 'Type', getValue: i => i.type ? i.type.replace(/_/g, ' ') : '-' },
    { label: 'Location', getValue: i => i.location || '-' },
    {
        label: 'Price',
        getValue: i => formatPrice(i.price, i.price_unit),
        highlight: 'lowest',
    },
    {
        label: 'Bedrooms',
        getValue: i => {
            const specs = i.specs || {};
            return specs.bedrooms ? `${specs.bedrooms} BHK` : '-';
        },
    },
    {
        label: 'Bathrooms',
        getValue: i => {
            const specs = i.specs || {};
            return specs.bathrooms ? `${specs.bathrooms}` : '-';
        },
    },
    {
        label: 'Area',
        getValue: i => {
            const specs = i.specs || {};
            return specs.area ? `${specs.area} ${specs.unit || 'sqft'}` : '-';
        },
        highlight: 'highest',
    },
];

function getNumericPrice(item: CompareItem): number {
    if (!item.price) return Infinity;
    return item.price * (item.price_unit === 'Cr' || item.price_unit === 'Crore' ? 10000000 : item.price_unit === 'Lakh' ? 100000 : 1);
}

function getNumericArea(item: CompareItem): number {
    const specs = item.specs || {};
    return specs.area || 0;
}

export default function CompareModal({ items, onClose }: CompareModalProps) {
    // ESC to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    // Find best values for highlighting
    const lowestPrice = Math.min(...items.map(getNumericPrice));
    const highestArea = Math.max(...items.map(getNumericArea));

    function isHighlighted(row: CompareRow, item: CompareItem): boolean {
        if (row.highlight === 'lowest' && row.label === 'Price') {
            return getNumericPrice(item) === lowestPrice && lowestPrice !== Infinity;
        }
        if (row.highlight === 'highest' && row.label === 'Area') {
            return getNumericArea(item) === highestArea && highestArea > 0;
        }
        return false;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Compare Properties</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Comparison table */}
                <div className="p-5 overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider pb-4 pr-4 w-28" />
                                {items.map(item => (
                                    <th key={item.id} className="pb-4 px-2 min-w-[160px]">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                {item.image ? (
                                                    <img src={getMediaUrl(item.image)} alt={item.type} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No image</div>
                                                )}
                                            </div>
                                            <Link
                                                href={`/properties/${item.slug || item.id}`}
                                                className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1"
                                            >
                                                View <ExternalLink className="w-3 h-3" />
                                            </Link>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ROWS.map(row => (
                                <tr key={row.label} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="py-3 pr-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        {row.label}
                                    </td>
                                    {items.map(item => (
                                        <td
                                            key={item.id}
                                            className={`py-3 px-2 text-center text-sm font-medium capitalize ${
                                                isHighlighted(row, item)
                                                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg'
                                                    : 'text-slate-700 dark:text-slate-300'
                                            }`}
                                        >
                                            {row.getValue(item)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
}
