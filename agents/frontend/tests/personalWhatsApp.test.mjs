import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyAttachments, orderedPropertyAttachments, EMPTY_ATTACHMENT_SELECTION, isAndroidDevice, nativePropertyShareSteps,
    validateNativeShares, validatePersonalWhatsAppFile } from '../src/lib/personalWhatsAppFiles.ts';
import { personalWhatsAppStatus, preparePersonalWhatsAppShare, personalWhatsAppInstallation } from '../src/lib/personalWhatsAppBridge.ts';
import { buildWhatsAppShareText } from '../src/lib/buildWhatsAppShareText.ts';
test('individual selection, chosen cover, photos before videos and no defaults', () => {
    const media = propertyAttachments({ media_urls: ['/one.jpg', '/two.jpg', '/one.jpg', '/movie.mp4'], video_urls: ['/movie.mp4', '/other.webm'] }, 'http://localhost:7071');
    assert.equal(media.length, 4); assert.deepEqual(EMPTY_ATTACHMENT_SELECTION.urls, []); assert.equal(EMPTY_ATTACHMENT_SELECTION.pdf, false);
    const selection = { urls: media.slice(0, 3).map(a => a.url), firstPhoto: media[1].url, pdf: true };
    assert.deepEqual(orderedPropertyAttachments(media, selection).map(a => a.label), ['Photo 2', 'Photo 1', 'Video 1']);
    assert.throws(() => orderedPropertyAttachments(media, { ...selection, firstPhoto: media[3].url }));
});
test('caption reuses property details and customer price without owner data or generated links', () => {
    const text = buildWhatsAppShareText([{ inv: { type: 'flat', locality: 'Example area', price: 100, display_price: 200, owner_phone: 'PRIVATE', owner_name: 'PRIVATE', specs: { bhk: 2 } }, link: '' }], 'dealer');
    assert.match(text, /Example area/); assert.match(text, /200/); assert.match(text, /2 BHK/); assert.doesNotMatch(text, /PRIVATE|https?:|Realty Pandit/i);
});
test('bridge ignores foreign source/origin/request IDs and cleans up listener', async () => {
    let listener, message;
    globalThis.location = { origin: 'http://localhost:5173' };
    globalThis.window = {
        setTimeout, addEventListener: (_, fn) => listener = fn,
        removeEventListener: (_, fn) => { assert.equal(fn, listener); listener = null; },
        postMessage: (value, target) => { assert.equal(target, location.origin); message = value; },
    };
    const pending = personalWhatsAppStatus();
    const event = { source: window, origin: location.origin, data: { channel: message.channel, direction: 'extension', id: message.id, result: { ready: true, account: 'test@c.us' } } };
    listener({ ...event, origin: 'https://evil.test' }); assert.ok(listener);
    listener({ ...event, source: {} }); assert.ok(listener);
    listener({ ...event, data: { ...event.data, id: 'wrong' } }); assert.ok(listener);
    listener({ ...event, data: { ...event.data, result: { installed: true, version: '0.2.0', capabilities: ['video-first'] } } });
    await new Promise(resolve => setImmediate(resolve));
    listener({ ...event, data: { ...event.data, id: message.id } });
    assert.deepEqual(await pending, { account: 'test@c.us' }); assert.equal(listener, null);
    const failed = preparePersonalWhatsAppShare('+12025550123', []);
    listener({ ...event, data: { ...event.data, id: message.id, result: { error: 'Rejected' } } });
    await assert.rejects(failed, /Rejected/); assert.equal(listener, null);
    delete globalThis.window; delete globalThis.location;
});

test('video-only attachments work, but PDF-only or an invalid photo cover does not', () => {
    const attachments = propertyAttachments({ media_urls: ['/photo.jpg'], video_urls: ['/first.mp4', '/second.mp4'] }, 'https://example.test');
    assert.deepEqual(orderedPropertyAttachments(attachments, { urls: attachments.slice(1).map(a => a.url), firstPhoto: '', pdf: false }).map(a => a.label), ['Video 1', 'Video 2']);
    assert.throws(() => orderedPropertyAttachments(attachments, { urls: [], firstPhoto: '', pdf: true }), /photo or video/);
});

