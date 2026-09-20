import { describe, expect, it } from 'vitest';
import { buildPropertyShareContent, collectPropertyShareMedia } from '../services/property_sharing';

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
});
