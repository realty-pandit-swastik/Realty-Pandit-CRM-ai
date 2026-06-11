# P1 — Requirement Capture (deal-pipeline AI) — task-level plan

> Phase 1 of the "Reliable Automation Machine" master plan. **For review before implementation** — it changes the live conversational flow, so it must be live-tested on a controlled WhatsApp number before going wide. TDD where the harness supports it (vitest; baseline 162/172 per `reference_test_tsc_baseline`). Lane: `wt/backend`.

**Goal:** When a buyer states a requirement — in one message or step-by-step ("1 BHK" → "Vaishali" → "Rent") — the bot **captures it, persists it, confirms it, and either sends matching v5 cards or asks the next missing detail.** It must never drop a requirement message (audit: only 28% got a card; 51% canned/no-reply).

## Root cause (confirmed in code)
1. `agents/sales_agent.ts:extractBuyerData` (307) captures **location, budget, type** but **NOT intent (rent/buy) nor standalone BHK** — so "Rent" and "1 BHK" as short answers are lost.
2. `services/webhook_processor.ts` step **3b.3** sends short messages on an active deal straight to `shareNextProperty()` (blind next-card) — it never runs `extractBuyerData`, so "1 BHK"/"Vaishali" on a live deal are dropped (the `…9483` step-by-step failure).
3. No LLM fallback when regex finds nothing in messy free text.

## Files
- Modify: `agents/backend/src/agents/sales_agent.ts` (`extractBuyerData` + persist)
- Modify: `agents/backend/src/services/webhook_processor.ts` (3b classification)
- Modify: `agents/backend/src/services/llm.ts` (add `extractRequirementSlots`)
- Create: `agents/backend/src/__tests__/requirement_capture.test.ts`
- Reuse: `utils/demand_canonical` (foldLegacyDemand), `services/matching_engine` (`buildMatchCriteriaFromLead`), `shareNextProperty` (v5 card path), `toInventoryIntent` ([[reference_match_intent_and_reflect_fix]]).

---

## Task 1 — Capture INTENT + BHK in `extractBuyerData` (regex)
- [ ] **Test first** (`requirement_capture.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { extractReqSlots } from '../agents/sales_agent'; // export the pure helper (Task 1 refactor)
describe('extractReqSlots', () => {
  it('captures standalone intent', () => { expect(extractReqSlots('Rent')).toMatchObject({ intent: 'rent' }); expect(extractReqSlots('I want to buy')).toMatchObject({ intent: 'buy' }); });
  it('captures standalone BHK', () => { expect(extractReqSlots('1 BHK')).toMatchObject({ bhk: 1 }); expect(extractReqSlots('2bhk')).toMatchObject({ bhk: 2 }); });
  it('captures combined', () => { expect(extractReqSlots('1bhk rent vaishali')).toMatchObject({ bhk: 1, intent: 'rent', location: expect.stringContaining('vaishali') }); });
  it('returns empty for chit-chat', () => { expect(extractReqSlots('hello')).toEqual({}); });
});
```
- [ ] Run → fails (no `extractReqSlots`).
- [ ] **Refactor** `extractBuyerData` into a pure `export function extractReqSlots(msg: string)` returning `{ intent?, bhk?, type?, location?, budget_min?, budget_max? }`; add:
  - **intent:** `/\b(rent|kiray|on rent|lena hai rent)\b/i → 'rent'`; `/\b(buy|purchase|kharid|sale|sell|lena hai)\b/i → 'buy'`.
  - **bhk:** `/(\d)\s*\/?\s*(\d)?\s*(?:bhk|bedroom|bed|rk)\b/i` (mirror `matching_engine.extractBhkInt`).
  - keep existing location/budget/type.
- [ ] Run → passes.
- [ ] **Persist:** in QUALIFICATION (sales_agent ~193), write captured `intent` to `contact.intent`/the deal, and `bhk` into `demand_schema_values.bhk` via `foldLegacyDemand` (deep-merge, don't clobber). Commit.

## Task 2 — LLM slot-extractor fallback (`llm.ts`)
- [ ] Add `extractRequirementSlots(message, history?)` to `LLMService` — a structured Gemini call returning JSON `{intent,bhk,type,location,budget_max}` (reuse `callGemini` with a JSON fallback like the existing `classifyWithConfidence` at llm.ts:204). Cache by message hash.
- [ ] In `extractBuyerData`, when regex yields nothing meaningful, call the LLM extractor (now resilient via P0 retry). Test with a mocked LLMService returning a fixed JSON.
- [ ] Commit.

## Task 3 — Fix the 3b.3 drop (route requirement messages to capture, not blind next-card)
- [ ] **In `webhook_processor.ts` step 3b:** before the GENERIC branch calls `shareNextProperty`, run `extractReqSlots(text)`. **If it returns any slot** (intent/bhk/type/location), treat the message as a **requirement update** — fall through to `message_router` (→ sales_agent capture + persist + reply/card), NOT blind `shareNextProperty`. Only truly contentless generics ("hi", "ok", "yes") keep the auto-share-next behaviour.
- [ ] Test: a unit test on the classification helper (extract the "is this a requirement message" predicate as a pure fn) asserting "1 BHK"/"Vaishali"/"rent" → requirement; "hi"/"ok" → not.
- [ ] Commit.

## Task 4 — Always-respond + confirm (close the loop)
- [ ] In the QUALIFICATION path, after capture: if criteria sufficient (intent + (location|budget) + type/bhk) → run matching → **v5 card** (the deal-context path already does this, [[reference_deal_ai_conversational_card]]); else → reply confirming what was captured + ask the **single** next missing slot ("Got it — 1BHK on rent. Which area/sector?"). Never return an empty reply. (P0 already covers LLM-failure here.)
- [ ] Suppress ₹0 / wrong-intent matches before sending (ties into P5; do the intent hard-filter here).
- [ ] Commit.

## Verification (must pass before going wide)
1. `npx tsc --noEmit` → no new errors vs the ~381 baseline; `npx vitest run requirement_capture` → green.
2. **Deploy backend, then LIVE test on a controlled number:** send step-by-step "1 bhk" → "rent" → "vaishali" → each is acknowledged, persisted (check `demand_schema_values`), and once enough, a **v5 card** arrives (correct intent, not ₹0). Then send "1bhk rent vaishali" in one message → card.
3. Re-run the WhatsApp audit → requirement-card% rises from 28%, dropped% falls from 51%, hanging threads fall.

## Skills used: test-driven-development (the vitest above), systematic-debugging (the 3b trace already done), verify (live WhatsApp walkthrough), verification-before-completion (audit deltas as evidence).

## Risk / rollback
Conversational-flow change → deploy, live-test on YOUR number first; if a regression, `git revert` the P1 commits + redeploy (backend is ts-node, no migration, instant rollback). Keep P0 (already live) intact.
