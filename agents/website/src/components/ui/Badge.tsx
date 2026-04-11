import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
    'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
    {
        variants: {
            variant: {
                sale: 'bg-green-100 text-green-700 border border-green-200',
                rent: 'bg-blue-100 text-blue-700 border border-blue-200',
                featured: 'bg-amber-100 text-amber-700 border border-amber-200',
                new: 'bg-purple-100 text-purple-700 border border-purple-200',
                commercial: 'bg-slate-100 text-slate-700 border border-slate-200',
                verified: 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
                default: 'bg-slate-100 text-slate-600 border border-slate-200',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
    children: React.ReactNode;
    className?: string;
}

export default function Badge({ variant, children, className }: BadgeProps) {
    return (
        <span className={cn(badgeVariants({ variant }), className)}>
            {children}
        </span>
    );
}
