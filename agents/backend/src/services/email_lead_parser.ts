
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone, resolveStoredContactPhone } from '../utils/phone';

/**
 * Email Lead Parser Service.
 * Parses lead notification emails from portals (99acres, MagicBricks, Housing.com)
 * and extracts contact information for SSOT ingestion.
 *
 * Usage: When email webhook receives a lead notification email,
 * call parseAndIngest() with the email subject and body.
 */
export class EmailLeadParser {

    /**
     * Parse email and ingest lead into SSOT.
     */
    async parseAndIngest(subject: string, body: string, fromAddress: string): Promise<{ success: boolean; phone?: string; source?: string; error?: string }> {
        const source = this.detectSource(fromAddress, subject);
        const extracted = this.extractContactInfo(body);

        if (!extracted.phone) {
            return { success: false, error: 'Could not extract phone number from email' };
        }

        // Normalize to E.164 and resolve to any existing contact PK (incl.
        // legacy bare/dash rows) so re-ingestion never creates a duplicate
        // contact that gets independently round-robined to another member.
        // See docs/plans/2026-05-17-duplicate-lead-reassignment.md
        const normalized = normalizePhone(extracted.phone);
        if (!normalized || !/^\+91[6-9]\d{9}$/.test(normalized)) {
            return { success: false, error: `Invalid phone extracted: ${extracted.phone}` };
        }
        const phone = (await resolveStoredContactPhone(normalized, prisma)) ?? normalized;

        try {
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) return { success: false, error: 'System not configured' };

            await prisma.contact.upsert({
                where: { phone_number: phone },
                update: {
                    name: extracted.name || undefined,
                    email: extracted.email || undefined,
                    source,
                    last_channel: source,
                    last_interaction: new Date(),
                },
                create: {
                    phone_number: phone,
                    name: extracted.name || null,
                    email: extracted.email || null,
                    source,
                    contact_type: 'UNKNOWN',
                    tenant_id: tenant.id,
                    last_channel: source,
                    last_interaction: new Date(),
                    lead_status: 'warm',
                }
            });

            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: phone,
                    channel: source,
                    direction: 'inbound',
                    event_type: 'email_lead',
                    content: `Email lead from ${source}: ${subject}`,
                    metadata: {
                        source,
                        subject,
                        from: fromAddress,
                        extracted,
                    }
                }
            });

            logger.info(`[EmailLeadParser] Parsed lead from ${source}: ${phone}`);
            return { success: true, phone, source };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Detect which portal the email is from.
     */
    private detectSource(from: string, subject: string): string {
        const text = `${from} ${subject}`.toLowerCase();
        if (text.includes('99acres')) return '99acres';
        if (text.includes('magicbricks')) return 'magicbricks';
        if (text.includes('housing.com') || text.includes('housing')) return 'housing';
        return 'email';
    }

    /**
     * Extract name, phone, and email from email body text.
     */
    private extractContactInfo(body: string): { name: string | null; phone: string | null; email: string | null } {
        // Phone: Indian numbers (+91, 0-prefixed, or 10-digit)
        const phoneMatch = body.match(/(?:\+91[\s-]?|0)?([6-9]\d{9})/);
        const phone = phoneMatch ? `+91${phoneMatch[1]}` : null;

        // Email
        const emailMatch = body.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
        const email = emailMatch ? emailMatch[0] : null;

        // Name: try common patterns
        let name: string | null = null;
        const namePatterns = [
            /(?:name|buyer|client|customer)\s*[:\-]\s*([A-Za-z\s]+)/i,
            /(?:Mr\.|Mrs\.|Ms\.)\s+([A-Za-z\s]+)/i,
            /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/m,
        ];
        for (const pattern of namePatterns) {
            const match = body.match(pattern);
            if (match) {
                name = match[1].trim();
                break;
            }
        }

        return { name, phone, email };
    }
}
