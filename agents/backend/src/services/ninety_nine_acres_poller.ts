/**
 * 99acres Pull API Poller
 *
 * Polls the 99acres XML API on a schedule (every 10 min via BullMQ)
 * to fetch new leads and ingest them into the CRM pipeline.
 *
 * API constraints:
 *   - Max 6 requests/hour
 *   - Max 2-day date window per request
 *   - Start date max 30 days old
 *   - Max 5000 results per response, no pagination
 */

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { isRealEmail } from '../utils/email';
import { sanitizeName } from '../utils/name_sanitizer';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from './lead_notifications';
import { assignViaRoundRobin, resolveAgentByEmail } from './lead_assignment';
import { assignContact, type AssignmentMethod } from './assign_contact';
import { ensureDealForLead } from './ensure_deal';
import { notify } from './notify';
import { alertCritical } from '../utils/alerter';
import { foldLegacyDemand } from '../utils/demand_canonical';
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedLead {
    // Contact details
    name: string | null;
    email: string | null;
    phone: string;
    phoneVerificationStatus: string | null;
    emailVerificationStatus: string | null;
    identity: string | null;             // "Individual" | "Dealer"

    // Query / property details
    productId: string;
    productStatus: string;
    productType: string;
    propertyLabel: string;               // CmpctLabl — human-readable description
    queryInfo: string;                   // buyer's message / query text
    responseType: string;
    receivedOn: string;

    // Newly captured fields
    queryId: string | null;              // unique 99acres query ID
    projId: string | null;              // 99acres project ID
    projName: string | null;            // project / society name
    cityName: string | null;            // direct city field (no regex needed)
    resCom: string | null;              // "R" = Residential, "C" = Commercial
    price: string | null;               // listing price / buyer budget (raw string)
    propertyCode: string | null;        // 99acres property code (e.g. "S36412095")
    subUserName: string | null;         // Gmail of team member whose listing got the enquiry
}

