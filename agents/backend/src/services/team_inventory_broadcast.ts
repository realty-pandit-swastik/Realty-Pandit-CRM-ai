/**
 * Team Inventory Broadcast — Phase D (2026-06-18, inventory epic point 4).
 *
 * When a new inventory goes ACTIVE (admin create-as-active, PATCH → active, or
 * approve), alert EVERY active team member so they can show it to their own
 * clients — over two channels:
 *   1. In-app bell + Web Push via notify('inventory_created').
 *   2. A Google Task in each Google-connected member's @default task list.
 *
 * NOTE: a WhatsApp leg was intentionally dropped (2026-06-18). The only template
 * Meta would approve came back MARKETING-classified, which silently drops to any
 * recipient who ever replied STOP — unacceptable for a "notify EVERY member"
 * requirement. The approved (unused) template `rp_team_new_inventory` still lives
 * on the WABA; re-add a UTILITY-worded version here if WhatsApp is wanted later.
 *
 * Idempotent: a `team_inventory_broadcast` interaction marker (keyed by
 * inventory_id) guards against a re-fire across the 3 trigger sites and any
 * status flip-flop (active → withdrawn → active). Fire-and-forget — errors are
 * logged, never thrown back into the write path.
 *
 * Only the AREA (locality + city) is broadcast — never flat_no / plot_no — to
 * stay consistent with the Phase B middleman redaction model. customer_price is
 * intentionally NOT used; the public display_price is shared.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { captureBackgroundError } from '../utils/capture';

const EVT_MARKER = 'team_inventory_broadcast';
const PUBLIC_SITE = process.env.PUBLIC_SITE_URL || 'https://www.realtypandit.in';

const STAFF_ROLES = ['super_boss', 'manager', 'employee'];

/**
 * Broadcast a newly-active inventory to all active team members.
 * Safe to call fire-and-forget from any of the activation trigger sites.
 */
