---
name: reference_lead_recycler
description: 2026-06-12 Daily Lead Recycler — a live BullMQ cron that drains the un-worked lead backlog by re-surfacing old leads as fresh deals
metadata:
  type: reference
---

**Daily Lead Recycler (LIVE 2026-06-12, 9 AM IST cron).** Audit found 1,170 leads (62%) never converted to a deal with **zero recorded human follow-up** (1,082 ignored TODO tasks, 0 StaffCall logs — call-logging feature is unused). Fix: `services/lead_recycler.ts` + a `'0 9 * * *'` job in `scheduled_worker.ts`. Each morning, per active **sales** agent (employees/managers — **excludes super_boss/owner + the developer number +919958860411**), takes the **10 oldest un-converted leads**, calls `ensureDealForLead` → fresh NEW deal (same agent) + "📞 Call new lead" / "Qualify Lead" tasks + the standard new-lead Calendar/push, and (if the lead has criteria) `shareNextProperty` sends the customer a card. Each lead recycled **exactly once** via a `lead_recycled` interaction marker; backlog drains in ~31 days then the job idles. Owner digest shows "♻️ Recycled N today · M total." Pure pick logic is unit-tested (`pickForAgent`/`isJunkPhone`). Plan: `docs/plans/2026-06-12-daily-lead-recycler.md`. ⚠️ cron hour is IST not UTC ([[reference_bullmq_cron_ist]]). Single-agent (Vinod×3) verified; full 28-agent run not yet watched at scale.
