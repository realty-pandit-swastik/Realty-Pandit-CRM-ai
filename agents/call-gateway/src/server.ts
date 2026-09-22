/**
 * call-gateway — VPS side of the AI calling bridge.
 *
 * Runs as its OWN PM2 process on its own port, deliberately separate from the
 * pipecat/WhatsApp voice service (that bot is working and off limits).
 *
 * The phone connects out to us over WSS and holds the socket open; we never
 * connect to it (Jio CGNAT — it has no reachable IP). The CRM backend talks to
 * us over the internal REST API on the same port.
 */

import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
    CALL_STATE,
    COMMAND_TTL_MS,
    isCommand,
    type CallState,
    type Command,
    type PhoneToServer,
    type ServerToPhone,
} from './protocol.ts';
import { LineManager } from './lines.ts';
import { CommandTracker } from './commands.ts';

const PORT = Number(process.env.CALL_GATEWAY_PORT ?? 7075);
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

const DEVICE_TOKEN = requireEnv('CALL_GATEWAY_DEVICE_TOKEN');
const INTERNAL_TOKEN = requireEnv('CALL_GATEWAY_INTERNAL_TOKEN');
const HEARTBEAT_SEC = 20;

type CallOutcome =
    | 'completed'
    | 'no_answer'
    | 'failed'
    | 'rejected'
    /** Outbound only: the platform cannot tell us if it was answered. See onPhoneMessage. */
    | 'pending_reconciliation';

interface CallRecord {
    callId: string;
    direction: 'inbound' | 'outbound';
    subId: number | null;
    number: string;
    state: CallState;
    createdAt: number;
    /** Outbound: far end started ringing. NOT an answer. */
    dialingAt: number | null;
    /** Only ever set for inbound, where OFFHOOK genuinely means we accepted. */
    answeredAt: number | null;
    endedAt: number | null;
    outcome: CallOutcome | null;
    error?: string;
}

const lines = new LineManager();
const commands = new CommandTracker();
const calls = new Map<string, CallRecord>();

let phone: WebSocket | null = null;
let deviceId: string | null = null;
const sessionId = Math.random().toString(36).slice(2);

const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[call-gateway]', ...a);

// ─── phone socket ───────────────────────────────────────────────────────────

function send(msg: ServerToPhone): boolean {
    if (!phone || phone.readyState !== phone.OPEN) return false;
    phone.send(JSON.stringify(msg));
    return true;
}

/** Send a command and resolve once the phone acks (or we give up retrying). */
function dispatch(command: Command): Promise<{ accepted: boolean; reason?: string }> {
    return new Promise((resolve) => {
        commands.track(command, (accepted, reason) => resolve({ accepted, reason }));
        if (!send(command)) {
            // Leave it tracked: the retry loop will re-send once the phone is back.
            log('command queued, phone offline:', command.type, command.commandId);
        }
    });
}

function onPhoneMessage(raw: string): void {
    let msg: PhoneToServer;
    try {
        msg = JSON.parse(raw);
    } catch {
        log('unparseable frame from phone');
        return;
    }

    switch (msg.type) {
        case 'hello': {
            if (msg.deviceToken !== DEVICE_TOKEN) {
                log('AUTH FAIL from', msg.deviceId);
                phone?.close(4001, 'bad device token');
                return;
            }
            deviceId = msg.deviceId;
            lines.sync(msg.lines);
            log(`hello from ${msg.deviceId} (${msg.androidBuild}) lines=${msg.lines.length}`);
            send({ type: 'hello_ok', sessionId, heartbeatSec: HEARTBEAT_SEC });
            break;
        }

        case 'heartbeat':
            break;

        case 'call_state': {
            const line = lines.applyReportedState(msg.subId, msg.state, msg.callId, msg.number);
            log(
                `state sub=${msg.subId} ${stateName(msg.state)} dir=${msg.direction}`,
                msg.number ?? '',
                `line=${line?.status}`,
            );

            // Inbound the server didn't initiate: mint a record so the CRM can match it.
            if (msg.direction === 'inbound' && msg.state === CALL_STATE.RINGING) {
                const callId = msg.callId ?? commands.nextId('in');
                if (!calls.has(callId)) {
                    calls.set(callId, {
                        callId,
                        direction: 'inbound',
                        subId: msg.subId,
                        number: msg.number ?? '',
                        state: msg.state,
                        createdAt: Date.now(),
                        dialingAt: null,
                        answeredAt: null,
                        endedAt: null,
                        outcome: null,
                    });
                }
            }

            const callId = msg.callId ?? line?.currentCallId ?? null;
            if (callId) {
                const rec = calls.get(callId);
                if (rec) {
                    rec.state = msg.state;

                    // ⚠️ OFFHOOK DOES NOT MEAN ANSWERED ON AN OUTBOUND CALL.
                    // Android has no CALL_STATE_DIALING: an outbound call flips
                    // IDLE -> OFFHOOK the moment the FAR END STARTS RINGING, not when
                    // the person picks up. Treating it as "answered" (as this code
                    // originally did) reports every unanswered ring as a connected
                    // call — it would have told the CRM a lead answered when their
                    // phone merely rang. Only an InCallService, which needs the
                    // default-dialer role, can distinguish the two live.
                    if (msg.state === CALL_STATE.OFFHOOK) {
                        if (msg.direction === 'outbound') {
                            if (rec.dialingAt === null) rec.dialingAt = Date.now();
                        } else if (rec.answeredAt === null) {
                            // Inbound is safe: we only reach OFFHOOK because we accepted.
                            rec.answeredAt = Date.now();
                        }
                    }

                    if (msg.state === CALL_STATE.IDLE && rec.endedAt === null) {
                        rec.endedAt = Date.now();
                        if (rec.direction === 'inbound') {
                            rec.outcome = rec.answeredAt ? 'completed' : 'no_answer';
                        } else {
                            // Truthfully unknown until the phone reconciles against
                            // CallLog (DURATION > 0 and TYPE != MISSED). Guessing here
                            // is what produces fake "answered" metrics.
                            rec.outcome = 'pending_reconciliation';
                        }
                    }
                }
            }
            break;
        }

        case 'command_ack': {
            const matched = commands.ack(msg.commandId, msg.accepted, msg.reason);
            if (!matched) log('stale ack ignored:', msg.commandId);
            else if (!msg.accepted) log('phone REJECTED', msg.commandId, msg.reason ?? '');
            break;
        }

        case 'error':
            log('phone error:', msg.code, msg.message, msg.commandId ?? '');
            break;
    }
}

