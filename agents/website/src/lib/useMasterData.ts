'use client';

import { useState, useEffect, useRef } from 'react';
import api from './api';

export interface PropertyCategory {
    id: string;
    name: string;
    slug: string;
    sub_categories: PropertySubCategory[];
}

export interface PropertySubCategory {
    id: string;
    category_id: string;
    name: string;
    slug: string;
    property_types: PropertyType[];
}

export interface PropertyType {
    id: string;
    sub_category_id: string;
    name: string;
    slug: string;
}

export interface PropertyConfiguration {
    id: string;
    name: string;
    slug: string;
}

export interface UsageType {
    id: string;
    name: string;
    slug: string;
}

export interface InvestmentType {
    id: string;
    name: string;
    slug: string;
}

export const useMasterData = () => {
    const [categories, setCategories] = useState<PropertyCategory[]>([]);
    const [configurations, setConfigurations] = useState<PropertyConfiguration[]>([]);
    const [usageTypes, setUsageTypes] = useState<UsageType[]>([]);
    const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const fetchMasterData = async () => {
            try {
                // Single API call to get the full classification tree
                const { data } = await api.get('/public/master/tree');
                setCategories(data.categories || []);
                setConfigurations(data.configurations || []);
                setUsageTypes(data.usage_types || []);
                setInvestmentTypes(data.investment_types || []);
            } catch (err) {
                console.error('Failed to load master data:', err);
                setError('Failed to load property classifications');
            } finally {
                setLoading(false);
            }
        };

        fetchMasterData();
    }, []);

    return { categories, configurations, usageTypes, investmentTypes, loading, error };
};
