import { describe, it, expect } from 'vitest';
import { extractLocationFromMsg } from '../utils/parse_lead_location';

// MagicBricks sends the customer's real area only inside the free-text `msg`, always shaped
// "...for Sale/Rent in <LOCATION> and has viewed your contact details." (the structured `City` field is
// just the city). We must capture <LOCATION> for preferred_location instead of dropping to the city.
describe('extractLocationFromMsg — MagicBricks msg → granular location', () => {
    const cases: [string, string][] = [
        ['This user is looking for 2 BHK Builder Floor Apartment for Sale in Sector 6 Vaishali, Ghaziabad and has viewed your contact details.', 'Sector 6 Vaishali, Ghaziabad'],
        ['This user is looking for 1 BHK Builder Floor Apartment for Sale in Vaishali, Ghaziabad and has viewed your contact details.', 'Vaishali, Ghaziabad'],
        ['This user is looking for 2 BHK Multistorey Apartment for Sale in Techzone 4, Greater Noida and has viewed your contact details.', 'Techzone 4, Greater Noida'],
        ['This user is looking for 1 BHK Multistorey Apartment for Rent in Sector 4 Vaishali, Ghaziabad and has viewed your contact details.', 'Sector 4 Vaishali, Ghaziabad'],
        ['This user is looking for 3 BHK Residential House for Sale in Sector 15 Vasundhara, Ghaziabad and has viewed your contact details.', 'Sector 15 Vasundhara, Ghaziabad'],
        ['This user is looking for 2 BHK Multistorey Apartment for Rent in Yamuna Expressway, Greater Noida and has viewed your contact details.', 'Yamuna Expressway, Greater Noida'],
    ];
    for (const [msg, expected] of cases) {
        it(`extracts "${expected}"`, () => expect(extractLocationFromMsg(msg)).toBe(expected));
    }

    it('returns null when the msg has no "for <intent> in <location>" phrase', () => {
        expect(extractLocationFromMsg('Customer enquired about a property')).toBeNull();
        expect(extractLocationFromMsg('')).toBeNull();
        expect(extractLocationFromMsg(null)).toBeNull();
        expect(extractLocationFromMsg(undefined)).toBeNull();
    });
});
