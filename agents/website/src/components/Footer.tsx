'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Building2, Phone, Mail, MapPin, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';
import { COMPANY_PHONE_DISPLAY } from '@/lib/constants';

const companyLinks = [
    { label: 'About Us', href: '/about' },
    { label: 'Services', href: '/services' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Careers', href: '/contact' },
];

const propertyLinks = [
    { label: 'Buy Property', href: '/properties?intent=buy' },
    { label: 'Rent Property', href: '/properties?intent=rent' },
    { label: 'Commercial', href: '/properties?category=commercial' },
    { label: 'Plots & Land', href: '/properties?type=plot' },
    { label: 'All Properties', href: '/properties' },
];

const serviceLinks = [
    { label: 'Property Management', href: '/services' },
    { label: 'Legal Assistance', href: '/services' },
    { label: 'Home Loans', href: '/services' },
    { label: 'EMI Calculator', href: '/tools/emi-calculator' },
    { label: 'Area Converter', href: '/tools/area-converter' },
];

const socialLinks = [
    { icon: Facebook, href: 'https://www.facebook.com/airealtypandit', label: 'Facebook' },
    { icon: Instagram, href: 'https://www.instagram.com/airealtypandit', label: 'Instagram' },
    { icon: Youtube, href: 'https://www.youtube.com/channel/UCQa1_h4333_Ke9RIKSx_Gow', label: 'YouTube' },
];

export default function Footer() {
    const pathname = usePathname();
    const isAgentPortal = pathname?.startsWith('/agent');

    if (isAgentPortal) return null;

    return (
        <footer className="bg-slate-900 dark:bg-slate-950 text-white">
            {/* Newsletter Section */}
            <div className="border-b border-slate-800 dark:border-slate-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h3 className="text-xl font-bold mb-1">Stay Updated with Realty Pandit</h3>
                            <p className="text-slate-400 text-sm">Get the latest property listings and market insights in your inbox.</p>
                        </div>
                        <div className="flex w-full md:w-auto gap-2">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                aria-label="Email address for newsletter"
                                className="flex-1 md:w-72 px-4 py-3 bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                            />
                            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
                                Subscribe
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Footer */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
                    {/* Brand */}
                    <div className="lg:col-span-2">
                        <div className="mb-4">
                            <Image
                                src="/logo.png"
                                alt="Realty Pandit"
                                width={180}
                                height={60}
                                className="h-10 w-auto"
                            />
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm">
                            AI-powered real estate platform. Buy, sell, or rent properties with Panditji — your personal property assistant available 24/7 on WhatsApp.
                        </p>
                        <div className="space-y-3 text-sm text-slate-400">
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-blue-400" /> {COMPANY_PHONE_DISPLAY}
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-blue-400" /> info@realtypandit.com
                            </div>
                            <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 mt-0.5 text-blue-400" /> India
                            </div>
                        </div>

                        {/* Social */}
                        <div className="flex gap-3 mt-6">
                            {socialLinks.map(social => (
                                <a
                                    key={social.label}
                                    href={social.href}
                                    aria-label={social.label}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] bg-slate-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors"
                                >
                                    <social.icon className="w-5 h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Company */}
                    <div>
                        <h4 className="font-semibold mb-4 text-white">Company</h4>
                        <div className="space-y-2.5">
                            {companyLinks.map(link => (
                                <Link key={link.label} href={link.href} className="block text-slate-300 hover:text-white dark:text-slate-400 dark:hover:text-white text-sm transition-colors">
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Properties */}
                    <div>
                        <h4 className="font-semibold mb-4 text-white">Properties</h4>
                        <div className="space-y-2.5">
                            {propertyLinks.map(link => (
                                <Link key={link.label} href={link.href} className="block text-slate-300 hover:text-white dark:text-slate-400 dark:hover:text-white text-sm transition-colors">
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Services & Tools */}
                    <div>
                        <h4 className="font-semibold mb-4 text-white">Services & Tools</h4>
                        <div className="space-y-2.5">
                            {serviceLinks.map(link => (
                                <Link key={link.label} href={link.href} className="block text-slate-300 hover:text-white dark:text-slate-400 dark:hover:text-white text-sm transition-colors">
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Popular Searches - SEO Links */}
            <div className="border-t border-slate-800 dark:border-slate-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <h4 className="font-semibold text-white mb-6">Popular Searches</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {/* Flats for Sale */}
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Flats for Sale</h5>
                            <div className="space-y-1.5">
                                {['Noida', 'Gurgaon', 'Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'].map(city => (
                                    <Link key={city} href={`/properties/in/${city.toLowerCase()}?intent=buy&type=flat`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Flats for Sale in {city}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        {/* Flats for Rent */}
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Flats for Rent</h5>
                            <div className="space-y-1.5">
                                {['Noida', 'Gurgaon', 'Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'].map(city => (
                                    <Link key={city} href={`/properties/in/${city.toLowerCase()}?intent=rent&type=flat`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Flats for Rent in {city}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        {/* Houses for Sale */}
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Houses for Sale</h5>
                            <div className="space-y-1.5">
                                {['Noida', 'Gurgaon', 'Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'].map(city => (
                                    <Link key={city} href={`/properties/in/${city.toLowerCase()}?intent=buy&type=house`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Houses for Sale in {city}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        {/* Properties by City */}
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Properties by City</h5>
                            <div className="space-y-1.5">
                                {['Noida', 'Gurgaon', 'Delhi', 'Mumbai', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'].map(city => (
                                    <Link key={city} href={`/properties/in/${city.toLowerCase()}`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Properties in {city}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Additional locality links */}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Popular in Noida</h5>
                            <div className="space-y-1.5">
                                {['Sector 150', 'Sector 137', 'Sector 62', 'Sector 75', 'Greater Noida West'].map(loc => (
                                    <Link key={loc} href={`/properties/in/noida/${loc.toLowerCase().replace(/\s+/g, '-')}`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Properties in {loc}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Popular in Gurgaon</h5>
                            <div className="space-y-1.5">
                                {['DLF Phase 1', 'DLF Phase 3', 'Sohna Road', 'Golf Course Road', 'Sector 49'].map(loc => (
                                    <Link key={loc} href={`/properties/in/gurgaon/${loc.toLowerCase().replace(/\s+/g, '-')}`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Properties in {loc}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Popular in Mumbai</h5>
                            <div className="space-y-1.5">
                                {['Andheri', 'Powai', 'Bandra', 'Thane', 'Navi Mumbai'].map(loc => (
                                    <Link key={loc} href={`/properties/in/mumbai/${loc.toLowerCase().replace(/\s+/g, '-')}`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Properties in {loc}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h5 className="text-sm font-medium text-slate-300 mb-3">Popular in Bangalore</h5>
                            <div className="space-y-1.5">
                                {['Whitefield', 'Indiranagar', 'Koramangala', 'HSR Layout', 'Electronic City'].map(loc => (
                                    <Link key={loc} href={`/properties/in/bangalore/${loc.toLowerCase().replace(/\s+/g, '-')}`} className="block text-xs text-slate-500 hover:text-blue-400 transition-colors">
                                        Properties in {loc}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-slate-500 text-sm">
                        &copy; {new Date().getFullYear()} Realty Pandit. All rights reserved.
                    </p>
                    <div className="flex gap-6 text-sm text-slate-500">
                        <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
