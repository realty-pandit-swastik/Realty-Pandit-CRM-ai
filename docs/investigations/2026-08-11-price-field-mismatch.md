# WhatsApp price fix + `price` column data corruption

**Date:** 2026-08-11 · **Code: FIXED and deployed.** **Data: REPORTED, owner to correct.**

---

## What was wrong

The WhatsApp property card rendered **`inventory.price`**, not `display_price`.
`services/property_sharing.ts` (`buildV5Card` + its v4 fallback) called:

```ts
const price = formatPrice(inv.price, inv.price_unit, inv.intent);
```

The public website already did this correctly (`routes/public.ts` → `p.display_price || p.price`), and so
did the team broadcast (`team_inventory_broadcast.ts`, whose comment even reads *"the public
display_price is shared"*). **Only the customer-facing card was wrong** — plus seven other outbound
surfaces.

## Why it mattered far more than the reported symptom

The trigger was 20853 showing ₹50 L instead of ₹55 L. The real exposure was much larger:
**104 of 821 active listings have `display_price ≠ price`**, and many are decimal-place errors.

What customers were actually being sent on WhatsApp:

| Listing | Card said | Should say |
|---|---|---|
| RP-GZB-RES-20888 | **₹75.0 Cr** | ₹75.0 Lakh |
| RP-GZB-RES-20445 | ₹42.5 Cr | ₹4.3 Cr |
| RP-GZB-RES-20499 | ₹40.0 Cr | ₹4.0 Cr |
| RP-GZB-RES-20834 | ₹18.0 Cr | ₹1.8 Cr |
| RP-GZB-RES-20350 | ₹11.0 Cr | ₹1.1 Cr |

A ₹75 lakh Vaishali flat was being quoted at **₹75 crore**.

## ⚠️ The trap that nearly made it worse

`price_unit` applies to **`price` only**. `display_price` is always raw rupees.

6 active listings carry a unit (`Crore` ×4, `Lakh` ×1, `Per Month` ×1) and store `price` in that unit —
e.g. `price = 1`, `unit = Crore`. `formatPrice` treats a unit-bearing value as already converted, so
naively passing `display_price` **with** the stored unit produces:

| Listing | Naive fix | Correct |
|---|---|---|
| RP-GZB-COM-20028 | **"11000000 Cr"** | 1.1 Cr |
| RP-GZB-RES-20038 | **"370000000 Cr"** | 37.0 Cr |
| RP-GZB-RES-20013 | **"7000000 Lakh"** | 70.0 Lakh |

**The rule: when using `display_price`, pass NO unit.** Fall back to `(price, price_unit)` only when
`display_price` is null.

```ts
const price = inv.display_price
    ? formatPrice(inv.display_price, undefined, inv.intent)
    : formatPrice(inv.price, inv.price_unit, inv.intent);
```

## Files changed (7)

| File | Change |
|---|---|
| `services/property_sharing.ts` | card v5 + v4 fallback |
| `agents/matching_agent.ts` | property matches sent to buyers |
| `agents/partner_agent.ts` | partner property messages |
| `services/deal_notifications.ts` | expression **+ `display_price` added to the Prisma select** |
| `services/llm.ts` | AI chat replies |
| `services/calendar.ts` | appointment confirmations **+ select** |
| `services/chat_handler.ts` | 2 renders **+ 2 selects** |

🔴 **Four of these needed `display_price: true` adding to a Prisma `select`.** Changing only the
expression would have returned `undefined`, silently fallen back to `price`, and fixed nothing.

`matching_agent` / `partner_agent` / `llm` needed no select change — `MatchedProperty` already carries
`display_price` (`matching_engine.ts:212`, populated at :468).

## Verification

- Type errors **394 → 394** — identical to the pre-change baseline (2 I introduced were found by a
  before/after diff and fixed: `null` → `undefined` for the optional `unit` param)
- Backend restarted, `/health` OK (db 3 ms, redis connected)
- Live smoke test: 20853 card **"50.0 Lakh" → "55.0 Lakh"**
- Line endings preserved per file (6 CRLF, 1 LF) — no whole-file diffs

**Deploy note:** prod runs TypeScript directly — `server-bootstrap.js` is
`require("ts-node").register({transpileOnly:true}); require("./src/server.ts")`. There is **no build
step**; `dist/` is dead code from 17 July. Edit `src/`, `pm2 restart`, done.

---

# 🔴 FOR THE OWNER — the `price` column is corrupt on 104 listings

The code fix stops customers seeing wrong numbers **on WhatsApp**. It does **not** repair the data,
and `price` is still read elsewhere (budget filters, matching, some analytics). Per standing practice,
bad data belongs to the owning agent, not to an automated rewrite.

## Breakdown

| Pattern | Count |
|---|---|
| `price` is **10×** `display_price` | 11 |
| `display_price` is **10×** `price` | 9 |
| `price` is **100×** `display_price` | 1 |
| `display_price` is **100×** `price` | 1 |
| Other genuine differences | 82 |
| **Total** | **104** |

The 22 power-of-ten rows are almost certainly typing slips. The other 82 may be legitimate
asking-vs-net differences and should be reviewed, not bulk-changed.

## ⭐ One agent accounts for most of the slips

**Ashwani** owns a large share of the 10× rows (20888, 20445, 20368, 20411, 20367, 20701, 20707,
20712, 20498, 20140, 20316, 20870, 20412 …). That points at a **data-entry habit or a confusing form
field**, not 13 unrelated mistakes — worth a conversation and possibly an input guard, rather than 13
individual corrections.

Also present: three listings with an absurd `price` — `RP-GZB-RES-20038` (**₹3**),
`RP-GZB-RES-20014` (**₹1**), `RP-GZB-RES-20018` (**₹5**).

## Regenerate the full list any time

```sql
select i.display_id, i.category, i.price::bigint, i.display_price::bigint,
       round(i.price/nullif(i.display_price,0),2) as ratio,
       coalesce(a.name,'-') as agent, coalesce(i.locality,i.city,'-') as area
from inventory i left join agents a on a.id = i.assigned_agent_id
where i.status='active' and i.display_price is not null and i.display_price <> i.price
order by abs(i.price - i.display_price) desc;
```

## Suggested guard (not implemented)

Add a validation on inventory create/update that flags a >5× divergence between `price` and
`display_price` for confirmation. That stops the next slip at entry rather than at the customer.