export async function broadcastNewInventoryToTeam(inventoryId: string): Promise<void> {
    try {
        const inv: any = await prisma.inventory.findUnique({
            where: { id: inventoryId },
            include: {
                taxonomy_node: { select: { name: true } },
                assigned_agent: { select: { id: true, name: true } },
            },
        });
        if (!inv) {
            logger.warn(`[TeamInvBroadcast] Inventory ${inventoryId} not found — skip`);
            return;
        }
        if (inv.status !== 'active') {
            logger.info(`[TeamInvBroadcast] Inventory ${inventoryId} not active (${inv.status}) — skip`);
            return;
        }

        // Idempotency: bail if we already broadcast this inventory.
        const existingMarker = await prisma.interaction.findFirst({
            where: {
                event_type: EVT_MARKER,
                metadata: { path: ['inventory_id'], equals: inventoryId },
            },
            select: { id: true },
        });
        if (existingMarker) {
            logger.info(`[TeamInvBroadcast] Inventory ${inventoryId} already broadcast — skip`);
            return;
        }

        const allStaff = await prisma.agent.findMany({
            where: {
                tenant_id: inv.tenant_id,
                status: 'active',
                role: { in: STAFF_ROLES },
            },
            select: {
                id: true, name: true, phone: true, email: true,
                google_refresh_token: true, google_sync_enabled: true,
            },
        });
        // Don't notify the person who just uploaded it — they already know.
        const recipients = allStaff.filter(a => a.id !== inv.uploaded_by_agent_id);
        if (recipients.length === 0) {
            logger.info(`[TeamInvBroadcast] Inventory ${inventoryId} — no other team members to notify`);
            return;
        }

        const summary = buildSummary(inv);
        const area = buildArea(inv);
        const price = formatPrice(inv.display_price ?? inv.price, inv.price_unit);
        const publicLink = inv.display_id ? `${PUBLIC_SITE}/properties/${inv.display_id}` : PUBLIC_SITE;

        logger.info(`[TeamInvBroadcast] Inventory ${inventoryId} (${inv.display_id || ''}) — broadcasting to ${recipients.length} members`);

        // ── 1+2. In-app bell + Web Push (push-only event; no free-form WhatsApp) ──
        try {
            const { notify } = await import('./notify');
            notify(
                'inventory_created',
                recipients.map(a => ({
                    id: a.id,
                    type: 'agent' as const,
                    phone: a.phone || undefined,
                    email: a.email || undefined,
                    name: a.name || undefined,
                })),
                {
                    inventory_id: inv.id,
                    display_id: inv.display_id,
                    uploader_name: inv.assigned_agent?.name || inv.uploader_name || 'A team member',
                    property_type: summary,
                    location: area,
                },
            );
        } catch (err) {
            logger.warn(`[TeamInvBroadcast] notify() failed (non-blocking): ${(err as Error).message}`);
        }

        // ── Google Task for the Google-connected members (opt-in) ──
        let sentGoogle = 0;
        const { pushInventoryTaskToGoogle } = await import('./google_sync');

        for (const a of recipients) {
            if (a.google_refresh_token && a.google_sync_enabled !== false) {
                const ok = await pushInventoryTaskToGoogle(a.id, {
                    title: `🆕 New listing to show clients: ${summary}`,
                    notes: [
                        `${summary}`,
                        `📍 ${area}`,
                        `💰 ${price}`,
                        '',
                        `View & share this listing:`,
                        publicLink,   // public website page — opens the actual listing (point 7 fix)
                    ].join('\n'),
                    dueISO: new Date().toISOString(),
                });
                if (ok) sentGoogle++;
            }
        }

        // ── WhatsApp alert (#7, 2026-07-01): send the APPROVED rp_team_new_inventory template to
        // each member so they get the new listing on WhatsApp too (covers the non-Google members).
        // Fire-and-forget; a per-recipient failure never blocks the broadcast.
        let sentWa = 0;
        try {
            const { WhatsAppService } = await import('./whatsapp');
            const wa = new WhatsAppService();
            for (const a of recipients) {
                if (!a.phone) continue;
                try {
                    await wa.sendTemplate(a.phone, 'rp_team_new_inventory', {
                        property: summary, location: area, price, link: publicLink,
                    });
                    sentWa++;
                } catch { /* skip this recipient — broadcast continues */ }
            }
        } catch (err) {
            logger.warn(`[TeamInvBroadcast] WhatsApp send failed (non-blocking): ${(err as Error).message}`);
        }

        // Marker — write last so a mid-run crash lets a retry resume.
        await prisma.interaction.create({
            data: {
                tenant_id: inv.tenant_id,
                phone_number: inv.owner_phone || 'system',
                channel: 'system',
                direction: 'outbound',
                event_type: EVT_MARKER,
                content: `[Team broadcast] New listing ${inv.display_id || inv.id} → ${recipients.length} members (push+in-app, google=${sentGoogle}, whatsapp=${sentWa})`,
                metadata: {
                    inventory_id: inv.id,
                    recipient_count: recipients.length,
                    sent_google: sentGoogle,
                    sent_wa: sentWa,
                },
            },
        });

        logger.info(`[TeamInvBroadcast] Inventory ${inventoryId} complete — recipients=${recipients.length} google=${sentGoogle} whatsapp=${sentWa}`);
    } catch (err) {
        captureBackgroundError(err, { source: 'team_inventory_broadcast#broadcastNewInventoryToTeam', inventoryId });
        logger.error(`[TeamInvBroadcast] Unhandled error for ${inventoryId}:`, err);
    }
}

function buildSummary(inv: any): string {
    const specs = typeof inv.specs === 'string' ? safeJson(inv.specs) : (inv.specs || {});
    const rooms = specs.bhk ?? specs.rooms ?? specs.bhk_count ?? specs.bedrooms;
    const typeName = inv.taxonomy_node?.name || inv.type || 'Property';
    return rooms ? `${rooms} BHK ${typeName}` : String(typeName);
}

function buildArea(inv: any): string {
    const parts = [inv.locality, inv.city || inv.district].filter(Boolean);
    return parts.join(', ') || inv.location || 'Location on request';
}

function formatPrice(price: any, unit?: string | null): string {
    if (!price) return 'Price on request';
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 'Price on request';
    const u = (unit || '').toLowerCase();
    if (u === 'lakh') return `${n % 1 === 0 ? n : n.toFixed(1)} Lakh`;
    if (u === 'crore') return `${n % 1 === 0 ? n : n.toFixed(2)} Cr`;
    if (u === 'thousand') return `${n.toFixed(0)}K`;
    if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(1)} Lakh`;
    return `${(n / 1e3).toFixed(0)}K`;
}

function safeJson(s: string): any {
    try { return JSON.parse(s); } catch { return {}; }
}
