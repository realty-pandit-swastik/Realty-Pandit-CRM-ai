'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const testimonials = [
    { name: 'Rajesh Kumar', location: 'Noida', rating: 5, quote: 'Panditji helped me find my dream 3BHK flat in just 3 days! The AI recommendations were spot-on and saved me weeks of searching.', avatar: 'RK' },
    { name: 'Priya Sharma', location: 'Gurgaon', rating: 5, quote: 'Best real estate experience ever. Zero brokerage, verified properties, and the WhatsApp assistant made everything so convenient.', avatar: 'PS' },
    { name: 'Amit Patel', location: 'Mumbai', rating: 5, quote: 'Sold my property within 2 weeks through Realty Pandit. The AI pricing suggestions were incredibly accurate.', avatar: 'AP' },
    { name: 'Sneha Verma', location: 'Bangalore', rating: 5, quote: 'As a first-time buyer, the legal assistance and documentation support was invaluable. Highly recommend Realty Pandit!', avatar: 'SV' },
    { name: 'Vikash Singh', location: 'Delhi', rating: 5, quote: 'Found the perfect commercial space for my startup. The virtual tour feature saved me multiple site visits.', avatar: 'VS' },
    { name: 'Meera Joshi', location: 'Pune', rating: 5, quote: 'The 24/7 WhatsApp support is a game-changer. Got instant responses to all my queries even at midnight!', avatar: 'MJ' },
];

export default function Testimonials() {
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setCurrent(c => (c + 1) % testimonials.length), 6000);
        return () => clearInterval(timer);
    }, []);

    return (
        <section className="py-20 bg-white dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4">
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
                    <p className="text-blue-600 text-sm font-semibold tracking-widest uppercase mb-2">Testimonials</p>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">What Our Clients Say</h2>
                </motion.div>

                <div className="relative max-w-3xl mx-auto overflow-hidden px-6 md:px-14">
                    <AnimatePresence mode="wait">
                        <motion.div key={current} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.4 }} className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 md:p-10 text-center">
                            <Quote className="w-10 h-10 text-blue-200 mx-auto mb-6" />
                            <p className="text-slate-700 dark:text-slate-200 text-lg md:text-xl leading-relaxed mb-8 italic">&ldquo;{testimonials[current].quote}&rdquo;</p>
                            <div className="flex items-center justify-center gap-4">
                                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                    {testimonials[current].avatar}
                                </div>
                                <div className="text-left">
                                    <p className="font-semibold text-slate-900 dark:text-white">{testimonials[current].name}</p>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">{testimonials[current].location}</p>
                                </div>
                                <div className="flex gap-0.5 ml-4">
                                    {Array.from({ length: testimonials[current].rating }).map((_, i) => (
                                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    <button onClick={() => setCurrent(c => (c - 1 + testimonials.length) % testimonials.length)} className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] bg-white dark:bg-slate-950 rounded-full shadow-lg dark:shadow-slate-900/30 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors z-10" aria-label="Previous testimonial">
                        <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <button onClick={() => setCurrent(c => (c + 1) % testimonials.length)} className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 min-w-[44px] min-h-[44px] bg-white dark:bg-slate-950 rounded-full shadow-lg dark:shadow-slate-900/30 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors z-10" aria-label="Next testimonial">
                        <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>

                    <div className="flex justify-center mt-6">
                        {testimonials.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrent(i)}
                                aria-label={`Go to testimonial ${i + 1}`}
                                className="min-w-[32px] min-h-[44px] flex items-center justify-center"
                            >
                                <span className={`block rounded-full transition-all ${i === current ? 'bg-blue-600 w-6 h-2.5' : 'bg-slate-300 dark:bg-slate-600 w-2.5 h-2.5'}`} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
