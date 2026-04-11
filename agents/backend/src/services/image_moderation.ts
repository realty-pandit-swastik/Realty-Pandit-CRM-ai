/**
 * Image Moderation Service
 *
 * Uses Gemini 2.5 Flash (vision) to analyze uploaded images for:
 * - Explicit/pornographic content
 * - Phone number text overlays
 * - Address text overlays
 * - Non-property images
 * - Watermarks from other platforms
 *
 * Fails OPEN: if Gemini API fails, the image is approved by default.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface ModerationResult {
    approved: boolean;
    reasons: string[];
    confidence: number;
}

const MODERATION_PROMPT = `You are a property listing image moderator. Analyze this image and respond ONLY with valid JSON.

Check for these violations:
1. EXPLICIT: Contains pornographic, sexually explicit, or nudity content
2. PHONE_NUMBER: Contains visible phone numbers overlaid as text on the image
3. ADDRESS_TEXT: Contains full addresses overlaid as text on the image (short location labels like "Sector 150" are OK)
4. NOT_PROPERTY: Image is clearly NOT related to real estate (e.g., memes, selfies, food, random objects). Interior/exterior/building/plot/construction/floor plan images are all valid.
5. COMPETITOR_WATERMARK: Has prominent watermarks from competitor platforms (99acres, MagicBricks, Housing.com, NoBroker, OLX)

Respond with this exact JSON format:
{
  "approved": true or false,
  "violations": [],
  "confidence": 0.0 to 1.0
}

If no violations, set approved=true, violations=[], confidence=1.0.
If violations found, set approved=false, list violation codes in violations array.
Be lenient - only flag clear violations. When in doubt, approve.`;

/**
 * Moderate a single image file using Gemini Vision.
 */
export async function moderateImage(filePath: string): Promise<ModerationResult> {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.warn('[ImageModeration] No GEMINI_API_KEY - approving by default');
            return { approved: true, reasons: [], confidence: 0 };
        }

        // Read image file
        const absolutePath = filePath.startsWith('/') || filePath.includes(':\\')
            ? filePath
            : path.join(process.cwd(), 'uploads', 'pending', path.basename(filePath));

        if (!fs.existsSync(absolutePath)) {
            logger.warn(`[ImageModeration] File not found: ${absolutePath} - approving by default`);
            return { approved: true, reasons: [], confidence: 0 };
        }

        const imageBuffer = fs.readFileSync(absolutePath);
        const base64Image = imageBuffer.toString('base64');

        // Detect MIME type from extension
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
        };
        const mimeType = mimeMap[ext] || 'image/jpeg';

        // Call Gemini Vision
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent([
            { text: MODERATION_PROMPT },
            {
                inlineData: {
                    mimeType,
                    data: base64Image,
                },
            },
        ]);

        const responseText = result.response.text().trim();

        // Parse JSON response (strip markdown code blocks if present)
        const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        const violations: string[] = parsed.violations || [];
        const approved = parsed.approved !== false && violations.length === 0;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

        // Map violation codes to human-readable reasons
        const reasonMap: Record<string, string> = {
            EXPLICIT: 'Image contains explicit or inappropriate content',
            PHONE_NUMBER: 'Image contains visible phone numbers - please remove them',
            ADDRESS_TEXT: 'Image contains address text overlay - please remove it',
            NOT_PROPERTY: 'Image does not appear to be a property photo',
            COMPETITOR_WATERMARK: 'Image has watermarks from another platform - please use original photos',
        };

        const reasons = violations.map((v: string) => reasonMap[v] || v);

        if (!approved) {
            logger.info(`[ImageModeration] REJECTED: ${path.basename(filePath)} - ${violations.join(', ')}`);
        }

        return { approved, reasons, confidence };
    } catch (err) {
        // Fail OPEN - approve image if moderation fails
        logger.error(`[ImageModeration] Error moderating ${filePath} - approving by default`, err);
        return { approved: true, reasons: [], confidence: 0 };
    }
}

/**
 * Moderate multiple images in parallel.
 * Returns results keyed by filename.
 */
export async function moderateImages(filePaths: string[]): Promise<Record<string, ModerationResult>> {
    const results: Record<string, ModerationResult> = {};

    // Process up to 5 at a time to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(async (fp) => {
                const result = await moderateImage(fp);
                return { path: fp, result };
            }),
        );
        for (const { path: fp, result } of batchResults) {
            results[fp] = result;
        }
    }

    return results;
}
