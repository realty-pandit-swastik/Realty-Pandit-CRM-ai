'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatType } from '@/lib/propertyUtils';

interface SmartBreadcrumbProps {
    propertyType: string;
    location: string;
}

const SESSION_KEY = 'rp_last_search_filters';

/** Save current search filters from the properties listing page */
export function saveSearchFilters(queryString: string) {
    if (typeof window !== 'undefined' && queryString) {
        sessionStorage.setItem(SESSION_KEY, queryString);
    }
}

export default function SmartBreadcrumb({ propertyType, location }: SmartBreadcrumbProps) {
    const [propertiesHref, setPropertiesHref] = useState('/properties');

    useEffect(() => {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved) {
            setPropertiesHref(`/properties?${saved}`);
        }
    }, []);

    return (
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6 overflow-x-auto">
            <Link href="/" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap">Home</Link>
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
            <Link href={propertiesHref} className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap">Properties</Link>
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
            <span className="text-slate-900 dark:text-slate-100 font-medium truncate">
                {formatType(propertyType)} in {location}
            </span>
        </nav>
    );
}
