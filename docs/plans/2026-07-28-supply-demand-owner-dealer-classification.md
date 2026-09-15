# Plan — Reliable RENT-vs-SELL + OWNER-vs-DEALER across every property-capture channel

**Date:** 2026-07-28 · **Trigger:** Nilin Dixit (+919289633929) — a landlord who wanted
to rent out his flat got classified as a buyer, then flipped to PARTNER_AGENT on
inventory upload, vanishing from Leads while a stale buyer deal lingered.

**Goal (owner's words):** the system must reliably identify, however a person contacts us,
(1) **is the property being offered for RENT or SALE**, and (2) **is the person the OWNER
(landlord) or a PARTNER AGENT / dealer** — and never silently lose the lead.

---

## How property is captured today (verified in code)

| Channel | Entry point | Supply vs demand routing | Rent/Sell | Owner vs Dealer |
|---|---|---|---|---|
| **WhatsApp message** | `webhook_processor.ts` → `WhatsAppWorkflowAdapter` (supply) / `BuyerWhatsAppAdapter` (demand) | new UNKNOWN → `isSupplyIntent(text)` (regex) first; else `BUYER_TRIGGER_WORDS` (incl. **'rent'**) | inventory workflow `answers.intent` (default 'sell') | `workflow_engine.ts`: owner→`LANDLORD`; EXTERNAL key-holder→`PARTNER_AGENT` |
| **WhatsApp voice** | `voice.ts` | none — always `contact_type=UNKNOWN` | none | none |
| **Website post-property** | `public.ts POST /post-property` | dedicated supply endpoint | `intent` from form | `LANDLORD`; dealer only if agent JWT/phone-match |
| **Website chatbox** | `chat_handler.ts` | buyer/search assistant, `contact_type=BUYER` default | search filter buy/rent | none |
| **Admin add-inventory** | `workflow_engine.ts` | agent-driven | `answers.intent` | `answers.ownership_type` (OWNER/EXTERNAL_AGENT/AGENT_OWNER) + key-holder flip |

## Root-cause gaps

1. **WhatsApp supply detection is weak + one-shot.** `SUPPLY_INTENT_RE`
   (`utils/intent_signals.ts:9`) matches "rent out / sell my / i have a flat / list my /
   my property" but MISSES common real phrasings: **"put it on rent" / "put on rent" /
   "having a property" / "property for rent" / "give on rent"** and Hindi/Hinglish
   ("kiraya pe dena hai", "bechna hai", "rent pe dena"). Nilin's "want to put it on rent"
   didn't match → he fell to the buyer keyword 'rent' (matches "rental") → buyer workflow.
   And once a **buyer session** starts, a later clear supply message is NOT re-routed.

2. **Owner wrongly turned into a DEALER.** `workflow_engine.ts:1054` registers the
   EXTERNAL **key holder** as `PARTNER_AGENT` via `ensurePartnerAgent`
   (`partner_auto_create.ts:52/58` sets `contact_type=PARTNER_AGENT` on create AND
   update) — with **no check that the key-holder phone == the owner phone**. An owner who
   holds his own keys (Nilin) gets flipped to dealer. Owner-vs-dealer should come from
   `ownership_type` / an explicit question, NOT from the key holder.

3. **Voice + chatbox never classify supply.** Voice = always UNKNOWN; chatbox = always
   BUYER. A seller/landlord on those channels is never routed to a listing flow.

4. **`contact_type` is single-valued + destructive.** A person can be a buyer today and a
   landlord tomorrow. Flipping the type (a) hides them from the Leads list
   (`routes/leads.ts:163` excludes LANDLORD/MANAGEMENT/PARTNER_AGENT) and (b) leaves any
   prior demand deal orphaned. Nothing reconciles the two.

---

## Proposed fix — phased

### Phase 0 — Stop the bleeding (acute bug + data)  [SMALL, do first]
- **Fix `workflow_engine.ts:1054`**: skip the external-key-holder→dealer registration when
  `normalize(key_holder_phone) === normalize(owner_phone)` (owner holds own keys → direct
  landlord). 
- **Harden `partner_auto_create.ts`**: `ensurePartnerAgent` must NOT downgrade an existing
  demand contact (BUYER/TENANT/UNKNOWN) to PARTNER_AGENT — only set it on create or when
  the contact isn't already a live lead.
- **Data cleanup**: reclassify Nilin → LANDLORD, remove the bogus PartnerAgent, close the
  stale buyer deal (CLOSED_LOST, "misclassified"). **Audit** all contacts flipped to
  PARTNER_AGENT via the owner==key-holder path and reclassify (same shape as the 467 sweep).

### Phase 1 — One classifier, two axes (single source of truth)  [MEDIUM]
- **Intent (rent/sell/buy)**: strengthen `SUPPLY_INTENT_RE` + add a `demandIntent`/
  `supplyIntent` matcher covering English + Hindi/Hinglish (put on rent, give on rent,
  kiraya pe dena, bechna hai, property for rent/sale, etc.). One shared util used everywhere.
- **Role (owner/dealer)**: a single `resolveSupplyRole()` that decides LANDLORD vs
  PARTNER_AGENT from an EXPLICIT signal (ownership_type answer, agent-auth, or a direct
  "owner or broker?" question) — never from key-holder. All capture paths call it.

### Phase 2 — Wire every channel to the classifier  [MEDIUM]
- **WhatsApp msg**: supply phrase beats buyer keyword on ambiguity; add a mid-buyer-session
  re-route ("looks like you want to LIST a property — is that right?"); on capture, ask
  rent/sell + owner/dealer explicitly.
- **WhatsApp voice**: classify from the call (supply mentioned → create a supply lead +
  agent task, not UNKNOWN).
- **Website chatbox**: detect "sell/rent out/list my property" → offer the listing flow +
  set LANDLORD (instead of buyer-search only).
- **Website post-property**: add an explicit **"I am: Owner / Dealer (agent)"** selector +
  confirm rent/sell.
- **Admin add-inventory**: drive owner/dealer from `ownership_type` (+ the key-holder fix).

### Phase 3 — Universal disambiguation prompt  [SMALL-MEDIUM]
When supply-vs-demand or owner-vs-dealer is ambiguous for a NEW contact, ask ONE
deterministic question (WhatsApp quick-reply / chatbox / voice / web): "List a property"
vs "Find a property", and "Owner" vs "Broker/Dealer". Deterministic > guessing.

### Phase 4 — Don't lose anyone (model + reconciliation)  [DECISION NEEDED]
- Decide how a person can hold BOTH roles over time. Options: (a) keep single
  `contact_type` but stop destructive flips + keep/relink prior deals + add a "supply
  leads" view so listers don't vanish; (b) add an explicit supply/demand role model
  (bigger). Reconcile stale deals when role changes.

### Phase 5 — Verification
Classifier unit tests across phrasings/languages; end-to-end test per channel; confirm no
lead "vanishes" (visible as owner in Inventory and/or a supply-leads view).

---

## Decisions needed from owner
1. **Scope/order**: do Phase 0 (bug+data) + Phase 2-WhatsApp now, then the rest? Or all.
2. **Ambiguity**: OK to ASK a one-tap clarifying question (adds a message) vs. guess harder?
3. **Model (Phase 4)**: keep single contact_type (non-destructive) [recommended, smaller]
   vs. a proper dual buyer+owner role model [bigger].
4. **Stale buyer deal fd6e8c40**: close (auditable) vs delete.

---

## EXECUTION STATUS (updated 2026-07-28)

- **Phase 0 — DONE** (`0f9b438`): key-holder≠owner guard (`workflow_engine.ts`) +
  no-demand-downgrade guard (`partner_auto_create.ts`). Nilin → LANDLORD, buyer deal
  fd6e8c40 closed (misclassified). Audited 170 flipped contacts; reclassified 121
  wrongly-flipped owners → LANDLORD (snapshot `/root/backups/owner_reclassify_snapshot_20260728.json`).
  Triage CSV in `docs/archive/2026-07-28-owner-flipped-to-partneragent-triage.csv`.
- **Phase 1 — DONE** (`257ead4`): `SUPPLY_INTENT_RE` strengthened (EN + Hindi/Hinglish:
  put on rent, give on rent, kiraya pe dena, bechna, etc.) + mid-buyer-session supply re-route.
- **Phase 2 — DONE** (`e21aa03` + verification): chatbox uses shared `isSupplyIntent`
  (→ redirect_upload); admin add-inventory owner-vs-dealer verified sound; **website
  post-property VERIFIED already sound** — the conversational flow (ChatWorkflowAdapter →
  ConversationalWorkflowCore → WorkflowEngine → `workflow_definition.ts`) already asks the
  web user "Who are you? Owner / Broker / Builder" (`user_role`, web platform) + Sale/Rent
  (`intent`), same engine as admin, Phase-0-hardened. Legacy `POST /public/post-property`
  (`submitProperty`) has ZERO callers — dead, LANDLORD default is safe. No deploy needed.
- **Phase 3 — DONE** (`a2b5f0f`): deterministic List-vs-Find disambiguation.
  - WhatsApp (backend): `services/disambiguation_router.ts` — early guard routes button
    taps (rp_intent_list/find) into supply/buyer workflow; `maybeSendDisambiguation` sends
    the 2-button prompt before the AI router, only for UNKNOWN + neither-matched + not-in-24h.
    `whatsapp.ts` gained `sendReplyButtons()`. Wired in `webhook_processor.ts`.
  - Website chatbox (frontend): `AIChatModal.tsx` welcome now offers List/Find chips on a
    fresh open (restored sessions untouched); taps → /post-property or startBuyerFlow().
    Built + `realty-website` restarted; chip strings confirmed live-served over HTTPS.
  - **Open item:** browser screenshot of the chatbox chips not yet captured (no reliable
    navigate+screenshot tool this session; verified via live-served bundle instead).

- **Phase 4a — DONE** (`a0a5cd0`): non-destructive lead visibility. `leads.ts` no longer
  hard-excludes owners/dealers; a contact shows in Leads if they are a normal demand lead OR
  have an active demand deal (`demand_transactions.some(status notIn CLOSED_WON/LOST)`),
  regardless of supply-side label. MANAGEMENT/staff stay out; composes with the active
  `lead_status` filter. **+22 previously-hidden real demand leads resurfaced** (default view
  4980 → 5002; 6 LANDLORD + 17 PARTNER_AGENT eligible, 1 excluded as lost). Owner-approved
  scope = owners + dealers with an active demand deal. Read-path only, no data mutation,
  reversible. Backup `/tmp/leads.ts.pre-phase4a`. Verified: reload healthy (200), no errors.

### Remaining (not started)
- **WhatsApp VOICE** (`voice.ts` always UNKNOWN) — needs the voice-bot (pipecat) transcript
  fed into the classifier. Separate integration, owner decision pending.
- **Phase 4b (optional, larger)** — general stale-deal reconciliation when a role changes
  (Phase 0 already fixed Nilin's specific stale deal), and — only if wanted — a proper dual
  buyer+owner role model (schema change). Note owners are ALSO already visible via Inventory +
  `/partners`; Phase 4a covers the demand-side "never lose a lead" outcome without a schema change.
- **Phase 5 — DONE (unit)** (`f44a322`): `src/__tests__/supply_intent.test.ts` — 33 vitest
  cases pinning `isSupplyIntent` (20 supply positives EN + Hindi/Hinglish, 9 demand negatives
  incl. "rent a flat" vs "rent out", 3 nullish edge, 1 Nilin regression guard). All pass.
  **Remaining (optional):** per-channel e2e (webhook_processor / chat_handler routing) — heavier,
  needs DB + whatsapp mocks.
- **Parked data** — 467 staff-as-owner re-entry; 99acres coord backfill (1678 leads);
  ~23 ambiguous flipped contacts.
