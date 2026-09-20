import { describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as string[]);
let sessionActive = vi.hoisted(() => ({ value: true }));

vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        async sendMediaStrict(_to: string, type: string, url: string, caption?: string) {
            sent.push(`${type} ${url}${caption ? ` caption=${caption}` : ''}`);
        }
        async sendTextStrict(_to: string, body: string) {
            sent.push(`text ${body.split('\n')[1] ?? body}`);
        }
    },
}));

vi.mock('../services/session_tracker', () => ({
    SessionTracker: { isSessionActive: async () => sessionActive.value },
}));

import {
    buildPropertyShareContent,
    collectPropertyShareMedia,
    sendPropertyMediaAndDetails,
} from '../services/property_sharing';

describe('property WhatsApp share content', () => {
    const property = {
        id: 'inv-1',
        category: 'residential',
        type: 'builder_floor',
        intent: 'sell',
        price: 61,
        customer_price: 58,
        display_price: 65,
        price_unit: 'lakh',
        apartment_name: 'Palm Residency',
        locality: 'Indirapuram',
        city: 'Ghaziabad',
        specs: {
            bhk: 3,
            area: 1450,
            area_unit: 'sqft',
            furnishing: 'semi_furnished',
            facing: 'east',
            amenities: ['lift', 'parking'],
        },
        media_urls: ['/uploads/home.jpg', '/uploads/walkthrough.mp4'],
        video_urls: ['/uploads/walkthrough.mp4', 'https://cdn.example.com/tour.mov'],
    };

    it('shares professional no-link details using display price and deduplicated media', () => {
        const content = buildPropertyShareContent(property);
        const media = collectPropertyShareMedia(property);

        expect(content.text).toContain('3 BHK Builder Floor');
        expect(content.text).toContain('₹65 Lakh');
        expect(content.text).toContain('1450 sqft');
        expect(content.text).not.toContain('58');
        expect(content.text).not.toMatch(/https?:\/\//);
        expect(content.params.p7).not.toMatch(/https?:\/\//);
        expect(media.images).toEqual(['https://api.realtypandit.in/uploads/home.jpg']);
        expect(media.videos).toEqual([
            'https://api.realtypandit.in/uploads/walkthrough.mp4',
            'https://cdn.example.com/tour.mov',
        ]);
    });

    it('sends every photo then every video uncaptioned, and the details as a separate last message', async () => {
        sent.length = 0;
        sessionActive.value = true;

        await expect(sendPropertyMediaAndDetails('+919999999999', property)).resolves.toBe(true);

        expect(sent).toEqual([
            'image https://api.realtypandit.in/uploads/home.jpg',
            'video https://api.realtypandit.in/uploads/walkthrough.mp4',
            'video https://cdn.example.com/tour.mov',
            'text 🏡 *3 BHK Builder Floor*',
        ]);
    });

    it('sends nothing outside the 24h window so the caller falls back to a template', async () => {
        sent.length = 0;
        sessionActive.value = false;

        await expect(sendPropertyMediaAndDetails('+919999999999', property)).resolves.toBe(false);
        expect(sent).toEqual([]);
    });

    // Runs after the brochure/card is already delivered — it must never throw, or a share that
    // DID reach the customer would be recorded and shown to the agent as failed.
    it('reports false instead of throwing on a malformed property', async () => {
        sessionActive.value = true;

        await expect(sendPropertyMediaAndDetails('+919999999999', null)).resolves.toBe(false);
    });
});
