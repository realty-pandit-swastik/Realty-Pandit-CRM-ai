export interface PropertyAttachment {
    url: string;
    kind: 'image' | 'video';
    label: string;
}

export interface AttachmentSelection {
    urls: string[];
    firstPhoto: string;
    pdf: boolean;
}

export interface PreparedWhatsAppFile {
    key: string;
    propertyId: string;
    filename: string;
    kind: 'image' | 'video' | 'document';
    caption: string;
    data: string;
}

export const MAX_PERSONAL_SHARE_BYTES = 40 * 1024 * 1024;
export const EMPTY_ATTACHMENT_SELECTION: AttachmentSelection = { urls: [], firstPhoto: '', pdf: false };

export async function downloadPersonalWhatsAppBlob(response: Response, remainingBytes: number): Promise<Blob> {
    const tooLarge = () => new Error('Selected attachments exceed 40 MB. Choose fewer or smaller files.');
    if (Number(response.headers.get('content-length')) > remainingBytes) {
        await response.body?.cancel();
        throw tooLarge();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The attachment download had no content. Nothing was sent.');
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > remainingBytes) { await reader.cancel(); throw tooLarge(); }
            chunks.push(value.slice().buffer);
        }
    } finally { reader.releaseLock(); }
    return new Blob(chunks, { type: (response.headers.get('content-type') || '').split(';')[0].trim() });
}

export function propertyAttachments(property: { media_urls?: string[]; video_urls?: string[] }, baseUrl: string): PropertyAttachment[] {
    const video = (url: string) => /\.(mp4|mov|webm|avi|mkv|m4v|3gp)(?:[?#]|$)/i.test(url);
    const resolve = (path: string) => new URL(path.startsWith('http') ? path : `/${path.replace(/^\//, '')}`, baseUrl).href;
    const photos = [...new Set((property.media_urls || []).filter(url => !video(url)).map(resolve))];
    const videos = [...new Set([...(property.video_urls || []), ...(property.media_urls || []).filter(video)].map(resolve))];
    return [...photos.map((url, i) => ({ url, kind: 'image' as const, label: `Photo ${i + 1}` })),
        ...videos.map((url, i) => ({ url, kind: 'video' as const, label: `Video ${i + 1}` }))];
}

export function orderedPropertyAttachments(attachments: PropertyAttachment[], selection: AttachmentSelection): PropertyAttachment[] {
    const chosen = attachments.filter(a => selection.urls.includes(a.url));
    if (!chosen.length) throw new Error('Select at least one photo or video for each property.');
    if (!chosen.some(a => a.kind === 'image')) return chosen;
    const cover = chosen.find(a => a.url === selection.firstPhoto && a.kind === 'image');
    if (!cover) throw new Error('Select a first photo for each property you want to share.');
    return [cover, ...chosen.filter(a => a.kind === 'image' && a !== cover), ...chosen.filter(a => a.kind === 'video')];
}

export function isAndroidDevice(userAgent: string): boolean {
    return /Android/i.test(userAgent);
}

export interface NativePropertyShare {
    propertyId: string;
    label: string;
    text: string;
    files: File[];
    kind: 'media' | 'pdf';
}

export function validatePersonalWhatsAppFile(blob: Blob, kind: PreparedWhatsAppFile['kind'], filename: string): void {
    const types = { image: /^image\/(jpeg|png|webp|gif|avif)$/, video: /^video\/(mp4|webm|quicktime)$/, document: /^application\/pdf$/ };
    if (!blob.size || !types[kind].test(blob.type)) throw new Error(`${filename} is not a supported ${kind} file. Nothing was sent.`);
}

export function nativePropertyShareSteps(propertyId: string, label: string, text: string, media: File[], pdf?: File): NativePropertyShare[] {
    if (!media.length) throw new Error('Select at least one photo or video for each property.');
    return [{ propertyId, label, text, files: media, kind: 'media' },
        ...(pdf ? [{ propertyId, label, text: '', files: [pdf], kind: 'pdf' as const }] : [])];
}

export function validateNativeShares(steps: NativePropertyShare[], canShare: (data: ShareData) => boolean): void {
    for (const step of steps) {
        if (!canShare({ files: step.files, ...(step.text ? { text: step.text } : {}) })) {
            throw new Error(`This browser cannot share ${step.label}'s ${step.kind === 'pdf' ? 'PDF' : 'selected media'}. Choose fewer files or use desktop Chrome.`);
        }
    }
}

export function blobDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not prepare this attachment.'));
        reader.readAsDataURL(blob);
    });
}
