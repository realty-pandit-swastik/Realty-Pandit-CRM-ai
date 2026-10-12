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
                <h3>Android selected-client sharing test</h3>
                <p>Install this standalone test app on Android 8 or newer to check whether WhatsApp opens the selected client with photos, videos and a separate PDF. This test uses local files on your phone; it is not connected to CRM property sharing yet.</p>
                <p><a href="https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/releases/download/android-share-proof-v0.1.0/share-helper-debug.apk">Download Android test APK (0.1.0)</a>{' · '}
                    <a href="https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/blob/android-share-proof-v0.1.0/docs/runbooks/android-my-whatsapp-handoff-proof.md" target="_blank" rel="noreferrer">Full phone-testing checklist</a></p>
                <ol>
                    <li>Open the downloaded APK on your phone. If prompted, allow your browser or file manager to install unknown apps, then turn that permission off after installation.</li>
                    <li>Open My WhatsApp proof, enter a consenting test recipient’s country-coded number, a property label and property details, then explicitly choose WhatsApp or WhatsApp Business.</li>
                    <li>Select local test photos or videos and choose the first photo. Tap Open client in My WhatsApp, review the handoff, then Open preview. Test one PDF separately.</li>
                    <li>Check the correct recipient, every attachment, their order and the details. Recipient reselection or lost content means the test failed. You can cancel without sending.</li>
                </ol>
                <p>This is a debug-signed proof APK for a small pilot. Selected-client CRM integration remains disabled until phone tests pass; a team rollout needs a stable release signing key.</p>
                <p>Desktop sending uses an unofficial WhatsApp Web integration. It can break or risk account restrictions. Review the sender and recipient before every send.</p>
                <a href="/">Back to CRM</a></>}
    </section>;
}
