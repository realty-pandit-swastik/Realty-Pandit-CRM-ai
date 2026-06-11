import axios from 'axios';
import logger from '../utils/logger';
import prisma from '../db';

const GRAPH_BASE = 'https://graph.facebook.com/v25.0';
const CATALOG_ID = process.env.META_CATALOG_ID!;
const token = () => process.env.WHATSAPP_TOKEN!;
const API_BASE = 'https://api.realtypandit.in';
const PLACEHOLDER_IMG = 'https://www.realtypandit.in/og-image.jpg';

function toAbsoluteUrl(url: string | undefined | null): string {
    if (!url || !url.trim()) return PLACEHOLDER_IMG;
    if (url.startsWith('http')) return url;
    // Relative paths are served by the backend API (confirmed: Facebook crawler gets 200)
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Actual Prisma field names (schema uses: type, display_price, specs JSON, media_urls, category, intent)
const INVENTORY_SELECT = {
    id: true, apartment_name: true, description: true, display_price: true,
    specs: true, type: true, locality: true, city: true,
    intent: true, category: true, media_urls: true, status: true,
} as const;

export function mapInventoryToProduct(inv: any): Record<string, string> {
    const pricePaise = Math.round((Number(inv.display_price) || 0) * 100);
    const bedrooms = (inv.specs as any)?.bedrooms;
    const bhkLabel = bedrooms ? `${bedrooms} BHK` : '';
    const intentStr = String(inv.intent ?? '').toLowerCase();
    const intent = (intentStr === 'rent' || intentStr === 'rent_lease' || intentStr === 'lease') ? 'rent' : 'buy';
    const category = String(inv.category ?? 'residential').toLowerCase();
    const propertyType = inv.type ?? '';
    const locationStr = inv.locality ?? inv.city ?? '';
    const parts = [bhkLabel, propertyType].filter(Boolean);
    const generated = (parts.join(' ') + (locationStr ? ` in ${locationStr}` : '')).trim() || 'Property';
    const name = (inv.apartment_name as string | null)?.trim() || generated;

    return {
        retailer_id: String(inv.id),
        name,
        description: (inv.description as string | null)?.trim() || generated,
        price: String(pricePaise),
        currency: 'INR',
        availability: 'in stock',
        condition: 'new',
        url: `https://www.realtypandit.in/properties/${inv.id}`,
        image_url: toAbsoluteUrl((inv.media_urls as string[] | null)?.[0]),
        custom_label_0: inv.city ?? '',
        custom_label_1: bhkLabel,
        custom_label_2: propertyType,
        custom_label_3: intent,
        custom_label_4: category,
    };
}

export async function upsertCatalogProduct(inv: any): Promise<void> {
    if (!CATALOG_ID || !token()) return;
    const product = mapInventoryToProduct(inv);
    try {
        await axios.post(
            `${GRAPH_BASE}/${CATALOG_ID}/products`,
            product,
            { headers: { Authorization: `Bearer ${token()}` } },
        );
        logger.info(`[CatalogSync] Upserted product ${inv.id}`);
    } catch (err: any) {
        const msg = err.response?.data?.error?.message ?? err.message;
        logger.error(`[CatalogSync] Upsert failed ${inv.id}: ${msg}`);
        throw err;
    }
}

export async function deleteCatalogProduct(inventoryId: string | number): Promise<void> {
    if (!CATALOG_ID || !token()) return;
    try {
        await axios.delete(`${GRAPH_BASE}/${CATALOG_ID}/products`, {
            headers: { Authorization: `Bearer ${token()}` },
            data: { retailer_id: String(inventoryId) },
        });
        logger.info(`[CatalogSync] Deleted product ${inventoryId}`);
    } catch (err: any) {
        const msg = err.response?.data?.error?.message ?? err.message;
        logger.error(`[CatalogSync] Delete failed ${inventoryId}: ${msg}`);
    }
}

// Fetch full inventory from DB then upsert — used when we only have the ID
export async function syncInventoryById(inventoryId: string): Promise<void> {
    const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: INVENTORY_SELECT,
    });
    if (!inv) return;
    if (inv.status === 'active') {
        await upsertCatalogProduct(inv);
    } else {
        await deleteCatalogProduct(inventoryId);
    }
}

async function fetchCatalogRetailerIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let url: string | null =
        `${GRAPH_BASE}/${CATALOG_ID}/products?fields=retailer_id&limit=200&access_token=${token()}`;
    while (url) {
        const resp = await axios.get<{ data: { retailer_id: string }[]; paging?: { next?: string } }>(url);
        for (const p of resp.data.data ?? []) ids.add(p.retailer_id);
        url = resp.data.paging?.next ?? null;
    }
    return ids;
}

export async function reconcileCatalog(): Promise<{ upserted: number; deleted: number }> {
    if (!CATALOG_ID || !token()) {
        logger.warn('[CatalogSync] Reconcile skipped — META_CATALOG_ID or WHATSAPP_TOKEN missing');
        return { upserted: 0, deleted: 0 };
    }

    const inventory = await prisma.inventory.findMany({
        where: { status: 'active' },
        select: INVENTORY_SELECT,
    });

    const remoteIds = await fetchCatalogRetailerIds();
    const localIds = new Set(inventory.map((i) => String(i.id)));

    let upserted = 0;
    for (const inv of inventory) {
        await upsertCatalogProduct(inv).catch(() => null);
        upserted++;
    }

    let deleted = 0;
    for (const rid of remoteIds) {
        if (!localIds.has(rid)) {
            await deleteCatalogProduct(rid);
            deleted++;
        }
    }

    logger.info(`[CatalogSync] Reconcile done: ${upserted} upserted, ${deleted} deleted`);
    return { upserted, deleted };
}
