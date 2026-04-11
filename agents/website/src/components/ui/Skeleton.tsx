import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'rect' | 'circle';
    width?: string;
    height?: string;
}

export default function Skeleton({ className, variant = 'rect', width, height }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-shimmer',
                variant === 'text' && 'h-4 rounded',
                variant === 'rect' && 'rounded-xl',
                variant === 'circle' && 'rounded-full',
                className
            )}
            style={{ width, height }}
        />
    );
}

export function PropertyCardSkeleton() {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <Skeleton className="h-52 rounded-none" />
            <div className="p-5 space-y-3">
                <Skeleton className="h-7 w-32" />
                <Skeleton variant="text" className="w-48" />
                <Skeleton variant="text" className="w-36" />
                <div className="flex gap-4 pt-3 border-t border-slate-100">
                    <Skeleton variant="text" className="w-16" />
                    <Skeleton variant="text" className="w-16" />
                    <Skeleton variant="text" className="w-16" />
                </div>
            </div>
        </div>
    );
}
