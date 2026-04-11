'use client';

import { cn } from '@/lib/utils';

interface Tab {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
    variant?: 'pills' | 'underline';
    className?: string;
}

export default function Tabs({ tabs, activeTab, onTabChange, variant = 'pills', className }: TabsProps) {
    return (
        <div className={cn('flex gap-1', variant === 'underline' && 'border-b border-slate-200 gap-0', className)}>
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                        'flex items-center gap-2 font-medium text-sm transition-all',
                        variant === 'pills' && [
                            'px-5 py-2.5 rounded-lg',
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
                        ],
                        variant === 'underline' && [
                            'px-5 py-3 border-b-2 -mb-px',
                            activeTab === tab.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                        ]
                    )}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
