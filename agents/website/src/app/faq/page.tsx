'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Search, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { COMPANY_WHATSAPP_URL } from '@/lib/constants';

interface FAQItem {
    question: string;
    answer: string;
    category: string;
}

const faqCategories = [
    { id: 'all', label: 'All' },
    { id: 'general', label: 'General' },
    { id: 'buying', label: 'Buying' },
    { id: 'selling', label: 'Selling' },
    { id: 'renting', label: 'Renting' },
    { id: 'panditji', label: 'Panditji AI' },
    { id: 'legal', label: 'Legal' },
];

const faqItems: FAQItem[] = [
    // General
    {
        question: 'What is Realty Pandit?',
        answer: 'Realty Pandit is an AI-powered real estate platform that helps you buy, sell, and rent properties across India. We combine cutting-edge artificial intelligence with deep real estate expertise to provide a seamless, transparent property experience. Our AI assistant Panditji is available 24/7 on WhatsApp to help you find and manage properties.',
        category: 'general',
    },
    {
        question: 'How does Panditji work?',
        answer: 'Panditji is our AI-powered property assistant available on WhatsApp. Simply send a message describing what you\'re looking for (e.g., "3BHK flat in Noida under 80 lakhs") and Panditji will understand your requirements and match you with relevant properties. It can answer questions about properties, schedule visits, and guide you through the entire buying, selling, or renting process.',
        category: 'general',
    },
    {
        question: 'Is Realty Pandit free to use?',
        answer: 'Yes, browsing properties and chatting with Panditji is completely free for buyers and tenants. For sellers and landlords, we offer competitive listing packages. There are no hidden charges, and you only pay for services you explicitly opt for. Contact us for detailed pricing on premium services.',
        category: 'general',
    },
    {
        question: 'Which cities does Realty Pandit operate in?',
        answer: 'Realty Pandit currently operates in major cities across NCR (Delhi, Noida, Greater Noida, Gurgaon, Ghaziabad, Faridabad), and is rapidly expanding to other metro cities including Mumbai, Bangalore, Pune, Hyderabad, and Chennai. Check our listings or ask Panditji for the latest available locations.',
        category: 'general',
    },
    // Buying
    {
        question: 'How do I buy a property through Realty Pandit?',
        answer: 'Start by telling Panditji your requirements on WhatsApp or browse our property listings. Once you find properties you like, we\'ll help you schedule site visits, verify documentation, negotiate pricing, and complete the transaction. Our team provides end-to-end support from property discovery to registration.',
        category: 'buying',
    },
    {
        question: 'What documents do I need to buy a property?',
        answer: 'For buying a property, you typically need: PAN Card, Aadhaar Card, address proof, income proof (salary slips/ITR for last 2-3 years), bank statements (6 months), passport-size photographs, and if taking a home loan — employment proof and property documents for bank verification. Our team will guide you through the complete documentation checklist.',
        category: 'buying',
    },
    {
        question: 'How do I check if a property is RERA registered?',
        answer: 'Every state has a RERA website where you can verify a project\'s registration status. Search by the RERA number or project name. At Realty Pandit, we verify RERA compliance for all listed properties and display the RERA number on the listing. You can also ask Panditji to check RERA status for any property.',
        category: 'buying',
    },
    {
        question: 'Can Realty Pandit help with home loans?',
        answer: 'Yes! We have partnerships with leading banks and NBFCs to help you get the best home loan rates. Our team assists with loan eligibility calculation, document preparation, application submission, and follow-up until disbursement. We compare offers from multiple lenders to ensure you get the most competitive interest rates.',
        category: 'buying',
    },
    {
        question: 'What are the hidden costs when buying a property?',
        answer: 'Beyond the property price, budget for: stamp duty (5-7% depending on state), registration charges (1%), GST (5% for under-construction, 0% for ready-to-move), legal fees, home loan processing fee (0.5-1%), maintenance deposit, parking charges, and interior costs. Our team provides a complete cost breakdown before you make a decision.',
        category: 'buying',
    },
    // Selling
    {
        question: 'How do I list my property for sale on Realty Pandit?',
        answer: 'You can list your property by chatting with Panditji on WhatsApp, filling out the listing form on our website, or contacting our team directly. Share your property details, photos, and pricing expectations. Our team will verify the information, create an attractive listing, and promote it to our buyer network.',
        category: 'selling',
    },
    {
        question: 'How is the property price determined?',
        answer: 'We use AI-powered valuation that considers multiple factors: location, property age, amenities, recent comparable sales in the area, market trends, and infrastructure developments. This provides a data-driven fair market value. Our experts also provide personalized pricing advice based on current demand and your timeline.',
        category: 'selling',
    },
    {
        question: 'How long does it typically take to sell a property?',
        answer: 'The timeline varies based on property type, pricing, location, and market conditions. A competitively priced property in a good location typically sells within 30-90 days. Premium or niche properties may take longer. Our AI-powered marketing and extensive buyer network help reduce the selling timeline significantly compared to traditional methods.',
        category: 'selling',
    },
    {
        question: 'Do I need to be present for property viewings?',
        answer: 'While it\'s helpful for owners to be present during viewings, it\'s not mandatory. Our team can conduct viewings on your behalf. We schedule visits at convenient times, accompany buyers, and provide you with detailed feedback after each viewing.',
        category: 'selling',
    },
    // Renting
    {
        question: 'How does tenant verification work?',
        answer: 'We conduct thorough tenant verification including: identity verification (Aadhaar, PAN), employment verification, previous rental reference checks, and police verification assistance. Our AI system also screens tenants based on their profile and history to ensure you get reliable tenants.',
        category: 'renting',
    },
    {
        question: 'Who prepares the rental agreement?',
        answer: 'Realty Pandit provides a standardized, legally vetted rental agreement that covers all essential clauses. We customize it based on the specific terms agreed between landlord and tenant. The agreement covers rent amount, security deposit, lock-in period, maintenance responsibilities, notice period, and other important terms.',
        category: 'renting',
    },
    {
        question: 'How much security deposit is standard?',
        answer: 'Security deposits vary by city: 2-3 months rent in Delhi/NCR, 2-3 months in Mumbai, and up to 10 months in Bangalore. This is negotiable between landlord and tenant. The deposit is refundable at the end of the lease, minus any deductions for damages. All terms are clearly documented in the rental agreement.',
        category: 'renting',
    },
    {
        question: 'Can I break the rental agreement early?',
        answer: 'Most rental agreements include a lock-in period (typically 6-12 months) during which early termination may result in forfeiture of the security deposit. After the lock-in period, either party can terminate with the agreed notice period (usually 1-2 months). Check your specific agreement terms or ask Panditji for guidance.',
        category: 'renting',
    },
    // Panditji AI
    {
        question: 'What can Panditji help me with?',
        answer: 'Panditji can help with: property search based on your criteria, property valuations, scheduling site visits, answering questions about properties and localities, explaining legal terms and processes, providing market insights, connecting you with agents, and guiding you through the entire buy/sell/rent process. Think of Panditji as your personal property advisor.',
        category: 'panditji',
    },
    {
        question: 'Is Panditji available 24/7?',
        answer: 'Yes! Panditji is available 24 hours a day, 7 days a week on WhatsApp. Whether it\'s early morning or late night, you can ask property-related questions and get instant responses. For tasks that require human intervention (like scheduling visits or legal documentation), our team follows up during business hours.',
        category: 'panditji',
    },
    {
        question: 'What languages does Panditji understand?',
        answer: 'Panditji currently understands and responds in English and Hindi. You can even mix both languages (Hinglish) in your messages. We\'re working on adding support for more regional languages to make property search accessible to everyone across India.',
        category: 'panditji',
    },
    {
        question: 'Is my conversation with Panditji private?',
        answer: 'Absolutely. Your conversations with Panditji are confidential and secured. We use industry-standard encryption for all communications. Your data is never shared with third parties without your consent. Please refer to our Privacy Policy for complete details on data handling practices.',
        category: 'panditji',
    },
    // Legal
    {
        question: 'What is RERA and how does it protect buyers?',
        answer: 'RERA (Real Estate Regulation and Development Act, 2016) protects home buyers by requiring all real estate projects to be registered, mandating transparency in project details, limiting advance payments to 10%, ensuring timely delivery with penalties for delays, and providing a 5-year structural defect warranty. Every property on Realty Pandit is verified for RERA compliance.',
        category: 'legal',
    },
    {
        question: 'How is stamp duty calculated?',
        answer: 'Stamp duty is a state-level tax on property transactions, typically 5-7% of the property value. Some states offer concessions for women buyers (1-2% less). The exact rate depends on the state, property type, and buyer category. For example, in Delhi it\'s 4-6%, in UP it\'s 7%, and in Haryana it\'s 5-7%. Our team provides exact calculations for your specific transaction.',
        category: 'legal',
    },
    {
        question: 'What is the property registration process?',
        answer: 'Property registration involves: preparing the sale deed with all terms, paying stamp duty and registration charges, visiting the Sub-Registrar\'s office with both parties and two witnesses, biometric verification, document submission, and collecting the registered deed. The entire process typically takes a few hours at the registrar\'s office. Our legal partners can guide you through every step.',
        category: 'legal',
    },
    {
        question: 'Do I need a lawyer for a property transaction?',
        answer: 'While not legally mandatory, having a lawyer review your property documents is highly recommended. A lawyer can verify the title, check for encumbrances, review the sale agreement, and ensure all legal formalities are completed correctly. Realty Pandit connects you with experienced real estate lawyers who can assist at competitive rates.',
        category: 'legal',
    },
];

