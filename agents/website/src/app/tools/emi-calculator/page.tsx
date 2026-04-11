'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Calculator, IndianRupee, TrendingUp, Wallet } from 'lucide-react';

export default function EMICalculatorPage() {
    const [loanAmount, setLoanAmount] = useState(5000000); // 50 Lakh
    const [interestRate, setInterestRate] = useState(8.5);
    const [tenure, setTenure] = useState(20);

    const emiData = useMemo(() => {
        const P = loanAmount;
        const r = interestRate / 12 / 100;
        const n = tenure * 12;

        if (r === 0) {
            const emi = P / n;
            return {
                emi: Math.round(emi),
                totalInterest: 0,
                totalPayable: P,
                principalPercent: 100,
                interestPercent: 0,
            };
        }

        const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const totalPayable = emi * n;
        const totalInterest = totalPayable - P;

        return {
            emi: Math.round(emi),
            totalInterest: Math.round(totalInterest),
            totalPayable: Math.round(totalPayable),
            principalPercent: Math.round((P / totalPayable) * 100),
            interestPercent: Math.round((totalInterest / totalPayable) * 100),
        };
    }, [loanAmount, interestRate, tenure]);

    const formatINR = (num: number) => num.toLocaleString('en-IN');

    const formatLoanDisplay = (amount: number) => {
        if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
        if (amount >= 100000) return `${(amount / 100000).toFixed(2)} Lakh`;
        return formatINR(amount);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-20">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-900 text-white">
                <div className="max-w-5xl mx-auto px-4 py-10">
                    <nav className="flex items-center gap-2 text-sm text-blue-100 mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-blue-200">Tools</span>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white font-medium">EMI Calculator</span>
                    </nav>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <Calculator className="w-8 h-8" />
                            <h1 className="text-3xl md:text-4xl font-bold">EMI Calculator</h1>
                        </div>
                        <p className="text-blue-100 text-lg">
                            Calculate your monthly home loan EMI instantly
                        </p>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-10">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* Calculator Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 md:p-8 shadow-sm"
                    >
                        {/* Loan Amount */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-slate-700 dark:text-slate-300 font-medium">Loan Amount</label>
                                <span className="text-lg font-bold text-slate-900 dark:text-white">
                                    &#8377;{formatLoanDisplay(loanAmount)}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={500000}
                                max={100000000}
                                step={100000}
                                value={loanAmount}
                                onChange={e => setLoanAmount(Number(e.target.value))}
                                aria-label="Loan amount"
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
                                <span>5 Lakh</span>
                                <span>10 Cr</span>
                            </div>
                        </div>

                        {/* Interest Rate */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-slate-700 dark:text-slate-300 font-medium">Interest Rate (% p.a.)</label>
                                <span className="text-lg font-bold text-slate-900 dark:text-white">{interestRate}%</span>
                            </div>
                            <input
                                type="range"
                                min={6}
                                max={15}
                                step={0.1}
                                value={interestRate}
                                onChange={e => setInterestRate(Number(e.target.value))}
                                aria-label="Interest rate"
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
                                <span>6%</span>
                                <span>15%</span>
                            </div>
                        </div>

                        {/* Tenure */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-slate-700 dark:text-slate-300 font-medium">Loan Tenure</label>
                                <span className="text-lg font-bold text-slate-900 dark:text-white">{tenure} Years</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={30}
                                step={1}
                                value={tenure}
                                onChange={e => setTenure(Number(e.target.value))}
                                aria-label="Loan tenure"
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
                                <span>1 Year</span>
                                <span>30 Years</span>
                            </div>
                        </div>

                        {/* Principal vs Interest Split Bar */}
                        <div className="mb-2">
                            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-3">Payment Breakdown</p>
                            <div className="flex rounded-full overflow-hidden h-5">
                                <div
                                    className="bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                                    style={{ width: `${emiData.principalPercent}%` }}
                                >
                                    {emiData.principalPercent}%
                                </div>
                                <div
                                    className="bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                                    style={{ width: `${emiData.interestPercent}%` }}
                                >
                                    {emiData.interestPercent}%
                                </div>
                            </div>
                            <div className="flex justify-between text-xs mt-2">
                                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Principal
                                </span>
                                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Interest
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Results Panel */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="lg:col-span-2 space-y-4"
                    >
                        {/* Monthly EMI */}
                        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
                                    <IndianRupee className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Monthly EMI</p>
                            </div>
                            <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                                &#8377;{formatINR(emiData.emi)}
                            </p>
                        </div>

                        {/* Total Interest */}
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-amber-500/10 dark:bg-amber-500/20 rounded-xl flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Total Interest</p>
                            </div>
                            <p className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                                &#8377;{formatINR(emiData.totalInterest)}
                            </p>
                        </div>

                        {/* Total Payable */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                                    <Wallet className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Total Payable</p>
                            </div>
                            <p className="text-3xl font-bold text-slate-900 dark:text-white">
                                &#8377;{formatINR(emiData.totalPayable)}
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* CTA Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="mt-12 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-900 rounded-2xl p-8 md:p-10 text-center text-white"
                >
                    <h2 className="text-2xl md:text-3xl font-bold mb-3">Looking for a home loan?</h2>
                    <p className="text-blue-100 mb-6 max-w-xl mx-auto">
                        Talk to Panditji on WhatsApp and get personalized property recommendations that fit your budget.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link
                            href="/properties"
                            className="px-6 py-3 bg-white text-blue-700 rounded-xl font-semibold hover:bg-blue-50 transition-colors"
                        >
                            Browse Properties
                        </Link>
                        <Link
                            href="/contact"
                            className="px-6 py-3 bg-blue-500/30 border border-white/30 text-white rounded-xl font-semibold hover:bg-blue-500/50 transition-colors"
                        >
                            Contact Us
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
