'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    {
        variants: {
            variant: {
                primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md',
                secondary: 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md',
                outline: 'border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400',
                ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm',
                whatsapp: 'bg-[#25D366] hover:bg-[#20BD5A] text-white shadow-sm hover:shadow-md',
                dark: 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm',
            },
            size: {
                sm: 'text-sm px-4 py-2',
                md: 'text-sm px-6 py-3',
                lg: 'text-base px-8 py-4',
                icon: 'p-2.5',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    loading?: boolean;
    children: ReactNode;
}

export default function Button({ variant, size, loading, className, children, disabled, ...props }: ButtonProps) {
    return (
        <button
            className={cn(buttonVariants({ variant, size }), className)}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {children}
        </button>
    );
}

export { buttonVariants };
