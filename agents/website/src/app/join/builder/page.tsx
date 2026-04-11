'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Mail, Phone, MapPin, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import api from '@/lib/api';

export default function BuilderRegisterPage() {
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        companyName: '',
        city: '',
        planType: 'PREMIUM' // Builders default to PREMIUM
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const premiumFeatures = [
        'Unlimited project listings',
        'Unit-wise inventory management',
        'Direct buyer appointments & leads',
        'Premium placement on homepage',
        'Advanced analytics & conversion tracking',
        'RERA verification badge',
        'Virtual site tour integration',
        'Dedicated account manager'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Validation
            if (!formData.name || !formData.phone || !formData.companyName) {
                throw new Error('Name, phone, and company name are required');
            }

            // Call backend API
            const response = await api.post('/builder/register', {
                name: formData.name,
                phone: formData.phone,
                email: formData.email || undefined,
                companyName: formData.companyName,
                planType: formData.planType
            });

            const data = response.data;

            setSuccess(true);

            // Redirect to builder dashboard after 2 seconds
            setTimeout(() => {
                router.push('/builder/dashboard');
            }, 2000);

        } catch (err: any) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-md text-center"
                >
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Registration Successful!
                    </h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                        Welcome to Realty Pandit Builder Platform. Redirecting to your dashboard...
                    </p>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <div className="flex items-center justify-center mb-4">
                        <Building2 className="w-12 h-12 text-orange-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Register as Real Estate Builder
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        Showcase your projects to thousands of verified buyers
                    </p>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Form - Left 2 columns */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8"
                    >
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Error Message */}
                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
                                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                                    <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                                </div>
                            )}

                            {/* Company Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Building2 className="w-4 h-4 inline mr-1" />
                                    Company / Builder Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    placeholder="Godrej Properties, DLF Limited, etc."
                                />
                            </div>

                            {/* Contact Person Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Contact Person Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    placeholder="Amit Kumar"
                                />
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Phone */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        <Phone className="w-4 h-4 inline mr-1" />
                                        Phone Number *
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        placeholder="+91 8178491914"
                                    />
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        <Mail className="w-4 h-4 inline mr-1" />
                                        Email (Optional)
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        placeholder="contact@company.com"
                                    />
                                </div>
                            </div>

                            {/* City */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <MapPin className="w-4 h-4 inline mr-1" />
                                    Primary Operating City (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    placeholder="Noida, Gurgaon, Mumbai, etc."
                                />
                            </div>

                            {/* Info Box */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="flex items-start">
                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-blue-800 dark:text-blue-200">
                                        <p className="font-semibold mb-1">After Registration:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Access your builder dashboard to add projects</li>
                                            <li>Upload project details, unit configurations, and media</li>
                                            <li>Receive verified buyer leads and appointment requests</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Registering...' : 'Complete Registration'}
                            </button>

                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                By registering, you agree to our Terms of Service and Privacy Policy
                            </p>
                        </form>
                    </motion.div>

                    {/* Premium Plan Info - Right column */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="lg:col-span-1"
                    >
                        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-lg p-6 text-white sticky top-8">
                            <div className="text-center mb-6">
                                <h3 className="text-2xl font-bold mb-2">PREMIUM Plan</h3>
                                <div className="text-4xl font-bold mb-1">₹9,999</div>
                                <div className="text-white/80 text-sm">per month</div>
                            </div>

                            <div className="space-y-3 mb-6">
                                {premiumFeatures.map((feature, i) => (
                                    <div key={i} className="flex items-start">
                                        <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                                        <span className="text-sm">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-sm">
                                <p className="font-semibold mb-2">🎯 Perfect for:</p>
                                <ul className="space-y-1 text-white/90">
                                    <li>• Residential developers</li>
                                    <li>• Commercial project builders</li>
                                    <li>• Mixed-use developments</li>
                                    <li>• Luxury villa communities</li>
                                </ul>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
