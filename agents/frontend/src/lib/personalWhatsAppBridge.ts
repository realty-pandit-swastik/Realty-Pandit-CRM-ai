import type { PreparedWhatsAppFile } from './personalWhatsAppFiles';

const CHANNEL = 'rp-personal-whatsapp-v1';
export interface PersonalShareResult {
    status: 'pending' | 'sending' | 'sent' | 'partial' | 'uncertain' | 'failed' | 'cancelled';
    results: { key: string; propertyId: string; filename: string; status: 'sent' | 'uncertain'; messageId?: string }[];
    error?: string;
}

interface BridgeReply {
    installed?: boolean;
    version?: string;
    capabilities?: string[];
    ready?: boolean;
    account?: string;
    requestId?: string;
    error?: string;
    status?: PersonalShareResult['status'];
    results?: PersonalShareResult['results'];
}

function bridgeRequest(action: 'status' | 'prepare' | 'result', payload?: unknown, timeoutMs = 45_000): Promise<BridgeReply> {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = window.setTimeout(() => {
            window.removeEventListener('message', receive);
            reject(new Error('The My WhatsApp extension did not respond. Enable it in this browser and reload the CRM. If a review opened, finish or cancel it there.'));
        }, timeoutMs);
        function receive(event: MessageEvent) {
            if (event.source !== window || event.origin !== location.origin || event.data?.channel !== CHANNEL
                || event.data.direction !== 'extension' || event.data.id !== id) return;
            clearTimeout(timer);
            window.removeEventListener('message', receive);
            const reply = event.data.result as BridgeReply;
            if (!reply || reply.error && !reply.status) reject(new Error(reply?.error || 'Invalid extension response.'));
            else resolve(reply);
        }
        window.addEventListener('message', receive);
        window.postMessage({ channel: CHANNEL, direction: 'crm', id, action, payload }, location.origin);
    });
}

export async function personalWhatsAppInstallation(): Promise<{ version: string }> {
    const result = await bridgeRequest('status', { probe: true }, 3000);
    if (!result.installed || !result.version || !result.capabilities?.includes('video-first')) {
        throw new Error('Update the My WhatsApp extension to version 0.2.0 or newer, then reload the CRM.');
    }
    return { version: result.version };
}

export async function personalWhatsAppStatus(): Promise<{ account: string }> {
    await personalWhatsAppInstallation();
    const result = await bridgeRequest('status');
    if (!result.ready || !result.account) throw new Error('Sign in to WhatsApp Web in this browser, then check the connection again.');
    return { account: result.account };
}

export async function preparePersonalWhatsAppShare(recipient: string, files: PreparedWhatsAppFile[]): Promise<string> {
    const result = await bridgeRequest('prepare', { recipient, files });
    if (!result.requestId) throw new Error('Could not open the extension confirmation.');
    return result.requestId;
}

export async function personalWhatsAppResult(requestId: string): Promise<PersonalShareResult> {
    const result = await bridgeRequest('result', { requestId });
    if (!result.status) throw new Error('Could not check this share. Inspect WhatsApp before sending again.');
    return { status: result.status, results: result.results || [], error: result.error };
}
