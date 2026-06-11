# Phase 5 — Manual Review List (14 remaining UNKNOWN contacts)

**Date:** 2026-05-12
**Context:** Phase 5 auto-categorization moved 138 active UNKNOWNs to BUYER and 2 to TENANT. The 14 below have a name but ZERO engagement (no interactions, no leads, no deals, no appointments, no scheduled visits, no key-holder/owner/builder relationships). They were intentionally left as UNKNOWN — they need a human eyeball.

Pick one of: BUYER, TENANT, LANDLORD, PARTNER_AGENT, MANAGEMENT, or **delete** the row.

## Likely junk / placeholders (4 rows)

These have `TEMP_<timestamp>_<hash>` phone numbers — placeholders the system creates when a walk-in didn't share a real number. Names are all "Sir". Recommend: **delete**.

| Name | Phone | Source | Created |
|---|---|---|---|
| Sir | `TEMP_1775478989562_yi1a7v` | manual | placeholder |
| Sir | `TEMP_1774377772542_btltyq` | manual | placeholder |
| sir | `TEMP_1774272014579_wdeaxv` | manual | placeholder |
| Sir | `TEMP_1775366252868_d6skn1` | manual | placeholder |
| Sir | `TEMP_1774420764473_kmscs8` | manual | placeholder |

Wait — that's 5, not 4. Re-counting the dry-run output: 5 "Sir" rows. So 5 placeholders.

## Real-looking names with real phone numbers (9 rows)

These could be real leads who walked in or were entered manually, then never followed up. They have valid Indian phone numbers. Recommend: **BUYER** (most likely) unless you recognize them as someone specific.

| Name | Phone | Source |
|---|---|---|
| Davender Malhotra | +91 9315873571 | manual |
| Nikhil Sorout | +91 8168955874 | voice |
| rahul | +91 9350146471 | manual |
| jitender singh | +91 7827710767 | manual |
| Mr Kuldeep | +91 8750870754 | manual |
| Saurabh goyal | +91 9818107540 | manual |
| Harshit singh | +91 7982354950 | manual |
| Gagan | +91 9999554069 | manual |
| Malhotra stationary Mohit | +91 9811509541 | manual |

## How to act on this

For each row above, open `https://admin.realtypandit.in` → Chats → search by phone → click contact → use the existing **Set as Buyer / Tenant / Landlord / Partner / Team** action in the contact dropdown.

For deletion of the 5 "Sir" TEMP_ rows: do not do this from the UI (no delete button). Run on the production server:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -r ts-node/register/transpile-only -e "
import(\"./src/db\").then(async m => {
  const r = await m.default.contact.deleteMany({ where: { phone_number: { startsWith: \"TEMP_\" }, _count: { interactions: 0 } } });
  console.log(r);
});
"'
```

(Or ping me and I'll write a one-shot cleanup script.)

## Why these weren't auto-categorized

The Phase 5 script's safe rule: any UNKNOWN with **zero downstream activity** stays UNKNOWN. Auto-categorizing a name with no engagement risks misclassifying someone (e.g., a partner who was added manually but hasn't been used yet). The 138 auto-marked as BUYER all had interactions / leads / appointments / scheduled visits — clear demand signal.

## Verification (post-Phase 5 dashboard state)

| Tile | Value |
|---|---|
| Total Contacts | 1575 |
| 🔥 HOT | 8 |
| 🟢 WARM | 300 |
| ❄️ COLD | 1263 |
| ❌ LOST | 4 |
| **Sum** | **1575 ✓** |

By contact_type:
- BUYER: 1349 (was 1211, +138)
- TENANT: 118 (was 116, +2)
- UNKNOWN: 14 (was 154, -140 — exactly matches BUYER+TENANT growth)
- PARTNER_AGENT: 46 unchanged
- LANDLORD: 27 unchanged
- MANAGEMENT: 20 unchanged

Total: 1574 (pre-fix) → 1575 (after, +1 new arrival during execution).

## Reversibility

If any of the 140 reclassifications turns out wrong, just open the contact and use the Set as X action in the UI. No data was deleted — only `contact_type` was changed. Records are intact.
