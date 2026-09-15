/**
 * Meta WhatsApp Cloud API error classification.
 *
 * WHY THIS EXISTS (2026-08-07): `sendWithRetry` treated every 4xx identically —
 * log once, throw, never retry. No code in the entire backend branched on Meta's
 * actual error code. That hid a 40% outbound failure rate: 131049 ("healthy
 * ecosystem engagement" throttling) peaked at 369/day on 2026-08-04, which is the
 * same signal pattern that preceded the July 2026 WABA lock for "Sending spam".
 *
 * ⚠ THE CIRCUIT-BREAKER TRAP — `countsAsCircuitFailure` is the important field.
 * `whatsappCircuit` opens after 3 consecutive failures (utils/circuit_breaker.ts).
 * A 131049 spike would trip it within seconds and silently kill ALL WhatsApp
 * output — including customer-initiated replies, which are perfectly legal and
 * were never the problem. Business rejections (Meta refusing THIS message to THIS
 * recipient) must never count toward a transport-health breaker; only genuine
 * transport faults (5xx, network, timeout) may.
 *
 * Codes: developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
 */

export interface MetaErrorInfo {
    /** Meta's numeric error code (e.g. 131049), or null when not a Meta API error. */
    code: number | null;
    subcode: number | null;
    title: string;
    message: string;
    httpStatus: number | null;
    /** Retry the same payload? Only for genuine throughput/transient faults. */
    retryable: boolean;
    /** Count toward whatsappCircuit's failure threshold? False for business rejections. */
    countsAsCircuitFailure: boolean;
    /** Stop sending PROACTIVE messages to this recipient for N seconds. 0 = no suppression. */
    suppressRecipientSec: number;
    /** Page a human — account-level problems, not per-message ones. */
    alertCritical: boolean;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Extract Meta's error object from an axios error, tolerating every shape it arrives in. */
function extractMetaError(err: any): { code: number | null; subcode: number | null; title: string; message: string } {
    const data = err?.response?.data;
    const e = data?.error ?? data ?? {};
    const code = typeof e.code === 'number' ? e.code : null;
    const subcode = typeof e.error_subcode === 'number' ? e.error_subcode : null;
    const title = e.error_data?.details || e.error_user_title || e.type || '';
    const message = e.message || err?.message || 'unknown WhatsApp error';
    return { code, subcode, title, message };
}

export function classifyMetaError(err: unknown): MetaErrorInfo {
    const anyErr = err as any;
    const httpStatus: number | null = anyErr?.response?.status ?? null;
    const { code, subcode, title, message } = extractMetaError(anyErr);

    const base: MetaErrorInfo = {
        code, subcode, title, message, httpStatus,
        retryable: false,
        countsAsCircuitFailure: false,
        suppressRecipientSec: 0,
        alertCritical: false,
    };

    switch (code) {
        // Per-recipient marketing throttle. Meta is protecting the user, not signalling
        // that our transport is broken. Back off from THIS recipient for a day.
        case 131049:
        case 131048:
            return { ...base, suppressRecipientSec: DAY };

        // Outside the 24h window — a template was required and we sent free-form.
        // Not a throttle; the caller should switch to a template (SessionTracker.smartSend).
        case 131047:
            return { ...base };

        // Not a WhatsApp user / permanently undeliverable. Long suppression.
        case 131026:
            return { ...base, suppressRecipientSec: 30 * DAY };

        // Genuine throughput cap — this one IS worth retrying with a long backoff.
        case 130429:
            return { ...base, retryable: true };

        // Account-level restriction. Every send will fail until a human intervenes.
        case 131031:
        case 368:
            return { ...base, alertCritical: true };

        // Expired/invalid token — also human-intervention territory.
        case 190:
        case 102:
            return { ...base, alertCritical: true };
    }

    // No recognised Meta code. Fall back to HTTP semantics.
    if (httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
        // Unknown 4xx: a business rejection we don't model yet. Do not retry, but do
        // NOT let it open the circuit either — an unmodelled rejection is still not a
        // transport fault, and treating it as one is exactly the trap described above.
        return base;
    }
    if (httpStatus === 429) {
        return { ...base, retryable: true };
    }

    // 5xx, network error, timeout — genuine transport fault.
    return { ...base, retryable: true, countsAsCircuitFailure: true };
}

/** Backoff schedule for retryable throughput errors: 2s, 8s, 30s. */
export function throughputBackoffMs(attempt: number): number {
    return [2000, 8000, 30000][Math.min(attempt, 2)];
}

/** Error thrown by sendWithRetry carrying the classification, so callers can persist it. */
export class WhatsAppSendError extends Error {
    public readonly info: MetaErrorInfo;
    constructor(info: MetaErrorInfo, cause?: unknown) {
        super(info.message);
        this.name = 'WhatsAppSendError';
        this.info = info;
        (this as any).cause = cause;
    }
}
