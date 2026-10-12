import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { allowedCrmUrl, validatePayload, sendPreparedFiles, MAX_BYTES } from '../src/protocol.js';
const data = mime => `data:${mime};base64,YQ==`;
const file = (key, kind = 'image', caption = '') => ({ key, propertyId: 'p1', filename: `${key}.bin`, kind, caption, data: data(kind === 'document' ? 'application/pdf' : `${kind}/${kind === 'image' ? 'jpeg' : 'mp4'}`) });
const payload = () => ({ recipient: '+12025550123', files: [file('cover', 'image', 'Property details'), file('photo'), file('video', 'video'), file('pdf', 'document')] });
test('only exact CRM origins are allowed', () => {
    for (const url of ['http://localhost:5173/inventory', 'https://admin.realtypandit.in/']) assert.equal(allowedCrmUrl(url), true);
    for (const url of ['https://admin.realtypandit.in.evil.test/', 'https://evil.test/', 'http://localhost:8888/', 'file:///tmp/a', 'bad']) assert.equal(allowedCrmUrl(url), false);
});
test('validates caption, MIME, recipient, file count, duplicate IDs and order', () => {
    assert.equal(validatePayload(payload()).files.length, 4);
    const reject = mutate => { const value = payload(); mutate(value); assert.throws(() => validatePayload(value)); };
    reject(p => p.recipient = 'PENDING_123');
    reject(p => p.files[0].caption = '');
    reject(p => p.files[1].caption = 'second caption');
    reject(p => p.files[0].caption = 'a'.repeat(1025));
    reject(p => p.files[1].key = p.files[0].key);
    reject(p => p.files[2].data = data('text/html'));
    reject(p => p.files.reverse());
    reject(p => p.files.push(file('pdf2', 'document')));
    reject(p => p.files = []);
    reject(p => p.files = Array.from({ length: 101 }, (_, i) => file(String(i))));
    reject(p => p.files[0].data = `data:image/jpeg;base64,${Buffer.alloc(MAX_BYTES + 1).toString('base64')}`);
});
test('property blocks stay together, each with its own first-photo caption', () => {
    const p = payload(); p.files.push({ ...file('cover2', 'image', 'Other property'), propertyId: 'p2' });
    validatePayload(p);
    p.files.push(file('late')); assert.throws(() => validatePayload(p), /together/);
});

test('video-only property starts with a captioned video; documents cannot replace media', () => {
    const p = { recipient: '+12025550123', files: [file('video', 'video', 'Video property details'), file('pdf', 'document')] };
    validatePayload(p);
    assert.throws(() => validatePayload({ ...p, files: [file('pdf', 'document', 'Details')] }));
    assert.throws(() => validatePayload({ ...p, files: [file('video', 'video')] }));
    assert.throws(() => validatePayload({ ...p, files: [...p.files, file('late-photo')] }));
});

test('first video carries its property details during the actual injected send', async () => {
    const calls = [];
    const r = runtime(async (to, bytes, options) => { calls.push(options); return { id: 'video-message', ack: 1 }; });
    assert.equal((await r.run({ recipient: '+12025550123', files: [file('video', 'video', 'Details')] }, r.account)).status, 'sent');
    assert.equal(calls[0].type, 'video'); assert.equal(calls[0].caption, 'Details');
});
function runtime(send, account = '+12025550199'.slice(1) + '@c.us') {
    const window = { WPP: { isReady: true, conn: { isAuthenticated: () => true, getMyUserId: () => account }, chat: { sendFileMessage: send } } };
    // Exercise the serialized function Chrome actually injects, with no module closure.
    return { window, run: vm.runInNewContext(`(${sendPreparedFiles.toString()})`, { window }), account };
}
test('sends sequentially to chosen recipient with caption only on cover and real ack', async () => {
    const calls = []; let inflight = false;
    const r = runtime(async (to, bytes, options) => { assert.equal(inflight, false); inflight = true; await Promise.resolve(); calls.push({ to, bytes, options }); inflight = false; return { id: `m${calls.length}`, ack: 1 }; });
    const result = await r.run(payload(), r.account);
    assert.equal(result.status, 'sent'); assert.equal(result.results.length, 4);
    assert.deepEqual(calls.map(c => c.options.type), ['image', 'image', 'video', 'document']);
    assert.equal(calls[0].options.caption, 'Property details'); assert.equal(calls[1].options.caption, undefined);
    assert.ok(calls.every(c => c.to === '12025550123@c.us' && c.options.waitForAck && c.options.detectMentioned === false));
});
test('stops on partial or missing acknowledgement without retries', async () => {
    for (const response of [null, { id: 'm' }, { id: 'm', ack: 0 }]) {
        let count = 0; const r = runtime(async () => ++count === 1 ? { id: 'first', ack: 1 } : response);
        const result = await r.run(payload(), r.account);
        assert.equal(result.status, 'partial'); assert.equal(count, 2); assert.equal(result.results[0].status, 'sent'); assert.equal(result.results[1].status, 'uncertain'); assert.equal(r.window.__rpPersonalWaSending, false);
    }
});
test('account switching and page-wide lock prevent extra sends', async () => {
    let count = 0; const r = runtime(async () => { count++; r.window.WPP.conn.getMyUserId = () => 'changed@c.us'; return { id: 'first', ack: 1 }; });
    assert.equal((await r.run(payload(), 'wrong@c.us')).status, 'failed'); assert.equal(count, 0);
    r.window.__rpPersonalWaSending = true;
    assert.equal((await r.run(payload(), r.account)).status, 'failed'); assert.equal(count, 0);
    r.window.__rpPersonalWaSending = false;
    assert.equal((await r.run(payload(), r.account)).status, 'partial'); assert.equal(count, 1);
});
