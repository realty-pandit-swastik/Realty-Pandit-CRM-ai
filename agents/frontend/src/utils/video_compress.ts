/**
 * Browser-side video compression (2026-08-11).
 *
 * Phones shoot 4K by default — roughly 350–400 MB per minute — so a property walkthrough blows past
 * any sane upload limit within seconds. Cloudflare Free also rejects request bodies over 100 MB at
 * the edge, which we cannot raise. Rather than tell staff to change their camera settings, we
 * re-encode in the browser before uploading: downscale to 1080p and cap the bitrate, which turns a
 * ~320 MB clip into roughly 40 MB.
 *
 * Encoding uses **WebCodecs** (`VideoEncoder` / `AudioEncoder`), which is hardware-accelerated and
 * therefore faster than real time. Decoding is delegated to the browser:
 *   - video via a <video> element played at 4× into a canvas (it already demuxes every format we
 *     accept, so we do not ship a demuxer as well as a muxer);
 *   - audio via `AudioContext.decodeAudioData`, which decodes the whole track in one go and is NOT
 *     real-time bound — so keeping narration costs us nothing in speed. Reading audio off the
 *     accelerated <video> would have pitched it 4× faster.
 *
 * 🔴 Feature-detected. Every current user is on Chrome 150/151 or Edge 151 (verified in the access
 * log), where WebCodecs has been stable since Chrome 94. If a Safari/Firefox user appears,
 * `isCompressionSupported()` returns false and the caller falls back to asking them to record at
 * 1080p — we must never silently upload a 350 MB file the edge will reject.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const MAX_EDGE = 1920;          // longest output edge — 1080p is plenty for a walkthrough
const VIDEO_BITRATE = 4_000_000;
const AUDIO_BITRATE = 128_000;
const OUTPUT_FPS = 30;
const PLAYBACK_RATE = 4;        // decode faster than real time

export interface CompressProgress {
    percent: number;            // 0–100
    stage: 'preparing' | 'encoding' | 'finishing';
}

export function isCompressionSupported(): boolean {
    return typeof window !== 'undefined'
        && typeof (window as any).VideoEncoder === 'function'
        && typeof (window as any).VideoFrame === 'function'
        && typeof HTMLVideoElement !== 'undefined'
        && typeof (HTMLVideoElement.prototype as any).requestVideoFrameCallback === 'function';
}

/** Fit inside MAX_EDGE keeping aspect ratio; both dimensions must be even for H.264. */
function targetSize(w: number, h: number): { width: number; height: number } {
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    return { width: even(w), height: even(h) };
}

/**
 * Decode the file's audio track and feed it to an AudioEncoder.
 * Returns false when the file has no audio (or audio cannot be decoded) — video-only output is
 * still perfectly valid, so this never fails the whole compression.
 */
async function encodeAudio(
    file: File,
    muxer: any,
    addConfig: (sampleRate: number, channels: number) => void,
    onCodec: (c: 'aac' | 'opus') => void,
): Promise<boolean> {
    if (typeof (window as any).AudioEncoder !== 'function') return false;
    let ctx: AudioContext | null = null;
    try {
        ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        if (!decoded || decoded.length === 0) return false;

        const channels = Math.min(2, decoded.numberOfChannels);
        const sampleRate = decoded.sampleRate;
        addConfig(sampleRate, channels);

        // 🔴 Negotiate the audio codec. AAC encoding is a proprietary codec that some Chromium
        // builds ship without — AudioEncoder.isConfigSupported({codec:'mp4a.40.2'}) returns false on
        // them (confirmed in the Playwright build during testing), even though DECODING works fine.
        // Opus is the royalty-free fallback and mp4-muxer can carry it in MP4. If neither is
        // available we return false and the video ships without sound, which still beats an upload
        // the user cannot make at all.
        let audioCodec = '';
        let muxCodec: 'aac' | 'opus' = 'aac';
        for (const [enc, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as const) {
            try {
                const { supported } = await (window as any).AudioEncoder.isConfigSupported({
                    codec: enc, sampleRate, numberOfChannels: channels, bitrate: AUDIO_BITRATE,
                });
                if (supported) { audioCodec = enc; muxCodec = mux; break; }
            } catch { /* try the next */ }
        }
        if (!audioCodec) return false;
        onCodec(muxCodec);

        const encoder = new (window as any).AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: () => { /* audio is best-effort; video still ships */ },
        });
        encoder.configure({ codec: audioCodec, sampleRate, numberOfChannels: channels, bitrate: AUDIO_BITRATE });

        // Interleave into the planar->packed layout AudioData expects, in ~1s slices.
        const CHUNK = sampleRate;
        for (let offset = 0; offset < decoded.length; offset += CHUNK) {
            const count = Math.min(CHUNK, decoded.length - offset);
            const interleaved = new Float32Array(count * channels);
            for (let c = 0; c < channels; c++) {
                const src = decoded.getChannelData(c);
                for (let i = 0; i < count; i++) interleaved[i * channels + c] = src[offset + i];
            }
            const data = new (window as any).AudioData({
                format: 'f32',
                sampleRate,
                numberOfFrames: count,
                numberOfChannels: channels,
                timestamp: Math.round((offset / sampleRate) * 1e6),
                data: interleaved,
            });
            encoder.encode(data);
            data.close();
        }
        await encoder.flush();
        encoder.close();
        return true;
    } catch {
        return false;   // no audio track, or the browser refused to decode it
    } finally {
        try { await ctx?.close(); } catch { /* ignore */ }
    }
}

