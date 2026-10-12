import { allowedCrmUrl, validatePayload, sendPreparedFiles, EXPIRY_MS, CAPABILITIES } from './protocol.js';
import { getRequest, saveRequest, allRequests, removeRequest, finishRequest } from './store.js';

const running = new Set();
const preparing = new Set();

async function getConnection(tabId) {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    const tab = tabId ? tabs.find(t => t.id === tabId) : tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (!tab) throw new Error('Open WhatsApp Web in this browser and sign in, then check the connection again.');
    const target = { tabId: tab.id };
    const [{ result: loaded }] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => !!window.WPP });
    if (!loaded) await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['vendor/wppconnect-wa.js'] });
    const [{ result }] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: async () => {
        for (let i = 0; i < 40 && !window.WPP?.isReady; i++) await new Promise(resolve => setTimeout(resolve, 500));
        if (!window.WPP?.isReady || !window.WPP.conn.isAuthenticated()) return null;
        return window.WPP.conn.getMyUserId()?.toString() || null;
    } });
    if (!result) throw new Error('WhatsApp Web is not connected yet. Sign in or wait for it to finish loading, then check again.');
    if (!/^\d{7,15}@c\.us$/.test(result)) throw new Error('Could not verify this WhatsApp account number. Reconnect WhatsApp Web before sharing.');
    return { tabId: tab.id, account: result };
}

async function cleanExpired() {
    for (const record of await allRequests()) {
        if (Date.now() > record.expires && !running.has(record.id)) await removeRequest(record.id);
    }
}

async function handle(message, sender) {
    const url = sender.url || '';
    let source;
    try { source = new URL(url); } catch { throw new Error('Unsupported sender.'); }
    const trustedUi = source.protocol === 'chrome-extension:' && source.host === chrome.runtime.id;
    const confirmation = trustedUi && new URL(url).pathname === '/confirm.html';
    const crm = sender.frameId === 0 && allowedCrmUrl(url);
    if (!crm && !trustedUi) throw new Error('This page cannot use the WhatsApp bridge.');
    if (message.action === 'status') {
        await cleanExpired();
        const info = { version: chrome.runtime.getManifest().version, capabilities: CAPABILITIES };
        if (message.payload?.probe) return { installed: true, ...info };
        const connection = await getConnection();
        return { ready: true, account: connection.account, ...info };
    }
    if (message.action === 'prepare' && crm) {
        if (preparing.has(sender.tab.id)) throw new Error('Another share is being prepared.');
        preparing.add(sender.tab.id);
        try {
        await cleanExpired();
        validatePayload(message.payload);
        const existing = (await allRequests()).some(r => r.creatorTabId === sender.tab.id
            && ['pending', 'sending'].includes(r.status));
        if (existing) throw new Error('Finish or cancel the existing share confirmation before preparing another.');
        const connection = await getConnection();
        const record = { id: crypto.randomUUID(), creatorTabId: sender.tab.id, origin: new URL(url).origin,
            ...connection, status: 'pending', expires: Date.now() + EXPIRY_MS, payload: message.payload };
        await saveRequest(record);
        try {
            const review = await chrome.tabs.create({ url: chrome.runtime.getURL(`confirm.html?id=${record.id}`) });
            await saveRequest({ ...record, reviewTabId: review.id });
        } catch (error) {
            await removeRequest(record.id);
            throw error;
        }
        return { requestId: record.id };
        } finally { preparing.delete(sender.tab?.id); }
    }
    if (!['result', 'review', 'confirm', 'cancel'].includes(message.action)) throw new Error('Unsupported bridge request.');
    const id = message.payload?.requestId;
    if (typeof id !== 'string') throw new Error('Invalid request ID.');
    const record = await getRequest(id);
    if (!record) throw new Error('Share request expired. Check WhatsApp before preparing another.');
    if (crm && (message.action !== 'result' || record.creatorTabId !== sender.tab.id
        || record.origin !== new URL(url).origin)) throw new Error('This share belongs to another CRM tab.');
    if (!crm && !confirmation) throw new Error('Open the extension confirmation page to review this share.');
    if (Date.now() > record.expires && !running.has(id)) {
        await removeRequest(id);
        throw new Error('Share request expired. Check WhatsApp before preparing another.');
    }
    if (message.action === 'result') {
        if (record.status === 'sending' && !running.has(id)) {
            const outcome = { status: 'uncertain', results: [], error: 'Extension restarted during sending. Check WhatsApp; do not resend automatically.' };
            await finishRequest(record, outcome);
            return outcome;
        }
        return { status: record.status, results: record.results || [], error: record.error };
    }
    if (message.action === 'review') return record;
    if (record.status !== 'pending' || running.has(id)) throw new Error('This share was already started or cancelled.');
    if (message.action === 'cancel') {
        await finishRequest(record, { status: 'cancelled', results: [] });
        return { status: 'cancelled' };
    }
    if (message.action === 'confirm') {
        running.add(id);
        try {
            await saveRequest({ ...record, status: 'sending' });
            const connection = await getConnection(record.tabId);
            if (connection.account !== record.account) throw new Error('WhatsApp account changed. Prepare the share again.');
            const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: record.tabId },
                world: 'MAIN', func: sendPreparedFiles, args: [record.payload, record.account] });
            if (!result) throw new Error('WhatsApp did not return a send result.');
            await finishRequest(record, result);
            return result;
        } catch {
            const outcome = { status: 'uncertain', results: [], error: 'Sending could not be confirmed. Check WhatsApp before preparing another share.' };
            await finishRequest(record, outcome);
            return outcome;
        } finally {
            running.delete(id);
        }
    }
    throw new Error('Unsupported bridge request.');
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
    handle(message, sender).then(reply).catch(error => reply({ error: error.message }));
    return true;
});

chrome.tabs.onRemoved.addListener(async tabId => {
    for (const record of await allRequests()) {
        if (record.reviewTabId === tabId && record.status === 'pending' && !running.has(record.id)) {
            await finishRequest(record, { status: 'cancelled', results: [] });
        }
    }
});

chrome.alarms.create('expire-personal-shares', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'expire-personal-shares') cleanExpired().catch(() => {});
});
