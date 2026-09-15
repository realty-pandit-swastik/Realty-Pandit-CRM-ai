/**
 * Per-SIM line state.
 *
 * Two rules learned from measuring the real handset on 2026-08-06:
 *
 *  1. `mCallState` is reported PER SUBSCRIPTION. Inbound and outbound live on
 *     different SIMs, so a single global "busy" flag would collide the two roles.
 *     Everything here is keyed by subId.
 *
 *  2. HANGUP IS NOT INSTANT. KEYCODE_ENDCALL returned while the call was still
 *     OFFHOOK; IDLE only arrived seconds later. A line is therefore free ONLY
 *     once the phone has REPORTED idle. Releasing on optimism means dialling
 *     over a live call.
 */

import { CALL_STATE, type CallState, type LineInfo, type LineRole } from './protocol.ts';

export type LineStatus =
    /** Reported idle by the phone. The only state from which we may dial. */
    | 'idle'
    /** We sent a dial/answer and are waiting for the phone to confirm a transition. */
    | 'pending'
    /** Phone reported RINGING or OFFHOOK. */
    | 'busy'
    /** SIM absent / out of service / phone offline. */
    | 'unavailable';

export interface Line {
    subId: number;
    role: LineRole;
    status: LineStatus;
    callState: CallState;
    currentCallId: string | null;
    number: string | null;
    /** When we moved to `pending`; used to time out a dial that never transitions. */
    pendingSince: number | null;
    updatedAt: number;
}

/** A dial that never produces a state transition must not strand the line forever. */
export const PENDING_TIMEOUT_MS = 45_000;

export class LineManager {
    private lines = new Map<number, Line>();

    /** (Re)register lines from a `hello`. Called on every reconnect. */
    sync(infos: LineInfo[], now = Date.now()): void {
        const seen = new Set<number>();
        for (const info of infos) {
            seen.add(info.subId);
            const existing = this.lines.get(info.subId);
            if (existing) {
                existing.role = info.role;
                // Never resurrect a busy line from a hello — wait for a real report.
                if (!info.inService) existing.status = 'unavailable';
                else if (existing.status === 'unavailable') existing.status = 'idle';
                existing.updatedAt = now;
                continue;
            }
            this.lines.set(info.subId, {
                subId: info.subId,
                role: info.role,
                status: info.inService ? 'idle' : 'unavailable',
                callState: CALL_STATE.IDLE,
                currentCallId: null,
                number: null,
                pendingSince: null,
                updatedAt: now,
            });
        }
        // A line the phone stopped reporting is gone (SIM pulled).
        for (const subId of [...this.lines.keys()]) {
            if (!seen.has(subId)) this.lines.delete(subId);
        }
    }

    /** Phone went away: nothing is dialable, but we keep roles for the reconnect. */
    markAllUnavailable(now = Date.now()): void {
        for (const line of this.lines.values()) {
            line.status = 'unavailable';
            line.currentCallId = null;
            line.pendingSince = null;
            line.updatedAt = now;
        }
    }

    get(subId: number): Line | undefined {
        return this.lines.get(subId);
    }

    all(): Line[] {
        return [...this.lines.values()];
    }

    /**
     * Pick a line for a new call. Returns undefined when none is CONFIRMED idle —
     * callers must queue rather than dial anyway.
     */
    acquire(role: LineRole, callId: string, now = Date.now()): Line | undefined {
        this.expirePending(now);
        const line = [...this.lines.values()].find(
            (l) => l.role === role && l.status === 'idle',
        );
        if (!line) return undefined;
        line.status = 'pending';
        line.currentCallId = callId;
        line.pendingSince = now;
        line.updatedAt = now;
        return line;
    }

    /** Undo an acquire when the phone rejects the command outright. */
    release(subId: number, now = Date.now()): void {
        const line = this.lines.get(subId);
        if (!line) return;
        line.status = 'idle';
        line.currentCallId = null;
        line.pendingSince = null;
        line.updatedAt = now;
    }

    /**
     * Apply a reported transition. This is the ONLY path that may mark a line
     * idle — see rule 2 at the top of the file.
     */
    applyReportedState(
        subId: number,
        state: CallState,
        callId: string | null,
        number: string | null,
        now = Date.now(),
    ): Line | undefined {
        let line = this.lines.get(subId);
        if (!line) {
            // Inbound on a line we haven't seen yet (hello raced the call).
            line = {
                subId,
                role: 'inbound',
                status: 'idle',
                callState: CALL_STATE.IDLE,
                currentCallId: null,
                number: null,
                pendingSince: null,
                updatedAt: now,
            };
            this.lines.set(subId, line);
        }

        line.callState = state;
        line.updatedAt = now;

        if (state === CALL_STATE.IDLE) {
            line.status = 'idle';
            line.currentCallId = null;
            line.number = null;
            line.pendingSince = null;
        } else {
            line.status = 'busy';
            line.pendingSince = null;
            if (callId) line.currentCallId = callId;
            if (number) line.number = number;
        }
        return line;
    }

    /** A dial that never transitioned — free the line so the role isn't wedged. */
    expirePending(now = Date.now()): Line[] {
        const expired: Line[] = [];
        for (const line of this.lines.values()) {
            if (
                line.status === 'pending' &&
                line.pendingSince !== null &&
                now - line.pendingSince > PENDING_TIMEOUT_MS
            ) {
                line.status = 'idle';
                line.currentCallId = null;
                line.pendingSince = null;
                line.updatedAt = now;
                expired.push(line);
            }
        }
        return expired;
    }
}
