/**
 * End-to-end protocol test with a SIMULATED handset.
 *
 * This exists to prove the invariants that were measured on the real phone on
 * 2026-08-06 — especially the hangup lag, which is the one most likely to cause
 * a production incident (dialling over a live call).
 *
 * Run: npm test
 */

process.env.CALL_GATEWAY_PORT ??= '7099';
process.env.CALL_GATEWAY_DEVICE_TOKEN ??= 'test-device';
process.env.CALL_GATEWAY_INTERNAL_TOKEN ??= 'test-internal';

const PORT = process.env.CALL_GATEWAY_PORT;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = { authorization: `Bearer ${process.env.CALL_GATEWAY_INTERNAL_TOKEN}` };

const CALL_STATE = { IDLE: 0, RINGING: 1, OFFHOOK: 2 } as const;

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail = ''): void {
    if (cond) {
        passed += 1;
        console.log(`  [PASS] ${label}`);
    } else {
        failed += 1;
        console.log(`  [FAIL] ${label} ${detail}`);
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fetch(BASE + path, {
        ...init,
        headers: { ...AUTH, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    let body: any = null;
    try {
        body = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, body };
}

/** A fake handset: acks commands, dedupes replays, and reports state on its own clock. */
class FakePhone {
    ws!: WebSocket;
    seenCommands = new Set<string>();
    dialled: string[] = [];
    issuedStamps: number[] = [];
    /** Set to delay the IDLE report after a hangup — mimics the real teardown lag. */
    hangupLagMs = 0;

    async connect(): Promise<void> {
        this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/phone`);
        await new Promise<void>((resolve, reject) => {
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error('ws failed'));
        });
        this.ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)));
        this.send({
            type: 'hello',
            deviceId: 'fake-lancelot',
            deviceToken: process.env.CALL_GATEWAY_DEVICE_TOKEN,
            appVersion: '0.1.0-test',
            androidBuild: 'lancelot/QP1A.190711.020',
            lines: [
                { subId: 1, role: 'outbound', inService: true },
                { subId: 2, role: 'inbound', inService: true },
            ],
        });
    }

    send(msg: any): void {
        this.ws.send(JSON.stringify(msg));
    }

    reportState(subId: number, state: number, number: string | null, direction: string, callId: string | null): void {
        this.send({ type: 'call_state', subId, state, number, direction, callId });
    }

    private onMessage(msg: any): void {
        if (msg.type === 'hello_ok' || msg.type === 'ping') return;

        // ── the dedupe half of the exactly-once pair ──
        if (this.seenCommands.has(msg.commandId)) {
            this.send({
                type: 'command_ack',
                commandId: msg.commandId,
                accepted: false,
                reason: 'duplicate commandId — deduped',
            });
            return;
        }
        this.seenCommands.add(msg.commandId);

        if (typeof msg.issuedAtMillis === 'number') this.issuedStamps.push(msg.issuedAtMillis);

        if (msg.type === 'dial') {
            this.dialled.push(msg.number);
            this.send({ type: 'command_ack', commandId: msg.commandId, accepted: true });
            // Real phone: OFFHOOK appears shortly after the dial.
            setTimeout(() => this.reportState(msg.subId, CALL_STATE.OFFHOOK, msg.number, 'outbound', msg.callId), 50);
        } else if (msg.type === 'hangup') {
            this.send({ type: 'command_ack', commandId: msg.commandId, accepted: true });
            // THE LAG: ack now, IDLE later. This is what the real handset did.
            setTimeout(() => this.reportState(msg.subId, CALL_STATE.IDLE, null, 'outbound', msg.callId), this.hangupLagMs);
        } else if (msg.type === 'answer') {
            this.send({ type: 'command_ack', commandId: msg.commandId, accepted: true });
            setTimeout(() => this.reportState(msg.subId, CALL_STATE.OFFHOOK, null, 'inbound', msg.callId), 50);
        }
    }
}

async function main(): Promise<void> {
    await import('../src/server.ts');
    await sleep(300);

    console.log('\n=== 1. health + phone connect ===');
    let h = await api('/health');
    check('server up', h.status === 200);
    check('no phone yet', h.body.phoneConnected === false);

    const phone = new FakePhone();
    await phone.connect();
    await sleep(200);
    h = await api('/health');
    check('phone connected', h.body.phoneConnected === true);
    check('two lines registered', h.body.lines.length === 2, JSON.stringify(h.body.lines));
    check('both idle', h.body.lines.every((l: any) => l.status === 'idle'));

    console.log('\n=== 2. outbound dial ===');
    const bad = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '9958860411' }) });
    check('non-E.164 rejected (no guessing)', bad.status === 400, `got ${bad.status}`);

    const dial = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '+919958860411' }) });
    check('dial accepted', dial.status === 202, JSON.stringify(dial.body));
    const callId = dial.body.callId;
    check('phone actually dialled it', phone.dialled[0] === '+919958860411');
    await sleep(200);
    h = await api('/health');
    const outLine = h.body.lines.find((l: any) => l.role === 'outbound');
    check('outbound line busy after OFFHOOK', outLine.status === 'busy', JSON.stringify(outLine));

    console.log('\n=== 3. line exhaustion (must not dial over a live call) ===');
    const second = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '+919999999999' }) });
    check('second dial refused with 409', second.status === 409, `got ${second.status}`);
    check('phone was NOT asked to dial again', phone.dialled.length === 1);

    console.log('\n=== 4. hangup lag — THE critical invariant ===');
    phone.hangupLagMs = 1200;
    const hup = await api(`/calls/${callId}/hangup`, { method: 'POST' });
    check('hangup acked', hup.status === 202);
    await sleep(200); // ack landed, but IDLE has NOT been reported yet
    h = await api('/health');
    const midLine = h.body.lines.find((l: any) => l.role === 'outbound');
    check('line STILL busy while teardown pending', midLine.status === 'busy', JSON.stringify(midLine));
    const during = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '+918888888888' }) });
    check('cannot dial during teardown', during.status === 409, `got ${during.status}`);

    await sleep(1400); // IDLE now reported
    h = await api('/health');
    const freeLine = h.body.lines.find((l: any) => l.role === 'outbound');
    check('line released only after reported IDLE', freeLine.status === 'idle', JSON.stringify(freeLine));
    const after = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '+918888888888' }) });
    check('dial works again once truly idle', after.status === 202, `got ${after.status}`);
    await sleep(150);
    await api(`/calls/${after.body.callId}/hangup`, { method: 'POST' });
    phone.hangupLagMs = 0;
    await sleep(200);

    console.log('\n=== 5. call record outcome — OUTBOUND OFFHOOK IS NOT AN ANSWER ===');
    // Android has no CALL_STATE_DIALING: outbound goes IDLE -> OFFHOOK when the FAR
    // END STARTS RINGING. An earlier version of this test asserted answeredAt was set
    // here and passed — enshrining a bug that would report every unanswered ring to
    // the CRM as a connected call.
    const rec = await api(`/calls/${callId}`);
    check('call recorded', rec.status === 200);
    check('outbound dialingAt set', rec.body.dialingAt !== null, JSON.stringify(rec.body.dialingAt));
    check('outbound answeredAt NOT set (cannot be known)', rec.body.answeredAt === null, JSON.stringify(rec.body.answeredAt));
    check(
        'outbound outcome=pending_reconciliation',
        rec.body.outcome === 'pending_reconciliation',
        JSON.stringify(rec.body.outcome),
    );

    console.log('\n=== 6. inbound call ===');
    phone.reportState(2, CALL_STATE.RINGING, '+919958860411', 'inbound', null);
    await sleep(200);
    h = await api('/health');
    const inLine = h.body.lines.find((l: any) => l.role === 'inbound');
    check('inbound line busy on ring', inLine.status === 'busy', JSON.stringify(inLine));
    check('caller id retained in E.164', inLine.number === '+919958860411', String(inLine.number));
    phone.reportState(2, CALL_STATE.IDLE, null, 'inbound', null);
    await sleep(200);
    h = await api('/health');
    check('inbound line freed', h.body.lines.find((l: any) => l.role === 'inbound').status === 'idle');

    console.log('\n=== 6b. inbound that rang but was never answered ===');
    phone.reportState(2, CALL_STATE.RINGING, '+919111111111', 'inbound', 'in-missed');
    await sleep(150);
    phone.reportState(2, CALL_STATE.IDLE, null, 'inbound', 'in-missed');
    await sleep(250);
    const missed = await api('/calls/in-missed');
    check('missed inbound recorded', missed.status === 200, `got ${missed.status}`);
    check(
        'missed inbound outcome=no_answer',
        missed.body?.outcome === 'no_answer',
        JSON.stringify(missed.body?.outcome),
    );

    console.log('\n=== 6c. every command carries issuedAtMillis (TTL is enforceable) ===');
    check(
        'commands stamped with issuedAtMillis',
        phone.issuedStamps.length > 0 && phone.issuedStamps.every((n) => typeof n === 'number'),
        JSON.stringify(phone.issuedStamps),
    );

    console.log('\n=== 7. auth ===');
    const noAuth = await fetch(`${BASE}/lines`);
    check('internal API rejects missing token', noAuth.status === 401);

    const oversized = await api('/calls', {
        method: 'POST',
        body: JSON.stringify({ number: '+919958860411', padding: 'x'.repeat(65 * 1024) }),
    });
    check('oversized internal request rejected', oversized.status === 413, `got ${oversized.status}`);

    const attacker = new WebSocket(`ws://127.0.0.1:${PORT}/phone`);
    await new Promise<void>((resolve, reject) => {
        attacker.onopen = () => resolve();
        attacker.onerror = () => reject(new Error('attacker ws failed'));
    });
    attacker.send(JSON.stringify({ type: 'hello', deviceId: 'attacker', deviceToken: 'wrong' }));
    await sleep(100);
    h = await api('/health');
    check('bad websocket handshake cannot evict the authenticated phone', h.body.deviceId === 'fake-lancelot');
    attacker.close();

    console.log('\n=== 8. disconnect ===');
    phone.ws.close();
    await sleep(300);
    h = await api('/health');
    check('phone marked gone', h.body.phoneConnected === false);
    check('all lines unavailable', h.body.lines.every((l: any) => l.status === 'unavailable'));
    const offline = await api('/calls', { method: 'POST', body: JSON.stringify({ number: '+917777777777' }) });
    check('no dialling while phone offline', offline.status === 409, `got ${offline.status}`);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('test crashed:', e);
    process.exit(1);
});