interface PollResult {
    fetched: number;
    new: number;
    updated: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class NinetyNineAcresPoller {
    private apiUrl: string;
    private username: string;
    private password: string;
    private parser: XMLParser;

    constructor() {
        this.apiUrl = process.env.NINETY_NINE_ACRES_API_URL || '';
        this.username = process.env.NINETY_NINE_ACRES_USERNAME || '';
        this.password = process.env.NINETY_NINE_ACRES_PASSWORD || '';
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            trimValues: true,
        });
    }

    /** Returns true if credentials are configured */
    isConfigured(): boolean {
        return !!(this.apiUrl && this.username && this.password);
    }

    /** Format a Date to 99acres format: YYYY-MM-DD HH:mm:ss */
    private formatDate(d: Date): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    /** Build the XML request body */
    private buildRequestXml(startDate: string, endDate: string): string {
        return `<?xml version='1.0'?><query><user_name>${this.username}</user_name><pswd>${this.password}</pswd><start_date>${startDate}</start_date><end_date>${endDate}</end_date></query>`;
    }

    /** Helper: safely extract a string from an XML node value */
    private xmlStr(value: any): string | null {
        const s = String(value || '').trim();
        return s || null;
    }

    /** Parse the 99acres XML response into structured leads */
    private parseResponse(xmlData: string): ParsedLead[] {
        const parsed = this.parser.parse(xmlData);

        // Check for error response
        const root = parsed.Xml || parsed.xml || parsed.XML;
        if (!root) {
            logger.warn('[99acresPoller] Unexpected XML structure:', JSON.stringify(parsed).slice(0, 500));
            return [];
        }

        const actionStatus = root['@_ActionStatus'] || root['@_actionstatus'] || '';
        if (String(actionStatus).toLowerCase() === 'false') {
            const errorDetail = root.ErrorDetail || root.errorDetail || {};
            const code = errorDetail.Code || errorDetail.code || 'UNKNOWN';
            const message = errorDetail.Message || errorDetail.message || 'Unknown error';
            throw new Error(`99acres API error [${code}]: ${message}`);
        }

        // Extract Resp entries
        const respEntries = root.Resp || root.resp || [];
        const responses = Array.isArray(respEntries) ? respEntries : (respEntries ? [respEntries] : []);

        const leads: ParsedLead[] = [];
        for (const resp of responses) {
            try {
                const qryDtl = resp.QryDtl || resp.qryDtl || {};
                const cntctDtl = resp.CntctDtl || resp.cntctDtl || {};

                const phone = String(cntctDtl.Phone || cntctDtl.phone || '').trim();
                if (!phone) continue;

                // ProdId can be an object with attributes or a plain string
                const prodIdNode = qryDtl.ProdId || qryDtl.prodId;
                const productIdText = typeof prodIdNode === 'object'
                    ? String(prodIdNode['#text'] || '')
                    : String(prodIdNode || '');
                const productStatus = (typeof prodIdNode === 'object'
                    ? prodIdNode['@_Status']
                    : null) || qryDtl['@_Status'] || '';
                const productType = (typeof prodIdNode === 'object'
                    ? prodIdNode['@_Type']
                    : null) || qryDtl['@_Type'] || '';

                leads.push({
                    // Contact
                    name:                    this.xmlStr(cntctDtl.Name || cntctDtl.name),
                    email:                   this.xmlStr(cntctDtl.Email || cntctDtl.email),
                    phone,
                    phoneVerificationStatus: this.xmlStr(cntctDtl.PhoneVerificationStatus || cntctDtl.phoneVerificationStatus),
                    emailVerificationStatus: this.xmlStr(cntctDtl.EmailVerificationStatus || cntctDtl.emailVerificationStatus),
                    identity:                this.xmlStr(cntctDtl.IDENTITY || cntctDtl.Identity || cntctDtl.identity),

                    // Query / property
                    productId:     productIdText,
                    productStatus,
                    productType,
                    propertyLabel: String(qryDtl.CmpctLabl || qryDtl.cmpctLabl || ''),
                    queryInfo:     String(qryDtl.QryInfo || qryDtl.qryInfo || ''),
                    responseType:  qryDtl['@_ResType'] || qryDtl['@_resType'] || '',
                    receivedOn:    String(qryDtl.RcvdOn || qryDtl.rcvdOn || ''),

                    // Newly captured
                    // QueryId is an ATTRIBUTE of <QryDtl> (<QryDtl QueryId="..."/>), parsed as
                    // qryDtl['@_QueryId']. The old paths (qryDtl.QryId / resp['@_QueryId']) never
                    // matched, so queryId silently parsed as null on every lead. Read the attribute first.
                    queryId:       this.xmlStr(qryDtl['@_QueryId'] || qryDtl['@_queryId'] || qryDtl.QryId || qryDtl.qryId || resp['@_QueryId'] || resp['@_queryId']),
                    projId:        this.xmlStr(qryDtl.ProjId || qryDtl.projId),
                    projName:      this.xmlStr(qryDtl.ProjName || qryDtl.projName),
                    cityName:      this.xmlStr(qryDtl.CityName || qryDtl.cityName),
                    resCom:        this.xmlStr(qryDtl.ResCom || qryDtl.resCom),
                    price:         this.xmlStr(qryDtl.Price || qryDtl.price),
                    propertyCode:  this.xmlStr(qryDtl.PROPERTY_CODE || qryDtl.PropertyCode || qryDtl.propCode),
                    subUserName:   this.xmlStr(qryDtl.SubUserName || qryDtl.subUserName),
                });
            } catch (err) {
                logger.warn('[99acresPoller] Skipping malformed Resp entry:', err);
            }
        }

        return leads;
    }

    /** Extract intent from the property label / query text */
    private extractIntent(label: string, query: string): string | null {
        const combined = `${label} ${query}`.toLowerCase();
        if (combined.includes('sale') || combined.includes('buy') || combined.includes('purchase') || combined.includes('sell')) return 'buy';
        if (combined.includes('rent') || combined.includes('lease')) return 'rent';
        return null;
    }

    /** Extract BHK count from property label (e.g. "2 BHK Flat in Delhi" → 2, "3 Bed" → 3) */
    private extractBhk(label: string): number | null {
        const match = label.match(/(\d+)\s*(?:BHK|Bed(?:room)?s?)/i);
        if (match) return parseInt(match[1], 10);
        return null;
    }

    /** Extract property type string from label + resCom field */
    private extractPropertyType(label: string, resCom: string | null): string | null {
        const lower = label.toLowerCase();
        if (lower.includes('apartment') || lower.includes('flat')) return 'flat';
        if (lower.includes('villa') || lower.includes('bungalow') || lower.includes('house') || lower.includes('kothi')) return 'house';
        if (lower.includes('plot') || lower.includes('land')) return 'plot';
        if (lower.includes('floor') && !lower.includes('flat')) return 'builder floor';
        if (lower.includes('penthouse')) return 'penthouse';
        if (lower.includes('studio')) return 'studio';
        if (lower.includes('office') || lower.includes('commercial') || lower.includes('shop')) return 'commercial';
        if (resCom === 'R') return 'residential';
        if (resCom === 'C') return 'commercial';
        return null;
    }

    /** Extract location from property label (fallback when cityName is not provided) */
    private extractLocation(label: string): string | null {
        const match = label.match(/\bin\s+(.+?)(?:\s+for\s+|\s*$)/i);
        return match ? match[1].trim() : null;
    }

    /**
     * Main poll method — called by BullMQ scheduled job.
     * Handles date windowing, API calls, and lead ingestion.
     */
    async poll(): Promise<PollResult> {
        if (!this.isConfigured()) {
            logger.debug('[99acresPoller] Not configured, skipping');
            return { fetched: 0, new: 0, updated: 0 };
        }

        // Get or create sync record
        const sync = await prisma.integrationSync.upsert({
            where: { source: '99acres' },
            update: { status: 'running', last_attempt: new Date() },
            create: { source: '99acres', status: 'running', last_attempt: new Date() },
        });

        const now = new Date();
        const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
        const maxWindowMs = 2 * 24 * 60 * 60 * 1000; // 2 days
        const maxChunksPerCycle = 5; // Stay within rate limits

        // Determine start date — ROLLING LOOKBACK, not a forward-only watermark.
        // The 99acres response API is RE-QUERYABLE by date (proven: it re-returns leads we already
        // ingested) — it is NOT deliver-once. A forward watermark that catches up to "now" then only
        // ever queries the last few minutes and NEVER re-scans the past, so any lead the API surfaces
        // with an earlier RcvdOn — delivered late, OR skipped while the 2026-05 silent-loss bug
        // advanced the watermark past it — is lost forever. Instead, re-scan a fixed recent window
        // every cycle. maxWindowMs (2 days) is the API's max single-window → exactly ONE request per
        // cycle, safely within the 6 req/hr limit at the 12-min cron. The queryId/received_on dedup in
        // ingestLead makes the re-scan idempotent (already-ingested enquiries are skipped — no dupes).
        let startDate = new Date(now.getTime() - maxWindowMs);

        // Cap to 30 days ago (a no-op floor for the 2-day lookback; kept as a guard).
        const minDate = new Date(now.getTime() - maxAgeMs);
        if (startDate < minDate) startDate = minDate;
        void sync; // retained for the status='running' upsert side-effect above

        const totalResult: PollResult = { fetched: 0, new: 0, updated: 0 };
        let chunksProcessed = 0;
        let currentStart = startDate;

        try {
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) throw new Error('System not configured - no tenant found');

            // Process in 2-day chunks
            while (currentStart < now && chunksProcessed < maxChunksPerCycle) {
                const currentEnd = new Date(Math.min(
                    currentStart.getTime() + maxWindowMs,
                    now.getTime(),
                ));

                const startStr = this.formatDate(currentStart);
                const endStr = this.formatDate(currentEnd);

                logger.info(`[99acresPoller] Fetching chunk ${chunksProcessed + 1}: ${startStr} to ${endStr}`);

                // Call 99acres API
                const requestXml = this.buildRequestXml(startStr, endStr);
                const response = await axios.post(this.apiUrl, `xml=${encodeURIComponent(requestXml)}`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 30000,
                });

                const leads = this.parseResponse(response.data);
                logger.info(`[99acresPoller] Got ${leads.length} leads in chunk`);

                // Ingest each lead. Track failures so we NEVER advance the watermark past a
                // window that lost leads. (2026-05 silent-loss bug: per-lead errors were
                // swallowed AND the watermark advanced anyway → leads were fetched-then-dropped
                // with the poll still reporting `success` and no alert. That cost ~3 days of
                // 99acres leads when the legacy demand columns were dropped.)
                let chunkFailures = 0;
                for (const lead of leads) {
                    try {
                        const result = await this.ingestLead(lead, tenant.id);
                        totalResult.fetched++;
                        if (result === 'new') totalResult.new++;
                        else totalResult.updated++;
                    } catch (err) {
                        chunkFailures++;
                        logger.error(`[99acresPoller] Failed to ingest lead ${lead.phone}:`, err);
                    }
                }

                if (chunkFailures > 0) {
                    // Do NOT advance the watermark — leave this window unconsumed so it is
                    // retried on the next cycle (after backoff). Throw so poll() marks the sync
                    // `failed` + increments consecutive_failures (alertCritical fires at >=3).
                    // A loud, retrying failure beats silent lead loss for a revenue pipeline.
                    throw new Error(`99acres: ${chunkFailures}/${leads.length} leads failed to ingest in window ${startStr}..${endStr}; watermark held at ${this.formatDate(currentStart)} for retry`);
                }

                // Advance watermark ONLY after a fully successful chunk.
                await prisma.integrationSync.update({
                    where: { source: '99acres' },
                    data: { last_success: currentEnd },
                });

                currentStart = currentEnd;
                chunksProcessed++;
            }

            // Mark final status
            await prisma.integrationSync.update({
                where: { source: '99acres' },
                data: {
                    status: 'success',
                    last_error: null,
                    consecutive_failures: 0,
                    leads_fetched: totalResult.fetched,
                    leads_new: totalResult.new,
                    leads_updated: totalResult.updated,
                    total_syncs: { increment: 1 },
                    metadata: {
                        chunks_processed: chunksProcessed,
                        start_date: this.formatDate(startDate),
                        end_date: this.formatDate(now),
                    },
                },
            });

            logger.info(`[99acresPoller] Complete: ${totalResult.fetched} fetched, ${totalResult.new} new, ${totalResult.updated} updated`);
            return totalResult;

        } catch (error) {
            const errMsg = (error as Error).message;
            const isRateLimit = errMsg.includes('ERROR-0007') || errMsg.toLowerCase().includes('limit');
            const isAuthError = errMsg.includes('ERROR-0001') || errMsg.toLowerCase().includes('authentication');

            logger.error(`[99acresPoller] Poll failed${isRateLimit ? ' (RATE LIMITED)' : ''}:`, errMsg);

            const updatedSync = await prisma.integrationSync.update({
                where: { source: '99acres' },
                data: {
                    status: 'failed',
                    last_error: errMsg,
                    consecutive_failures: { increment: 1 },
                    leads_fetched: totalResult.fetched,
                    leads_new: totalResult.new,
                    leads_updated: totalResult.updated,
                    total_syncs: { increment: 1 },
                },
            });

            // Alert on auth failures
            if (isAuthError) {
                alertCritical('99acres_auth_failed', '99acres API authentication failed - check credentials', { error: errMsg });
            }

            // Alert after 3+ consecutive failures (any type)
            if (updatedSync.consecutive_failures >= 3) {
                alertCritical(
                    '99acres_consecutive_failures',
                    `99acres poller has failed ${updatedSync.consecutive_failures} times in a row. Last error: ${errMsg.substring(0, 100)}`,
                    { consecutive_failures: updatedSync.consecutive_failures, error: errMsg },
                );
            }

            throw error;
        }
    }

    /**
     * Ingest a single lead into the CRM.
     *
     * Order of operations:
     *   1. Normalize phone
     *   2. Derive intent + location (cityName preferred over regex)
     *   3. Fetch existing contact (to inform smart merge)
     *   4. Compute safe merged name + email values
     *   5. Upsert contact
     *   6. Log interaction (with all new metadata fields)
     *   7. If NEW contact: resolve listing agent → round-robin fallback → notify → escalation job
     *   8. Fire-and-forget buyer confirmations
     */
    private async ingestLead(lead: ParsedLead, tenantId: string): Promise<'new' | 'updated'> {
        const phoneNumber = normalizePhone(lead.phone);
        if (!phoneNumber) {
            throw new Error(`Invalid phone: ${lead.phone}`);
        }

        // ── Idempotent re-scan guard ──────────────────────────────────────────
        // poll() re-scans a rolling 2-day window every cycle, so the same enquiry is fetched
        // repeatedly. Skip if we've already logged its lead_capture interaction — matched by the
        // unique 99acres queryId, OR (for older rows whose queryId predates the parse fix) by
        // phone + received_on. Without this, the re-scan would create a duplicate interaction each
        // cycle. (Contact upsert + isNew side-effects are already idempotent; the interaction is not.)
        const dedupOr: any[] = [];
        if (lead.queryId) dedupOr.push({ metadata: { path: ['query_id'], equals: lead.queryId } });
        if (lead.receivedOn) dedupOr.push({ AND: [{ phone_number: phoneNumber }, { metadata: { path: ['received_on'], equals: lead.receivedOn } }] });
        if (dedupOr.length) {
            const already = await prisma.interaction.findFirst({
                where: { channel: '99acres', event_type: 'lead_capture', OR: dedupOr },
                select: { id: true },
            });
            if (already) return 'updated';
        }

        let intent = this.extractIntent(lead.propertyLabel, lead.queryInfo);
        // Prefer "society, city" when 99acres gives a project/society (more granular than the bare city);
        // else the regex-extracted label location; else the bare city. (99acres does NOT send the
        // sector/locality of the customer's requirement, so city-only leads stay city-only.)
        const location = [lead.projName, lead.cityName].filter(Boolean).join(', ')
            || this.extractLocation(lead.propertyLabel)
            || lead.cityName
            || null;
        const bhk = this.extractBhk(lead.propertyLabel);
        const propertyType = this.extractPropertyType(lead.propertyLabel, lead.resCom);

        // ── Fetch existing contact for smart merge ────────────────────────────
        const existing = await prisma.contact.findUnique({
            where: { phone_number: phoneNumber },
            select: { phone_number: true, assigned_agent_id: true, name: true, email: true },
        });
        const isNew = !existing;

        // ── Smart merge: email ────────────────────────────────────────────────
        // Only use incoming email if it passes the @ check.
        // If incoming is fake (phone number in email field), keep stored value.
        const incomingEmail = isRealEmail(lead.email) ? lead.email : null;
        const mergedEmail: string | undefined = incomingEmail !== null
            ? incomingEmail
            : (existing?.email ?? undefined);

        // ── Smart merge: name ─────────────────────────────────────────────────
        // Strip placeholder names (USER/Name/temp/etc) before merging — these
        // come from 99acres when the actual lead name is missing.
        // Never replace a longer (richer) name with a shorter truncation.
        const incomingName = sanitizeName(lead.name);
        const existingName = sanitizeName(existing?.name);
        let mergedName: string | undefined;
        if (!incomingName) {
            mergedName = undefined; // nothing useful incoming — don't touch
        } else if (!existingName) {
            mergedName = incomingName;
        } else {
            mergedName = incomingName.length >= existingName.length ? incomingName : existingName;
        }

        // ── Budget: map price → budget_max (create only) ──────────────────────
        const budgetMax = lead.price
            ? parseFloat(lead.price.replace(/[^0-9.]/g, '')) || null
            : null;

        // Budget-aware intent guard (2026-06-12): 99acres labels often omit "rent"/"sale" so intent
        // comes back null and the deal defaults to buy. A residential lead with a budget in the
        // monthly-rent band (₹3k–₹2L) is almost certainly a RENTAL — correct it so matching works.
        if ((intent === 'buy' || !intent) && budgetMax && budgetMax >= 3000 && budgetMax <= 200000 && bhk != null) {
            intent = 'rent';
        }

        // ── Derive classification slugs from extracted property type ───────────
        const SLUG_MAP: Record<string, { mainCat: string; subCat: string; typeSlug: string }> = {
            flat:           { mainCat: 'residential', subCat: 'apartment',          typeSlug: 'flat' },
            apartment:      { mainCat: 'residential', subCat: 'apartment',          typeSlug: 'flat' },
            villa:          { mainCat: 'residential', subCat: 'individual_housing',  typeSlug: 'villa' },
            house:          { mainCat: 'residential', subCat: 'individual_housing',  typeSlug: 'independent_house' },
            plot:           { mainCat: 'residential', subCat: 'plot_land',           typeSlug: 'residential_plot' },
            'builder floor':{ mainCat: 'residential', subCat: 'apartment',          typeSlug: 'builder_floor' },
            penthouse:      { mainCat: 'residential', subCat: 'apartment',          typeSlug: 'penthouse' },
            studio:         { mainCat: 'residential', subCat: 'apartment',          typeSlug: 'studio_apartment' },
        };
        const slugEntry = propertyType ? SLUG_MAP[propertyType] : null;
        const demandMainCat: string | null = slugEntry?.mainCat
            ?? (lead.resCom === 'R' ? 'residential' : lead.resCom === 'C' ? 'commercial' : null);
        const demandSubCat: string | null = slugEntry?.subCat ?? null;
        const demandTypeSlug: string | null = slugEntry?.typeSlug ?? null;

        // ── Upsert contact ────────────────────────────────────────────────────
        // Stage 3 (2026-05-31): resolve the requirement into the canonical taxonomy node.
        const demandTax = await resolveDemandTaxonomy({ main_category: demandMainCat || undefined, property_type: propertyType || undefined, bhk: bhk ?? null });

        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name: mergedName,
                email: mergedEmail,
                source: '99acres',
                intent: intent || undefined,
                preferred_location: location || undefined,
                // Only fill if extracted (don't overwrite manually-entered values with null)
                property_type: propertyType || undefined,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Persist legacy classification from the resolved node so column-reading
                // paths (matching hard filter, filters) stay correct (2026-05-31). Fill-only.
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                type_id: demandTax.type_id ?? undefined,
                // Phase 1 dual-write — only update demand_schema_values if we extracted a BHK; merge
                // is handled DB-side via upsert (Postgres jsonb replaces wholesale, but for 99acres
                // we always want bhk to be the latest extraction so wholesale replace of {bhk:"…"} is fine).
                ...(bhk ? (foldLegacyDemand({ demand_bhk: bhk }) as any) : {}),
                last_channel: '99acres',
                last_interaction: new Date(),
                // budget_max is NOT updated — respect manually-entered values
            },
            create: {
                phone_number: phoneNumber,
                name: mergedName ?? null,
                email: mergedEmail ?? null,
                source: '99acres',
                contact_type: 'BUYER',
                intent,
                preferred_location: location,
                budget_max: budgetMax,
                property_type: propertyType,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                type_id: demandTax.type_id ?? undefined,
                // Phase 1 dual-write — canonical demand SoT.
                ...(foldLegacyDemand({ demand_bhk: bhk ?? null }) as any),
                tenant_id: tenantId,
                last_channel: '99acres',
                last_interaction: new Date(),
                lead_status: 'warm',
            },
        });

        // ── Log interaction (with all new metadata fields) ────────────────────
        await prisma.interaction.create({
            data: {
                tenant_id: tenantId,
                phone_number: phoneNumber,
                channel: '99acres',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `99acres lead: ${contact.name || 'Unknown'} — ${lead.propertyLabel || lead.projName || 'N/A'}. Query: ${lead.queryInfo || 'N/A'}`,
                metadata: {
                    source: '99acres',
                    ingestion_method: 'pull_api',
                    // Original fields
                    product_id: lead.productId,
                    product_status: lead.productStatus,
                    product_type: lead.productType,
                    response_type: lead.responseType,
                    received_on: lead.receivedOn,
                    // Newly captured fields
                    query_id: lead.queryId,
                    proj_id: lead.projId,
                    proj_name: lead.projName,
                    city_name: lead.cityName,
                    res_com: lead.resCom,
                    price: lead.price,
                    property_code: lead.propertyCode,
                    sub_user_name: lead.subUserName,
                    phone_verification_status: lead.phoneVerificationStatus,
                    email_verification_status: lead.emailVerificationStatus,
                    identity: lead.identity,
                },
            },
        });

        // ── Initialize lead score for new contacts ──────────────────────────
        if (isNew) {
            await prisma.leadScore.upsert({
                where: { phone_number: phoneNumber },
                update: {},
                create: {
                    phone_number: phoneNumber,
                    tenant_id: tenantId,
                    intent_score: intent ? 20 : 10,
                    engagement_score: 15,
                    reliability_score: 50,
                    urgency_score: 10,
                    total_score: intent ? 95 : 85,
                },
            });
        }

        // ── New contact: routing, notifications, escalation ───────────────────
        if (isNew) {
            // Step 1: Resolve listing agent via SubUserName (the 99acres account that uploaded the property)
            // This ensures the lead goes to the team member who owns the listing — not round-robin.
            // If sub_user_name is missing or unrecognised, assign to manager for manual review.
            let finalAgentId: string | null = null;
            let method: AssignmentMethod | null = null;
            if (lead.subUserName) {
                finalAgentId = await resolveAgentByEmail(lead.subUserName);
                if (finalAgentId) method = 'sub_user';
            }
            if (!finalAgentId) {
                // No sub_user_name match — assign to manager (not round-robin)
                // so the correct owner can be identified and reassigned manually
                const manager = await prisma.agent.findFirst({
                    where: { role: { in: ['manager', 'super_boss'] }, status: 'active' },
                    orderBy: { created_at: 'asc' },
                    select: { id: true },
                });
                finalAgentId = manager?.id ?? null;
                if (finalAgentId) {
                    method = 'manager_review';
                    logger.warn(`[99acres] No sub_user_name match for property ${lead.propertyCode} — assigned to manager for review`);
                }
            }

            if (finalAgentId) {
                await assignContact(phoneNumber, finalAgentId, method);

                // Step 2: Load assigned agent + super_boss for notifications
                const [assignedAgent, superBoss] = await Promise.all([
                    prisma.agent.findUnique({
                        where: { id: finalAgentId },
                        select: { id: true, name: true, email: true, phone: true },
                    }),
                    prisma.agent.findFirst({
                        where: { role: 'super_boss', status: 'active' },
                        select: { id: true, name: true, email: true, phone: true },
                    }),
                ]);

                // Step 3: Build recipients (dedup if assigned agent IS super_boss)
                const recipients: Array<{ id: string; type: 'agent'; phone?: string; email: string; name: string }> = [];
                if (assignedAgent) {
                    recipients.push({
                        id: assignedAgent.id,
                        type: 'agent',
                        phone: assignedAgent.phone ?? undefined,
                        email: assignedAgent.email,
                        name: assignedAgent.name,
                    });
                }
                if (superBoss && superBoss.id !== finalAgentId) {
                    recipients.push({
                        id: superBoss.id,
                        type: 'agent',
                        phone: superBoss.phone ?? undefined,
                        email: superBoss.email,
                        name: superBoss.name,
                    });
                }

                // Step 4: PWA push + WhatsApp notification to agent(s) and admin
                if (recipients.length > 0) {
                    notify('lead_assigned', recipients, {
                        name: contact.name || 'Unknown Buyer',
                        phone: phoneNumber,
                        property_label: lead.projName || lead.propertyLabel || 'N/A',
                        source: '99acres',
                        query_id: lead.queryId,
                    }).catch(err => logger.warn('[99acresPoller] notify lead_assigned failed:', (err as Error).message));
                }

                // Step 5: Enqueue 20-min escalation check
                const { scheduledJobsQueue } = await import('../queues/index');
                await scheduledJobsQueue.add(
                    'lead-escalation',
                    {
                        phone_number: phoneNumber,
                        assigned_agent_id: finalAgentId,
                        lead_name: contact.name || null,
                        property_label: lead.projName || lead.propertyLabel || null,
                        assigned_at: new Date().toISOString(),
                    },
                    {
                        delay: 20 * 60 * 1000, // 20 minutes
                        attempts: 1,
                        removeOnComplete: true,
                        removeOnFail: { count: 100 },
                    },
                );

                logger.info(`[99acresPoller] Lead ${phoneNumber} assigned to agent ${finalAgentId}, escalation job queued`);

                // Step 5b: Create workflow qualification task
                const { createQualifyTask } = await import('./workflow_task_service');
                createQualifyTask({
                    tenantId,
                    contactPhone: phoneNumber,
                    assignedTo: finalAgentId,
                    source: '99acres',
                }).catch(err => logger.warn('[99acresPoller] Workflow task creation failed:', (err as Error).message));
            }

            // Auto-create NEW deal so AI qualification cadence kicks in (B1).
            // Placed outside if (finalAgentId) so deal is always created even when
            // agent resolution fails — ensureDealForLead has its own assignment fallback.
            ensureDealForLead({
                contactPhone: phoneNumber,
                source: '99acres',
                assignedAgentId: finalAgentId ?? undefined,
            }).catch((err) => {
                logger.error(`[99acres] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`);
            });

            // Step 6: Buyer confirmations (fire-and-forget)
            sendBuyerConfirmationWhatsApp(phoneNumber, contact.name || null, '99acres')
                .catch(err => logger.warn('[99acresPoller] Buyer WA failed:', (err as Error).message));
            if (contact.email) {
                sendBuyerConfirmationEmail(contact.email, contact.name || null)
                    .catch(err => logger.warn('[99acresPoller] Buyer email failed:', (err as Error).message));
            }
        }

        return isNew ? 'new' : 'updated';
    }

    /** Get current sync status for admin UI */
    async getSyncStatus() {
        return prisma.integrationSync.findUnique({
            where: { source: '99acres' },
        });
    }
}
