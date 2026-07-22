# Real WhatsApp conversations — what the AI actually does (2026-06-21)

Pulled real client↔Panditji transcripts from prod (`interactions`, channel=whatsapp). This is ground-truth evidence for the qualification/chat rebuild. **Verdict: the AI chat is underperforming badly in production** — it deflects, spams mismatched cards, ignores stated requirements, and leaks errors. Below: each failure with a real example, frequency, and root cause.

## Quantified (640 outbound text replies)
- **23% canned/broken** = "team member will assist" deflect (13%) + "experiencing high traffic" error leaked to the client (7%) + visit-menu/"no visit" lines (4%)
- **16%** of replies show **₹0.0 Lakh** prices
- **27%** are "Properties Found" card dumps (often mismatched / repeated)

## Failure patterns (ranked)

### F1 — The bot DEFLECTS instead of capturing (the #1 problem)
A complete lead gets "🙏 a team member will assist you shortly" on **every** message, capturing nothing.
- **Sonia** (`+917830467676`): "Rent, 2 BHK, fully furnished, below 24000, preferred ground floor or villa, gaur yamuna city greater noida, For Myself" → every line answered with the canned deflect. A perfect, fully-specified lead — the AI engaged zero times.
- **Prince** (`+918396080778`): "1 bhk full furnished near Vaishali metro station / For rent" → deflect, deflect, deflect.
- Root: messages fall through to the **safety-net ack** instead of running SalesAgent intake. The conversational AI barely executes.

### F2 — The bot SPAMS mismatched property cards, ignoring stated requirements
- **Nandini** (`+918851897603`, 16 inbound / 1 real reply): "3 bhk flat under 50 lakh" + a list of Ghaziabad localities → bot sends a **1BHK** card. "I said 3 bhj" / "I want 3 bhk" (×4) → keeps sending 1BHK/2BHK. "Villa under 50 lakh" → sends 1BHK builder_flat. The stated **BHK, type, budget, and locations were all ignored**; the bot just fired the next card on every reply.
- Root: the "generic message → share next card" path fires on every inbound; requirement capture isn't updating the deal; matching isn't respecting stated BHK/type/budget.

### F3 — Requirement capture misses real client phrasing
Locations clients actually use are **not in the hardcoded whitelist** → silently dropped: Siddharth Vihar, Raj Nagar Extension, Pratap Vihar, Guldhar, Sanjay Nagar, Niti Khand, Kaushambi, **Gaur Yamuna City**, Vasundhara, Indirapuram. Also missed: multi-intent ("independent house OR 3bhk flat under 50 lakh"), "villa under 50 lakh", BHK typos ("bhj"), Hinglish ("Vaishali mein 2 bhk dikhao", "ghar").

### F4 — The visit Confirm/Reschedule/Cancel menu loops + self-contradicts
- **`+917986024171`**: bot repeats "You have a property visit scheduled. 1.Confirm 2.Reschedule 3.Cancel"; client replies 1/2/3 → same menu again; then "I don't see an active visit to cancel" immediately followed by the menu again. Stuck loop, broken UX.

### F5 — Cards show ₹0.0 Lakh (16% of replies)
- **Prince, Sonia**: "VILLA 💰 ₹0.0 Lakh", "APARTMENT 💰 ₹0.0 Lakh". Rent listings / missing price render as ₹0 — looks broken to the client.

### F6 — Wrong audience: a SELLER treated as a buyer
- **Sharad** (`+919871828635`, 7 inbound / 0 replies): pastes a detailed **commercial property he's OFFERING** ("For sale commercial property near Kaushambi Metro… 4000 sq ft… leased to a brand") + photos → bot sends him **residential villa/apartment** cards. He's a supply lead; the bot mis-handled him as demand and never engaged.

### F7 — Operational embarrassments
- **"I am currently experiencing high traffic"** persisted and re-sent as a **followup nudge** to clients (Ansh, `+919999947252`) — 7% of all replies leak this error text.
- Identical "3 Properties Found" card re-sent for days (Ansh: same block 6+ times).
- Cards fired on meaningless inputs ("Test", "Reply", "yes").

## What this means for the rebuild (re-prioritized)
The original A1/A2 plan is still right but the real chats show the **bigger** wins are conversation + matching, not just the gate:

1. **P0 — Make the AI converse + capture (not deflect).** Run real intake on every demand message: acknowledge → capture → ask for the ONE missing thing → read-back. Kill the "team member will assist" as the default. *(supersedes/expands A2)*
2. **P0 — Stop card-spam; respect stated BHK/type/budget in matching.** A reply ≠ "send next card"; only share when criteria changed or the client asked. Never send a 3BHK-seeker a 1BHK.
3. **P1 — Requirement capture overhaul.** Free-text locations (drop the whitelist / geocode), BHK typos, multi-intent, Hinglish, "villa under 50 lakh". *(extends A1)*
4. **P1 — Fix ₹0 prices on cards** (rent vs sale price field).
5. **P1 — Fix the visit menu loop** (idempotent state; stop re-sending; resolve "no visit" contradiction).
6. **P2 — Seller-vs-buyer detection** (Sharad); never leak "high traffic" to clients; de-dup repeated cards.

**Already shipped (A1, 2026-06-21):** budget_min no longer fabricated; residential/commercial now captured into `contact.category_id`. These help #3 but the real chats show #1 + #2 are the urgent fixes.

---

## Resolution — ALL fixed + deployed + verified 2026-06-21

| # | Issue | Fix (deployed) | Verified |
|---|---|---|---|
| F1 | Bot deflects instead of conversing | `SalesAgent` deterministic ask→read-back→qualify-on-confirm (no LLM dependency for capture) | e2e on prod |
| F2 | Card-spam + wrong BHK | matching HARD-filters single demand `bhk`; `webhook 3b.3` qualifies only on location+budget, shares only on new-criteria/"more" | 3BHK search → only BHK=3 |
| F3 | Capture misses budget/sector | `extractReqSlots` now captures budget + keeps the sector | real-message tests |
| F4 | Visit-menu loop / "no visit" | unified confirm/reschedule/cancel lookup to any non-terminal appointment (no-appt case already gated) | logic + tsc |
| F5 | ₹0.0 Lakh prices | intent-aware `formatPropertyPrice` (rent→/month, sale→Lakh/Cr, 0→"Price on request") across all card emitters | price cases on prod |
| F6 | Seller treated as buyer | `isSupplyIntent` skips buyer-deal create, routes UNKNOWN sellers to inventory flow + 3b.3 backstop | supply vs demand on prod |
| F7-A | "high traffic" leaked to clients | `isLlmFallback` guard in `followup_scheduler` + `interaction_engine` | fallback-block on prod |
| F7-B | Identical cards re-sent | `handleMoreResults` now applies the offset (paginates); deal path already dedups via `shareNextProperty` | logic + tsc |

New shared helpers: `utils/format_price.ts`, `utils/intent_signals.ts`. All deployed; backend tsc 379 (0 new).
