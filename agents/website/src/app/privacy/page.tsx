'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, Shield, Mail, Phone, MapPin, Building } from 'lucide-react';

const sections = [
    { id: 'overview', title: 'Overview & Data Fiduciary' },
    { id: 'collection', title: 'Information We Collect' },
    { id: 'usage', title: 'How We Use Your Information' },
    { id: 'legal-basis', title: 'Legal Basis for Processing' },
    { id: 'meta-platforms', title: 'Meta Platforms (WhatsApp, Instagram, Facebook)' },
    { id: 'ai-processing', title: 'AI & Automated Processing' },
    { id: 'third-party', title: 'Third-Party Services' },
    { id: 'cookies', title: 'Cookies & Tracking' },
    { id: 'storage', title: 'Data Storage & Security' },
    { id: 'retention', title: 'Data Retention' },
    { id: 'rights', title: 'Your Rights under DPDP Act' },
    { id: 'deletion', title: 'Data Deletion' },
    { id: 'children', title: "Children's Privacy" },
    { id: 'cross-border', title: 'Cross-Border Data Transfer' },
    { id: 'grievance', title: 'Grievance Redressal' },
    { id: 'changes', title: 'Changes to This Policy' },
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
                        <p className="text-slate-300 text-lg max-w-3xl">Your privacy is important to us. This policy explains how Realty Pandit collects, uses, stores, and protects your personal data in compliance with the Digital Personal Data Protection Act, 2023 (DPDP Act), the Information Technology Act, 2000 and Meta Platform Terms.</p>
                        <p className="text-slate-500 text-sm mt-4">Last updated: April 16, 2026 | Effective: April 16, 2026</p>
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

                            <section id="overview" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. Overview & Data Fiduciary</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">This Privacy Policy applies to all services provided by Realty Pandit through our website (realtypandit.in), WhatsApp Business account, Instagram account (@airealtypandit), Facebook Page, mobile applications, and any related services.</p>
                                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-4">
                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Data Fiduciary (as defined under DPDP Act, 2023)</h4>
                                    <div className="space-y-2 text-slate-600 dark:text-slate-300 text-sm">
                                        <div className="flex items-start gap-2"><Building className="w-4 h-4 mt-1 text-blue-500 shrink-0" /><span><strong>Entity:</strong> Realty Pandit Technologies Pvt. Ltd.</span></div>
                                        <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-1 text-blue-500 shrink-0" /><span><strong>Registered Address:</strong> India</span></div>
                                        <div className="flex items-start gap-2"><Mail className="w-4 h-4 mt-1 text-blue-500 shrink-0" /><span><strong>Contact:</strong> privacy@realtypandit.in</span></div>
                                        <div className="flex items-start gap-2"><Phone className="w-4 h-4 mt-1 text-blue-500 shrink-0" /><span><strong>WhatsApp:</strong> +91 81784 91914</span></div>
                                    </div>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300">By using our services, you consent to the collection and processing of your personal data as described in this policy. If you do not agree, please discontinue use of our services.</p>
                            </section>

                            <section id="collection" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. Information We Collect</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We collect the following categories of personal data:</p>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">a) Information You Provide Directly</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Identity Data:</strong> Full name, phone number, email address</li>
                                    <li><strong>Property Preferences:</strong> Search queries, buy/sell/rent intent, budget range, BHK requirements, preferred locations</li>
                                    <li><strong>Communication Data:</strong> Messages sent via WhatsApp to Panditji AI, Instagram DMs, Facebook Messenger messages, comments on posts, emails, and phone call recordings (with consent)</li>
                                    <li><strong>Business Data:</strong> Company name, RERA registration number (for agents/builders), business address</li>
                                    <li><strong>Transaction Data:</strong> Site visit history, deal status, negotiation details</li>
                                </ul>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">b) Information Collected Automatically</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Device Data:</strong> Browser type, operating system, IP address, device identifiers</li>
                                    <li><strong>Usage Data:</strong> Pages visited, time spent, click patterns, referral source</li>
                                    <li><strong>Location Data:</strong> Approximate location derived from IP address</li>
                                    <li><strong>Cookie Data:</strong> Session identifiers, preferences, analytics data</li>
                                </ul>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">c) Information from Third Parties</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Property Portals:</strong> Lead information from 99acres, MagicBricks, Housing.com (name, phone, email, property interest)</li>
                                    <li><strong>Meta Platforms:</strong> Profile information from Facebook, Instagram, or WhatsApp when you interact with our business accounts</li>
                                    <li><strong>Facebook Lead Ads:</strong> Information you submit through our lead generation forms on Facebook/Instagram</li>
                                </ul>
                            </section>

                            <section id="usage" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. How We Use Your Information</h2>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Property Matching:</strong> To provide AI-powered property recommendations through Panditji based on your preferences</li>
                                    <li><strong>Communication:</strong> To respond to your inquiries via WhatsApp, Instagram, Facebook, email, or phone</li>
                                    <li><strong>Appointment Management:</strong> To schedule, confirm, and remind you about property visits</li>
                                    <li><strong>Lead Management:</strong> To assign you to appropriate agents and track your journey from inquiry to deal closure</li>
                                    <li><strong>Marketing:</strong> To send property updates, new listings, and promotional offers (with your consent, withdrawable anytime)</li>
                                    <li><strong>Analytics:</strong> To analyze usage patterns and improve our AI, website, and services</li>
                                    <li><strong>Advertising:</strong> To create and manage targeted advertisements on Meta platforms (Facebook, Instagram) and measure their effectiveness</li>
                                    <li><strong>Legal Compliance:</strong> To comply with RERA, IT Act, DPDP Act, and other applicable Indian laws</li>
                                    <li><strong>Fraud Prevention:</strong> To detect and prevent fraudulent or unauthorized activity</li>
                                </ul>
                            </section>

                            <section id="legal-basis" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. Legal Basis for Processing</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">Under the DPDP Act, 2023, we process your personal data based on:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Consent (Section 6):</strong> Your explicit consent provided when you interact with our services, submit forms, or message us on WhatsApp/Instagram/Facebook</li>
                                    <li><strong>Legitimate Uses (Section 7):</strong> Processing necessary for performing a contract (property search, visit scheduling), compliance with Indian law, responding to medical emergencies, or employment purposes</li>
                                    <li><strong>Voluntary Provision:</strong> When you voluntarily provide personal data for a specific purpose</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">You may withdraw consent at any time by contacting us at privacy@realtypandit.in or messaging &quot;STOP&quot; on WhatsApp. Withdrawal of consent does not affect the lawfulness of processing done before withdrawal.</p>
                            </section>

                            <section id="meta-platforms" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Meta Platforms (WhatsApp, Instagram, Facebook)</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We use Meta&apos;s platforms to provide our services. This section explains how your data is processed across these platforms:</p>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">WhatsApp Business</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li>We operate a WhatsApp Business account (+91 81784 91914) powered by Meta&apos;s Cloud API</li>
                                    <li>Messages you send are processed by our AI assistant (Panditji) to provide property recommendations</li>
                                    <li>We send transactional messages (appointment confirmations, visit reminders) and marketing messages (new listings, offers) using Meta-approved templates</li>
                                    <li>You can opt out of marketing messages anytime by replying &quot;STOP&quot;</li>
                                    <li>Message data is processed per Meta&apos;s WhatsApp Business Terms of Service</li>
                                </ul>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">Instagram (@airealtypandit)</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li>We may read and respond to comments on our posts and direct messages using AI</li>
                                    <li>Your public profile information (username, profile picture) is visible when you comment or interact</li>
                                    <li>We use Instagram API to manage content, moderate comments, and respond to messages</li>
                                    <li>Data is processed per Meta&apos;s Instagram Platform Policy</li>
                                </ul>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">Facebook Page (Realty Pandit)</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li>We collect leads through Facebook Lead Ads forms you voluntarily submit</li>
                                    <li>We may respond to comments and messages on our Page</li>
                                    <li>We use Meta Pixel for advertising measurement and audience building</li>
                                    <li>Page Insights data is used for analytics in aggregate form</li>
                                </ul>

                                <h4 className="font-semibold text-slate-900 dark:text-white mt-6 mb-2">Meta Advertising</h4>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li>We may use your data to create Custom Audiences for targeted advertising on Facebook and Instagram</li>
                                    <li>We use Meta Pixel and Conversions API for ad performance measurement</li>
                                    <li>You can manage your ad preferences through Meta&apos;s Ad Preferences settings</li>
                                    <li>We do not sell your personal data to third-party advertisers</li>
                                </ul>
                            </section>

                            <section id="ai-processing" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. AI & Automated Processing</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We use artificial intelligence to enhance our services:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Panditji AI Assistant:</strong> Processes your messages to understand property requirements and provide personalized recommendations. Powered by Google Gemini AI with anonymized queries</li>
                                    <li><strong>Lead Scoring:</strong> Automated scoring of leads based on intent, engagement, and reliability signals to prioritize service</li>
                                    <li><strong>Property Matching:</strong> Automated matching of your preferences against available inventory</li>
                                    <li><strong>Follow-up Scheduling:</strong> Automated determination of optimal follow-up timing based on interaction history</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">Automated decisions do not produce legal effects. You can request human review of any AI-generated recommendation by contacting our support team.</p>
                            </section>

                            <section id="third-party" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Third-Party Services</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">We integrate with the following third-party services:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Meta Platforms (WhatsApp, Instagram, Facebook):</strong> Communication and advertising. Subject to <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Meta&apos;s Privacy Policy</a></li>
                                    <li><strong>Google (Gemini AI, Maps, Analytics):</strong> AI processing, location services, analytics. Subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Google&apos;s Privacy Policy</a></li>
                                    <li><strong>99acres, MagicBricks, Housing.com:</strong> Property lead syndication. Only property inquiry data is shared</li>
                                    <li><strong>GlitchTip (Self-hosted):</strong> Error tracking for service reliability. No personal data is intentionally shared</li>
                                    <li><strong>Postfix SMTP:</strong> Email delivery for transactional and communication emails</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">We do not sell, rent, or trade your personal data to any third party for their independent marketing purposes.</p>
                            </section>

                            <section id="cookies" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">8. Cookies & Tracking</h2>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Essential Cookies:</strong> Required for website functionality, authentication, and security. Cannot be disabled</li>
                                    <li><strong>Analytics Cookies:</strong> Google Analytics (G-WJF3Y3SXM3) to understand visitor behavior in aggregate</li>
                                    <li><strong>Marketing Cookies:</strong> Meta Pixel for advertising measurement and Custom Audience creation</li>
                                    <li><strong>Preference Cookies:</strong> Theme preferences (light/dark mode), language selection</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">You can manage cookies through our consent banner on first visit or through your browser settings. Disabling cookies may affect website functionality.</p>
                            </section>

                            <section id="storage" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">9. Data Storage & Security</h2>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Location:</strong> All primary data is stored on secure servers located in India</li>
                                    <li><strong>Encryption:</strong> Data in transit is encrypted using TLS 1.2+. Sensitive data at rest uses AES-256 encryption</li>
                                    <li><strong>Access Control:</strong> Role-based access with principle of least privilege. Only authorized personnel access personal data</li>
                                    <li><strong>Security Measures:</strong> SSL certificates, firewalls, intrusion detection, regular security audits, automated error monitoring</li>
                                    <li><strong>Backups:</strong> Encrypted backups with secure storage for disaster recovery</li>
                                    <li><strong>Breach Response:</strong> In case of a data breach, we will notify affected individuals and the Data Protection Board of India within 72 hours as required under the DPDP Act</li>
                                </ul>
                            </section>

                            <section id="retention" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">10. Data Retention</h2>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Active Users:</strong> Personal data is retained as long as your account is active or services are being provided</li>
                                    <li><strong>Inactive Leads:</strong> Data from leads with no interaction for 2 years may be anonymized or deleted</li>
                                    <li><strong>Transaction Records:</strong> Retained for 8 years as required by Indian tax and RERA regulations</li>
                                    <li><strong>Communication Logs:</strong> WhatsApp/email logs retained for 1 year for service quality, then archived</li>
                                    <li><strong>Analytics Data:</strong> Aggregated and anonymized analytics retained indefinitely</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">You can request early deletion of your data subject to legal retention obligations. See <a href="#deletion" className="text-blue-600 dark:text-blue-400 hover:underline">Data Deletion</a>.</p>
                            </section>

                            <section id="rights" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">11. Your Rights under DPDP Act, 2023</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">As a Data Principal under the Digital Personal Data Protection Act, 2023, you have the following rights:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Right to Information (Section 11(1)):</strong> Obtain a summary of your personal data being processed and the processing activities</li>
                                    <li><strong>Right to Correction & Erasure (Section 12):</strong> Request correction of inaccurate data or erasure of data no longer necessary</li>
                                    <li><strong>Right to Grievance Redressal (Section 13):</strong> File a complaint with our Grievance Officer or the Data Protection Board of India</li>
                                    <li><strong>Right to Nominate (Section 14):</strong> Nominate another person to exercise your rights in case of death or incapacity</li>
                                    <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for any or all processing activities at any time</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">To exercise your rights, email us at <a href="mailto:privacy@realtypandit.in" className="text-blue-600 dark:text-blue-400 hover:underline">privacy@realtypandit.in</a> or visit our <Link href="/data-deletion" className="text-blue-600 dark:text-blue-400 hover:underline">Data Deletion page</Link>. We will respond within 30 days.</p>
                            </section>

                            <section id="deletion" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">12. Data Deletion</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">You have the right to request deletion of your personal data. For detailed instructions, visit our dedicated <Link href="/data-deletion" className="text-blue-600 dark:text-blue-400 hover:underline">Data Deletion Instructions page</Link>.</p>
                                <p className="text-slate-600 dark:text-slate-300">To request deletion: email <a href="mailto:privacy@realtypandit.in" className="text-blue-600 dark:text-blue-400 hover:underline">privacy@realtypandit.in</a> with subject &quot;Data Deletion Request&quot; or message &quot;DELETE MY DATA&quot; on WhatsApp at +91 81784 91914.</p>
                            </section>

                            <section id="children" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">13. Children&apos;s Privacy</h2>
                                <p className="text-slate-600 dark:text-slate-300">Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal data from children. If we discover that we have collected data from a child without verifiable parental consent, we will delete it promptly. As required under Section 9 of the DPDP Act, processing of children&apos;s data requires verifiable consent of a parent or lawful guardian.</p>
                            </section>

                            <section id="cross-border" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">14. Cross-Border Data Transfer</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">Your personal data may be processed outside India in the following cases:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Meta Platforms:</strong> WhatsApp, Instagram, and Facebook data is processed by Meta Platforms Inc. (USA) under their data processing terms</li>
                                    <li><strong>Google Services:</strong> AI processing and analytics data may be processed by Google LLC (USA)</li>
                                </ul>
                                <p className="text-slate-600 dark:text-slate-300 mt-4">Such transfers are made in compliance with Section 16 of the DPDP Act, 2023, which permits transfer to countries not restricted by the Central Government. We ensure appropriate safeguards are in place for all cross-border transfers.</p>
                            </section>

                            <section id="grievance" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">15. Grievance Redressal</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">In accordance with the DPDP Act, 2023 and IT Act, 2000, we have appointed a Grievance Officer:</p>
                                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Grievance Officer</p>
                                                <p className="text-slate-900 dark:text-white font-medium">Realty Pandit Technologies Pvt. Ltd.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
                                                <a href="mailto:grievance@realtypandit.in" className="text-slate-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">grievance@realtypandit.in</a>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300 text-sm mt-4">Grievances will be acknowledged within 24 hours and resolved within 30 days. If unsatisfied with the resolution, you may approach the Data Protection Board of India as established under the DPDP Act, 2023.</p>
                                </div>
                            </section>

                            <section id="changes" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">16. Changes to This Policy</h2>
                                <p className="text-slate-600 dark:text-slate-300">We may update this Privacy Policy to reflect changes in our practices, technology, legal requirements, or other factors. Material changes will be notified via email or WhatsApp. The &quot;Last Updated&quot; date at the top indicates the most recent revision. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
                            </section>

                            <section id="contact" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">17. Contact Us</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">For any questions, concerns, or requests related to this Privacy Policy or your personal data:</p>
                                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Building className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Company</p>
                                                <p className="text-slate-900 dark:text-white font-medium">Realty Pandit Technologies Pvt. Ltd.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Privacy Email</p>
                                                <a href="mailto:privacy@realtypandit.in" className="text-slate-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">privacy@realtypandit.in</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">General Email</p>
                                                <a href="mailto:support@realtypandit.in" className="text-slate-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">support@realtypandit.in</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">WhatsApp</p>
                                                <p className="text-slate-900 dark:text-white font-medium">+91 81784 91914</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Governing Law:</strong> This Privacy Policy is governed by the laws of India, including the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011. Any disputes shall be subject to the exclusive jurisdiction of courts in India.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
