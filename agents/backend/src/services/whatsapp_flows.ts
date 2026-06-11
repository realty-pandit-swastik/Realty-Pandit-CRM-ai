import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

const GRAPH_BASE = 'https://graph.facebook.com/v25.0';
const WABA_ID = process.env.WABA_ID ?? '2124684824933246';
const token = () => process.env.WHATSAPP_TOKEN!;

// Read private key from env — stored with | as newline separator to avoid .env multiline issues
const privateKey = () => (process.env.FLOW_PRIVATE_KEY ?? '').replace(/\|/g, '\n');

export async function createFlow(name: string, categories: string[]): Promise<string> {
    const resp = await axios.post(
        `${GRAPH_BASE}/${WABA_ID}/flows`,
        { name, categories },
        { headers: { Authorization: `Bearer ${token()}` } },
    );
    return resp.data.id as string;
}

export async function uploadFlowJson(flowId: string, flowJson: object): Promise<void> {
    const boundary = `----FormBoundary${Date.now()}`;
    const jsonStr = JSON.stringify(flowJson);
    const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="flow.json"',
        'Content-Type: application/json',
        '',
        jsonStr,
        `--${boundary}`,
        'Content-Disposition: form-data; name="name"',
        '',
        'flow.json',
        `--${boundary}`,
        'Content-Disposition: form-data; name="asset_type"',
        '',
        'FLOW_JSON',
        `--${boundary}--`,
    ].join('\r\n');

    await axios.post(`${GRAPH_BASE}/${flowId}/assets`, body, {
        headers: {
            Authorization: `Bearer ${token()}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
    });
}

export async function publishFlow(flowId: string): Promise<void> {
    await axios.post(
        `${GRAPH_BASE}/${flowId}/publish`,
        {},
        { headers: { Authorization: `Bearer ${token()}` } },
    );
}

export interface DecryptedFlowRequest {
    screen: string;
    data: Record<string, any>;
    version: string;
    action: string;
    flow_token?: string;
    aesKey: Buffer;
    iv: Buffer;
}

export function decryptFlowRequest(
    encryptedFlowData: string,
    encryptedAesKey: string,
    initialVector: string,
): DecryptedFlowRequest {
    const pk = privateKey();
    if (!pk) throw new Error('FLOW_PRIVATE_KEY not configured');

    const aesKey = crypto.privateDecrypt(
        { key: pk, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(encryptedAesKey, 'base64'),
    );
    const iv = Buffer.from(initialVector, 'base64');
    const bodyBuf = Buffer.from(encryptedFlowData, 'base64');
    const TAG_LEN = 16;
    const tag = bodyBuf.subarray(-TAG_LEN);
    const ciphertext = bodyBuf.subarray(0, -TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const body = JSON.parse(decrypted.toString());
    return { ...body, aesKey, iv };
}

export function encryptFlowResponse(
    responseData: any,
    aesKey: Buffer,
    iv: Buffer,
): string {
    const flippedIv = Buffer.from(iv.map(b => ~b & 0xff));
    const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(responseData), 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([encrypted, tag]).toString('base64');
}
