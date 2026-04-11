'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { UserCircle, Users, Mail, Phone, Building2, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

export default function AgentRegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const agentType = searchParams.get('type') || 'individual'; // individual or agency

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        companyName: '',
        planType: 'FREE' // FREE, BASIC, PRO
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Pre-select plan based on agent type
        if (agentType === 'agency') {
            setFormData(prev => ({ ...prev, planType: 'PRO' }));
        }
    }, [agentType]);

    const plans = [
        {
            value: 'FREE',
            name: 'FREE',
            price: '₹0/month',
            features: [
                '10 property listings',
                'Lead notifications',
                'Commission on deals (buyer contact hidden)',
                'WhatsApp integration'
            ],
            recommended: agentType === 'individual'
        },
        {
            value: 'BASIC',
            name: 'BASIC',
            price: '₹999/month',
            features: [
                '25 property listings',
                'Full buyer contact details',
                'Lead notifications',
                'WhatsApp integration'
            ],
            recommended: false
        },
        {
            value: 'PRO',
            name: 'PRO',
            price: '₹2,499/month',
            features: [
                '50 property listings',
                'Full buyer contact details',
                'Advanced analytics & reports',
                'Priority lead matching',
                'Team management (for agencies)'
            ],
            recommended: agentType === 'agency'
        }
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Validation
            if (!formData.name || !formData.phone) {
                throw new Error('Name and phone are required');
            }

            if (agentType === 'agency' && !formData.companyName) {
                throw new Error('Company name is required for agencies');
            }

            // Call backend API
            await api.post('/agent/register', {
                name: formData.name,
                phone: formData.phone,
                email: formData.email || undefined,
                companyName: formData.companyName || undefined
            });

            setSuccess(true);

            // Redirect to login after 2 seconds — registration doesn't issue a token
            setTimeout(() => {
                router.push('/agent/login');
            }, 2000);

        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Registration failed. Please try again.');
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
                        Welcome to Realty Pandit. Redirecting to login — use your phone number to sign in via WhatsApp OTP.
                    </p>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    <div className="flex items-center justify-center mb-4">
                        {agentType === 'agency' ? (
                            <Users className="w-12 h-12 text-purple-600" />
                        ) : (
                            <UserCircle className="w-12 h-12 text-blue-600" />
                        )}
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {agentType === 'agency' ? 'Register Your Agency' : 'Register as Individual Agent'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        Join thousands of agents growing their business with Realty Pandit
                    </p>
                </motion.div>

                {/* Form */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8"
                >
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {agentType === 'agency' ? 'Your Name' : 'Full Name'} *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder={agentType === 'agency' ? 'Rahul Sharma' : 'Enter your full name'}
                            />
                        </div>

                        {/* Company Name (for agencies) */}
                        {agentType === 'agency' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Building2 className="w-4 h-4 inline mr-1" />
                                    Company Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Sharma Properties Pvt Ltd"
                                />
                            </div>
                        )}

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
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="your.email@example.com"
                            />
                        </div>

                        {/* Plan Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Select Plan
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {plans.map((plan) => (
                                    <div
                                        key={plan.value}
                                        onClick={() => setFormData({ ...formData, planType: plan.value })}
                                        className={`relative cursor-pointer rounded-lg border-2 p-4 ${
                                            formData.planType === plan.value
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        {plan.recommended && (
                                            <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                                                Recommended
                                            </span>
                                        )}
                                        <div className="font-semibold text-gray-900 dark:text-white mb-1">
                                            {plan.name}
                                        </div>
                                        <div className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                                            {plan.price}
                                        </div>
                                        <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                                            {plan.features.slice(0, 3).map((feature, i) => (
                                                <li key={i} className="flex items-start">
                                                    <CheckCircle className="w-3 h-3 text-green-500 mr-1 flex-shrink-0 mt-0.5" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Registering...' : 'Complete Registration'}
                        </button>

                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            By registering, you agree to our Terms of Service and Privacy Policy
                        </p>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
