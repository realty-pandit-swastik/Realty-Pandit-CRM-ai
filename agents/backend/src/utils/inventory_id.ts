/**
 * Inventory Display ID Generator
 *
 * Generates human-readable IDs like RP-DEL-RES-20431
 * Format: RP-{CITY_CODE}-{CATEGORY_CODE}-{SEQUENTIAL_NUMBER}
 */

import prisma from '../db';

const CITY_CODES: Record<string, string> = {
    'delhi': 'DEL',
    'new delhi': 'DEL',
    'noida': 'NOI',
    'greater noida': 'GNO',
    'gurgaon': 'GGN',
    'gurugram': 'GGN',
    'faridabad': 'FDB',
    'ghaziabad': 'GZB',
    'mumbai': 'MUM',
    'pune': 'PUN',
    'bangalore': 'BLR',
    'bengaluru': 'BLR',
    'hyderabad': 'HYD',
    'chennai': 'CHN',
    'kolkata': 'KOL',
    'ahmedabad': 'AHM',
    'jaipur': 'JAI',
    'lucknow': 'LKO',
    'chandigarh': 'CHD',
    'indore': 'IND',
    'bhopal': 'BPL',
    'patna': 'PAT',
    'nagpur': 'NGP',
    'surat': 'SRT',
    'vadodara': 'VAD',
    'dehradun': 'DDN',
    'thiruvananthapuram': 'TVM',
    'kochi': 'KCH',
    'coimbatore': 'CBE',
    'visakhapatnam': 'VZG',
};

const CATEGORY_CODES: Record<string, string> = {
    'residential': 'RES',
    'commercial': 'COM',
    'agricultural': 'AGR',
};

function getCityCode(city: string): string {
    if (!city) return 'UNK';
    const normalized = city.toLowerCase().trim();
    if (CITY_CODES[normalized]) return CITY_CODES[normalized];
    // Fallback: first 3 chars uppercased
    return normalized.replace(/[^a-z]/g, '').substring(0, 3).toUpperCase() || 'UNK';
}

function getCategoryCode(mainCategory: string): string {
    if (!mainCategory) return 'GEN';
    return CATEGORY_CODES[mainCategory.toLowerCase().trim()] || 'GEN';
}

/**
 * Generate a human-readable display ID for an inventory record.
 * Uses atomic counter increment to ensure uniqueness.
 */
export async function generateDisplayId(city: string, mainCategory: string): Promise<string> {
    const cityCode = getCityCode(city);
    const catCode = getCategoryCode(mainCategory);

    const counter = await prisma.inventoryCounter.upsert({
        where: { id: 'singleton' },
        update: { counter: { increment: 1 } },
        create: { id: 'singleton', counter: 20001 },
    });

    return `RP-${cityCode}-${catCode}-${counter.counter}`;
}
