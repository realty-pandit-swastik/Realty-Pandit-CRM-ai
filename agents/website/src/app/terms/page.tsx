'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, FileText, Mail } from 'lucide-react';

const sections = [
    { id: 'acceptance', title: 'Acceptance of Terms' },
    { id: 'accounts', title: 'User Accounts' },
    { id: 'listings', title: 'Property Listings' },
    { id: 'responsibilities', title: 'User Responsibilities' },
    { id: 'prohibited', title: 'Prohibited Activities' },
    { id: 'intellectual', title: 'Intellectual Property' },
    { id: 'liability', title: 'Limitation of Liability' },
    { id: 'disputes', title: 'Dispute Resolution' },
    { id: 'governing', title: 'Governing Law' },
    { id: 'contact', title: 'Contact Us' },
];

export default function TermsOfServicePage() {
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
                        <span className="text-white">Terms of Service</span>
                    </div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="w-12 h-12 text-blue-400" />
                            <h1 className="text-4xl md:text-5xl font-bold text-white">Terms of Service</h1>
                        </div>
                        <p className="text-slate-300 text-lg max-w-3xl">Please read these terms carefully before using Realty Pandit&apos;s services. By accessing or using our platform, you agree to be bound by these terms.</p>
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
                            <section id="acceptance" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">By accessing or using Realty Pandit&apos;s website, mobile applications, WhatsApp services (Panditji AI assistant), or any related services (collectively, the &quot;Platform&quot;), you agree to comply with and be bound by these Terms of Service (&quot;Terms&quot;).</p>
                                <p className="text-slate-600 dark:text-slate-300">If you do not agree to these Terms, please do not use our Platform. We reserve the right to modify these Terms at any time, and your continued use of the Platform after such modifications constitutes acceptance of the updated Terms.</p>
                            </section>

                            <section id="accounts" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">2. User Registration & Accounts</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">To access certain features of the Platform, you may need to provide personal information:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Accuracy:</strong> You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.</li>
                                    <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</li>
                                    <li><strong>Unauthorized Access:</strong> You must notify us immediately of any unauthorized use of your account or any other breach of security.</li>
                                    <li><strong>Age Requirement:</strong> You must be at least 18 years old to use our Platform or have parental/guardian consent.</li>
                                    <li><strong>One Account Per User:</strong> You may not create multiple accounts or share your account with others.</li>
                                </ul>
                            </section>

                            <section id="listings" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">3. Property Listings</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">Users listing properties on our Platform agree to the following:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Accuracy of Information:</strong> All property details, photos, pricing, and specifications must be accurate and up-to-date. Misleading or false information is strictly prohibited.</li>
                                    <li><strong>Legal Compliance:</strong> Properties must comply with all applicable laws including RERA (Real Estate Regulatory Authority) registration where required.</li>
                                    <li><strong>Ownership/Authorization:</strong> You must be the legal owner of the property or have explicit authorization from the owner to list it on our Platform.</li>
                                    <li><strong>No Duplicate Listings:</strong> Do not create multiple listings for the same property with different details or prices.</li>
                                    <li><strong>RERA Compliance:</strong> For projects requiring RERA registration, the RERA registration number must be displayed prominently.</li>
                                    <li><strong>Photo Rights:</strong> You must own or have rights to use all photos uploaded. Watermarked images from other portals are not permitted.</li>
                                </ul>
                            </section>

                            <section id="responsibilities" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">4. User Responsibilities</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">As a user of the Platform, you agree to:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Lawful Use:</strong> Use the Platform only for lawful purposes and in accordance with these Terms.</li>
                                    <li><strong>Respectful Communication:</strong> Communicate respectfully with other users, property owners, and our support team. Harassment, abuse, or threats are strictly prohibited.</li>
                                    <li><strong>Transaction Responsibility:</strong> Realty Pandit is a platform connecting buyers, sellers, and renters. All property transactions are between users. You are responsible for conducting due diligence before any transaction.</li>
                                    <li><strong>Verification:</strong> Verify property ownership, legal documents, and RERA compliance independently before making any commitments or payments.</li>
                                    <li><strong>AI Assistant Usage:</strong> Panditji AI provides recommendations based on your preferences but is not a substitute for professional real estate advice or legal counsel.</li>
                                </ul>
                            </section>

                            <section id="prohibited" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">5. Prohibited Activities</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">You may not engage in any of the following prohibited activities:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li>Posting false, misleading, or fraudulent property listings</li>
                                    <li>Impersonating any person or entity or falsely stating affiliation with a person or entity</li>
                                    <li>Scraping, data mining, or automated extraction of data from our Platform</li>
                                    <li>Attempting to gain unauthorized access to our systems or other users&apos; accounts</li>
                                    <li>Transmitting viruses, malware, or any other malicious code</li>
                                    <li>Using the Platform to spam, phish, or conduct any fraudulent activities</li>
                                    <li>Posting content that violates intellectual property rights, privacy rights, or any applicable law</li>
                                    <li>Interfering with or disrupting the Platform or servers or networks connected to the Platform</li>
                                    <li>Using automated systems (bots) to access the Platform without our express written permission</li>
                                </ul>
                            </section>

                            <section id="intellectual" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">6. Intellectual Property Rights</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">All content on the Platform is the property of Realty Pandit or its content suppliers:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Platform Ownership:</strong> The Platform, including its design, code, features, branding (Realty Pandit, Panditji), and AI technology, is owned by Realty Pandit Technologies Pvt. Ltd. and protected by copyright, trademark, and other intellectual property laws.</li>
                                    <li><strong>Limited License:</strong> We grant you a limited, non-exclusive, non-transferable license to access and use the Platform for personal, non-commercial use.</li>
                                    <li><strong>User Content:</strong> You retain ownership of property listings and content you post. By posting, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and display your content for the purpose of operating and promoting the Platform.</li>
                                    <li><strong>Restrictions:</strong> You may not copy, modify, distribute, sell, or lease any part of our Platform without explicit written permission.</li>
                                </ul>
                            </section>

                            <section id="liability" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">7. Limitation of Liability</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">To the fullest extent permitted by law:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Platform &quot;As Is&quot;:</strong> The Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied.</li>
                                    <li><strong>No Warranty:</strong> We do not warrant that the Platform will be uninterrupted, error-free, or free of viruses or other harmful components.</li>
                                    <li><strong>Property Transactions:</strong> Realty Pandit is not a party to any property transaction between users. We do not guarantee the accuracy of listings or the reliability of any user.</li>
                                    <li><strong>Liability Cap:</strong> Our total liability to you for any claims arising from your use of the Platform shall not exceed the amount you paid us (if any) in the past 12 months.</li>
                                    <li><strong>Indirect Damages:</strong> We shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill.</li>
                                    <li><strong>User Disputes:</strong> We are not responsible for disputes between users. You agree to release Realty Pandit from claims, demands, and damages arising from disputes with other users.</li>
                                </ul>
                            </section>

                            <section id="disputes" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">8. Dispute Resolution</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">In the event of any dispute or claim arising from these Terms or your use of the Platform:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Informal Resolution:</strong> You agree to first contact us at <a href="mailto:support@realtypandit.in" className="text-blue-600 dark:text-blue-400 hover:underline">support@realtypandit.in</a> to attempt to resolve the dispute informally.</li>
                                    <li><strong>Arbitration:</strong> If informal resolution fails, disputes shall be resolved through binding arbitration in accordance with the Arbitration and Conciliation Act, 1996.</li>
                                    <li><strong>Arbitration Location:</strong> Arbitration proceedings shall be conducted in New Delhi, India.</li>
                                    <li><strong>Class Action Waiver:</strong> You agree to resolve disputes on an individual basis and waive any right to participate in class action lawsuits.</li>
                                </ul>
                            </section>

                            <section id="governing" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">9. Governing Law & Jurisdiction</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">These Terms shall be governed by and construed in accordance with the laws of India:</p>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li><strong>Applicable Law:</strong> Indian law, including the Information Technology Act, 2000, Consumer Protection Act, 2019, and RERA Act, 2016.</li>
                                    <li><strong>Exclusive Jurisdiction:</strong> Courts in New Delhi, India shall have exclusive jurisdiction over any disputes not resolved through arbitration.</li>
                                    <li><strong>Severability:</strong> If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</li>
                                </ul>
                            </section>

                            <section id="contact" className="mb-12">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">10. Contact Us</h2>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">If you have questions about these Terms of Service, please contact us:</p>
                                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
                                                <a href="mailto:legal@realtypandit.in" className="text-slate-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">legal@realtypandit.in</a>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">Legal Department</p>
                                                <p className="text-slate-900 dark:text-white font-medium">Realty Pandit Technologies Pvt. Ltd.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Terms Updates:</strong> We reserve the right to modify these Terms at any time. Material changes will be notified via email or prominent notice on the Platform. Continued use after changes constitutes acceptance of the updated Terms.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
