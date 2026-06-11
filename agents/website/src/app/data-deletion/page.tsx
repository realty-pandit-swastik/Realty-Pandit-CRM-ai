'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Trash2, Mail, Phone, Clock, CheckCircle, AlertTriangle, Shield } from 'lucide-react';

const steps = [
    {
        icon: Mail,
        title: 'Submit Request',
        description: 'Send an email to privacy@realtypandit.in with subject "Data Deletion Request" or message "DELETE MY DATA" on WhatsApp at +91 81784 91914.',
    },
    {
        icon: CheckCircle,
        title: 'Verification',
        description: 'We will verify your identity by confirming your registered phone number or email address. This protects your data from unauthorized deletion requests.',
    },
    {
        icon: Clock,
        title: 'Processing',
        description: 'Your request will be processed within 30 days. You will receive a confirmation once deletion is complete.',
    },
    {
        icon: Trash2,
        title: 'Deletion Complete',
        description: 'All your personal data will be permanently deleted from our systems, except data required to be retained by law.',
    },
];

export default function DataDeletionPage() {
    return (
        <div className="min-h-screen pt-16">
            {/* Hero */}
            <section className="bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 py-20 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 left-10 w-72 h-72 bg-red-500 rounded-full blur-[128px]" />
                    <div className="absolute bottom-10 right-10 w-72 h-72 bg-orange-500 rounded-full blur-[128px]" />
                </div>
                <div className="max-w-7xl mx-auto px-4 relative">
                    <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white">Data Deletion</span>
                    </div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-center gap-3 mb-4">
                            <Trash2 className="w-12 h-12 text-red-400" />
                            <h1 className="text-4xl md:text-5xl font-bold text-white">Data Deletion Instructions</h1>
                        </div>
                        <p className="text-slate-300 text-lg max-w-3xl">You have the right to request deletion of your personal data from Realty Pandit&apos;s systems. This page explains how to exercise this right under the Digital Personal Data Protection Act, 2023 and Meta Platform Policies.</p>
                        <p className="text-slate-500 text-sm mt-4">Last updated: April 16, 2026</p>
                    </motion.div>
                </div>
            </section>

            {/* Steps */}
            <section className="py-16 bg-white dark:bg-slate-950">
                <div className="max-w-4xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">How to Request Data Deletion</h2>

                    <div className="space-y-6 mb-16">
                        {steps.map((step, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex gap-4 p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
                            >
                                <div className="shrink-0">
                                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                                        <step.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Step {index + 1}: {step.title}</h3>
                                    <p className="text-slate-600 dark:text-slate-300">{step.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Contact Methods */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
                        <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                                <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Via Email</h3>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 mb-3">Send your request to:</p>
                            <a href="mailto:privacy@realtypandit.in?subject=Data%20Deletion%20Request" className="text-blue-600 dark:text-blue-400 font-medium text-lg hover:underline">privacy@realtypandit.in</a>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Subject: &quot;Data Deletion Request&quot;</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Include: Your registered name and phone number</p>
                        </div>
                        <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                                <Phone className="w-6 h-6 text-green-600 dark:text-green-400" />
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Via WhatsApp</h3>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 mb-3">Message us at:</p>
                            <p className="text-green-600 dark:text-green-400 font-medium text-lg">+91 81784 91914</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Send: &quot;DELETE MY DATA&quot;</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">We will confirm and process your request</p>
                        </div>
                    </div>

                    {/* What Gets Deleted */}
                    <div className="mb-16">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">What Data Will Be Deleted</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl">
                                <h4 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                                    <Trash2 className="w-5 h-5 text-red-500" /> Will Be Deleted
                                </h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300 text-sm">
                                    <li>Your name, phone number, email address</li>
                                    <li>Property search preferences and history</li>
                                    <li>WhatsApp conversation history with Panditji</li>
                                    <li>Instagram and Facebook interaction data</li>
                                    <li>Lead scores and engagement data</li>
                                    <li>Site visit records and appointment history</li>
                                    <li>Cookie and browsing data linked to your account</li>
                                    <li>Email communication history</li>
                                </ul>
                            </div>
                            <div className="p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                                <h4 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" /> May Be Retained (Legal Obligations)
                                </h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300 text-sm">
                                    <li>Transaction records (required by Indian tax law for up to 8 years)</li>
                                    <li>RERA compliance records</li>
                                    <li>Records required for ongoing legal proceedings</li>
                                    <li>Anonymized aggregate analytics data (not personally identifiable)</li>
                                    <li>Records necessary to prevent fraud or enforce our terms</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Meta Platform Specific */}
                    <div className="mb-16">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Meta Platform Data (Facebook, Instagram, WhatsApp)</h2>
                        <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <p className="text-slate-600 dark:text-slate-300 mb-4">If you interacted with Realty Pandit through Meta platforms, the following applies:</p>
                            <ul className="space-y-3 text-slate-600 dark:text-slate-300">
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                    <span><strong>WhatsApp:</strong> Your conversation data stored in our systems will be deleted. Meta may retain message metadata per their own retention policy.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                    <span><strong>Instagram:</strong> Your DM data and comment interaction data stored in our systems will be deleted. Public comments you made remain on Instagram (managed by Meta).</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                    <span><strong>Facebook:</strong> Lead data submitted through our Facebook ads will be deleted from our systems. Meta may retain lead form submission data per their data policy.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                    <span><strong>Meta Pixel Data:</strong> We will remove your data from our Custom Audiences. To manage Meta&apos;s data on you, visit <a href="https://www.facebook.com/privacy/center/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Meta Privacy Center</a>.</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="mb-16">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Processing Timeline</h2>
                        <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-20 text-center shrink-0">
                                        <span className="text-blue-600 dark:text-blue-400 font-bold">24 hrs</span>
                                    </div>
                                    <div className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
                                    <p className="text-slate-600 dark:text-slate-300 text-sm">Request acknowledged and verification initiated</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 text-center shrink-0">
                                        <span className="text-blue-600 dark:text-blue-400 font-bold">7 days</span>
                                    </div>
                                    <div className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
                                    <p className="text-slate-600 dark:text-slate-300 text-sm">Active data removed from production systems</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 text-center shrink-0">
                                        <span className="text-blue-600 dark:text-blue-400 font-bold">30 days</span>
                                    </div>
                                    <div className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
                                    <p className="text-slate-600 dark:text-slate-300 text-sm">Data purged from backups and archives. Confirmation sent</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Legal Notice */}
                    <div className="mb-16">
                        <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                            <div className="flex items-start gap-3">
                                <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Your Legal Rights</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Under the Digital Personal Data Protection Act, 2023 (Section 12), you have the right to erasure of your personal data. This right is subject to certain legal exceptions, including data retention required by Indian tax laws, RERA regulations, and other statutory obligations.</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-300">If you are unsatisfied with how your deletion request is handled, you may file a complaint with the <strong>Data Protection Board of India</strong> as established under the DPDP Act, 2023, or contact our Grievance Officer at <a href="mailto:grievance@realtypandit.in" className="text-blue-600 dark:text-blue-400 hover:underline">grievance@realtypandit.in</a>.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Back to Privacy */}
                    <div className="text-center">
                        <Link href="/privacy" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-medium">
                            <Shield className="w-4 h-4" />
                            Read our full Privacy Policy
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