test('Android detection depends on device, not window width', () => {
    assert.equal(isAndroidDevice('Mozilla/5.0 (Linux; Android 15) Chrome/140'), true);
    for (const ua of ['Mozilla/5.0 Windows Chrome/140', 'iPhone Safari', 'Macintosh Chrome']) assert.equal(isAndroidDevice(ua), false);
});

test('native shares keep each property and its optional PDF in separate steps', () => {
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const video = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    const pdf = new File(['%PDF-'], 'brochure.pdf', { type: 'application/pdf' });
    const steps = [...nativePropertyShareSteps('one', 'One', 'First property', [photo, video], pdf),
        ...nativePropertyShareSteps('two', 'Two', 'Second property', [video])];
    assert.deepEqual(steps.map(s => [s.propertyId, s.kind, s.text]), [['one', 'media', 'First property'], ['one', 'pdf', ''], ['two', 'media', 'Second property']]);
    const checked = []; validateNativeShares(steps, data => { checked.push(data); return true; });
    assert.equal(checked.length, 3); assert.deepEqual(checked[0].files, [photo, video]); assert.equal(checked[1].text, undefined);
    assert.throws(() => validateNativeShares(steps, data => data.files[0].type !== 'application/pdf'), /PDF/);
    assert.throws(() => nativePropertyShareSteps('one', 'One', 'Details', [], pdf));
});

test('unsupported and empty attachments fail before handoff on both platforms', () => {
    validatePersonalWhatsAppFile(new Blob(['video'], { type: 'video/mp4' }), 'video', 'movie.mp4');
    assert.throws(() => validatePersonalWhatsAppFile(new Blob(['x'], { type: 'video/x-msvideo' }), 'video', 'movie.avi'));
    assert.throws(() => validatePersonalWhatsAppFile(new Blob([], { type: 'image/jpeg' }), 'image', 'photo.jpg'));
    assert.throws(() => validatePersonalWhatsAppFile(new Blob(['x'], { type: 'text/html' }), 'document', 'brochure.pdf'));
});

test('old extension is distinguished from missing or disconnected WhatsApp', async () => {
    globalThis.location = { origin: 'http://localhost:5173' };
    let listener;
    globalThis.window = {
        setTimeout, addEventListener: (_, fn) => listener = fn, removeEventListener: () => { listener = null; },
        postMessage: message => queueMicrotask(() => listener({ source: window, origin: location.origin,
            data: { channel: message.channel, direction: 'extension', id: message.id, result: { ready: true, account: 'test@c.us' } } })),
    };
    await assert.rejects(personalWhatsAppInstallation(), /Update.*0.2.0/);
    assert.equal(listener, null);
    delete globalThis.window; delete globalThis.location;
});

test('missing extension probe times out and removes its reply listener', async () => {
    globalThis.location = { origin: 'http://localhost:5173' };
    let listener;
    globalThis.window = {
        setTimeout: fn => setTimeout(fn, 0), addEventListener: (_, fn) => listener = fn,
        removeEventListener: (_, fn) => { assert.equal(fn, listener); listener = null; }, postMessage() {},
    };
    await assert.rejects(personalWhatsAppInstallation(), /extension did not respond/);
    assert.equal(listener, null);
    delete globalThis.window; delete globalThis.location;
});

test('downloads are bounded even when content-length is absent or understated', async () => {
    const { downloadPersonalWhatsAppBlob } = await import('../src/lib/personalWhatsAppFiles.ts');
    const blob = await downloadPersonalWhatsAppBlob(new Response('abc', { headers: { 'content-type': 'image/jpeg' } }), 3);
    assert.equal(blob.size, 3); assert.equal(blob.type, 'image/jpeg');
    await assert.rejects(downloadPersonalWhatsAppBlob(new Response('abc', { headers: { 'content-length': '100' } }), 3), /40 MB/);
    await assert.rejects(downloadPersonalWhatsAppBlob(new Response('abcd', { headers: { 'content-length': '1' } }), 3), /40 MB/);
});
