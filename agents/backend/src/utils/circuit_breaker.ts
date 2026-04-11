/**
 * Circuit Breaker — 6 Sigma Reliability Pattern
 *
 * Prevents cascading failures when external APIs (Gemini, WhatsApp) go down.
 * Three states:
 *   CLOSED  — Normal operation. Tracks failures.
 *   OPEN    — API down. Returns fallback immediately. No calls made.
 *   HALF_OPEN — Testing. Allows one call through. Success → CLOSED, Failure → OPEN.
 *
 * Usage:
 *   const cb = new CircuitBreaker('gemini', { failureThreshold: 5, resetTimeout: 30000 });
 *   const result = await cb.call(() => geminiApi.generate(prompt), 'fallback value');
 */

import logger from './logger';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
    failureThreshold: number;   // Failures before opening (default: 5)
    resetTimeout: number;       // Milliseconds before trying HALF_OPEN (default: 30000)
    callTimeout: number;        // Max milliseconds per call (default: 15000)
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeout: 30000,
    callTimeout: 15000,
};

export class CircuitBreaker {
    readonly name: string;
    private options: CircuitBreakerOptions;
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private successCount = 0;

    constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
        this.name = name;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    getState(): CircuitState {
        if (this.state === 'OPEN') {
            // Check if enough time has passed to try HALF_OPEN
            if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
                this.state = 'HALF_OPEN';
                logger.info(`[CircuitBreaker:${this.name}] OPEN → HALF_OPEN (testing)`);
            }
        }
        return this.state;
    }

    /**
     * Execute a function through the circuit breaker.
     * Returns fallback if circuit is OPEN.
     */
    async call<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
        const currentState = this.getState();

        if (currentState === 'OPEN') {
            logger.warn(`[CircuitBreaker:${this.name}] OPEN — returning fallback`);
            return fallback;
        }

        try {
            // Execute with timeout
            const result = await this.withTimeout(fn(), this.options.callTimeout);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error as Error);
            return fallback;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            logger.info(`[CircuitBreaker:${this.name}] HALF_OPEN → CLOSED (call succeeded)`);
        }
        this.failureCount = 0;
        this.state = 'CLOSED';
        this.successCount++;
    }

    private onFailure(error: Error): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN';
            logger.error(`[CircuitBreaker:${this.name}] HALF_OPEN → OPEN (test call failed: ${error.message})`);
            return;
        }

        if (this.failureCount >= this.options.failureThreshold) {
            this.state = 'OPEN';
            logger.error(`[CircuitBreaker:${this.name}] CLOSED → OPEN (${this.failureCount} failures: ${error.message})`);
        } else {
            logger.warn(`[CircuitBreaker:${this.name}] Failure ${this.failureCount}/${this.options.failureThreshold}: ${error.message}`);
        }
    }

    private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Circuit breaker timeout (${ms}ms)`));
            }, ms);

            promise.then(
                (result) => { clearTimeout(timer); resolve(result); },
                (error) => { clearTimeout(timer); reject(error); }
            );
        });
    }

    /** Get stats for health check endpoint */
    getStats() {
        return {
            name: this.name,
            state: this.getState(),
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
        };
    }

    /** Force reset (for testing/admin) */
    reset(): void {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        logger.info(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
    }
}

// ─── Shared Instances ────────────────────────────────────────────────────────
// These are singletons used across the app

export const geminiCircuit = new CircuitBreaker('gemini', {
    failureThreshold: 5,
    resetTimeout: 30000,    // 30 seconds before retrying
    callTimeout: 15000,     // 15 seconds per Gemini call
});

export const whatsappCircuit = new CircuitBreaker('whatsapp', {
    failureThreshold: 3,
    resetTimeout: 20000,    // 20 seconds before retrying
    callTimeout: 10000,     // 10 seconds per WhatsApp call
});
