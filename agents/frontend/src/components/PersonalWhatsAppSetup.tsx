import { useState } from 'react';
import { personalWhatsAppInstallation, personalWhatsAppStatus } from '../lib/personalWhatsAppBridge';
import './PersonalWhatsAppShareModal.css';

const extensionId = import.meta.env.VITE_PERSONAL_WHATSAPP_EXTENSION_ID || '';
const storeUrl = /^[a-p]{32}$/.test(extensionId) ? `https://chromewebstore.google.com/detail/${extensionId}` : '';

export default function PersonalWhatsAppSetup({ compact = false }: { compact?: boolean }) {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    async function check() {
        setBusy(true); setStatus(''); setError('');
        try {
            const installed = await personalWhatsAppInstallation();
            setStatus(`Extension ${installed.version} installed.`);
            const { account } = await personalWhatsAppStatus();
            setStatus(`Extension ${installed.version} connected. Sending account: +${account.split('@')[0]}`);
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not check the extension.'); }
        finally { setBusy(false); }
    }

    return <section className={compact ? 'personal-wa-setup' : 'personal-wa-panel personal-wa-setup-page'} aria-label="My WhatsApp setup">
        <h2>My WhatsApp desktop setup</h2>
        <p>Use desktop Chrome with your own WhatsApp Web account in the same browser profile. The WhatsApp desktop app is not required. Edge support still needs live verification.</p>
        {storeUrl ? <a href={storeUrl} target="_blank" rel="noreferrer">Install My WhatsApp extension</a>
            : <p>The production store listing is pending. Contact your CRM administrator for the pilot installation.</p>}
        {!compact && <ol>
            <li>Open the store link and confirm installation in Chrome.</li>
            <li>Reload the CRM after installation or an extension update.</li>
            <li>Open WhatsApp Web and link your own WhatsApp account.</li>
            <li>Check the connection, then choose My WhatsApp on a property or selected properties.</li>
        </ol>}
        <p><a href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">Open WhatsApp Web</a>{' '}
            {!compact && <button type="button" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check extension and connection'}</button>}</p>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
        <p><a href="/my-whatsapp-privacy.html" target="_blank" rel="noreferrer">Extension privacy and data handling</a></p>
        {compact ? <a href="/my-whatsapp-setup" target="_blank" rel="noreferrer">Installation instructions</a>
            : <><p>On Android, the CRM prepares files for your phone’s share sheet. Choose WhatsApp and the recipient, then tap Send there.</p>
                <p>Desktop sending uses an unofficial WhatsApp Web integration. It can break or risk account restrictions. Review the sender and recipient before every send.</p>
                <a href="/">Back to CRM</a></>}
    </section>;
}