export default function FAQPage() {
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const filteredFAQs = faqItems.filter((faq) => {
        const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
        const matchesSearch = searchQuery === '' ||
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const toggleAccordion = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    const faqJsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqItems.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer,
            },
        })),
    };

    return (
        <div className="min-h-screen">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            {/* Hero Section */}
            <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 pt-32 pb-20">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span className="text-white">FAQ</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                            Frequently Asked<br />
                            <span className="text-blue-400">Questions</span>
                        </h1>
                        <p className="text-lg text-slate-300 max-w-2xl">
                            Find answers to common questions about buying, selling, renting properties, and using Panditji AI assistant.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* FAQ Content */}
            <section className="py-20 bg-white dark:bg-slate-900">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-8"
                    >
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                            <input
                                type="search"
                                placeholder="Search questions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                aria-label="Search frequently asked questions"
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            />
                        </div>
                    </motion.div>

                    {/* Category Tabs */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex flex-wrap gap-3 mb-10"
                    >
                        {faqCategories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => { setActiveCategory(cat.id); setOpenIndex(null); }}
                                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                                    activeCategory === cat.id
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </motion.div>

                    {/* Accordion */}
                    <div className="space-y-3">
                        {filteredFAQs.map((faq, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.03 }}
                                className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                            >
                                <button
                                    onClick={() => toggleAccordion(index)}
                                    className="w-full flex items-center justify-between px-6 py-5 text-left bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3 pr-4">
                                        <span className="inline-block px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full capitalize shrink-0">
                                            {faq.category === 'panditji' ? 'Panditji AI' : faq.category}
                                        </span>
                                        <span className="text-slate-900 dark:text-white font-medium">
                                            {faq.question}
                                        </span>
                                    </div>
                                    <motion.div
                                        animate={{ rotate: openIndex === index ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="shrink-0"
                                    >
                                        <ChevronDown className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                                    </motion.div>
                                </button>

                                <AnimatePresence>
                                    {openIndex === index && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <div className="px-6 pb-5 pt-0 bg-white dark:bg-slate-900">
                                                <p className="text-slate-600 dark:text-slate-300 leading-relaxed pl-0 md:pl-[calc(theme(spacing.3)+theme(spacing.2.5)*2+theme(fontSize.xs[1].lineHeight))]">
                                                    {faq.answer}
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>

                    {filteredFAQs.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-16"
                        >
                            <p className="text-slate-500 dark:text-slate-400 text-lg">No questions found. Try a different search term or category.</p>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-slate-50 dark:bg-slate-800/50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                            Still Have Questions?
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
                            Can&apos;t find what you&apos;re looking for? Chat with Panditji on WhatsApp or reach out to our team. We&apos;re here to help 24/7.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <a
                                href={`${COMPANY_WHATSAPP_URL}?text=Hi%20Panditji%2C%20I%20have%20a%20question`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-green-600/20"
                            >
                                <MessageCircle className="w-5 h-5" />
                                Ask Panditji
                            </a>
                            <Link
                                href="/contact"
                                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
                            >
                                Contact Us
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
