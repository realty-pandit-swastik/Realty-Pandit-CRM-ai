'use client';

import { motion } from 'framer-motion';
import { Brain, ShieldCheck, BadgePercent, MessageCircle, FileCheck, Video } from 'lucide-react';

const propositions = [
    { icon: Brain, title: 'AI-Powered Search', desc: 'Panditji finds your perfect property match instantly using artificial intelligence.', color: 'bg-blue-100 text-blue-600' },
    { icon: ShieldCheck, title: 'Verified Listings', desc: 'Every property is verified before listing. No fake listings, no surprises.', color: 'bg-green-100 text-green-600' },
    { icon: BadgePercent, title: 'Zero Brokerage', desc: 'Connect directly with owners. Save lakhs on brokerage fees.', color: 'bg-amber-100 text-amber-600' },
    { icon: MessageCircle, title: '24/7 WhatsApp Support', desc: 'Chat with Panditji anytime on WhatsApp. Get instant responses.', color: 'bg-purple-100 text-purple-600' },
    { icon: FileCheck, title: 'Legal Assistance', desc: 'End-to-end documentation, registration, and RERA compliance help.', color: 'bg-rose-100 text-rose-600' },
    { icon: Video, title: 'Virtual Tours', desc: 'View properties from anywhere with 360-degree virtual tours.', color: 'bg-cyan-100 text-cyan-600' },
];

export default function ValuePropositions() {
    return (
        <section className="py-20 bg-white dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
                    <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-2">Why Realty Pandit</p>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">The Smarter Way to Find Property</h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">We combine cutting-edge AI technology with personalized service to make your property journey effortless.</p>
                </motion.div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {propositions.map((p, i) => (
                        <motion.div key={p.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
                            <div className={`w-14 h-14 ${p.color} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                                <p.icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{p.title}</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{p.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
