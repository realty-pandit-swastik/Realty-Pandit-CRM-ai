---
name: feedback_data_corrections_owned_by_lead_owner
description: Bad DATA in a property/lead (vs a code bug) is the lead/inventory OWNER's to correct — surface it, never silently fix it
metadata:
  type: feedback
---

When I spot **bad data** in a listing or lead (a junk value, not a code defect), I **surface it and stop** — I do **not** fix the record myself, even adjacent to an approved task. The lead/inventory owner (the employee who owns that lead) makes the correction.

**Instance (2026-06-10):** an "Open Market Shop" RENT listing shows **Display: ₹8,51,00,20,733/month (+₹851 Cr)** vs Demand ₹20,000/month — clearly a fat-fingered price. Puneet's instruction: **leave it incorrect; he already asked the employee who owns that lead to fix it.** Do NOT touch/normalize/"repair" that row, and don't keep re-flagging it.

**Why:** data entry is the owning agent's responsibility + accountability; a silent Claude-side edit erases that and can collide with the owner's own correction. This is consistent with prod-backup discipline ([[reference_prod_db_backup.md]]) and the three-mode protocol ([[feedback_three_mode_protocol]]) — data writes need explicit per-instance approval, and a "that value looks wrong" observation is **never** standing approval to change it.

**How to apply:** report the bad value + which record, note it's the owner's to fix, move on. Only touch the data if Puneet explicitly says "fix this record."
