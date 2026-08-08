/**
 * Social backlog — who messaged or commented and never got an answer.
 *
 * WHY: between 2026-04-17 and 2026-08-07 the Instagram/Facebook reply path never once
 * succeeded (38 inbound events, 0 sends, 65 failures — wrong host + wrong token type). Those
 * people are still unanswered, and nothing in the database records them: `logSocialInteraction`
 * can only write an Interaction when a Contact already exists with a matching scoped id, and
 * for a first-touch commenter there is none (Interaction.phone_number is a required FK). So the
 * ONLY record of them is the application log — which is what this script reads.
 *
 *   npx ts-node --transpile-only scripts/social_backlog.ts            # worklist (no sends)
 *   npx ts-node --transpile-only scripts/social_backlog.ts --execute  # attempt DM replies
 *
 * ⚠ TWO HARD LIMITS, both by design rather than oversight:
 *
 * 1. COMMENTS CANNOT BE REPLIED TO FROM HERE. The log lines record the username and text but
 *    never the `comment_id` (logSocialInteraction was never passed one), and IG reels do not
 *    expose their comments through the Graph API. A comment reply needs that id. Comments are
 *    therefore reported as a manual worklist only.
 *
 * 2. DM SENDS CURRENTLY FAIL for anyone without a role on the app —
 *    `(#200) App does not have Advanced Access to instagram_manage_messages`. Until Meta grants
 *    Advanced Access, --execute will report that per person rather than deliver. The worklist
 *    is still the useful output: it tells the team exactly who to answer by hand.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import axios from 'axios';
import { cacheGet } from '../src/utils/redis';

const EXECUTE = process.argv.includes('--execute');
const LOG_DIR = path.resolve(__dirname, '../logs');
const GRAPH = 'https://graph.facebook.com/v25.0';
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || '';
const WHATSAPP_LINK = 'https://wa.me/918178491914?text=Hi%20Panditji';
// Our own account appears two ways: numeric id on DM echoes, and @handle on comments we
// posted ourselves. Filtering only the numeric id left `airealtypandit` in the worklist.
const SELF_IDS = new Set(
    [process.env.IG_BUSINESS_ACCOUNT_ID, process.env.FB_PAGE_ID, 'airealtypandit', 'Realty Pandit']
        .filter(Boolean) as string[],
);

// Synthetic events injected while testing the pipeline on 2026-08-07/08. They used real-looking
// ids, so they must be excluded by TEXT as well or they show up as customer messages.
const PROBE_TEXTS = new Set(['kitna price hai', 'kya price hai is flat ka', 'our own outbound', 'follow me and earn money click link http://x.co']);

interface Event {
    ts: Date;
    platform: 'instagram' | 'facebook';
    surface: 'dm' | 'comment';
    userId: string;      // IGSID/PSID for DMs; @username for comments (no id is ever logged)
    text: string;
}

const PATTERNS: Array<{ re: RegExp; platform: Event['platform']; surface: Event['surface'] }> = [
    { re: /\[SocialReplier\] Instagram DM from ([^:]+): "(.*)"$/,       platform: 'instagram', surface: 'dm' },
    { re: /\[SocialReplier\] Messenger from ([^:]+): "(.*)"$/,          platform: 'facebook',  surface: 'dm' },
    { re: /\[SocialReplier\] Instagram comment from @?([^:]+): "(.*)"$/, platform: 'instagram', surface: 'comment' },
    { re: /\[SocialReplier\] Facebook comment from ([^:]+): "(.*)"$/,   platform: 'facebook',  surface: 'comment' },
];

function parseLogs(): Event[] {
    const out: Event[] = [];
    const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('combined-') && f.endsWith('.log'));
    for (const f of files.sort()) {
        for (const line of fs.readFileSync(path.join(LOG_DIR, f), 'utf8').split('\n')) {
            if (!line.includes('[SocialReplier]')) continue;
            let rec: any;
            try { rec = JSON.parse(line); } catch { continue; }
            const msg = String(rec.message || '');
            for (const { re, platform, surface } of PATTERNS) {
                const m = msg.match(re);
                if (!m) continue;
                const userId = m[1].trim();
                // Skip our own account's echoes and the synthetic probes used while testing.
                if (SELF_IDS.has(userId)) break;
                if (/^(queue_probe|7{6,}|8{6,})$/.test(userId)) break;
                if (PROBE_TEXTS.has(m[2].trim())) break;
                out.push({ ts: new Date(rec.timestamp), platform, surface, userId, text: m[2] });
                break;
            }
        }
    }
    return out;
}

/** Meta reply windows: a DM needs inbound activity within 24h; comment-linked private replies last 7d. */
function reachability(e: Event, newestForUser: Date): string {
    const hours = (Date.now() - newestForUser.getTime()) / 36e5;
    if (e.surface === 'dm') return hours <= 24 ? `OPEN (${hours.toFixed(1)}h)` : `CLOSED (${(hours / 24).toFixed(1)}d)`;
    return hours <= 24 * 7 ? `comment: private-reply window OPEN (${(hours / 24).toFixed(1)}d)` : 'comment: reply publicly only';
}

