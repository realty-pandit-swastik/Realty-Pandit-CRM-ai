import { useRef, useState } from 'react';
import { sendContactMatches, sendEnquiryMatches } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { toDialablePhone } from '../lib/phone';

export type MatchSendState = 'sending' | 'sent' | 'retry' | 'manual_hi';

export function useSendMatches() {
    const { showToast } = useToast();
    const [states, setStates] = useState<Record<string, MatchSendState>>({});
    const locks = useRef(new Set<string>());
    const requests = useRef(new Map<string, string>());
    const sent = useRef(new Set<string>());
    const send = async (dealId: string | undefined, name: string | null, phone?: string | null) => {
        if (!dealId && !phone) { showToast('A contact is required to send matching.', 'error'); return; }
        const key = dealId || `contact:${phone}`;
        if (locks.current.has(key) || sent.current.has(key)) return;
        locks.current.add(key);
        const requestId = requests.current.get(key) || crypto.randomUUID();
        requests.current.set(key, requestId);
        setStates(prev => ({ ...prev, [key]: 'sending' }));
        try {
            const result = dealId ? await sendEnquiryMatches(dealId, requestId) : await sendContactMatches(phone!, requestId);
            if (result.state === 'no_matches') {
                setStates(prev => ({ ...prev, [key]: 'retry' }));
                showToast('No matching inventory found for this enquiry.', 'info');
                return;
            }
            sent.current.add(key);
            setStates(prev => ({ ...prev, [key]: result.greeting_status === 'manual_required' ? 'manual_hi' : 'sent' }));
            showToast(`Matching sent to ${name || 'lead'}`, 'success');
            if (result.greeting_status === 'manual_required') {
                const tel = toDialablePhone(phone);
                if (tel) window.open(`https://wa.me/${tel.slice(1)}?text=Hi`, '_blank', 'noopener,noreferrer');
                showToast('Matches sent. Open “Send Hi” to greet from your own WhatsApp; tap Send there.', 'info', undefined, 6500);
            }
        } catch (error: any) {
            setStates(prev => ({ ...prev, [key]: 'retry' }));
            showToast(`${error?.response?.data?.error || 'Matching could not be sent.'} Tap Retry matches to retry.`, 'error', undefined, 6500);
        } finally { locks.current.delete(key); }
    };
    return { states, send };
}
