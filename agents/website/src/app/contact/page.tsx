'use client';

import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, MessageCircle } from 'lucide-react';
import ContactForm from '@/components/ContactForm';
import { COMPANY_PHONE_DISPLAY } from '@/lib/constants';

export default function ContactPage() {
    return (
        <div className="min-h-screen pt-20">
            <div className="max-w-5xl mx-auto px-4 py-16">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
                    <p className="text-blue-400 text-sm font-medium tracking-widest uppercase mb-2">Get in Touch</p>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
                    <p className="text-gray-400 text-lg max-w-xl mx-auto">
                        Have a property inquiry? Talk to Panditji or fill out the form below. We&apos;ll get back to you within minutes.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Contact Info */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                                    <MessageCircle className="w-6 h-6 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">WhatsApp Panditji</h3>
                                    <p className="text-gray-400 text-sm">Chat with our AI assistant 24/7. Get instant property recommendations.</p>
                                    <p className="text-blue-400 mt-1">{COMPANY_PHONE_DISPLAY}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center shrink-0">
                                    <Phone className="w-6 h-6 text-green-400" />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Call Us</h3>
                                    <p className="text-gray-400 text-sm">Same number for WhatsApp, Voice, and VOIP</p>
                                    <p className="text-green-400 mt-1">{COMPANY_PHONE_DISPLAY}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                                    <Mail className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Email</h3>
                                    <p className="text-gray-400 text-sm">For business inquiries and partnerships</p>
                                    <p className="text-purple-400 mt-1">info@realtypandit.com</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center shrink-0">
                                    <MapPin className="w-6 h-6 text-orange-400" />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Office</h3>
                                    <p className="text-gray-400 text-sm">India</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Contact Form */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-8"
                    >
                        <h3 className="text-white font-semibold text-lg mb-6">Send us a message</h3>
                        <ContactForm />
                    </motion.div>
                </div>

                {/* Google Maps */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-16"
                >
                    <h2 className="text-2xl font-bold text-white mb-6 text-center">Find Us on Map</h2>
                    <div className="rounded-2xl overflow-hidden border border-white/10">
                        <iframe
                            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1040.966878514319!2d77.3377957070108!3d28.648300623190828!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390cfacf67fed425%3A0x2c49982c0a3889b4!2sRealty%20Pandit!5e0!3m2!1sen!2sin!4v1771135636157!5m2!1sen!2sin"
                            width="100%"
                            height="450"
                            style={{ border: 0 }}
                            allowFullScreen={true}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            className="w-full"
                        />
                    </div>
                    <div className="text-center mt-4">
                        <a
                            href="https://maps.app.goo.gl/PrKZPa8mNiNuWHJv9"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-2"
                        >
                            <MapPin className="w-4 h-4" />
                            Open in Google Maps
                        </a>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