async function main() {
    console.log(`\n=== SOCIAL BACKLOG  (${EXECUTE ? 'EXECUTE' : 'WORKLIST — no sends'}) ===\n`);

    const events = parseLogs();
    if (!events.length) { console.log('No social events found in logs.'); return; }

    // Group by person; the newest message is what governs the reply window.
    const byUser = new Map<string, Event[]>();
    for (const e of events) {
        const k = `${e.platform}:${e.surface}:${e.userId}`;
        (byUser.get(k) ?? byUser.set(k, []).get(k)!).push(e);
    }

    const rows: Array<{ key: string; e: Event; newest: Date; count: number; replied: boolean }> = [];
    for (const [key, list] of byUser) {
        list.sort((a, b) => a.ts.getTime() - b.ts.getTime());
        const newest = list[list.length - 1].ts;
        const replied = !!(await cacheGet(`social_replied:${key}`).catch(() => null));
        rows.push({ key, e: list[list.length - 1], newest, count: list.length, replied });
    }
    rows.sort((a, b) => b.newest.getTime() - a.newest.getTime());

    const pending = rows.filter(r => !r.replied);
    console.log(`${events.length} inbound events from ${rows.length} distinct people — ${pending.length} with no recorded reply.\n`);

    console.log('WHEN                 PLATFORM  SURFACE  WHO                    REACHABLE                        MESSAGE');
    console.log('-'.repeat(150));
    for (const r of pending) {
        console.log(
            `${r.newest.toISOString().slice(0, 16).replace('T', ' ')}  ` +
            `${r.e.platform.padEnd(9)} ${r.e.surface.padEnd(8)} ${r.e.userId.slice(0, 21).padEnd(22)} ` +
            `${reachability(r.e, r.newest).padEnd(32)} ${JSON.stringify(r.e.text).slice(0, 60)}`,
        );
    }

    const dms = pending.filter(r => r.e.surface === 'dm');
    const comments = pending.filter(r => r.e.surface === 'comment');
    console.log(`\n  ${dms.length} DMs (sendable from here) · ${comments.length} comments (need the comment_id — reply from the app)\n`);

    if (!EXECUTE) {
        console.log('WORKLIST ONLY — no messages sent. Re-run with --execute to attempt the DM replies.');
        console.log('Review this list with the owner first; these people last heard from us a long time ago.');
        return;
    }

    console.log('--- attempting DM replies ---');
    let ok = 0, blocked = 0, failed = 0;
    for (const r of dms) {
        const body = `Namaste! 🙏 Sorry for the delay in replying.\n\nFor property details, photos and site visits, message us on WhatsApp — Panditji replies instantly:\n\n👉 ${WHATSAPP_LINK}`;
        try {
            await axios.post(`${GRAPH}/me/messages`,
                { recipient: { id: r.e.userId }, message: { text: body } },
                { params: { access_token: TOKEN }, timeout: 15000 });
            ok++; console.log(`  SENT      ${r.e.userId}`);
        } catch (err: any) {
            const m = err.response?.data?.error?.message || err.message;
            if (/Advanced Access|does not have role on app/i.test(m)) { blocked++; console.log(`  BLOCKED   ${r.e.userId} — needs Meta Advanced Access`); }
            else { failed++; console.log(`  FAILED    ${r.e.userId} — ${String(m).slice(0, 110)}`); }
        }
        await new Promise(res => setTimeout(res, 1500)); // gentle pacing — this is a burst to real people
    }
    console.log(`\nsent=${ok}  blocked=${blocked}  failed=${failed}`);
    if (blocked) console.log('BLOCKED ones need Meta App Review (Advanced Access on instagram_manage_messages), then re-run.');
}

main().then(() => process.exit(0)).catch(e => { console.error('ERR', e); process.exit(1); });
