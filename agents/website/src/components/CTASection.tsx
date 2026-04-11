'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MessageCircle, Building, ArrowRight } from 'lucide-react';

export default function CTASection() {
    return (
        <section className="py-20 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute top-10 left-[10%] w-72 h-72 bg-blue-500 rounded-full blur-[128px]" />
                <div className="absolute bottom-10 right-[10%] w-72 h-72 bg-purple-500 rounded-full blur-[128px]" />
            </div>
            <div className="max-w-4xl mx-auto px-4 relative text-center">
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
                        <MessageCircle className="w-4 h-4" /> Available 24/7 on WhatsApp
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Ready to Find Your Perfect Property?</h2>
                    <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">Talk to Panditji, our AI assistant, on WhatsApp. Get instant property recommendations, schedule visits, and close deals — all from your phone.</p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/contact" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-lg shadow-lg shadow-blue-600/25">
                            <MessageCircle className="w-5 h-5" /> Talk to Panditji
                        </Link>
                        <Link href="/properties" className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-8 py-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-lg">
                            <Building className="w-5 h-5" /> Browse Properties <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
