'use client';

import { motion } from 'framer-motion';
import { Shield, TrainFront, TreePine } from 'lucide-react';
import type { Landmark } from '@/lib/api';

interface NeighborhoodScoresProps {
    landmarks: Landmark[];
}

function computeScore(count: number, maxForFull: number = 3): number {
    if (count === 0) return 0;
    if (count === 1) return 3;
    if (count === 2) return 4;
    return 5;
}

function computeAmenityScore(count: number): number {
    if (count === 0) return 0;
    if (count <= 2) return 2;
    if (count <= 4) return 3;
    if (count <= 6) return 4;
    return 5;
}

function getScoreColor(score: number): string {
    if (score >= 4) return 'bg-green-500';
    if (score >= 2) return 'bg-amber-500';
    return 'bg-red-400';
}

function getScoreBg(score: number): string {
    if (score >= 4) return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
    if (score >= 2) return 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800';
    return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
}

function getScoreLabel(score: number): string {
    if (score >= 4) return 'Excellent';
    if (score >= 3) return 'Good';
    if (score >= 2) return 'Average';
    if (score >= 1) return 'Below Average';
    return 'No Data';
}

const CATEGORIES = [
    {
        key: 'safety',
        label: 'Safety & Healthcare',
        icon: Shield,
        types: ['hospital'],
        compute: computeScore,
    },
    {
        key: 'connectivity',
        label: 'Connectivity',
        icon: TrainFront,
        types: ['transit_station'],
        compute: computeScore,
    },
    {
        key: 'amenities',
        label: 'Amenities & Lifestyle',
        icon: TreePine,
        types: ['shopping_mall', 'school', 'park'],
        compute: computeAmenityScore,
    },
];

export default function NeighborhoodScores({ landmarks }: NeighborhoodScoresProps) {
    if (landmarks.length === 0) return null;

    const typeCounts: Record<string, number> = {};
    landmarks.forEach(lm => {
        typeCounts[lm.type] = (typeCounts[lm.type] || 0) + 1;
    });

    const scores = CATEGORIES.map(cat => {
        const count = cat.types.reduce((sum, t) => sum + (typeCounts[t] || 0), 0);
        const score = cat.compute(count);
        return { ...cat, score, count };
    });

    // Don't render if all scores are 0
    if (scores.every(s => s.score === 0)) return null;

    return (
        <div className="neighborhood-scores">
            <h4 className="text-slate-900 dark:text-white font-semibold text-base mb-3 flex items-center gap-2">
                Neighborhood Rating
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scores.map((cat, i) => {
                    const Icon = cat.icon;
                    return (
                        <motion.div
                            key={cat.key}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className={`border rounded-xl p-4 ${getScoreBg(cat.score)}`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{cat.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-2xl font-bold text-slate-900 dark:text-white">{cat.score}<span className="text-sm font-normal text-slate-400">/5</span></div>
                                <div className="flex-1">
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            whileInView={{ width: `${(cat.score / 5) * 100}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                                            className={`h-2 rounded-full ${getScoreColor(cat.score)}`}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">{getScoreLabel(cat.score)}</span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
