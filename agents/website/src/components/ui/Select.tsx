'use client';

import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string; label: string }[];
    placeholder?: string;
}

export default function Select({ label, options, placeholder, className, ...props }: SelectProps) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    className={cn(
                        'w-full py-3 px-4 pr-10 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm appearance-none',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all',
                        className
                    )}
                    {...props}
                >
                    {placeholder && <option value="">{placeholder}</option>}
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
        </div>
    );
}
