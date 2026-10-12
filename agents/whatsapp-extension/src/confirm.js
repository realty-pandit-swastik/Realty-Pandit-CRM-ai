const requestId = new URLSearchParams(location.search).get('id');
const status = document.getElementById('status');
const send = document.getElementById('send');
const cancel = document.getElementById('cancel');
const call = action => chrome.runtime.sendMessage({ action, payload: { requestId } });
function line(parent, text, tag = 'p') {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
}

try {
    const record = await call('review');
    if (record.error) throw new Error(record.error);
    if (record.status !== 'pending') throw new Error('This share was already started or cancelled. Check the CRM and WhatsApp.');
    const summary = document.getElementById('summary');
    line(summary, `From: +${record.account.split('@')[0]}`);
    line(summary, `To: ${record.payload.recipient}`);
    line(summary, `Requested by: ${record.origin}`);
    const files = document.getElementById('files');
    record.payload.files.forEach((file, index) => {
        const card = document.createElement('section');
        line(card, `${index + 1}. ${file.filename}`, 'h2');
        if (file.kind === 'image') {
            const image = document.createElement('img');
            image.src = file.data;
            image.alt = file.filename;
            card.append(image);
        }
        if (file.caption) line(card, file.caption, 'pre');
        files.append(card);
    });
    status.textContent = 'Review your selected files and captions, then confirm to send.';
    send.disabled = cancel.disabled = false;
} catch (error) {
    status.textContent = error.message;
}

send.addEventListener('click', async () => {
    send.disabled = cancel.disabled = true;
    status.textContent = 'Sending selected attachments. Keep this tab and WhatsApp Web open.';
    // Keep the MV3 worker active while its WhatsApp send acknowledgement is pending.
    const heartbeat = setInterval(() => call('result').catch(() => {}), 20_000);
    try {
        const result = await call('confirm');
        const sent = (result.results || []).filter(r => r.status === 'sent').length;
        status.textContent = result.status === 'sent'
            ? `WhatsApp acknowledged all ${sent} attachments. Return to the CRM.`
            : `${sent} attachments acknowledged. ${result.error || 'Check WhatsApp before sending again.'}`;
    } catch {
        status.textContent = 'Connection interrupted. Check WhatsApp before sending again.';
    } finally {
        clearInterval(heartbeat);
    }
});

cancel.addEventListener('click', async () => {
    send.disabled = cancel.disabled = true;
    try {
        const result = await call('cancel');
        status.textContent = result.error || 'Cancelled. No attachments were sent.';
    } catch {
        status.textContent = 'Could not confirm cancellation. Close this review tab and check the CRM.';
    }
});
