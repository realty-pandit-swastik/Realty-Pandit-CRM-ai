'use client';

import { useEffect, useState } from 'react';
import { Phone, Mail, UserCheck } from 'lucide-react';
import api from '@/lib/api';

interface Coordinator {
    name: string;
    phone: string | null;
    email: string | null;
}

/**
 * ManagerContactBanner — sticky info strip rendered above every authenticated /agent/* page.
 *
 * Middleman model (2026-04-17): the partner agent only ever contacts the platform through their
 * assigned manager ("coordinator"). This banner makes the manager always-reachable so the partner
 * never needs to look up client/owner contacts — those are stripped everywhere else anyway.
 *
 * Data source: GET /agent/coordinator (returns the partner's managing_agent).
 * Fails silently — if there's no coordinator assigned yet (e.g., brand-new self-signup before
 * super_boss reviews), the banner renders nothing.
 */
export function ManagerContactBanner() {
    const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get('/agent/coordinator')
            .then((res) => {
                if (!cancelled) setCoordinator(res.data?.coordinator ?? null);
            })
            .catch(() => {
                // 401 will redirect via axios interceptor; other errors → just hide the banner.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading || !coordinator) return null;

    return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-amber-900 font-medium">
                <UserCheck className="h-4 w-4 text-amber-700" />
                Your manager:
                <span className="font-semibold text-amber-950">{coordinator.name}</span>
            </div>
            {coordinator.phone && (
                <a
                    href={`tel:${coordinator.phone}`}
                    className="inline-flex items-center gap-1 text-amber-900 hover:text-amber-700 hover:underline"
                >
                    <Phone className="h-3.5 w-3.5" />
                    {coordinator.phone}
                </a>
            )}
            {coordinator.email && (
                <a
                    href={`mailto:${coordinator.email}`}
                    className="inline-flex items-center gap-1 text-amber-900 hover:text-amber-700 hover:underline"
                >
                    <Mail className="h-3.5 w-3.5" />
                    {coordinator.email}
                </a>
            )}
            <span className="text-amber-700/80 text-xs ml-auto hidden sm:inline">
                All owner &amp; client coordination happens through your manager.
            </span>
        </div>
    );
}
