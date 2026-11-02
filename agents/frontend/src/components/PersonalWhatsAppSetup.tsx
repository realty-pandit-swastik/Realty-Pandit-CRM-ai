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
        {compact ? <a href="/my-whatsapp-setup" target="_blank" rel="noreferrer">Installation instructions</a> : <>
            <h3>Android selected-client CRM pilot</h3>
            <p>Install the signed helper on Android 8 or newer. This pilot is connected to CRM My WhatsApp sharing; recipient targeting, caption placement, ordering, and mixed media still need testing on your phone.</p>
            <p><a href="https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/releases/download/android-crm-pilot-v0.2.0/my-whatsapp-pilot.apk">Download Android CRM pilot APK (0.2.0)</a></p>
            <ol>
                <li>Open the APK on your phone. If prompted, allow your browser or file manager to install unknown apps, then turn that permission off after installation.</li>
                <li>Return to CRM in Android Chrome. Open a property or selected properties and choose My WhatsApp.</li>
                <li>Choose Selected client via Android helper (pilot), enter a consenting test recipient’s number or choose a CRM contact, and select WhatsApp or WhatsApp Business.</li>
                <li>Select photos/videos, a first photo, and/or the PDF. Tap Prepare selected-client pilot, then Open My WhatsApp.</li>
                <li>Review the recipient and files in the helper, then open the WhatsApp preview. Check the exact recipient, every attachment, order, and details before tapping Send. Open the PDF step afterward if selected.</li>
            </ol>
            <p>Test an unsaved number you have never messaged. If WhatsApp asks you to choose a recipient again, opens the wrong chat, or loses files/details, cancel and report the failure. CRM does not mark these shares as sent.</p>
            <p>If the helper does not open, install/update it, return to CRM, cancel the prepared share, and prepare again. The separate phone share-sheet option requires choosing the recipient manually and may not show unsaved numbers.</p>
            <p><a href="/">Return to CRM</a></p>
        </>}
    </section>;
}