function stateName(s: CallState): string {
    return s === CALL_STATE.IDLE ? 'IDLE' : s === CALL_STATE.RINGING ? 'RINGING' : 'OFFHOOK';
}

// ─── retry loop ─────────────────────────────────────────────────────────────

setInterval(() => {
    const { retry, failed } = commands.dueForRetry();
    for (const c of retry) {
        // Never re-send a stale command that STARTS a call. Hangup/answer stay
        // retryable: ending a call late is harmless, beginning one is not.
        if (c.type === 'dial' && Date.now() - c.issuedAtMillis > COMMAND_TTL_MS) {
            log('DROPPING stale dial (TTL exceeded):', c.commandId);
            commands.ack(c.commandId, false, 'expired before delivery');
            lines.release(c.subId);
            const rec = calls.get(c.callId);
            if (rec) { rec.outcome = 'failed'; rec.error = 'expired before delivery'; rec.endedAt = Date.now(); }
            continue;
        }
        log('retrying', c.type, c.commandId);
        send(c);
    }
    for (const c of failed) {
        log('command FAILED (no ack):', c.type, c.commandId);
        if (c.type === 'dial' || c.type === 'answer') lines.release(c.subId);
    }
    for (const line of lines.expirePending()) {
        log(`pending timeout — released line sub=${line.subId}`);
    }
}, 1_000).unref?.();

// ─── internal REST API (consumed by realty-backend) ─────────────────────────

