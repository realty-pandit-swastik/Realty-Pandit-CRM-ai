import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import { toDialablePhone, isValidPhoneInput } from '../lib/phone';
import { buildWhatsAppShareText } from '../lib/buildWhatsAppShareText';
import { propertyAttachments, orderedPropertyAttachments, blobDataUrl, downloadPersonalWhatsAppBlob, EMPTY_ATTACHMENT_SELECTION,
    MAX_PERSONAL_SHARE_BYTES, isAndroidDevice, validatePersonalWhatsAppFile, nativePropertyShareSteps, validateNativeShares,
    type NativePropertyShare, type AttachmentSelection, type PreparedWhatsAppFile } from '../lib/personalWhatsAppFiles';
import { personalWhatsAppStatus, preparePersonalWhatsAppShare, personalWhatsAppResult, type PersonalShareResult } from '../lib/personalWhatsAppBridge';
import { ContactSearchField } from './ContactSearchField';
import PersonalWhatsAppSetup from './PersonalWhatsAppSetup';
import './PersonalWhatsAppShareModal.css';

interface ShareInventory {
    id: string;
    display_id?: string;
    media_urls?: string[];
    video_urls?: string[];
    locality?: string;
    location?: string;
}

interface Props {
    inventoryIds: string[];
    initialPhone?: string | null;
    onClose: () => void;
    onSent?: () => void;
}

