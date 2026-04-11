'use client';

import { motion } from 'framer-motion';
import { BedDouble, Bath, Maximize, Calendar } from 'lucide-react';

interface AnimatedSpecsGridProps {
    specs: {
        bedrooms?: number;
        bathrooms?: number;
        area?: number;
        unit?: string;
    };
    createdAt: string;
    bedroomsOverride?: number | null;
}

export default function AnimatedSpecsGrid({ specs, createdAt, bedroomsOverride }: AnimatedSpecsGridProps) {
    const bedrooms = bedroomsOverride ?? specs.bedrooms;
    const items = [
        bedrooms ? {
            icon: BedDouble,
            value: `${bedrooms} BHK`,
            label: 'Bedrooms',
        } : null,
        specs.bathrooms ? {
            icon: Bath,
            value: `${specs.bathrooms}`,
            label: 'Bathrooms',
        } : null,
        specs.area ? {
            icon: Maximize,
            value: `${specs.area} ${specs.unit || 'sqft'}`,
            label: 'Area',
        } : null,
        {
            icon: Calendar,
            value: new Date(createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
            label: 'Listed',
        },
    ].filter(Boolean) as { icon: typeof BedDouble; value: string; label: string }[];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {items.map((item, i) => {
                const Icon = item.icon;
                return (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-50px' }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow"
                    >
                        <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                        <div className="text-slate-900 dark:text-white font-semibold">{item.value}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-xs">{item.label}</div>
                    </motion.div>
                );
            })}
        </div>
    );
}
