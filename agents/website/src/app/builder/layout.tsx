'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, FolderKanban, Users, Calendar, CreditCard, LogOut, Menu, X } from 'lucide-react';
import api from '@/lib/api';

export default function BuilderLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    useEffect(() => {
        const isLoginPage = pathname === '/builder/login';
        api.get('/builder/me').then(() => {
            if (isLoginPage) router.push('/builder/dashboard');
        }).catch(() => {
            if (!isLoginPage) router.push('/builder/login');
        });
    }, [pathname, router]);

    if (pathname === '/builder/login') {
        return <>{children}</>;
    }

    const navItems = [
        { name: 'Dashboard', href: '/builder/dashboard', icon: LayoutDashboard },
        { name: 'My Projects', href: '/builder/projects', icon: FolderKanban },
        { name: 'Leads', href: '/builder/leads', icon: Users },
        { name: 'Appointments', href: '/builder/appointments', icon: Calendar },
        { name: 'Subscription', href: '/builder/subscription', icon: CreditCard },
    ];

    const handleLogout = async () => {
        localStorage.removeItem('builder_info');
        try {
            await api.post('/auth/logout');
        } catch {}
        router.push('/builder/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <div className={`fixed inset-0 bg-gray-600 bg-opacity-75 z-20 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)}></div>

            <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between h-16 px-6 border-b">
                    <span className="text-xl font-bold text-emerald-600">Builder Portal</span>
                    <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
                        <X className="h-6 w-6 text-gray-500" />
                    </button>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors ${isActive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                            >
                                <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
                <div className="absolute bottom-0 w-full border-t p-4">
                    <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                        <LogOut className="mr-3 h-5 w-5" />
                        Sign Out
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm lg:hidden">
                    <div className="flex items-center justify-between h-16 px-4">
                        <button onClick={() => setIsSidebarOpen(true)} className="text-gray-500 focus:outline-none">
                            <Menu className="h-6 w-6" />
                        </button>
                        <span className="text-lg font-semibold text-gray-900">Builder Portal</span>
                        <div className="w-6"></div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