function json(res: http.ServerResponse, code: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<{ body: Record<string, unknown>; tooLarge: boolean }> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk as Buffer;
        size += buffer.length;
        if (size <= MAX_REQUEST_BODY_BYTES) chunks.push(buffer);
    }
    if (size > MAX_REQUEST_BODY_BYTES) return { body: {}, tooLarge: true };
    if (!chunks.length) return { body: {}, tooLarge: false };
    try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString());
        return {
            body: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {},
            tooLarge: false,
        };
    } catch {
        return { body: {}, tooLarge: false };
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (url.pathname === '/health') {
        return json(res, 200, {
            ok: true,
            phoneConnected: !!phone && phone.readyState === phone.OPEN,
            deviceId,
            lines: lines.all(),
            pendingCommands: commands.size(),
        });
    }

    // Everything below is internal-only.
    if (req.headers.authorization !== `Bearer ${INTERNAL_TOKEN}`) {
        return json(res, 401, { error: 'unauthorized' });
    }

    if (url.pathname === '/lines' && req.method === 'GET') {
        return json(res, 200, { lines: lines.all() });
    }

    if (url.pathname === '/calls' && req.method === 'POST') {
        const { body, tooLarge } = await readBody(req);
        if (tooLarge) return json(res, 413, { error: 'request body too large' });
        const number = typeof body.number === 'string' ? body.number : '';
        if (!/^\+\d{8,15}$/.test(number)) {
            // Normalisation is the caller's job — we refuse ambiguous input rather
            // than guess, because dialling the wrong number is unrecoverable.
            return json(res, 400, { error: 'number must be E.164, e.g. +919958860411' });
        }
        // Refuse rather than queue when the handset is gone. A dial held for a
        // disconnected phone would fire on reconnect and ring a customer long after
        // the operator's intent expired — the caller should re-decide, not inherit a
        // stale intent.
        if (!phone || phone.readyState !== phone.OPEN) {
            return json(res, 409, { error: 'phone offline — dial refused, not queued' });
        }
        const callId = commands.nextId('out');
        const line = lines.acquire('outbound', callId);
        if (!line) {
            return json(res, 409, { error: 'no outbound line confirmed idle', lines: lines.all() });
        }
        calls.set(callId, {
            callId,
            direction: 'outbound',
            subId: line.subId,
            number,
            state: CALL_STATE.IDLE,
            createdAt: Date.now(),
            dialingAt: null,
            answeredAt: null,
            endedAt: null,
            outcome: null,
        });
        const result = await dispatch({
            type: 'dial',
            commandId: commands.nextId('cmd'),
            issuedAtMillis: Date.now(),
            callId,
            subId: line.subId,
            number,
        });
        if (!result.accepted) {
            lines.release(line.subId);
            const rec = calls.get(callId)!;
            rec.outcome = 'failed';
            rec.error = result.reason;
            rec.endedAt = Date.now();
            return json(res, 502, { error: 'phone did not accept dial', reason: result.reason });
        }
        return json(res, 202, { callId, subId: line.subId });
    }

    const hangup = url.pathname.match(/^\/calls\/([^/]+)\/hangup$/);
    if (hangup && req.method === 'POST') {
        const callId = hangup[1];
        const rec = calls.get(callId);
        if (!rec) return json(res, 404, { error: 'unknown callId' });
        const result = await dispatch({
            type: 'hangup',
            commandId: commands.nextId('cmd'),
            issuedAtMillis: Date.now(),
            callId,
            subId: rec.subId ?? 0,
        });
        // NOTE: accepted != hung up. Teardown lags by seconds; the line is only
        // released when the phone REPORTS idle. Do not mark the line free here.
        return json(res, result.accepted ? 202 : 502, { accepted: result.accepted });
    }

    const answer = url.pathname.match(/^\/calls\/([^/]+)\/answer$/);
    if (answer && req.method === 'POST') {
        const callId = answer[1];
        const rec = calls.get(callId);
        if (!rec) return json(res, 404, { error: 'unknown callId' });
        const result = await dispatch({
            type: 'answer',
            commandId: commands.nextId('cmd'),
            issuedAtMillis: Date.now(),
            callId,
            subId: rec.subId ?? 0,
        });
        return json(res, result.accepted ? 202 : 502, { accepted: result.accepted });
    }

    const get = url.pathname.match(/^\/calls\/([^/]+)$/);
    if (get && req.method === 'GET') {
        const rec = calls.get(get[1]);
        return rec ? json(res, 200, rec) : json(res, 404, { error: 'unknown callId' });
    }

    return json(res, 404, { error: 'not found' });
});

// ─── websocket ──────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/phone' });

wss.on('connection', (ws) => {
    let authenticated = false;
    const authTimer = setTimeout(() => {
        if (!authenticated) {
            log('closing phone socket that did not authenticate');
            ws.close(4001, 'authentication required');
        }
    }, 10_000);
    authTimer.unref?.();

    ws.on('message', (data) => {
        const raw = data.toString();
        if (!authenticated) {
            let hello: PhoneToServer;
            try {
                hello = JSON.parse(raw);
            } catch {
                ws.close(4001, 'invalid handshake');
                return;
            }
            if (hello.type !== 'hello' || hello.deviceToken !== DEVICE_TOKEN) {
                log('AUTH FAIL from unauthenticated phone socket');
                ws.close(4001, 'bad device token');
                return;
            }

            // Authenticate before replacing the active handset. Otherwise any
            // internet client can connect to /phone and evict the real device.
            const previousPhone = phone;
            phone = ws;
            authenticated = true;
            clearTimeout(authTimer);
            if (previousPhone && previousPhone.readyState === previousPhone.OPEN) {
                log('replacing authenticated phone socket');
                previousPhone.close(4000, 'superseded');
            }
            log('authenticated phone socket connected');
        }
        onPhoneMessage(raw);
    });

    ws.on('close', (code, reason) => {
        clearTimeout(authTimer);
        log('phone socket closed', code, reason.toString());
        if (phone === ws) {
            phone = null;
            lines.markAllUnavailable();
            const dropped = commands.failAll('phone disconnected');
            if (dropped.length) log(`failed ${dropped.length} in-flight command(s)`);
        }
    });

    ws.on('error', (err) => log('socket error', err.message));
});

server.listen(PORT, () => log(`listening on :${PORT} (ws path /phone)`));

export { server, lines, commands, calls };
