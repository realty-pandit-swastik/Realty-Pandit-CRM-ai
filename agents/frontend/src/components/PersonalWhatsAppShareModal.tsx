import { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';
import { toDialablePhone, isValidPhoneInput } from '../lib/phone';
import { buildWhatsAppShareText } from '../lib/buildWhatsAppShareText';
import { propertyAttachments, orderedPropertyAttachments, blobDataUrl, downloadPersonalWhatsAppBlob, EMPTY_ATTACHMENT_SELECTION,
    MAX_PERSONAL_SHARE_BYTES, isAndroidDevice, validatePersonalWhatsAppFile, nativePropertyShareSteps, validateNativeShares,
    type NativePropertyShare, type AttachmentSelection, type PreparedWhatsAppFile } from '../lib/personalWhatsAppFiles';
import { personalWhatsAppStatus, preparePersonalWhatsAppShare, personalWhatsAppResult, type PersonalShareResult } from '../lib/personalWhatsAppBridge';
import { androidHandoffPayload, androidHandoffLaunch, validateAndroidHandoff, type AndroidHandoff, type AndroidSendingApp } from '../lib/androidWhatsAppHandoff';
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
    const [androidMode, setAndroidMode] = useState<'helper' | 'manual'>('helper');
    const [sendingApp, setSendingApp] = useState<AndroidSendingApp>('com.whatsapp');
    const [handoff, setHandoff] = useState<AndroidHandoff | null>(null);
    const [pilotState, setPilotState] = useState<'idle' | 'preparing' | 'ready' | 'opened' | 'cancelled' | 'expired' | 'failed'>('idle');
    const handoffRef = useRef<AndroidHandoff | null>(null);
    const preparingRef = useRef(false);
    const generation = useRef(0);
    const preparedFilesRef = useRef<{ key: string; mediaFiles: File[]; pdfFiles: File[] } | null>(null);
    const [isPreloading, setIsPreloading] = useState(false);
    const [preloadedKey, setPreloadedKey] = useState('');
    const prefetchGen = useRef(0);
    const android = isAndroidDevice(navigator.userAgent);
    const unsupportedMobile = !android && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const panel = useRef<HTMLDivElement>(null);
    const active = useRef(true);
    const apiBase = client.defaults.baseURL || window.location.origin;

    const cancelPrepared = useCallback(() => {
        const prepared = handoffRef.current;
        handoffRef.current = null;
        if (prepared) void client.post('/api/personal-whatsapp/handoffs/cancel', { launch_token: prepared.launch_token }).catch(() => {
            if (active.current) setError('Could not confirm cancellation. The previous share may remain usable until it expires.');
        });
    }, []);

    const invalidate = useCallback(() => {
        generation.current++;
        prefetchGen.current++;
        preparedFilesRef.current = null;
        setPreloadedKey('');
        setIsPreloading(false);
        cancelPrepared(); setHandoff(null); setPilotState('idle');
        setNativeSteps([]); setNativeIndex(0); setHandedOff(false); setProgress(''); setError('');
    }, [cancelPrepared]);

    useEffect(() => {
        invalidate(); setLoadedKey(''); setLoadError(''); setInventories([]); setSelections({});
        let alive = true;
        Promise.all(idsKey.split(',').map(async id => {
            const response = await client.get(`/api/inventory/${encodeURIComponent(id)}`);
            return (response.data?.data ?? response.data) as ShareInventory;
        })).then(items => {
            if (alive) { setInventories(items); setLoadedKey(idsKey); setNativeSteps([]); setNativeIndex(0); setHandedOff(false); }
        }).catch(() => { if (alive) setLoadError('Could not load the selected properties. Close and retry.'); });
        return () => { alive = false; };
    }, [idsKey, invalidate]);

    useEffect(() => {
        active.current = true;
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.focus();
        return () => { active.current = false; generation.current++; cancelPrepared(); previous?.focus(); };
    }, [cancelPrepared]);

    const caption = (inv: ShareInventory) => [`Property ID: ${inv.display_id || inv.id}`,
        buildWhatsAppShareText([{ inv, link: '' }], 'dealer')].filter(Boolean).join('\n').replace(/https?:\/\/\S+/gi, '').trim();
    const chosen = inventories.filter(inv => {
        const selection = selections[inv.id];
        return selection && (selection.urls.length > 0 || selection.pdf);
    });

    const selectionKey = inventories.map(inv => {
        const sel = selections[inv.id] || EMPTY_ATTACHMENT_SELECTION;
        return `${inv.id}:${sel.firstPhoto}:${sel.urls.slice().sort().join(',')}:${sel.pdf ? '1' : '0'}`;
    }).join('|');

    const hasMedia = chosen.some(inv => (selections[inv.id]?.urls?.length || 0) > 0);
    const hasPdf = chosen.some(inv => !!selections[inv.id]?.pdf);
    const isPreloaded = preloadedKey === selectionKey && !!preparedFilesRef.current;
    const preloadedMediaCount = isPreloaded ? (preparedFilesRef.current?.mediaFiles.length || 0) : 0;
    const preloadedPdfCount = isPreloaded ? (preparedFilesRef.current?.pdfFiles.length || 0) : 0;

    useEffect(() => {
        if (!inventories.length || !chosen.length) {
            preparedFilesRef.current = null;
            setPreloadedKey('');
            setIsPreloading(false);
            return;
        }

        const currentGen = ++prefetchGen.current;
        const currentKey = selectionKey;

        const timer = window.setTimeout(async () => {
            if (currentGen !== prefetchGen.current || !active.current) return;
            setIsPreloading(true);

            try {
                const mediaFiles: File[] = [];
                const pdfFiles: File[] = [];
                let total = 0;

                for (const inv of chosen) {
                    if (currentGen !== prefetchGen.current || !active.current) return;
                    const selection = selections[inv.id];
                    const ordered = (selection?.urls?.length)
                        ? orderedPropertyAttachments(propertyAttachments(inv, apiBase), selection)
                        : [];
                    const name = `property-${(inv.display_id || inv.id).replace(/[^a-zA-Z0-9-]/g, '')}`;

                    const mediaPromises = ordered.map(async (attachment, i) => {
                        const response = await fetch(attachment.url, {
                            credentials: new URL(attachment.url, window.location.href).origin === new URL(apiBase, window.location.href).origin ? 'include' : 'omit',
                            signal: AbortSignal.timeout(60_000),
                        });
                        if (!response.ok) throw new Error(`${attachment.label} could not be downloaded.`);
                        const blob = await downloadPersonalWhatsAppBlob(response, MAX_PERSONAL_SHARE_BYTES - total);
                        validatePersonalWhatsAppFile(blob, attachment.kind, attachment.label);
                        let fileType = (blob.type || '').split(';')[0].trim().toLowerCase();
                        if (attachment.kind === 'image') {
                            if (!fileType || fileType === 'application/octet-stream' || fileType === 'image/jpg') fileType = 'image/jpeg';
                        } else if (attachment.kind === 'video') {
                            if (!fileType || fileType === 'application/octet-stream') fileType = 'video/mp4';
                        }
                        const ext = fileType.includes('png') ? 'png' : fileType.includes('webp') ? 'webp' : (attachment.kind === 'video' ? 'mp4' : 'jpg');
                        return new File([blob], `${name}-${i + 1}.${ext}`, { type: fileType, lastModified: Date.now() });
                    });

                    const downloaded = await Promise.all(mediaPromises);
                    for (const f of downloaded) {
                        total += f.size;
                        mediaFiles.push(f);
                    }

                    if (selection?.pdf) {
                        if (currentGen !== prefetchGen.current || !active.current) return;
                        const response = await client.post('/api/inventory/share-pdf', { inventory_ids: [inv.id], variant: 'brandless' }, { responseType: 'blob' });
                        const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
                        validatePersonalWhatsAppFile(pdfBlob, 'document', 'brochure.pdf');
                        total += pdfBlob.size;
                        pdfFiles.push(new File([pdfBlob], `${name}-brochure.pdf`, { type: 'application/pdf', lastModified: Date.now() }));
                    }
                }

                if (currentGen === prefetchGen.current && active.current) {
                    preparedFilesRef.current = { key: currentKey, mediaFiles, pdfFiles };
                    setPreloadedKey(currentKey);
                    setIsPreloading(false);
                }
            } catch {
                if (currentGen === prefetchGen.current && active.current) {
                    setIsPreloading(false);
                }
            }
        }, 120);

        return () => window.clearTimeout(timer);
    }, [selectionKey, chosen.length, inventories, selections, apiBase]);

    useEffect(() => {
        if (!handoff) return;
        const timer = window.setTimeout(() => {
            cancelPrepared(); setHandoff(null); setPilotState('expired');
            setProgress('Prepared share expired. Prepare again; nothing was automatically retried.');
        }, Math.max(0, handoff.expires_at - Date.now()));
        return () => window.clearTimeout(timer);
    }, [handoff, cancelPrepared]);

    async function prepareAndroid() {
        if (preparingRef.current || handoffRef.current) return;
        preparingRef.current = true;
        const current = ++generation.current;
        setBusy(true); setError(''); setPilotState('preparing'); setProgress('Preparing your selected recipient and attachments…');
        try {
            const payload = androidHandoffPayload(phone, sendingApp, inventories, selections, apiBase);
            const response = await client.post('/api/personal-whatsapp/handoffs', payload);
            const prepared = validateAndroidHandoff(response.data?.data ?? response.data);
            if (!active.current || generation.current !== current) {
                void client.post('/api/personal-whatsapp/handoffs/cancel', { launch_token: prepared.launch_token }).catch(() => {});
                return;
            }
            handoffRef.current = prepared; setHandoff(prepared); setPilotState('ready');
            setProgress('Ready. Open My WhatsApp to review the selected client and files in the helper. No message has been sent.');
        } catch (err) {
            if (active.current && generation.current === current) {
                setPilotState('failed'); setProgress(''); setError(err instanceof Error ? err.message : 'Could not prepare the share. Prepare again.');
            }
        } finally { preparingRef.current = false; if (active.current) setBusy(false); }
    }

    function update(id: string, selection: AttachmentSelection) {
        invalidate();
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
        if (android && androidMode === 'helper') { await prepareAndroid(); return; }
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

    function sendPropertyDetails() {
        setError('');
        const recipient = toDialablePhone(phone)?.replace(/^\+/, '') || phone.replace(/\D/g, '');
        const cleanPhone = recipient.length === 10 ? '91' + recipient : recipient;
        if (!cleanPhone) {
            setError('Please enter or select a recipient phone number first.');
            return;
        }
        const text = inventories.map(inv => caption(inv)).join('\n\n');
        if (!text) {
            setError('No property details to send.');
            return;
        }
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
        setProgress(`✓ Property details opened in WhatsApp for +${cleanPhone}! Send the text, then tap Button 2 below to share media.`);
    }

    async function doNativeShareMedia(mediaFiles: File[]) {
        if (!window.isSecureContext || !navigator.share) {
            throw new Error('This browser cannot open the share sheet. Please open this CRM in mobile Safari or Chrome over HTTPS.');
        }

        if (!mediaFiles.length) {
            throw new Error('No photos or videos selected to share.');
        }

        if (navigator.canShare && !navigator.canShare({ files: mediaFiles })) {
            throw new Error('This browser cannot share this combination of photos. Try selecting fewer photos.');
        }

        // CRITICAL FOR WHATSAPP MEDIA CAROUSEL:
        // Do NOT pass `title`, `text`, or PDF document files here!
        // When sharing purely image files without title/text, Android Chrome fires an ACTION_SEND_MULTIPLE
        // intent with MIME type "image/*" (or "image/jpeg"). WhatsApp recognizes this as a media intent
        // and opens MediaPreviewActivity — the native photo carousel preview!
        await navigator.share({
            files: mediaFiles,
        });
        setHandedOff(true);
        setProgress(hasPdf
            ? '✓ Photos opened in WhatsApp carousel! Next: tap Step 3 below to share the brochure PDF.'
            : '✓ Photos opened in WhatsApp carousel! Select WhatsApp, tap your contact, and send.');
        onSent?.();
    }

    async function doNativeSharePdf(pdfFiles: File[]) {
        if (!window.isSecureContext || !navigator.share) {
            throw new Error('This browser cannot open the share sheet. Please open this CRM in mobile Safari or Chrome over HTTPS.');
        }

        if (!pdfFiles.length) {
            throw new Error('No PDF brochure available to share.');
        }

        if (navigator.canShare && !navigator.canShare({ files: pdfFiles })) {
            throw new Error('This browser cannot share the PDF brochure.');
        }

        await navigator.share({
            files: pdfFiles,
            title: 'Property Brochure PDF',
        });
        setHandedOff(true);
        setProgress('✓ Brochure PDF opened in Share Sheet! Select WhatsApp and tap your contact.');
        onSent?.();
    }

    async function shareMedia() {
        setError('');
        if (!hasMedia) {
            setError('Select at least one property photo or video.');
            return;
        }

        const currentKey = selectionKey;
        const cached = preparedFilesRef.current;

        // FAST PATH: If media files are already cached in memory, share immediately!
        // No async network delays before navigator.share preserves transient user activation.
        if (cached && cached.key === currentKey && cached.mediaFiles.length > 0) {
            try {
                await doNativeShareMedia(cached.mediaFiles);
            } catch (err: any) {
                if (active.current) {
                    if (err?.name === 'AbortError') {
                        setProgress('Share sheet closed. Photos remain ready to share again.');
                    } else if (err?.name === 'NotAllowedError') {
                        setError('Permission expired or denied. Tap Step 2 again to open the Share Sheet.');
                    } else {
                        setError(err instanceof Error ? err.message : 'Could not open share sheet.');
                    }
                }
            }
            return;
        }

        // SLOW PATH if tapped before background preloading finished:
        setBusy(true);
        setProgress('Preparing selected photos/videos in memory for carousel…');
        try {
            const mediaFiles: File[] = [];
            let total = 0;
            for (const inv of chosen) {
                const selection = selections[inv.id];
                const ordered = (selection?.urls?.length)
                    ? orderedPropertyAttachments(propertyAttachments(inv, apiBase), selection)
                    : [];
                const name = `property-${(inv.display_id || inv.id).replace(/[^a-zA-Z0-9-]/g, '')}`;
                for (let i = 0; i < ordered.length; i++) {
                    const attachment = ordered[i];
                    setProgress(`Downloading ${attachment.label}…`);
                    const response = await fetch(attachment.url, {
                        credentials: new URL(attachment.url, window.location.href).origin === new URL(apiBase, window.location.href).origin ? 'include' : 'omit',
                        signal: AbortSignal.timeout(60_000),
                    });
                    if (!response.ok) throw new Error(`${attachment.label} could not be downloaded.`);
                    const blob = await downloadPersonalWhatsAppBlob(response, MAX_PERSONAL_SHARE_BYTES - total);
                    total += blob.size;
                    validatePersonalWhatsAppFile(blob, attachment.kind, attachment.label);
                    let fileType = (blob.type || '').split(';')[0].trim().toLowerCase();
                    if (attachment.kind === 'image') {
                        if (!fileType || fileType === 'application/octet-stream' || fileType === 'image/jpg') fileType = 'image/jpeg';
                    } else if (attachment.kind === 'video') {
                        if (!fileType || fileType === 'application/octet-stream') fileType = 'video/mp4';
                    }
                    const ext = fileType.includes('png') ? 'png' : fileType.includes('webp') ? 'webp' : (attachment.kind === 'video' ? 'mp4' : 'jpg');
                    mediaFiles.push(new File([blob], `${name}-${i + 1}.${ext}`, { type: fileType, lastModified: Date.now() }));
                }
            }
            if (!mediaFiles.length) {
                throw new Error('Select at least one photo or video to share.');
            }

            if (preparedFilesRef.current?.key === currentKey) {
                preparedFilesRef.current.mediaFiles = mediaFiles;
            } else {
                preparedFilesRef.current = { key: currentKey, mediaFiles, pdfFiles: [] };
            }
            setPreloadedKey(currentKey);

            await doNativeShareMedia(mediaFiles);
        } catch (err: any) {
            if (active.current) {
                if (err?.name === 'AbortError') {
                    setProgress('Share sheet closed. Photos remain ready to share.');
                } else if (err?.name === 'NotAllowedError') {
                    setProgress('⚡ Photos are ready in memory! Tap Step 2 to open the Share Sheet now.');
                } else {
                    setError(err instanceof Error ? err.message : 'Could not share photos.');
                    setProgress('');
                }
            }
        } finally {
            if (active.current) setBusy(false);
        }
    }

    async function sharePdf() {
        setError('');
        if (!hasPdf) {
            setError('No property brochure PDF selected.');
            return;
        }

        const currentKey = selectionKey;
        const cached = preparedFilesRef.current;

        // FAST PATH:
        if (cached && cached.key === currentKey && cached.pdfFiles.length > 0) {
            try {
                await doNativeSharePdf(cached.pdfFiles);
            } catch (err: any) {
                if (active.current) {
                    if (err?.name === 'AbortError') {
                        setProgress('Share sheet closed. PDF remains ready to share again.');
                    } else if (err?.name === 'NotAllowedError') {
                        setError('Permission expired or denied. Tap to open the Share Sheet again.');
                    } else {
                        setError(err instanceof Error ? err.message : 'Could not open share sheet for PDF.');
                    }
                }
            }
            return;
        }

        // SLOW PATH:
        setBusy(true);
        setProgress('Generating property brochure PDF…');
        try {
            const pdfFiles: File[] = [];
            for (const inv of chosen) {
                const selection = selections[inv.id];
                if (!selection?.pdf) continue;
                const name = `property-${(inv.display_id || inv.id).replace(/[^a-zA-Z0-9-]/g, '')}`;
                const response = await client.post('/api/inventory/share-pdf', { inventory_ids: [inv.id], variant: 'brandless' }, { responseType: 'blob' });
                const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
                validatePersonalWhatsAppFile(pdfBlob, 'document', 'brochure.pdf');
                pdfFiles.push(new File([pdfBlob], `${name}-brochure.pdf`, { type: 'application/pdf', lastModified: Date.now() }));
            }
            if (!pdfFiles.length) {
                throw new Error('Could not generate property PDF.');
            }

            if (preparedFilesRef.current?.key === currentKey) {
                preparedFilesRef.current.pdfFiles = pdfFiles;
            } else {
                preparedFilesRef.current = { key: currentKey, mediaFiles: [], pdfFiles };
            }
            setPreloadedKey(currentKey);

            await doNativeSharePdf(pdfFiles);
        } catch (err: any) {
            if (active.current) {
                if (err?.name === 'AbortError') {
                    setProgress('Share sheet closed. PDF remains ready to share.');
                } else if (err?.name === 'NotAllowedError') {
                    setProgress('⚡ PDF is ready in memory! Tap to open the Share Sheet now.');
                } else {
                    setError(err instanceof Error ? err.message : 'Could not share PDF.');
                    setProgress('');
                }
            }
        } finally {
            if (active.current) setBusy(false);
        }
    }

    function keyboard(event: React.KeyboardEvent) {
        if (event.key === 'Escape' && !busy) onClose();
        if (event.key !== 'Tab') return;
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    return <div className="personal-wa-overlay" onKeyDown={keyboard}>
        <div className="personal-wa-panel" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="personal-wa-title">
            <div className="personal-wa-heading"><h2 id="personal-wa-title">My WhatsApp — choose attachments</h2>
                <button type="button" onClick={onClose} disabled={busy} aria-label="Close sharing">×</button></div>
            {android ? <><p><strong>Android selected-client pilot — phone compatibility unverified.</strong> The helper attempts to open the selected number, including unsaved/new recipients. Review the recipient, attachments, order, and details before tapping Send in WhatsApp. Media and PDF are separate steps; sending is never confirmed by CRM.</p>
                <p><a href="/my-whatsapp-setup" target="_blank" rel="noreferrer">Install / update the Android helper</a></p>
                <fieldset disabled={busy}><legend>Android sharing method</legend>
                    <label><input type="radio" name="android-mode" checked={androidMode === 'helper'} onChange={() => { invalidate(); setAndroidMode('helper'); }} />Selected client via Android helper (pilot)</label>{' '}
                    <label><input type="radio" name="android-mode" checked={androidMode === 'manual'} onChange={() => { invalidate(); setAndroidMode('manual'); }} />Phone share sheet — choose recipient manually</label>
                </fieldset>
                {androidMode === 'manual' && <p>Prepare selected photos/videos, then choose WhatsApp and the recipient in your phone’s share sheet and tap Send. Each property is shared separately; its PDF is another step. Caption placement and order depend on WhatsApp. Unsaved recipients may not appear.</p>}</>
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
                    <input type="tel" value={phone} onChange={e => { invalidate(); setPhone(e.target.value); }} placeholder="Phone number" /></label>
                <ContactSearchField label="Or choose a CRM contact" allowCreate={false} onContactSelected={contact => { invalidate(); setPhone(contact.phone || contact.sourceId || ''); }} />
                {android && androidMode === 'manual' && <p>This number is a reminder. Select the final recipient inside WhatsApp for every share step.</p>}
                {android && androidMode === 'helper' && <><p>The selected number is passed to the helper. Check the final WhatsApp preview before sending.</p>
                    <label>Sending app <select value={sendingApp} onChange={e => { invalidate(); setSendingApp(e.target.value as AndroidSendingApp); }}>
                        <option value="com.whatsapp">WhatsApp</option><option value="com.whatsapp.w4b">WhatsApp Business</option>
                    </select></label></>}

                {/* WhatsApp Direct Sharing Flow */}
                <div style={{ backgroundColor: 'var(--bg-secondary)', border: '2px solid #25D366', borderRadius: '12px', padding: '16px', margin: '16px 0' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#25D366', marginBottom: '6px' }}>
                        ⚡ WhatsApp Sharing Flow
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        {hasMedia && hasPdf
                            ? 'Step 1 sends property details via WhatsApp. Step 2 opens the native WhatsApp photo carousel (sent as inline images). Step 3 shares the brochure PDF.'
                            : hasMedia
                                ? 'Step 1 sends property details via WhatsApp. Step 2 opens the Android Share Sheet to share photos directly into the WhatsApp carousel (inline images in chat).'
                                : 'Step 1 sends property details via WhatsApp. Step 2 opens the Share Sheet to send the brochure PDF document.'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={sendPropertyDetails}
                            disabled={busy}
                            style={{
                                padding: '12px 16px', borderRadius: '8px', border: 'none',
                                backgroundColor: '#25D366', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'center'
                            }}
                        >
                            1️⃣ Step 1: Send Details (WhatsApp)
                        </button>
                        {hasMedia && (
                            <button
                                type="button"
                                onClick={shareMedia}
                                disabled={busy || (!preloadedMediaCount && isPreloading)}
                                style={{
                                    padding: '12px 16px', borderRadius: '8px', border: 'none',
                                    backgroundColor: isPreloaded && preloadedMediaCount > 0 ? '#059669' : '#128c7e', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'center',
                                    boxShadow: isPreloaded && preloadedMediaCount > 0 ? '0 0 10px rgba(5, 150, 105, 0.4)' : undefined,
                                }}
                            >
                                {isPreloaded && preloadedMediaCount > 0
                                    ? `2️⃣ Step 2: Share Photos (Carousel) (${preloadedMediaCount} Ready) ⚡`
                                    : isPreloading
                                        ? '⏳ Preparing photos in background…'
                                        : '2️⃣ Step 2: Share Photos (Carousel)'}
                            </button>
                        )}
                        {hasPdf && (
                            <button
                                type="button"
                                onClick={sharePdf}
                                disabled={busy || (!preloadedPdfCount && isPreloading)}
                                style={{
                                    padding: '12px 16px', borderRadius: '8px', border: 'none',
                                    backgroundColor: isPreloaded && preloadedPdfCount > 0 ? '#0284c7' : '#0369a1', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'center',
                                    boxShadow: isPreloaded && preloadedPdfCount > 0 ? '0 0 10px rgba(2, 132, 199, 0.4)' : undefined,
                                }}
                            >
                                {hasMedia ? (
                                    isPreloaded && preloadedPdfCount > 0
                                        ? `3️⃣ Step 3: Share Brochure PDF (Document) ⚡`
                                        : isPreloading
                                            ? '⏳ Preparing PDF brochure…'
                                            : '3️⃣ Step 3: Share Brochure PDF (Document)'
                                ) : (
                                    isPreloaded && preloadedPdfCount > 0
                                        ? `2️⃣ Step 2: Share Brochure PDF (Document) ⚡`
                                        : isPreloading
                                            ? '⏳ Preparing PDF brochure…'
                                            : '2️⃣ Step 2: Share Brochure PDF (Document)'
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {inventories.map(inv => {
                    const attachments = propertyAttachments(inv, apiBase);
                    const selection = selections[inv.id] || EMPTY_ATTACHMENT_SELECTION;
                    return <section className="personal-wa-property" key={inv.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <h3>{inv.display_id || inv.locality || inv.location || 'Property'}</h3>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button type="button" onClick={() => update(inv.id, { urls: attachments.map(a => a.url), firstPhoto: attachments.find(a => a.kind === 'image')?.url || '', pdf: selection.pdf })} style={{ fontSize: '11px', padding: '4px 8px' }}>Select All Photos</button>
                                <button type="button" onClick={() => update(inv.id, EMPTY_ATTACHMENT_SELECTION)} style={{ fontSize: '11px', padding: '4px 8px' }}>Deselect All</button>
                            </div>
                        </div>
                        <div className="personal-wa-gallery">{attachments.map(item => {
                            const thumbUrl = item.kind === 'image'
                                ? item.url.replace(/(\.[^.]+)$/, '_thumb$1')
                                : item.url;
                            return <div className="personal-wa-card" key={item.url}>
                                {item.kind === 'image' ? (
                                    <img
                                        src={thumbUrl}
                                        alt={item.label}
                                        loading="lazy"
                                        crossOrigin="anonymous"
                                        onError={(e) => {
                                            const img = e.currentTarget;
                                            if (!img.dataset.triedOriginal) {
                                                img.dataset.triedOriginal = '1';
                                                img.src = item.url;
                                            } else if (!img.dataset.triedRelative) {
                                                img.dataset.triedRelative = '1';
                                                try {
                                                    const parsed = new URL(item.url);
                                                    img.src = parsed.pathname + parsed.search;
                                                } catch {
                                                    // no-op
                                                }
                                            }
                                        }}
                                    />
                                ) : (
                                    <video src={item.url} controls playsInline preload="metadata" aria-label={item.label} />
                                )}
                                <label><input type="checkbox" checked={selection.urls.includes(item.url)} onChange={() => {
                                    const urls = selection.urls.includes(item.url) ? selection.urls.filter(url => url !== item.url) : [...selection.urls, item.url];
                                    const firstPhoto = urls.includes(selection.firstPhoto) ? selection.firstPhoto : attachments.find(a => a.kind === 'image' && urls.includes(a.url))?.url || '';
                                    update(inv.id, { ...selection, urls, firstPhoto });
                                }} />{item.label}</label>
                                {item.kind === 'image' && selection.urls.includes(item.url) && <label><input type="radio" name={`first-${inv.id}`} checked={selection.firstPhoto === item.url}
                                    onChange={() => update(inv.id, { ...selection, firstPhoto: item.url })} />First photo with details</label>}
                            </div>;
                        })}</div>
                        {!attachments.length && <p>No property media available.</p>}
                        <label><input type="checkbox" checked={selection.pdf} onChange={e => update(inv.id, { ...selection, pdf: e.target.checked })} />Include property PDF</label>
                        {selection.urls.length > 0 || selection.pdf ? <>
                            <h4>{android ? 'Property details supplied as share text' : 'First photo/video caption'}</h4><pre>{caption(inv)}</pre>
                            {android && <button type="button" onClick={() => copyDetails(caption(inv))}>Copy property details</button>}
                            <p>{selection.urls.length} media selected{selection.pdf ? ' + PDF' : ''}. Prepared order: chosen first photo, remaining photos, videos{android ? '; PDF shared separately.' : ', PDF. Video-only details go on the first video.'}</p>
                            {!selection.urls.length && !(android && androidMode === 'helper') && <p role="alert">Choose at least one photo or video.</p>}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '12px' }}>
                                <button
                                    type="button"
                                    onClick={sendPropertyDetails}
                                    disabled={busy}
                                    style={{
                                        padding: '10px 14px', borderRadius: '8px', border: 'none',
                                        backgroundColor: '#25D366', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', textAlign: 'center'
                                    }}
                                >
                                    1️⃣ Step 1: Send Details (WhatsApp)
                                </button>
                                {hasMedia && (
                                    <button
                                        type="button"
                                        onClick={shareMedia}
                                        disabled={busy || (!preloadedMediaCount && isPreloading)}
                                        style={{
                                            padding: '10px 14px', borderRadius: '8px', border: 'none',
                                            backgroundColor: isPreloaded && preloadedMediaCount > 0 ? '#059669' : '#128c7e', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'center',
                                        }}
                                    >
                                        {isPreloaded && preloadedMediaCount > 0
                                            ? `2️⃣ Step 2: Share Photos (Carousel) (${preloadedMediaCount} Ready) ⚡`
                                            : isPreloading
                                                ? '⏳ Preparing photos…'
                                                : '2️⃣ Step 2: Share Photos (Carousel)'}
                                    </button>
                                )}
                                {hasPdf && (
                                    <button
                                        type="button"
                                        onClick={sharePdf}
                                        disabled={busy || (!preloadedPdfCount && isPreloading)}
                                        style={{
                                            padding: '10px 14px', borderRadius: '8px', border: 'none',
                                            backgroundColor: isPreloaded && preloadedPdfCount > 0 ? '#0284c7' : '#0369a1', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'center',
                                        }}
                                    >
                                        {hasMedia ? (
                                            isPreloaded && preloadedPdfCount > 0
                                                ? `3️⃣ Step 3: Share Brochure PDF (Document) ⚡`
                                                : isPreloading
                                                    ? '⏳ Preparing PDF…'
                                                    : '3️⃣ Step 3: Share Brochure PDF (Document)'
                                        ) : (
                                            isPreloaded && preloadedPdfCount > 0
                                                ? `2️⃣ Step 2: Share Brochure PDF (Document) ⚡`
                                                : isPreloading
                                                    ? '⏳ Preparing PDF…'
                                                    : '2️⃣ Step 2: Share Brochure PDF (Document)'
                                        )}
                                    </button>
                                )}
                            </div>
                        </> : <p>Select only the photos and videos you want to send.</p>}
                    </section>;
                })}
            </fieldset>
            {error && <p className="personal-wa-error" role="alert">{error}</p>}
            <p role="status" aria-live="polite">{progress}</p>
            {android && androidMode === 'manual' && loadedKey === idsKey && nativeSteps.length > 0 && <section aria-label="Prepared shares">
                <h3>Step {nativeIndex + 1} of {nativeSteps.length}: {nativeSteps[nativeIndex].label} — {nativeSteps[nativeIndex].kind}</h3>
                {phone && <p>Intended recipient: {phone}. Check this recipient inside WhatsApp.</p>}
                <p>{nativeSteps[nativeIndex].files.length} files ready. No CRM sent record will be created.</p>
                {handedOff && <p>Check the WhatsApp chat before sharing this step again to avoid duplicates.</p>}
                <button type="button" onClick={shareNative} disabled={busy}>{busy ? 'Opening share sheet…' : handedOff ? 'Share this step again' : 'Share to WhatsApp'}</button>{' '}
                {nativeIndex + 1 < nativeSteps.length && <button type="button" disabled={busy || !handedOff} onClick={() => {
                    setNativeIndex(i => i + 1); setHandedOff(false); setProgress('Choose WhatsApp and the recipient again for this step.');
                }}>I checked WhatsApp — next step</button>}
            </section>}
            {android && androidMode === 'helper' && <section aria-label="Android pilot share">
                <p>Pilot status: {pilotState}. No CRM sent record will be created.</p>
                {handoff && <><p>Recipient: {phone}. App: {sendingApp === 'com.whatsapp' ? 'WhatsApp' : 'WhatsApp Business'}. Expires at {new Date(handoff.expires_at).toLocaleTimeString()}.</p>
                    <button type="button" disabled={pilotState === 'opened'} onClick={() => {
                        if (Date.now() >= handoff.expires_at) { invalidate(); setPilotState('expired'); setProgress('Prepared share expired. Prepare again.'); return; }
                        setPilotState('opened'); setProgress('Helper launch requested. Check your phone; CRM cannot confirm the app opened or that anything was sent.');
                        // Keep capabilities out of DOM links and click breadcrumbs; launch synchronously from this user gesture.
                        window.location.assign(androidHandoffLaunch(handoff.launch_token, navigator.userAgent));
                    }}>{pilotState === 'opened' ? 'Launch requested — check your phone' : 'Open My WhatsApp'}</button>{' '}
                    <button type="button" onClick={() => { invalidate(); setPilotState('cancelled'); setProgress('Prepared share cancelled. Any WhatsApp preview already open must be closed on your phone.'); }}>Cancel prepared share</button>
                    {pilotState === 'opened' && <p>If the helper did not open, install/update it from setup, then cancel this share and prepare again. App installation cannot be detected reliably.</p>}
                </>}
            </section>}
            {outcome && <div role="status">
                <p>{outcome.status === 'sent' ? 'WhatsApp acknowledged all selected attachments. Recipient delivery is not confirmed.'
                    : outcome.status === 'cancelled' ? 'Sharing cancelled. No attachments were sent.' : outcome.error || 'Check WhatsApp before sharing again.'}</p>
                {outcome.results.map(item => <p key={item.key}>{item.filename}: {item.status === 'sent' ? 'acknowledged by WhatsApp' : 'not confirmed'}</p>)}
            </div>}
            <div className="personal-wa-actions">
                <button type="button" onClick={onClose} disabled={busy} className="btn-close">Close</button>
                {android && androidMode === 'helper' && (
                    <button type="button" onClick={send} className="btn-pilot" disabled={unsupportedMobile || busy || checking || !!outcome || !chosen.length || loadedKey !== idsKey || !!loadError || (android && (androidMode === 'helper' ? !!handoff : nativeSteps.length > 0))}>
                        {busy ? 'Preparing / sharing…' : 'Prepare selected-client pilot'}
                    </button>
                )}
            </div>
        </div>
    </div>;
}
