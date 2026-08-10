# SENT 2026-08-10 — 99acres escalation #2 (rebutting "main user only")

**Status:** SENT and delivered. Second escalation, after the 3 Aug email
([`2026-08-03-99acres-subuser-escalation-email.md`](2026-08-03-99acres-subuser-escalation-email.md)).

| | |
|---|---|
| From | `Sunny Sharma <admin@realtypandit.in>` |
| To | `pramod.verma@99acres.com` |
| Cc | `realtypandit99@gmail.com`, `bzonkcrazy@gmail.com` |
| Reply-To | `realtypandit99@gmail.com` |
| Message-ID | `<d1008cbe-a59c-6f4d-4560-49dd09f363c6@realtypandit.in>` |
| Reply deadline stated | **end of day 11 August 2026** |

## Delivery result (verified in `/var/log/mail.log`, not just "accepted")

| Recipient | Result |
|---|---|
| pramod.verma@99acres.com | ✅ `250 2.6.0 … Queued mail for delivery` via `99acres-com.mail.protection.outlook.com`, InternalId `75295071670768`, 19,553 bytes |
| bzonkcrazy@gmail.com | ✅ `250 2.0.0 OK` |
| realtypandit99@gmail.com | 🔴 **deferred — `452-4.2.2 The recipient's inbox is out of storage space`** |

**First 99acres mail sent fully authenticated** — DKIM signed (`s=rp2026, d=realtypandit.in`), SPF
and DMARC passing as of the same day.

🔴 **Risk flagged to the owner:** `realtypandit99@gmail.com` is the **Reply-To**, and its mailbox is
full. Pramod's reply could bounce and never be seen — which would be indistinguishable from him
ignoring us. Owner asked to clear space.

## What prompted this one

Pramod replied by phone/WhatsApp that he did not understand the 3 Aug email, then forwarded an
internal 99acres response addressed to him:

> The integration is configured on the main user account, and all leads—including those from
> sub-users—are pushed through the main user only.
> If there are any issues with lead assignment, they need to be checked and resolved on the
> client's CRM side.

That is contradicted by their own feed history, which is what this email demonstrates.

## The evidence used (all re-verified from prod on 2026-08-10)

- **12 distinct sub-user addresses** across **2,290 enquiries**, 4 Apr → 22 Jul.
- **5–8 different sub-users per day**, every day, right up to the break.
- On **22 July alone** (the last working day), 5 different consultants on 5 different listings:

| Received (UTC) | Listing | Sub-user sent |
|---|---|---|
| 22 Jul 06:20 | Q92060238 | `tabfinancialsolution@gmail.com` |
| 22 Jul 09:08 | I89866620 | `haardiq0308@gmail.com` |
| 22 Jul 09:44 | D92062966 | `mvroyalgroup@gmail.com` |
| 22 Jul 10:56 | K92746588 | `ashwanikashyap8595@gmail.com` |
| 22 Jul 11:32 | O92085904 | `ravindragolaji96@gmail.com` |

- Mapping was **consistent** — listing `I89866620` always returned `haardiq0308`, never anyone else.
- Since the break: **366 enquiries, 19 consecutive days, zero exceptions** (verified with `>`, not
  `>=`, on the boundary timestamp `2026-07-22 13:56:18.612`).

**The decisive argument:** if the feed only ever carried the main user, the field would have been
blank for all 2,426 earlier enquiries too. It was populated on 94% of them.

## Deliberate differences from the 3 Aug email

1. **A before/after contrast using their own identifiers.** The 3 Aug email listed only enquiries
   *missing* the field, so there was nothing to compare against — likely why it did not land.
2. **One ask, not five.** The `CmpctLabl` / `QryInfo` request was dropped entirely; it is a
   separate pre-existing issue that diluted the main point.
3. **Assignment vs the missing field explicitly separated** — their reply shows that is exactly
   where the confusion sits.
4. **A face-saving frame** — "what changed on 22 July?" rather than "your team is wrong". They are
   far likelier to investigate a change than admit an error.

⚠️ **One claim from the 3 Aug email was quietly dropped as no longer true.** It said every other
field arrived unchanged at ~96%. Property code and city are now at ~83%, so "your other fields
dropped too" would have been an easy deflection. The claim that still holds, and the one used here,
is that **SubUserName is the only field at absolute zero**.

## If there is no reply by EOD 11 Aug

Escalate beyond Pramod — 99acres support and the account team. Addresses not yet held; ask the
owner. Also worth a phone call to **+91 78385 00180** (on file).
