'use client';

import { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';
import type { Property } from '@/lib/api';
import { formatPrice, getMediaUrl } from '@/lib/api';

const STORAGE_KEY = 'rp_compare_list';
const MAX_COMPARE = 3;

export interface CompareItem {
    id: string;
    type: string;
    location: string | null;
    price: number | null;
    price_unit: string | null;
    image: string | null;
    specs: any;
    slug?: string | null;
}

export function getCompareList(): CompareItem[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

export function setCompareList(list: CompareItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('compare-list-changed'));
}

export function propertyToCompareItem(p: Property): CompareItem {
    return {
        id: p.id,
        type: p.type,
        location: p.location,
        price: p.price,
        price_unit: p.price_unit,
        image: p.media_urls?.[0] || null,
        specs: p.specs,
        slug: p.slug,
    };
}

interface CompareButtonProps {
    property: Property;
    size?: 'sm' | 'md';
    className?: string;
}

export default function CompareButton({ property, size = 'sm', className = '' }: CompareButtonProps) {
    const [inList, setInList] = useState(false);

    useEffect(() => {
        const check = () => setInList(getCompareList().some(c => c.id === property.id));
        check();
        window.addEventListener('compare-list-changed', check);
        window.addEventListener('storage', check);
        return () => {
            window.removeEventListener('compare-list-changed', check);
            window.removeEventListener('storage', check);
        };
    }, [property.id]);

    const toggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const list = getCompareList();

        if (inList) {
            setCompareList(list.filter(c => c.id !== property.id));
        } else {
            if (list.length >= MAX_COMPARE) {
                alert(`You can compare up to ${MAX_COMPARE} properties at a time. Remove one first.`);
                return;
            }
            setCompareList([...list, propertyToCompareItem(property)]);
        }
    };

    const sizeClasses = size === 'sm'
        ? 'w-8 h-8'
        : 'w-10 h-10';
    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

    return (
        <button
            onClick={toggle}
            title={inList ? 'Remove from compare' : 'Add to compare'}
            aria-label={inList ? 'Remove from compare' : 'Add to compare'}
            className={`${sizeClasses} rounded-lg flex items-center justify-center transition-all ${
                inList
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 shadow-md'
            } ${className}`}
        >
            <Layers className={iconSize} />
        </button>
    );
}
