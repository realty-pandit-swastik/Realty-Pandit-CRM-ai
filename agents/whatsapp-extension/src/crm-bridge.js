(() => {
    const channel = 'rp-personal-whatsapp-v1';
    window.addEventListener('message', async event => {
        const message = event.data;
        if (event.source !== window || event.origin !== location.origin || message?.channel !== channel
            || message.direction !== 'crm' || typeof message.id !== 'string'
            || !['status', 'prepare', 'result'].includes(message.action)) return;
        try {
            const result = await chrome.runtime.sendMessage({ action: message.action, payload: message.payload });
            window.postMessage({ channel, direction: 'extension', id: message.id, result }, location.origin);
        } catch {
            window.postMessage({ channel, direction: 'extension', id: message.id,
                result: { error: 'Extension disconnected. Reload the CRM after enabling the extension.' } }, location.origin);
        }
    });
})();
