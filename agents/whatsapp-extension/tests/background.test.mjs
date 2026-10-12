import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { allowedCrmUrl, validatePayload, sendPreparedFiles, EXPIRY_MS, CAPABILITIES } from '../src/protocol.js';
const source = (await readFile(new URL('../src/background.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '');
const crm = { url: 'http://localhost:5173/inventory', frameId: 0, tab: { id: 1 } };
const ui = { url: 'chrome-extension://extension-id/confirm.html', frameId: 0, tab: { id: 3 } };
const payload = { recipient: '+12025550123', files: [{ key: 'one', propertyId: 'p1', filename: 'cover.jpg', kind: 'image', caption: 'Property details', data: 'data:image/jpeg;base64,YQ==' }] };
function harness() {
    const records = new Map(); let listener, alarm; let sends = 0; let account = '12025550199@c.us';
    const chrome = {
        runtime: { id: 'extension-id', getManifest: () => ({ version: '0.2.0' }), getURL: path => `chrome-extension://extension-id/${path.replace(/^\//, '')}`, onMessage: { addListener: fn => listener = fn } },
        tabs: { query: async () => [{ id: 2 }], create: async () => ({ id: 3 }), onRemoved: { addListener() {} } },
        alarms: { create() {}, onAlarm: { addListener: fn => alarm = fn } },
        scripting: { executeScript: async options => {
            if (options.func?.name === 'sendPreparedFiles') { sends++; return [{ result: { status: 'sent', results: [{ key: 'one', status: 'sent' }] } }]; }
            return [{ result: options.func?.toString().includes('!!window.WPP') ? true : account }];
        } },
    };
    vm.runInNewContext(source, { chrome, crypto: webcrypto, URL, Date, Set, Error,
        allowedCrmUrl, validatePayload, sendPreparedFiles, EXPIRY_MS, CAPABILITIES,
        getRequest: async id => records.get(id), allRequests: async () => [...records.values()],
        saveRequest: async record => records.set(record.id, record), removeRequest: async id => records.delete(id),
        finishRequest: async (record, outcome) => { const { payload: _, ...metadata } = record; records.set(record.id, { ...metadata, ...outcome }); },
    });
    const call = (action, sender = crm, value) => new Promise(resolve => listener({ action, payload: value }, sender, resolve));
    return { call, records, get sends() { return sends; }, setAccount: value => account = value, expire: () => alarm({ name: 'expire-personal-shares' }) };
}
test('rejects foreign, framed and other-extension senders', async () => {
    const h = harness();
    for (const sender of [{ ...crm, url: 'https://evil.test' }, { ...crm, frameId: 1 }, { ...ui, url: 'chrome-extension://other-extension/confirm.html' }, { ...crm, url: '' }]) {
        assert.ok((await h.call('status', sender)).error);
    }
});

test('installation probe returns version and capabilities without touching WhatsApp', async () => {
    const h = harness(); h.setAccount(null);
    const probe = await h.call('status', crm, { probe: true });
    assert.equal(probe.installed, true); assert.equal(probe.version, '0.2.0');
    assert.ok(probe.capabilities.includes('video-first')); assert.equal(h.sends, 0);
    assert.ok((await h.call('status')).error);
});
test('prepare never sends; CRM cannot confirm, review, or inspect another tab’s request', async () => {
    const h = harness(); const { requestId } = await h.call('prepare', crm, payload); assert.ok(requestId); assert.equal(h.sends, 0);
    for (const action of ['confirm', 'review', 'cancel']) assert.ok((await h.call(action, crm, { requestId })).error);
    assert.ok((await h.call('result', { ...crm, tab: { id: 99 } }, { requestId })).error);
    assert.equal((await h.call('review', ui, { requestId })).payload.recipient, payload.recipient);
    const result = await h.call('confirm', ui, { requestId }); assert.equal(result.status, 'sent'); assert.equal(h.sends, 1);
    assert.equal(h.records.get(requestId).payload, undefined);
    assert.ok((await h.call('confirm', ui, { requestId })).error); assert.equal(h.sends, 1);
});
test('concurrent prepare and account change fail closed', async () => {
    const h = harness(); const replies = await Promise.all([h.call('prepare', crm, payload), h.call('prepare', crm, payload)]);
    assert.equal(replies.filter(r => r.requestId).length, 1); assert.equal(replies.filter(r => r.error).length, 1);
    const requestId = replies.find(r => r.requestId).requestId; h.setAccount('changed@c.us');
    assert.equal((await h.call('confirm', ui, { requestId })).status, 'uncertain'); assert.equal(h.sends, 0);
});
test('cancel removes attachments, interrupted sends never retry, expired files are purged', async () => {
    const h = harness(); const { requestId } = await h.call('prepare', crm, payload);
    assert.equal((await h.call('cancel', ui, { requestId })).status, 'cancelled'); assert.equal(h.records.get(requestId).payload, undefined); assert.equal(h.sends, 0);
    const { requestId: next } = await h.call('prepare', crm, payload); const record = h.records.get(next);
    h.records.set(next, { ...record, status: 'sending' });
    assert.equal((await h.call('result', crm, { requestId: next })).status, 'uncertain'); assert.equal(h.sends, 0); assert.equal(h.records.get(next).payload, undefined);
    h.records.set('expired', { id: 'expired', expires: 0, payload }); h.expire(); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.records.has('expired'), false);
});