/**
 * Re-encode `file` to a smaller H.264 mp4.
 * Resolves to a new File, or the ORIGINAL when compression is unsupported, fails, or would not help.
 */
export async function compressVideo(
    file: File,
    onProgress?: (p: CompressProgress) => void,
): Promise<File> {
    if (!isCompressionSupported()) return file;

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;             // required for programmatic play()
    video.playsInline = true;
    video.src = url;

    try {
        onProgress?.({ percent: 0, stage: 'preparing' });
        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('This video could not be read by the browser.'));
        });

        const { width, height } = targetSize(video.videoWidth, video.videoHeight);
        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) return file;

        // The muxer needs its audio config up front, so audio is encoded first — it is fast
        // (decodeAudioData is not real-time) and tells us whether there is a track at all.
        let audioCfg: { sampleRate: number; channels: number } | null = null;
        const pending: any[] = [];
        const probeMuxer = {
            addAudioChunk: (c: any, m: any) => pending.push([c, m]),
        };
        let audioMuxCodec: 'aac' | 'opus' = 'aac';
        const hasAudio = await encodeAudio(
            file, probeMuxer,
            (sampleRate, channels) => { audioCfg = { sampleRate, channels }; },
            (c) => { audioMuxCodec = c; },
        );

        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: 'avc', width, height },
            // Read through a local: TS narrows `audioCfg` to never because it is only assigned
            // inside the callback above.
            ...(() => {
                const cfg = audioCfg as { sampleRate: number; channels: number } | null;
                return hasAudio && cfg
                    ? { audio: { codec: audioMuxCodec, sampleRate: cfg.sampleRate, numberOfChannels: cfg.channels } }
                    : {};
            })(),
            fastStart: 'in-memory',  // moov at the front so it plays immediately
        });
        for (const [c, m] of pending) muxer.addAudioChunk(c, m);

        // 🔴 The codec string encodes a LEVEL, and the level caps resolution. avc1.42001f is
        // Baseline 3.1, which tops out around 720p — configuring it for 1080p throws
        // "has a coded area ... specify a lower resolution or higher AVC level". Ask the browser
        // which of these it can actually do, most compatible first, rather than guessing.
        const CANDIDATES = ['avc1.4d0028', 'avc1.640028', 'avc1.42e028', 'avc1.42001f'];
        let codec = '';
        for (const c of CANDIDATES) {
            try {
                const { supported } = await VideoEncoder.isConfigSupported({
                    codec: c, width, height, bitrate: VIDEO_BITRATE, framerate: OUTPUT_FPS,
                });
                if (supported) { codec = c; break; }
            } catch { /* try the next one */ }
        }
        if (!codec) return file;   // nothing this browser can encode at this size

        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => { throw e; },
        });
        encoder.configure({ codec, width, height, bitrate: VIDEO_BITRATE, framerate: OUTPUT_FPS });

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx2d = canvas.getContext('2d', { alpha: false })!;

        let frames = 0;
        let lastKey = -Infinity;

        await new Promise<void>((resolve, reject) => {
            const onFrame = (_now: number, meta: any) => {
                try {
                    ctx2d.drawImage(video, 0, 0, width, height);
                    const ts = Math.max(0, Math.round((meta?.mediaTime ?? video.currentTime) * 1e6));
                    const frame = new VideoFrame(canvas, { timestamp: ts });
                    const keyFrame = ts - lastKey >= 2e6;   // ~2s GOP keeps seeking responsive
                    if (keyFrame) lastKey = ts;
                    // close() in a finally: a throw from encode() would otherwise leak the frame,
                    // and Chrome warns "VideoFrame was garbage collected without being closed".
                    try { encoder.encode(frame, { keyFrame }); } finally { frame.close(); }
                    frames++;
                    onProgress?.({
                        percent: Math.min(99, Math.round((video.currentTime / duration) * 100)),
                        stage: 'encoding',
                    });
                } catch (e) {
                    reject(e as Error);
                    return;
                }
                if (!video.ended) (video as any).requestVideoFrameCallback(onFrame);
            };
            video.onended = () => resolve();
            video.onerror = () => reject(new Error('Playback failed while compressing.'));
            (video as any).requestVideoFrameCallback(onFrame);
            video.playbackRate = PLAYBACK_RATE;
            video.play().catch(reject);
        });

        onProgress?.({ percent: 99, stage: 'finishing' });
        await encoder.flush();
        encoder.close();
        muxer.finalize();

        const { buffer } = muxer.target as ArrayBufferTarget;
        const out = new File([buffer], file.name.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' });
        onProgress?.({ percent: 100, stage: 'finishing' });

        // Never make things worse: if the source was already small/efficient, keep it.
        if (!frames || out.size >= file.size) return file;
        return out;
    } catch {
        // Compression is an optimisation, never a reason to block an upload. Hand back the original
        // and let the caller's size guard decide.
        return file;
    } finally {
        try { video.pause(); } catch { /* ignore */ }
        video.removeAttribute('src');
        URL.revokeObjectURL(url);
    }
}
