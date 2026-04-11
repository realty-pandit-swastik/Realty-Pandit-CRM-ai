'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export default function BuilderSubscription() {
    const [currentPlan, setCurrentPlan] = useState<string>('FREE');

    useEffect(() => {
        const info = localStorage.getItem('builder_info');
        if (info) {
            try {
                const parsed = JSON.parse(info);
                setCurrentPlan(parsed.planType || 'FREE');
            } catch {}
        }
    }, []);

    const plans = [
        {
            name: 'Free',
            key: 'FREE',
            price: '₹0',
            description: 'Get started with basic listings.',
            features: ['10 Unit Listings', 'Basic Project Page', 'Lead Notifications', 'WhatsApp Support'],
        },
        {
            name: 'Basic',
            key: 'BASIC',
            price: '₹2,999',
            description: 'For growing builders.',
            features: ['50 Unit Listings', 'Full Buyer Contacts', 'Lead Notifications', 'Priority Support', 'Basic Analytics'],
        },
        {
            name: 'Pro',
            key: 'PRO',
            price: '₹9,999',
            description: 'For established builders.',
            features: ['200 Unit Listings', 'Full Buyer Contacts', 'Advanced Analytics', 'Priority Search Placement', 'Dedicated Account Manager'],
            recommended: true,
        },
        {
            name: 'Premium',
            key: 'PREMIUM',
            price: '₹19,999',
            description: 'For large-scale developers.',
            features: ['Unlimited Listings', 'Full Buyer Contacts', 'Homepage Placement', 'Advanced Analytics', 'RERA Verification Badge', 'Virtual Tour Integration', 'Dedicated Account Manager'],
        },
    ];

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h2 className="text-3xl font-extrabold text-gray-900">Builder Plans</h2>
                <p className="mt-4 text-xl text-gray-500">Choose the right plan to grow your real estate business.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
                {plans.map((plan) => {
                    const isCurrent = currentPlan === plan.key;
                    return (
                        <div key={plan.key} className={`border rounded-lg shadow-sm divide-y divide-gray-200 bg-white ${isCurrent ? 'ring-2 ring-emerald-500' : ''} ${plan.recommended ? 'relative' : ''}`}>
                            {plan.recommended && (
                                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                    <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">Recommended</span>
                                </div>
                            )}
                            <div className="p-6">
                                <h2 className="text-lg font-medium text-gray-900">{plan.name}</h2>
                                {isCurrent && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2">
                                        Current Plan
                                    </span>
                                )}
                                <p className="mt-4 text-sm text-gray-500">{plan.description}</p>
                                <p className="mt-8">
                                    <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                                    {plan.price !== '₹0' && <span className="text-base font-medium text-gray-500">/mo</span>}
                                </p>
                                <button
                                    type="button"
                                    className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium ${
                                        isCurrent
                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                    disabled={isCurrent}
                                >
                                    {isCurrent ? 'Active' : `Upgrade to ${plan.name}`}
                                </button>
                            </div>
                            <div className="pt-6 pb-8 px-6">
                                <h3 className="text-xs font-medium text-gray-900 tracking-wide uppercase">What&apos;s included</h3>
                                <ul className="mt-6 space-y-4">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start">
                                            <Check className="flex-shrink-0 h-5 w-5 text-green-500" />
                                            <p className="ml-3 text-sm text-gray-500">{feature}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
