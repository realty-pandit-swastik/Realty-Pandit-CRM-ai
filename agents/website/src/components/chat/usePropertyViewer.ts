'use client';

import { useState, useCallback } from 'react';
import { Property } from '@/lib/api';
import { PropertyMatchData } from './PropertyMatchCard';
import { NormalizedProperty, normalizeFromAI, normalizeFromBuyer } from './normalizeProperty';

interface PropertyViewerState {
    isOpen: boolean;
    properties: NormalizedProperty[];
    currentIndex: number;
    source: 'ai' | 'buyer';
}

export function usePropertyViewer() {
    const [state, setState] = useState<PropertyViewerState>({
        isOpen: false,
        properties: [],
        currentIndex: 0,
        source: 'ai',
    });

    const setAIProperties = useCallback((properties: Property[]) => {
        if (!properties || properties.length === 0) return;
        setState({
            isOpen: true,
            properties: properties.map(normalizeFromAI),
            currentIndex: 0,
            source: 'ai',
        });
    }, []);

    const setBuyerProperty = useCallback((property: PropertyMatchData, matchIndex: number, totalAvailable: number) => {
        const normalized = normalizeFromBuyer(property, matchIndex, totalAvailable);
        setState((prev) => ({
            isOpen: true,
            properties: [normalized],
            currentIndex: 0,
            source: 'buyer',
        }));
    }, []);

    const goNext = useCallback(() => {
        setState((prev) => {
            if (prev.source !== 'ai') return prev;
            const next = Math.min(prev.currentIndex + 1, prev.properties.length - 1);
            return { ...prev, currentIndex: next };
        });
    }, []);

    const goPrevious = useCallback(() => {
        setState((prev) => {
            if (prev.source !== 'ai') return prev;
            const next = Math.max(prev.currentIndex - 1, 0);
            return { ...prev, currentIndex: next };
        });
    }, []);

    const closeViewer = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: false }));
    }, []);

    const getCurrentProperty = useCallback((): NormalizedProperty | null => {
        if (state.properties.length === 0) return null;
        return state.properties[state.currentIndex] || null;
    }, [state.properties, state.currentIndex]);

    return {
        isOpen: state.isOpen,
        properties: state.properties,
        currentIndex: state.currentIndex,
        source: state.source,
        currentProperty: getCurrentProperty(),
        totalCount: state.source === 'buyer'
            ? (state.properties[0]?.totalAvailable || 0)
            : state.properties.length,
        displayIndex: state.source === 'buyer'
            ? (state.properties[0]?.matchIndex || 0)
            : state.currentIndex,
        setAIProperties,
        setBuyerProperty,
        goNext,
        goPrevious,
        closeViewer,
    };
}
