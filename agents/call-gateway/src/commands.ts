/**
 * Reliable, exactly-once-effect delivery of server->phone commands.
 *
 * The socket can drop mid-send, so commands are retried. Retrying a `dial` is
 * only safe because the phone dedupes by commandId — the two halves are a pair
 * and neither works alone. If you change one, change the other.
 */

import type { Command } from './protocol.ts';

export const ACK_TIMEOUT_MS = 5_000;
export const MAX_ATTEMPTS = 3;

export interface PendingCommand {
    command: Command;
    attempts: number;
    firstSentAt: number;
    lastSentAt: number;
    resolve: (accepted: boolean, reason?: string) => void;
}

export class CommandTracker {
    private pending = new Map<string, PendingCommand>();
    private counter = 0;

    /** Monotonic + random: survives a server restart without colliding. */
    nextId(prefix: string): string {
        this.counter += 1;
        return `${prefix}_${Date.now().toString(36)}_${this.counter.toString(36)}_${Math.floor(
            Math.random() * 1e6,
        ).toString(36)}`;
    }

    track(
        command: Command,
        resolve: (accepted: boolean, reason?: string) => void,
        now = Date.now(),
    ): void {
        this.pending.set(command.commandId, {
            command,
            attempts: 1,
            firstSentAt: now,
            lastSentAt: now,
            resolve,
        });
    }

    /** Returns true when the ack matched something we were waiting on. */
    ack(commandId: string, accepted: boolean, reason?: string): boolean {
        const entry = this.pending.get(commandId);
        if (!entry) return false; // late ack for something we already gave up on
        this.pending.delete(commandId);
        entry.resolve(accepted, reason);
        return true;
    }

    /**
     * Commands whose ack window has elapsed. Each returned entry has already had
     * its attempt counter incremented — the caller re-sends it.
     * Entries past MAX_ATTEMPTS are dropped and resolved as failed.
     */
    dueForRetry(now = Date.now()): { retry: Command[]; failed: Command[] } {
        const retry: Command[] = [];
        const failed: Command[] = [];
        for (const [id, entry] of [...this.pending.entries()]) {
            if (now - entry.lastSentAt < ACK_TIMEOUT_MS) continue;
            if (entry.attempts >= MAX_ATTEMPTS) {
                this.pending.delete(id);
                entry.resolve(false, `no ack after ${entry.attempts} attempts`);
                failed.push(entry.command);
                continue;
            }
            entry.attempts += 1;
            entry.lastSentAt = now;
            retry.push(entry.command);
        }
        return { retry, failed };
    }

    /** Socket died: nothing in flight can be acked, so fail it all cleanly. */
    failAll(reason: string): Command[] {
        const dropped: Command[] = [];
        for (const [, entry] of this.pending) {
            entry.resolve(false, reason);
            dropped.push(entry.command);
        }
        this.pending.clear();
        return dropped;
    }

    size(): number {
        return this.pending.size;
    }
}
