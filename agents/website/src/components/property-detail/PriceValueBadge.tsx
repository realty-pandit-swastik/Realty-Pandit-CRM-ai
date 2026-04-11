'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { Property } from '@/lib/api';

interface PriceValueBadgeProps {
    property: Property;
    similarProperties: Property[];
}

function getPricePerSqft(p: Property): number | null {
    const specs = p.specs as any || {};
    if (!p.price || !specs.area) return null;
    const priceInRs = p.price * (p.price_unit === 'Cr' || p.price_unit === 'Crore' ? 10000000 : p.price_unit === 'Lakh' ? 100000 : 1);
    return priceInRs / specs.area;
}

export default function PriceValueBadge({ property, similarProperties }: PriceValueBadgeProps) {
    const badge = useMemo(() => {
        const currentPPS = getPricePerSqft(property);
        if (!currentPPS) return null;

        const comparables = similarProperties
            .map(getPricePerSqft)
            .filter((v): v is number => v !== null);

        if (comparables.length < 2) return null;

        const avgPPS = comparables.reduce((a, b) => a + b, 0) / comparables.length;
        const ratio = currentPPS / avgPPS;

        if (ratio < 0.85) return { label: 'Great Value', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-700', icon: Star };
        if (ratio < 1.0) return { label: 'Good Deal', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700', icon: TrendingDown };
        if (ratio < 1.15) return { label: 'Fair Price', color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: Minus };
        return { label: 'Premium', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-700', icon: TrendingUp };
    }, [property, similarProperties]);

    if (!badge) return null;

    const Icon = badge.icon;

    return (
        <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}
        >
            <Icon className="w-3 h-3" />
            {badge.label}
        </motion.span>
    );
}
