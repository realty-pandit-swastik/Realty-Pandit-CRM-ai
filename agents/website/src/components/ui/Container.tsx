import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
    sm: 'max-w-3xl',
    md: 'max-w-5xl',
    lg: 'max-w-7xl',
    xl: 'max-w-[1400px]',
};

export default function Container({ children, size = 'lg', className, ...props }: ContainerProps) {
    return (
        <div className={cn(sizeMap[size], 'mx-auto px-4 sm:px-6 lg:px-8', className)} {...props}>
            {children}
        </div>
    );
}
