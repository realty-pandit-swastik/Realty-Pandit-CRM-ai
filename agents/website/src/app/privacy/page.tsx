'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Shield, Mail } from 'lucide-react';

const sections = [
    { id: 'collection', title: 'Information We Collect' },
    { id: 'usage', title: 'How We Use Your Information' },
    { id: 'storage', title: 'Data Storage & Security' },
    { id: 'third-party', title: 'Third-Party Services' },
    { id: 'cookies', title: 'Cookies & Tracking' },
    { id: 'rights', title: 'Your Rights' },
    { id: 'contact', title: 'Contact Us' },
];

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen pt-16">
            {/* Hero */}
            <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-20 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full blur-[128px]" />
                    <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-500 rounded-full blur-[128px]" />
                </div>
                <div className="max-w-7xl mx-auto px-4 relative">
                    <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                        <Link href="/" className="hover:text-white transition-colors">Home</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-white">Privacy Policy</span>
                    </div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-center gap-3 mb-4">
                            <Shield className="w-12 h-12 text-blue-400" />
                            <h1 className="text-4xl md:text-5xl font-bold text-white">Privacy Policy</h1>
                        </div>
                        <p className="text-slate-300 text-lg max-w-3xl">Your privacy is important to us. This policy explains how Realty Pandit collects, uses, and protects your personal information.</p>
                        <p className="text-slate-500 text-sm mt-4">Last updated: February 11, 2025</p>
                    </motion.div>
                </div>
            </section>

            {/* Content */}
            <section className="py-16 bg-white dark:bg-slate-950">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Sidebar */}
                        <aside className="lg:col-span-1">
                            <div className="sticky top-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                                <h3 className="text-slate-900 dark:text-white font-semibold mb-4">Contents</h3>
                                <nav className="space-y-2">
                                    {sections.map(section => (
                                        <a
                                            key={section.id}
                                            href={`#${section.id}`}
                                            className="block text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                        >
                                            {section.title}
                                        </a>
                                    ))}
                                </nav>
                            </div>
                        </aside>

                        {/* Main Content */}
                        <div className="lg:col-span-3 prose prose-slate dark:prose-invert max-w-none">
                            <section id="collection" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. Information We Collect</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We collect information that you provide directly to us when you use our services:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Personal Information:</strong> Name, phone number, email address, and location when you fill out contact forms, schedule property visits, or use the lead capture popup.</li>
                                    <li><strong>Property Preferences:</strong> Search queries, property interests (buy/sell/rent), budget range, and BHK requirements.</li>
                                    <li><strong>WhatsApp Communication:</strong> Messages you send to Panditji, our AI assistant, via WhatsApp including property inquiries and preferences.</li>
                                    <li><strong>Usage Data:</strong> Browser type, IP address, device information, pages visited, time spent on pages, and referral source collected via cookies and analytics.</li>
                                    <li><strong>Cookie Consent:</strong> Your consent preferences for cookies and tracking technologies as captured by our cookie consent banner.</li>
                                </ul>
                            </section>

                            <section id="usage" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. How We Use Your Information</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We use the collected information for the following purposes:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Property Matching:</strong> To provide personalized property recommendations through Panditji AI based on your preferences and search history.</li>
                                    <li><strong>Communication:</strong> To contact you via WhatsApp, phone, or email regarding property inquiries, scheduled visits, and follow-up communications.</li>
                                    <li><strong>Service Improvement:</strong> To analyze user behavior and improve our website, AI algorithms, and customer service.</li>
                                    <li><strong>Marketing:</strong> To send you newsletters, property updates, and promotional offers (only with your consent, which can be withdrawn anytime).</li>
                                    <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes including RERA requirements.</li>
                                </ul>
                            </section>

                            <section id="storage" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. Data Storage & Security</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">Your data is stored securely using industry-standard practices:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Location:</strong> All data is stored on secure servers located in India, complying with Indian data protection laws.</li>
                                    <li><strong>Encryption:</strong> Data transmission is encrypted using SSL/TLS protocols. Sensitive data at rest is encrypted using AES-256 encryption.</li>
                                    <li><strong>Access Control:</strong> Only authorized personnel with legitimate business needs have access to your personal information.</li>
                                    <li><strong>Retention:</strong> We retain your personal information for as long as your account is active or as needed to provide services. You can request deletion at any time.</li>
                                    <li><strong>Backups:</strong> Regular backups are maintained to prevent data loss, stored securely with encryption.</li>
                                </ul>
                            </section>

                            <section id="third-party" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. Third-Party Services</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We integrate with third-party services to enhance your experience:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>WhatsApp Business API:</strong> For Panditji AI communication. Messages are processed according to Meta's privacy policy.</li>
                                    <li><strong>Google Gemini AI:</strong> Powers Panditji's natural language understanding. Queries are anonymized before processing.</li>
                                    <li><strong>Property Portals:</strong> We sync listings with 99acres, MagicBricks, and Housing.com. Only property data is shared, not personal information without consent.</li>
                                    <li><strong>Payment Gateways:</strong> For premium services (if applicable), processed through PCI-DSS compliant payment providers.</li>
                                    <li><strong>Analytics:</strong> We may use Google Analytics or similar services to understand user behavior. You can opt-out via cookie settings.</li>
                                </ul>
                            </section>

                            <section id="cookies" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Cookies & Tracking</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We use cookies and similar tracking technologies:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Essential Cookies:</strong> Required for website functionality, authentication, and security. Cannot be disabled.</li>
                                    <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website (e.g., Google Analytics).</li>
                                    <li><strong>Marketing Cookies:</strong> Used to deliver personalized ads and track campaign effectiveness.</li>
                                    <li><strong>Preference Cookies:</strong> Remember your settings like theme preference (light/dark mode) and language selection.</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">You can manage cookie preferences through our cookie consent banner that appears on your first visit. Most browsers also allow you to control cookies through settings.</p>
                            </section>

                            <section id="rights" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. Your Rights</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">Under Indian data protection laws, you have the following rights:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Right to Access:</strong> Request a copy of all personal data we hold about you.</li>
                                    <li><strong>Right to Correction:</strong> Request correction of inaccurate or incomplete personal information.</li>
                                    <li><strong>Right to Deletion:</strong> Request deletion of your personal data (subject to legal retention requirements).</li>
                                    <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for marketing communications or data processing at any time.</li>
                                    <li><strong>Right to Data Portability:</strong> Request your data in a structured, machine-readable format.</li>
                                    <li><strong>Right to Object:</strong> Object to processing of your personal data for marketing or profiling purposes.</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">To exercise any of these rights, contact us at <a href="mailto:privacy@realtypandit.com" className="text-blue-600 dark:text-blue-400 hover:underline">privacy@realtypandit.com</a></p>
                            </section>

                            <section id="contact" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Contact Us</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">If you have questions about this Privacy Policy or our data practices, please contact us:</p>
                                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
                                                <a href="mailto:privacy@realtypandit.com" className="text-slate-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">privacy@realtypandit.com</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Data Protection Officer</p>
                                                <p className="text-slate-900 dark:text-white font-medium">Realty Pandit Technologies Pvt. Ltd.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Policy Updates:</strong> We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
