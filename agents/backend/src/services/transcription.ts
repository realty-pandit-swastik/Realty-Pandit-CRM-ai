/**
 * Transcription Service
 * Uses Gemini Audio API for speech-to-text transcription
 * Supports Hindi, Hinglish, and English
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import axios from 'axios';
import logger from '../utils/logger';

export interface TranscriptionResult {
    text: string;
    language?: string; // detected language
    duration?: number; // seconds
    confidence?: number; // 0.0 - 1.0
}

export interface TranscriptionOptions {
    language?: 'hi' | 'en' | 'auto'; // hindi, english, auto-detect
    enableTimestamps?: boolean;
}

/**
 * Transcription Service using Gemini's multimodal capabilities
 */
export class TranscriptionService {
    private genAI?: GoogleGenerativeAI;
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.error('[TranscriptionService] GEMINI_API_KEY is missing! Transcription will fail.');
            return;
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use Gemini 2.5 Pro for audio transcription (project standard)
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    }

    /**
     * Transcribe audio file to text
     * @param audioPath Local path to audio file or URL
     * @param options Transcription options
     * @returns Transcription result with text and metadata
     */
    async transcribeAudio(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult> {
        try {
            logger.info(`[TranscriptionService] Transcribing audio: ${audioPath}`);

            // Determine if audioPath is URL or local file
            const isUrl = audioPath.startsWith('http://') || audioPath.startsWith('https://');
            let audioData: string;
            let mimeType: string;

            if (isUrl) {
                // Download audio from URL
                const response = await axios.get(audioPath, { responseType: 'arraybuffer' });
                audioData = Buffer.from(response.data).toString('base64');
                mimeType = response.headers['content-type'] || 'audio/mpeg';
            } else {
                // Read local file
                if (!fs.existsSync(audioPath)) {
                    throw new Error(`Audio file not found: ${audioPath}`);
                }
                const buffer = fs.readFileSync(audioPath);
                audioData = buffer.toString('base64');
                // Determine MIME type from extension
                const ext = audioPath.split('.').pop()?.toLowerCase();
                mimeType = this.getMimeType(ext || '');
            }

            // Prepare transcription prompt
            const languageInstruction = this.getLanguageInstruction(options?.language);
            const prompt = `Please transcribe this audio recording accurately. ${languageInstruction}

Return ONLY the transcribed text without any additional commentary, explanations, or formatting.

If the audio contains multiple speakers, transcribe their dialogue sequentially.`;

            // Call Gemini API with audio data
            const result = await this.model.generateContent([
                {
                    inlineData: {
                        data: audioData,
                        mimeType: mimeType,
                    },
                },
                prompt,
            ]);

            const response = await result.response;
            const text = response.text().trim();

            logger.info(`[TranscriptionService] Transcription complete: ${text.substring(0, 100)}...`);

            return {
                text,
                language: this.detectLanguage(text),
                confidence: this.estimateConfidence(text),
            };
        } catch (error) {
            logger.error('[TranscriptionService] Transcription failed:', error);
            throw new Error(`Transcription failed: ${(error as Error).message}`);
        }
    }

    /**
     * Transcribe long audio files (chunking if needed)
     * Gemini 1.5 Flash supports up to 9.5 hours of audio
     * @param audioPath Audio file path or URL
     * @param options Transcription options
     */
    async transcribeLongAudio(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult> {
        // For now, use the same method since Gemini 1.5 supports long audio
        // Future enhancement: chunk audio for very long files
        return this.transcribeAudio(audioPath, options);
    }

    /**
     * Batch transcribe multiple audio files
     * @param audioPaths Array of audio file paths
     * @param options Transcription options
     */
    async batchTranscribe(
        audioPaths: string[],
        options?: TranscriptionOptions
    ): Promise<TranscriptionResult[]> {
        const results: TranscriptionResult[] = [];

        for (const path of audioPaths) {
            try {
                const result = await this.transcribeAudio(path, options);
                results.push(result);
            } catch (error) {
                logger.error(`[TranscriptionService] Failed to transcribe ${path}:`, error);
                results.push({
                    text: '',
                    confidence: 0,
                });
            }
        }

        return results;
    }

    /**
     * Get language instruction for prompt
     */
    private getLanguageInstruction(language?: 'hi' | 'en' | 'auto'): string {
        switch (language) {
            case 'hi':
                return 'The audio is in Hindi or Hinglish (Hindi-English mix). Transcribe it accurately preserving the original language mix.';
            case 'en':
                return 'The audio is in English. Transcribe it accurately.';
            case 'auto':
            default:
                return 'The audio may be in Hindi, English, or Hinglish (mix of both). Transcribe it accurately in the original language(s) used.';
        }
    }

    /**
     * Detect primary language from transcribed text
     */
    private detectLanguage(text: string): string {
        // Simple heuristic: check for Devanagari characters
        const hasDevanagari = /[\u0900-\u097F]/.test(text);
        const hasEnglish = /[a-zA-Z]/.test(text);

        if (hasDevanagari && hasEnglish) return 'hinglish';
        if (hasDevanagari) return 'hindi';
        if (hasEnglish) return 'english';
        return 'unknown';
    }

    /**
     * Estimate transcription confidence
     * Based on text length and quality indicators
     */
    private estimateConfidence(text: string): number {
        if (!text || text.length < 10) return 0.3;

        // Simple heuristics
        const wordCount = text.split(/\s+/).length;
        const hasProperPunctuation = /[.!?]/.test(text);
        const hasGoodLength = wordCount >= 5 && wordCount <= 1000;

        let confidence = 0.7; // Base confidence

        if (hasProperPunctuation) confidence += 0.1;
        if (hasGoodLength) confidence += 0.1;
        if (wordCount > 20) confidence += 0.1;

        return Math.min(confidence, 1.0);
    }

    /**
     * Get MIME type from file extension
     */
    private getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            m4a: 'audio/mp4',
            ogg: 'audio/ogg',
            flac: 'audio/flac',
            aac: 'audio/aac',
            '3gp': 'audio/3gpp',
        };

        return mimeTypes[extension] || 'audio/mpeg';
    }
}

// Singleton instance
const transcriptionService = new TranscriptionService();

export default transcriptionService;
