import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    hover?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
};

export default function Card({ children, hover = true, padding = 'md', className, ...props }: CardProps) {
    return (
        <div
            className={cn(
                'bg-white rounded-2xl border border-slate-200 shadow-sm',
                hover && 'hover:shadow-lg hover:border-slate-300 transition-all duration-300',
                paddingMap[padding],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
