'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, ArrowLeftRight, Ruler } from 'lucide-react';

const UNITS = [
    { key: 'sqft', label: 'Square Feet (sq ft)' },
    { key: 'sqm', label: 'Square Meters (sq m)' },
    { key: 'sqyd', label: 'Square Yards (sq yd)' },
    { key: 'acres', label: 'Acres' },
    { key: 'hectares', label: 'Hectares' },
    { key: 'gaj', label: 'Gaj' },
    { key: 'bigha', label: 'Bigha' },
    { key: 'biswa', label: 'Biswa' },
    { key: 'marla', label: 'Marla' },
    { key: 'kanal', label: 'Kanal' },
] as const;

type UnitKey = (typeof UNITS)[number]['key'];

// Conversion factors: 1 unit = X sqft
const TO_SQFT: Record<UnitKey, number> = {
    sqft: 1,
    sqm: 10.7639,
    sqyd: 9,
    acres: 43560,
    hectares: 107639,
    gaj: 9,
    bigha: 27000,
    biswa: 1350,
    marla: 272.25,
    kanal: 5445,
};

const QUICK_REFERENCE: { from: UnitKey; to: UnitKey; fromVal: number }[] = [
    { from: 'sqft', to: 'sqm', fromVal: 1000 },
    { from: 'sqyd', to: 'sqft', fromVal: 100 },
    { from: 'acres', to: 'sqft', fromVal: 1 },
    { from: 'marla', to: 'sqft', fromVal: 1 },
    { from: 'kanal', to: 'sqft', fromVal: 1 },
    { from: 'bigha', to: 'sqft', fromVal: 1 },
    { from: 'gaj', to: 'sqft', fromVal: 100 },
    { from: 'hectares', to: 'acres', fromVal: 1 },
];

export default function AreaConverterPage() {
    const [inputValue, setInputValue] = useState('1000');
    const [fromUnit, setFromUnit] = useState<UnitKey>('sqft');
    const [toUnit, setToUnit] = useState<UnitKey>('sqm');

    const convertedValue = useMemo(() => {
        const num = parseFloat(inputValue);
        if (isNaN(num) || num < 0) return '';
        const sqft = num * TO_SQFT[fromUnit];
        const result = sqft / TO_SQFT[toUnit];
        return result.toLocaleString('en-IN', { maximumFractionDigits: 4 });
    }, [inputValue, fromUnit, toUnit]);

    const handleSwap = () => {
        setFromUnit(toUnit);
        setToUnit(fromUnit);
        if (convertedValue) {
            const num = parseFloat(inputValue);
            if (!isNaN(num)) {
                const sqft = num * TO_SQFT[fromUnit];
                const result = sqft / TO_SQFT[toUnit];
                setInputValue(result.toFixed(4).replace(/\.?0+$/, ''));
            }
        }
    };

    const getUnitLabel = (key: UnitKey) => UNITS.find(u => u.key === key)?.label || key;

    const convertQuickRef = (from: UnitKey, to: UnitKey, val: number) => {
        const sqft = val * TO_SQFT[from];
        const result = sqft / TO_SQFT[to];
        return result.toLocaleString('en-IN', { maximumFractionDigits: 4 });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-700 dark:to-teal-800 text-white">
                <div className="max-w-5xl mx-auto px-4 py-10">
                    <nav className="flex items-center gap-2 text-sm text-emerald-100 mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-emerald-200">Tools</span>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white font-medium">Area Converter</span>
                    </nav>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <Ruler className="w-8 h-8" />
                            <h1 className="text-3xl md:text-4xl font-bold">Area Converter</h1>
                        </div>
                        <p className="text-emerald-100 text-lg">
                            Convert between sq ft, sq m, acres, bigha, marla, and more
                        </p>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-10">
                {/* Converter Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 md:p-8 shadow-sm"
                >
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
                        {/* From */}
                        <div>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 block">From</label>
                            <select
                                value={fromUnit}
                                onChange={e => setFromUnit(e.target.value as UnitKey)}
                                aria-label="Convert from unit"
                                className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 mb-2"
                            >
                                {UNITS.map(u => (
                                    <option key={u.key} value={u.key}>{u.label}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                placeholder="Enter value"
                                aria-label="Value to convert"
                                className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-lg font-semibold focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder-slate-400 dark:placeholder-slate-500"
                            />
                        </div>

                        {/* Swap Button */}
                        <div className="flex justify-center md:pb-2">
                            <button
                                onClick={handleSwap}
                                className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                title="Swap units"
                                aria-label="Swap units"
                            >
                                <ArrowLeftRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* To */}
                        <div>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 block">To</label>
                            <select
                                value={toUnit}
                                onChange={e => setToUnit(e.target.value as UnitKey)}
                                aria-label="Convert to unit"
                                className="w-full py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 mb-2"
                            >
                                {UNITS.map(u => (
                                    <option key={u.key} value={u.key}>{u.label}</option>
                                ))}
                            </select>
                            <div className="w-full py-3 px-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-lg font-semibold min-h-[52px]">
                                {convertedValue || '---'}
                            </div>
                        </div>
                    </div>

                    {/* Conversion summary */}
                    {inputValue && convertedValue && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl py-3 px-4"
                        >
                            {inputValue} {getUnitLabel(fromUnit)} = {convertedValue} {getUnitLabel(toUnit)}
                        </motion.p>
                    )}
                </motion.div>

                {/* Quick Reference Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mt-10"
                >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Quick Conversion Reference</h2>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-semibold">From</th>
                                    <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-semibold">To</th>
                                </tr>
                            </thead>
                            <tbody>
                                {QUICK_REFERENCE.map((ref, i) => (
                                    <tr
                                        key={i}
                                        className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                    >
                                        <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                                            {ref.fromVal.toLocaleString('en-IN')} {getUnitLabel(ref.from)}
                                        </td>
                                        <td className="py-3 px-4 text-emerald-700 dark:text-emerald-400 font-medium">
                                            {convertQuickRef(ref.from, ref.to, ref.fromVal)} {getUnitLabel(ref.to)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