export default function PersonalWhatsAppShareModal({ inventoryIds, initialPhone, onClose, onSent }: Props) {
    const idsKey = inventoryIds.join(',');
    const [inventories, setInventories] = useState<ShareInventory[]>([]);
    const [loadedKey, setLoadedKey] = useState('');
    const [loadError, setLoadError] = useState('');
    const [selections, setSelections] = useState<Record<string, AttachmentSelection>>({});
    const [phone, setPhone] = useState(initialPhone || '');
    const [account, setAccount] = useState('');
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');
    const [outcome, setOutcome] = useState<PersonalShareResult | null>(null);
    const [nativeSteps, setNativeSteps] = useState<NativePropertyShare[]>([]);
    const [nativeIndex, setNativeIndex] = useState(0);
    const [handedOff, setHandedOff] = useState(false);
    const android = isAndroidDevice(navigator.userAgent);
    const unsupportedMobile = !android && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const panel = useRef<HTMLDivElement>(null);
    const active = useRef(true);
    const apiBase = client.defaults.baseURL || window.location.origin;

    useEffect(() => {
        let alive = true;
        Promise.all(idsKey.split(',').map(async id => {
            const response = await client.get(`/api/inventory/${encodeURIComponent(id)}`);
            return (response.data?.data ?? response.data) as ShareInventory;
        })).then(items => {
            if (alive) { setInventories(items); setLoadedKey(idsKey); setNativeSteps([]); setNativeIndex(0); setHandedOff(false); }
        }).catch(() => { if (alive) setLoadError('Could not load the selected properties. Close and retry.'); });
        return () => { alive = false; };
    }, [idsKey]);

    useEffect(() => {
        active.current = true;
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.focus();
        return () => { active.current = false; previous?.focus(); };
    }, []);

    const caption = (inv: ShareInventory) => [`Property ID: ${inv.display_id || inv.id}`,
        buildWhatsAppShareText([{ inv, link: '' }], 'dealer')].filter(Boolean).join('\n').replace(/https?:\/\/\S+/gi, '').trim();
    const chosen = inventories.filter(inv => {
        const selection = selections[inv.id];
        return selection && (selection.urls.length > 0 || selection.pdf);
    });

    function update(id: string, selection: AttachmentSelection) {
        setSelections(previous => ({ ...previous, [id]: selection }));
        setError(''); setProgress(''); setNativeSteps([]); setNativeIndex(0); setHandedOff(false);
    }

    async function checkConnection() {
        setChecking(true); setError(''); setAccount('');
        try { setAccount((await personalWhatsAppStatus()).account); }
        catch (err) { setError(err instanceof Error ? err.message : 'Could not check WhatsApp.'); }
        finally { setChecking(false); }
    }

    async function send() {
        const recipient = isValidPhoneInput(phone) ? toDialablePhone(phone) : null;
        if ((!android && !recipient) || !chosen.length) { setError('Choose at least one property photo or video, and a recipient for desktop sharing.'); return; }
        setBusy(true); setError(''); setOutcome(null);
        let handoffStarted = false;
        try {
            if (android) {
                if (!window.isSecureContext || !navigator.share || !navigator.canShare) {
                    throw new Error('This browser cannot share files. Use Android Chrome over HTTPS or desktop Chrome with the extension.');
                }
            } else {
                setProgress('Checking your WhatsApp connection…');
                const connection = await personalWhatsAppStatus();
                setAccount(connection.account);
            }
            const files: PreparedWhatsAppFile[] = [];
            const steps: NativePropertyShare[] = [];
            let total = 0;
            let count = 0;
            async function append(blob: Blob, propertyId: string, filename: string, kind: PreparedWhatsAppFile['kind'], text = '') {
                total += blob.size;
                if (total > MAX_PERSONAL_SHARE_BYTES) throw new Error('Selected attachments exceed 40 MB. Choose fewer files.');
                validatePersonalWhatsAppFile(blob, kind, filename);
                if (++count > 100) throw new Error('Choose no more than 100 attachments per share.');
                if (!android) files.push({ key: `${propertyId}-${files.length}`, propertyId, filename, kind, caption: text, data: await blobDataUrl(blob) });
                return new File([blob], filename, { type: blob.type });
            }
            for (const inv of chosen) {
                const selection = selections[inv.id];
                const ordered = orderedPropertyAttachments(propertyAttachments(inv, apiBase), selection);
                const text = caption(inv);
                if (text.length > 1024) throw new Error('Property details exceed the 1,024-character caption limit. This property needs a shorter share summary.');
                const name = `property-${(inv.display_id || inv.id).replace(/[^a-zA-Z0-9-]/g, '')}`;
                const media: File[] = [];
                let pdf: File | undefined;
                for (let i = 0; i < ordered.length; i++) {
                    const attachment = ordered[i];
                    setProgress(`Preparing ${inv.display_id || 'property'} — ${attachment.label}…`);
                    const response = await fetch(attachment.url, {
                        credentials: new URL(attachment.url).origin === new URL(apiBase).origin ? 'include' : 'omit',
                        signal: AbortSignal.timeout(60_000),
                    });
                    if (!response.ok) throw new Error(`${attachment.label} could not be downloaded. Nothing was sent.`);
                    const blob = await downloadPersonalWhatsAppBlob(response, MAX_PERSONAL_SHARE_BYTES - total);
                    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'bin';
                    media.push(await append(blob, inv.id, `${name}-${i + 1}.${extension}`, attachment.kind, i === 0 ? text : ''));
                }
                if (selection.pdf) {
                    setProgress('Preparing property PDF…');
                    const response = await client.post('/api/inventory/share-pdf', { inventory_ids: [inv.id], variant: 'brandless' }, { responseType: 'blob' });
                    pdf = await append(response.data, inv.id, `${name}-brochure.pdf`, 'document');
                }
                if (android) steps.push(...nativePropertyShareSteps(inv.id, inv.display_id || inv.locality || 'Property', text, media, pdf));
            }
            if (android) {
                validateNativeShares(steps, data => navigator.canShare(data));
                if (!active.current) return;
                setNativeSteps(steps); setNativeIndex(0); setHandedOff(false);
                setProgress('Files ready. Share each property, choosing WhatsApp and the recipient on your phone.');
                return;
            }
            if (!active.current) return;
            handoffStarted = true;
            const requestId = await preparePersonalWhatsAppShare(recipient!, files);
            setProgress('Confirm the sender, recipient, and attachments in the extension review tab.');
            const deadline = Date.now() + 10 * 60 * 1000;
            while (active.current && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                if (!active.current) return;
                const result = await personalWhatsAppResult(requestId);
                if (result.status === 'pending' || result.status === 'sending') {
                    setProgress(result.status === 'sending' ? 'Sending selected attachments through your WhatsApp Web…' : 'Waiting for your confirmation in the extension review tab…');
                    continue;
                }
                setOutcome(result);
                setProgress('');
                if (result.status === 'sent') onSent?.();
                return;
            }
            throw new Error('The share could not be confirmed. Check WhatsApp before starting another share.');
        } catch (err) {
            if (handoffStarted && active.current) setOutcome({ status: 'uncertain', results: [], error: 'Check the extension review tab and WhatsApp before preparing another share.' });
            if (active.current) { setError(err instanceof Error ? err.message : 'Could not share. Check WhatsApp before retrying.'); setProgress(''); }
        } finally { if (active.current) setBusy(false); }
    }

    async function shareNative() {
        const step = nativeSteps[nativeIndex];
        if (!step || busy || loadedKey !== idsKey) return;
        setBusy(true); setError(''); setProgress('');
        try {
            // Prepared files preserve user activation: invoke share before any asynchronous work.
            await navigator.share({ files: step.files, ...(step.text ? { text: step.text } : {}) });
            if (active.current) {
                setHandedOff(true);
                setProgress('Handed to share app. Check WhatsApp and tap Send there. Sending is not confirmed.');
            }
        } catch (err) {
            if (active.current) setProgress(err instanceof Error && err.name === 'AbortError'
                ? 'Sharing cancelled or no share target available. Files remain ready; no sent record was created.'
                : 'Could not hand off these files. Retry, or change the selection and prepare again.');
        } finally { if (active.current) setBusy(false); }
    }

    async function copyDetails(text: string) {
        try { await navigator.clipboard.writeText(text); setProgress('Property details copied. Paste them into WhatsApp if its share preview omits them.'); }
        catch { setError('Could not copy. Select and copy the displayed property details.'); }
    }

    function keyboard(event: React.KeyboardEvent) {
        if (event.key === 'Escape' && !busy) onClose();
        if (event.key !== 'Tab') return;
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    return <div className="personal-wa-overlay" onKeyDown={keyboard}>
        <div className="personal-wa-panel" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="personal-wa-title">
            <div className="personal-wa-heading"><h2 id="personal-wa-title">My WhatsApp — choose attachments</h2>
                <button type="button" onClick={onClose} disabled={busy} aria-label="Close sharing">×</button></div>
            {android ? <p>Prepare selected photos/videos, then choose WhatsApp and the recipient in your phone’s share sheet and tap Send. Each property is shared separately; its PDF is another step. Caption placement and order depend on WhatsApp.</p>
                : unsupportedMobile ? <p role="alert">Use Android Chrome for phone sharing, or desktop Chrome with the My WhatsApp extension.</p>
                    : <><PersonalWhatsAppSetup compact />
                        <button type="button" onClick={checkConnection} disabled={busy || checking}>{checking ? 'Checking…' : 'Check sending account'}</button></>}
            {account && <p>Sending account: +{account.split('@')[0]}</p>}
            <p className="personal-wa-help">Selected files must total at most 40 MB; no more than 100 files per share.</p>
            {loadError && <p role="alert">{loadError}</p>}
            {loadedKey !== idsKey && !loadError && <p role="status">Loading property attachments…</p>}
            <fieldset disabled={busy || !!outcome}>
                <legend>Recipient</legend>
                <label>WhatsApp number (include country code for international numbers)
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" /></label>
                <ContactSearchField label="Or choose a CRM contact" allowCreate={false} onContactSelected={contact => setPhone(contact.sourceId || contact.phone)} />
                {android && <p>This number is a reminder. Select the final recipient inside WhatsApp for every share step.</p>}
                {inventories.map(inv => {
                    const attachments = propertyAttachments(inv, apiBase);
                    const selection = selections[inv.id] || EMPTY_ATTACHMENT_SELECTION;
                    return <section className="personal-wa-property" key={inv.id}>
                        <h3>{inv.display_id || inv.locality || inv.location || 'Property'}</h3>
                        <div className="personal-wa-gallery">{attachments.map(item => <div className="personal-wa-card" key={item.url}>
                            {item.kind === 'image' ? <img src={item.url} alt={item.label} loading="lazy" />
                                : <video src={item.url} controls playsInline preload="metadata" aria-label={item.label} />}
                            <label><input type="checkbox" checked={selection.urls.includes(item.url)} onChange={() => {
                                const urls = selection.urls.includes(item.url) ? selection.urls.filter(url => url !== item.url) : [...selection.urls, item.url];
                                const firstPhoto = urls.includes(selection.firstPhoto) ? selection.firstPhoto : attachments.find(a => a.kind === 'image' && urls.includes(a.url))?.url || '';
                                update(inv.id, { ...selection, urls, firstPhoto });
                            }} />{item.label}</label>
                            {item.kind === 'image' && selection.urls.includes(item.url) && <label><input type="radio" name={`first-${inv.id}`} checked={selection.firstPhoto === item.url}
                                onChange={() => update(inv.id, { ...selection, firstPhoto: item.url })} />First photo with details</label>}
                        </div>)}</div>
                        {!attachments.length && <p>No property media available.</p>}
                        <label><input type="checkbox" checked={selection.pdf} onChange={e => update(inv.id, { ...selection, pdf: e.target.checked })} />Include property PDF</label>
                        {selection.urls.length > 0 || selection.pdf ? <>
                            <h4>{android ? 'Property details supplied as share text' : 'First photo/video caption'}</h4><pre>{caption(inv)}</pre>
                            {android && <button type="button" onClick={() => copyDetails(caption(inv))}>Copy property details</button>}
                            <p>{selection.urls.length} media selected{selection.pdf ? ' + PDF' : ''}. Prepared order: chosen first photo, remaining photos, videos{android ? '; PDF shared separately.' : ', PDF. Video-only details go on the first video.'}</p>
                            {!selection.urls.length && <p role="alert">Choose at least one photo or video.</p>}
                        </> : <p>Select only the photos and videos you want to send.</p>}
                    </section>;
                })}
            </fieldset>
            {error && <p className="personal-wa-error" role="alert">{error}</p>}
            <p role="status" aria-live="polite">{progress}</p>
            {android && loadedKey === idsKey && nativeSteps.length > 0 && <section aria-label="Prepared shares">
                <h3>Step {nativeIndex + 1} of {nativeSteps.length}: {nativeSteps[nativeIndex].label} — {nativeSteps[nativeIndex].kind}</h3>
                {phone && <p>Intended recipient: {phone}. Check this recipient inside WhatsApp.</p>}
                <p>{nativeSteps[nativeIndex].files.length} files ready. No CRM sent record will be created.</p>
                {handedOff && <p>Check the WhatsApp chat before sharing this step again to avoid duplicates.</p>}
                <button type="button" onClick={shareNative} disabled={busy}>{busy ? 'Opening share sheet…' : handedOff ? 'Share this step again' : 'Share to WhatsApp'}</button>{' '}
                {nativeIndex + 1 < nativeSteps.length && <button type="button" disabled={busy || !handedOff} onClick={() => {
                    setNativeIndex(i => i + 1); setHandedOff(false); setProgress('Choose WhatsApp and the recipient again for this step.');
                }}>I checked WhatsApp — next step</button>}
            </section>}
            {outcome && <div role="status">
                <p>{outcome.status === 'sent' ? 'WhatsApp acknowledged all selected attachments. Recipient delivery is not confirmed.'
                    : outcome.status === 'cancelled' ? 'Sharing cancelled. No attachments were sent.' : outcome.error || 'Check WhatsApp before sharing again.'}</p>
                {outcome.results.map(item => <p key={item.key}>{item.filename}: {item.status === 'sent' ? 'acknowledged by WhatsApp' : 'not confirmed'}</p>)}
            </div>}
            <div className="personal-wa-actions"><button type="button" onClick={onClose} disabled={busy}>Close</button>
                <button type="button" onClick={send} disabled={unsupportedMobile || busy || checking || !!outcome || !chosen.length || loadedKey !== idsKey || !!loadError || (android && nativeSteps.length > 0)}>
                    {busy ? 'Preparing / sharing…' : android ? 'Prepare selected attachments' : 'Review and send from my WhatsApp'}</button></div>
        </div>
    </div>;
}
