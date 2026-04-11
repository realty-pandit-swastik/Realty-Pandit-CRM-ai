'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Building2, MapPin, Users, TrendingUp } from 'lucide-react';

function AnimatedNumber({ value, duration = 2 }: { value: number; duration?: number }) {
    const [count, setCount] = useState(0);
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    useEffect(() => {
        if (!isInView) return;
        let start = 0;
        const end = value;
        const increment = end / (duration * 60);
        const timer = setInterval(() => {
            start += increment;
            if (start >= end) { setCount(end); clearInterval(timer); }
            else { setCount(Math.floor(start)); }
        }, 1000 / 60);
        return () => clearInterval(timer);
    }, [isInView, value, duration]);

    return <span ref={ref}>{count.toLocaleString('en-IN')}</span>;
}

const stats = [
    { icon: Building2, label: 'Properties Listed', value: 500, suffix: '+', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    { icon: MapPin, label: 'Locations Served', value: 50, suffix: '+', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
    { icon: Users, label: 'Happy Clients', value: 1000, suffix: '+', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    { icon: TrendingUp, label: 'Deals Closed', value: 200, suffix: '+', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
];

export default function StatsCounter() {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setLoaded(true), 600);
        return () => clearTimeout(t);
    }, []);

    return (
        <section className="py-20 bg-slate-50 dark:bg-slate-800">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {stats.map((stat, i) => (
                        <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }} className="text-center">
                            <div className={`w-14 h-14 ${stat.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                                <stat.icon className="w-7 h-7" />
                            </div>
                            {!loaded ? (
                                <>
                                    <div className="h-10 w-24 mx-auto bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse mb-2" />
                                    <div className="h-4 w-28 mx-auto bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                </>
                            ) : (
                                <>
                                    <div className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-1">
                                        <AnimatedNumber value={stat.value} />{stat.suffix}
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">{stat.label}</p>
                                </>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
