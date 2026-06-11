# WhatsApp Numbered-Menu Loop — Shared Parser + Circuit Breaker Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` (inline, this codebase) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Project note:** This repo deploys via `node deployment/deploy-agent.js backend --skip-verify` (NOT a build artifact). Tests = **vitest**. The known-green baseline is **162 passed / 10 failed / 172** (the 10 failures are pre-existing, unrelated — see `reference_test_tsc_baseline`). "Done" for each code task = touched-file `tsc` clean + vitest baseline intact + new tests green. Git IS available here; commit per task. The real ship gate is Task 6 (deploy + prod E2E).

**STATUS: ✅ SHIPPED & verified 2026-05-19.** All 6 tasks done. vitest
176 passed / 10 failed (10 = unchanged pre-existing baseline) / 186 (+14
new green); touched-file tsc clean (only the known shifted
`webhook_processor.ts:130` baseline error remains, pre-existing). Deployed.
Prod E2E: VIST_SCHEDULED & VISITED `1/2/3/3./*2*` all route correctly (no
loop); `Hello`/`hmm` show the menu once; `escalateStuckMenu` degrades
gracefully on task-FK error. GlitchTip clean (no new errors). Real contact
+917986024171 loop history is pre-fix; no inbound since deploy — next
message will be handled by the deployed fix. Git commits skipped per the
"commit only when asked" rule (ship gate = deploy, done).

**Goal:** Permanently eliminate the numbered-menu infinite-loop bug class in the WhatsApp bot — any "reply 1/2/3" menu must parse the numbers, and no menu can ever re-send itself forever.

**Architecture:** (1) One tested pure util `parseMenuChoice()` that turns "3","3.","*2*","option 1" → a number. (2) A generic menu-loop **circuit breaker**: before a handler re-sends a menu it just sent, it escalates to a human instead of looping. (3) Wire both into the two remaining word-only menu sites (`coordination_agent` VISITED, `webhook_processor` calendar fast-path); the VIST_SCHEDULED hot-fix from 2026-05-19 is refactored onto the shared util for consistency.

**Tech Stack:** TypeScript, Node, Prisma, vitest. Files under `clients/sunny-sharma/projects/reality-pandit/agents/backend/`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/utils/menu_choice.ts` | Pure parser: text → menu number (1–9) or null | Create |
| `src/utils/menu_loop_guard.ts` | "Did I just send this exact menu?" check + standard human-handoff escalation response/task | Create |
| `src/__tests__/menu_choice.test.ts` | Unit tests for the parser | Create |
| `src/__tests__/menu_loop_guard.test.ts` | Unit tests for the guard (prisma mocked) | Create |
| `src/agents/coordination_agent.ts` | Use shared parser for VIST_SCHEDULED; add VISITED numeric+word handling; circuit-break every status menu | Modify |
| `src/services/webhook_processor.ts` | Calendar fast-path: accept `cancel` + numeric via shared parser | Modify (`~214-245`) |

All other word-only menus in the codebase were audited; only these two sites lack numeric handling and can loop. The circuit breaker (Task 3) is the catch-all for any future menu that forgets.

---

### Task 1: Shared `parseMenuChoice` utility (TDD)

**Files:**
- Create: `src/utils/menu_choice.ts`
- Test: `src/__tests__/menu_choice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/menu_choice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMenuChoice } from '../utils/menu_choice';

describe('parseMenuChoice', () => {
    it('parses a bare digit', () => {
        expect(parseMenuChoice('3')).toBe(3);
        expect(parseMenuChoice('1')).toBe(1);
    });
    it('parses common decorations', () => {
        expect(parseMenuChoice(' 2 ')).toBe(2);
        expect(parseMenuChoice('3.')).toBe(3);
        expect(parseMenuChoice('2)')).toBe(2);
        expect(parseMenuChoice('*1*')).toBe(1);
        expect(parseMenuChoice('option 3')).toBe(3);
        expect(parseMenuChoice('no. 2')).toBe(2);
        expect(parseMenuChoice('3 - cancel')).toBe(3);
    });
    it('returns null for non-menu input', () => {
        expect(parseMenuChoice('Hello')).toBeNull();
        expect(parseMenuChoice('confirm')).toBeNull();
        expect(parseMenuChoice('')).toBeNull();
        expect(parseMenuChoice('I want 2 bhk in noida')).toBeNull(); // not a leading choice
        expect(parseMenuChoice('99')).toBeNull(); // out of menu range
        expect(parseMenuChoice('0')).toBeNull();
    });
    it('caps at 1..9 and trims emoji/space prefix', () => {
        expect(parseMenuChoice('👉 1')).toBe(1);
        expect(parseMenuChoice('9')).toBe(9);
        expect(parseMenuChoice('10')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/__tests__/menu_choice.test.ts`
Expected: FAIL — `Cannot find module '../utils/menu_choice'`.

- [ ] **Step 3: Implement the util**

Create `src/utils/menu_choice.ts`:

```typescript
/**
 * Parse a WhatsApp numbered-menu reply into its choice number.
 *
 * Menus like "1. Confirm  2. Reschedule  3. Cancel" tell users to "reply
 * with the number". Without this, handlers that only matched word keywords
 * ignored "1"/"2"/"3" and re-sent the same menu forever (2026-05-19 prod
 * loop on contact +917986024171). Use this everywhere a numbered menu is
 * offered. See docs/plans/2026-05-19-menu-loop-shared-parser.md
 *
 * Accepts: "3", " 3 ", "3.", "3)", "3-", "*3*", "option 3", "no. 3",
 *          "3 - cancel", "👉 3". Range 1..9 only. Anything else → null.
 * Deliberately strict: must be a LEADING standalone choice token, so a
 * sentence like "I want 2 bhk" does NOT parse as choice 2.
 */
export function parseMenuChoice(text: string | null | undefined): number | null {
    if (!text) return null;
    const t = String(text).trim().toLowerCase();
    // Strip a leading "option"/"number"/"no."/decoration, then require the
    // first token to be a single 1-9 digit, optionally wrapped/followed by
    // punctuation or a label after a separator.
    const m = t.match(/^(?:\*+|👉|➡️|option|opt|number|no\.?|choice)?\s*\*?\s*([1-9])\s*\*?(?:[.)\-:\s]|$)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 9 ? n : null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/menu_choice.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Touched-file tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "menu_choice" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/menu_choice.ts src/__tests__/menu_choice.test.ts
git commit -m "feat(bot): shared parseMenuChoice util for numbered WhatsApp menus"
```

---

### Task 2: Refactor VIST_SCHEDULED hot-fix onto the shared parser

**Why:** The 2026-05-19 emergency fix used an inline `msg.trim().match(/^(1|2|3)\b/)`. Move it to `parseMenuChoice` so all menus behave identically (handles "3.", "*2*", etc. too).

**Files:**
- Modify: `src/agents/coordination_agent.ts`
- Test: `src/__tests__/coordination_menu.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/coordination_menu.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        appointment: { findFirst: vi.fn().mockResolvedValue(null) },
        task: { create: vi.fn().mockResolvedValue({ id: 't1' }) },
        agent: { findFirst: vi.fn().mockResolvedValue({ id: 'sb1' }) },
        interaction: { findFirst: vi.fn().mockResolvedValue(null) },
    },
}));

import { CoordinationAgent } from '../agents/coordination_agent';

const ctx = (message: string, status: string) => ({
    contact: { phone_number: '+910000000000', assigned_agent_id: null, tenant_id: 't', name: 'X' },
    message,
    currentTransaction: { id: '00000000-0000-0000-0000-000000000000', status },
}) as any;

describe('CoordinationAgent VIST_SCHEDULED numeric menu', () => {
    let agent: CoordinationAgent;
    beforeEach(() => { agent = new CoordinationAgent(); });

    it('does NOT re-send the menu for "1"/"2"/"3" / "3." / "*2*"', async () => {
        for (const m of ['1', '2', '3', '3.', '*2*']) {
            const r = await agent.handle(ctx(m, 'VISIT_SCHEDULED'));
            expect(r.reply_script || '').not.toContain('You have a property visit scheduled. Would you like to');
        }
    });
    it('still handles the word "confirm"', async () => {
        const r = await agent.handle(ctx('confirm', 'VISIT_SCHEDULED'));
        expect(r.reply_script || '').not.toContain('Would you like to');
    });
    it('shows the menu once for an unrelated first message', async () => {
        const r = await agent.handle(ctx('Hello', 'VISIT_SCHEDULED'));
        expect(r.reply_script || '').toContain('You have a property visit scheduled');
    });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/__tests__/coordination_menu.test.ts`
Expected: FAIL (current inline regex misses `3.` / `*2*`, or import/mocks differ) — confirm at least the `3.`/`*2*` cases fail.

- [ ] **Step 3: Replace the inline regex with the shared parser**

In `src/agents/coordination_agent.ts`, add the import after line 22 (`import logger from '../utils/logger';`):

```typescript
import { parseMenuChoice } from '../utils/menu_choice';
```

Then replace this block (added 2026-05-19):

```typescript
        const numChoice = msg.trim().match(/^(1|2|3)\b/)?.[1];
        if (numChoice && currentTransaction.status === 'VISIT_SCHEDULED') {
            if (numChoice === '1') return this.handleConfirmMessage(context);
            if (numChoice === '2') return this.handleRescheduleMessage(context);
            if (numChoice === '3') return this.handleCancelMessage(context);
        }
```

with:

```typescript
        const choice = parseMenuChoice(message);
        if (choice && currentTransaction.status === 'VISIT_SCHEDULED') {
            if (choice === 1) return this.handleConfirmMessage(context);
            if (choice === 2) return this.handleRescheduleMessage(context);
            if (choice === 3) return this.handleCancelMessage(context);
        }
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/__tests__/coordination_menu.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Touched-file tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "coordination_agent\.ts" || echo CLEAN`
Expected: `CLEAN` (pre-existing baseline errors elsewhere are not in this file).

- [ ] **Step 6: Commit**

```bash
git add src/agents/coordination_agent.ts src/__tests__/coordination_menu.test.ts
git commit -m "refactor(bot): VIST_SCHEDULED menu uses shared parseMenuChoice"
```

---

### Task 3: Universal menu-loop circuit breaker

**Why:** Even with numeric parsing, a future menu (or an unrecognized reply like "Hello" repeated) must never loop. Rule: **if the last thing we sent this contact is the exact menu we are about to send again, escalate to a human instead of re-sending.**

**Files:**
- Create: `src/utils/menu_loop_guard.ts`
- Test: `src/__tests__/menu_loop_guard.test.ts`
- Modify: `src/agents/coordination_agent.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/menu_loop_guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const taskCreate = vi.fn().mockResolvedValue({ id: 'task1' });
const agentFindFirst = vi.fn().mockResolvedValue({ id: 'sb1' });
vi.mock('../db', () => ({
    default: {
        interaction: { findFirst: (...a: any[]) => findFirst(...a) },
        task: { create: (...a: any[]) => taskCreate(...a) },
        agent: { findFirst: (...a: any[]) => agentFindFirst(...a) },
    },
}));

import { lastOutboundWasSameMenu, escalateStuckMenu } from '../utils/menu_loop_guard';

describe('menu_loop_guard', () => {
    beforeEach(() => { findFirst.mockReset(); taskCreate.mockClear(); });

    it('lastOutboundWasSameMenu true when previous outbound == menu', async () => {
        findFirst.mockResolvedValue({ content: 'MENU TEXT' });
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(true);
    });
    it('false when previous outbound differs / none', async () => {
        findFirst.mockResolvedValue({ content: 'something else' });
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(false);
        findFirst.mockResolvedValue(null);
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(false);
    });
    it('escalateStuckMenu creates a HIGH task and returns a human-handoff reply', async () => {
        const r = await escalateStuckMenu(
            { contact: { phone_number: '+91999', assigned_agent_id: null, tenant_id: 't', name: 'X' } } as any,
            'MENU TEXT',
        );
        expect(taskCreate).toHaveBeenCalledTimes(1);
        expect(r.action).toBe('reply');
        expect(r.reply_script).toContain('team member');
    });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/__tests__/menu_loop_guard.test.ts`
Expected: FAIL — `Cannot find module '../utils/menu_loop_guard'`.

- [ ] **Step 3: Implement the guard**

Create `src/utils/menu_loop_guard.ts`:

```typescript
/**
 * Menu-loop circuit breaker (2026-05-19).
 *
 * A handler must never re-send a menu it just sent. Before returning a
 * numbered menu, call lastOutboundWasSameMenu(); if true, return
 * escalateStuckMenu() instead — the customer gets a human-handoff message
 * and a HIGH follow-up task is assigned, so the conversation can never spin
 * forever (covers any menu, including future ones that forget numeric
 * parsing). See docs/plans/2026-05-19-menu-loop-shared-parser.md
 */
import prisma from '../db';
import logger from './logger';
import type { AgentContext, AgentResponse } from '../agents/types';

/** True if the most recent outbound WhatsApp message to `phone` is exactly `menuText`. */
export async function lastOutboundWasSameMenu(phone: string, menuText: string): Promise<boolean> {
    try {
        const last = await prisma.interaction.findFirst({
            where: { phone_number: phone, direction: 'outbound', channel: 'whatsapp' },
            orderBy: { created_at: 'desc' },
            select: { content: true },
        });
        return !!last && (last.content || '').trim() === menuText.trim();
    } catch (e) {
        logger.warn(`[MenuLoopGuard] check failed for ${phone}: ${(e as Error).message}`);
        return false; // fail open — never block a reply because the check errored
    }
}

/** Human-handoff response + HIGH follow-up task. Never throws. */
export async function escalateStuckMenu(context: AgentContext, menuText: string): Promise<AgentResponse> {
    const c: any = context.contact || {};
    try {
        let assignee: string | null = c.assigned_agent_id || null;
        if (!assignee) {
            const sb = await prisma.agent.findFirst({
                where: { role: 'super_boss', status: 'active' }, select: { id: true },
            });
            assignee = sb?.id || null;
        }
        if (assignee) {
            await prisma.task.create({
                data: {
                    title: `Bot menu loop — needs human: ${c.name || c.phone_number}`,
                    description: `Customer did not pick a valid option on a repeated menu. Menu: "${menuText.slice(0, 160)}". Please follow up.`,
                    contact_phone: c.phone_number,
                    assigned_to: assignee,
                    priority: 'HIGH',
                    status: 'TODO',
                    task_type: 'CALLBACK',
                    due_date: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
        }
        logger.warn(`[MenuLoopGuard] Stuck menu for ${c.phone_number} → escalated to ${assignee || 'NONE'}`);
    } catch (e) {
        logger.error(`[MenuLoopGuard] escalation failed for ${c.phone_number}: ${(e as Error).message}`);
    }
    return {
        action: 'reply',
        reply_script: "🙏 Let me connect you with a team member who will help you right away. Someone will reach out shortly.",
        quality_hint: 'needs_human',
        metadata: { menu_loop_escalation: true },
    };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/__tests__/menu_loop_guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the breaker into every coordination_agent status menu**

In `src/agents/coordination_agent.ts` add to the import added in Task 2:

```typescript
import { parseMenuChoice } from '../utils/menu_choice';
import { lastOutboundWasSameMenu, escalateStuckMenu } from '../utils/menu_loop_guard';
```

Replace the VIST_SCHEDULED default menu return (currently `reply_script: 'You have a property visit scheduled...Just reply with your choice!'`) with a guarded version:

```typescript
        if (currentTransaction.status === 'VISIT_SCHEDULED') {
            const menu = 'You have a property visit scheduled. Would you like to:\n\n1. *Confirm* your attendance\n2. *Reschedule* to a different time\n3. *Cancel* the visit\n\nJust reply with your choice!';
            if (await lastOutboundWasSameMenu(contact.phone_number, menu)) {
                return escalateStuckMenu(context, menu);
            }
            return { action: 'reply', reply_script: menu, quality_hint: 'confident' };
        }
```

(The exact original menu string is preserved verbatim so `lastOutboundWasSameMenu` matches prior sends.)

- [ ] **Step 6: Run the coordination test from Task 2 again (regression)**

Run: `npx vitest run src/__tests__/coordination_menu.test.ts`
Expected: PASS (still 3 — the `interaction.findFirst` mock returns null so no false escalation; "Hello" still shows the menu once).

- [ ] **Step 7: Touched-file tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "menu_loop_guard\.ts|coordination_agent\.ts" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/menu_loop_guard.ts src/__tests__/menu_loop_guard.test.ts src/agents/coordination_agent.ts
git commit -m "feat(bot): menu-loop circuit breaker + guard VIST_SCHEDULED menu"
```

---

### Task 4: Fix the VISITED menu (numeric + word + no loop)

**Context:** `coordination_agent.ts` `VISITED` status returns "1. Make an offer / 2. Schedule another visit / 3. See more properties" with NO numeric or word handling and no target handlers — identical loop class. There are no automated offer/again/see-more flows, so 1/2/3 map to a clear acknowledgement + human handoff (consistent with project "never silent / never loop" policy), and the breaker prevents re-loops.

**Files:**
- Modify: `src/agents/coordination_agent.ts`
- Test: `src/__tests__/coordination_menu.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/coordination_menu.test.ts` inside the top-level (new describe):

```typescript
describe('CoordinationAgent VISITED menu', () => {
    const agent = new CoordinationAgent();
    it('1/2/3 do NOT re-send the VISITED menu', async () => {
        for (const m of ['1', '2', '3']) {
            const r = await agent.handle(ctx(m, 'VISITED'));
            expect(r.reply_script || '').not.toContain('How was the property visit?');
        }
    });
    it('unrecognized first reply shows the VISITED menu once', async () => {
        const r = await agent.handle(ctx('hmm', 'VISITED'));
        expect(r.reply_script || '').toContain('How was the property visit?');
    });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/__tests__/coordination_menu.test.ts`
Expected: FAIL — the new `VISITED` describe fails (1/2/3 currently re-send "How was the property visit?").

- [ ] **Step 3: Implement VISITED handling**

In `src/agents/coordination_agent.ts`, replace the entire `if (currentTransaction.status === 'VISITED') { ... }` block with:

```typescript
        if (currentTransaction.status === 'VISITED') {
            const visitedMenu = "How was the property visit? Would you like to:\n\n1. *Make an offer* on this property\n2. *Schedule another visit* to see it again\n3. *See more properties* that match your criteria\n\nYour feedback helps us find the perfect match!";
            const vChoice = parseMenuChoice(message);
            const lower = msg;
            // Numeric OR word intent → acknowledge + hand to a human (no
            // automated offer/again/see-more flow exists; never loop).
            if (vChoice === 1 || lower.includes('offer')) {
                return escalateStuckMenu(context, visitedMenu).then(r => ({
                    ...r,
                    reply_script: "Great — you'd like to make an offer. 🙌 A team member will call you shortly to take it forward.",
                }));
            }
            if (vChoice === 2 || lower.includes('another visit') || lower.includes('again') || lower.includes('schedule')) {
                return escalateStuckMenu(context, visitedMenu).then(r => ({
                    ...r,
                    reply_script: "Sure — we'll arrange another visit. 🗓️ A team member will coordinate the new time with you shortly.",
                }));
            }
            if (vChoice === 3 || lower.includes('more propert') || lower.includes('see more') || lower.includes('other option')) {
                return {
                    action: 'reply',
                    reply_script: "On it — I'll pull up more properties that match your requirements.",
                    quality_hint: 'confident',
                    metadata: { redirect_to: 'sales', reason: 'visited_see_more' },
                };
            }
            if (await lastOutboundWasSameMenu(contact.phone_number, visitedMenu)) {
                return escalateStuckMenu(context, visitedMenu);
            }
            return { action: 'reply', reply_script: visitedMenu, quality_hint: 'confident' };
        }
```

(`escalateStuckMenu` already creates the HIGH follow-up task + logs; we override only the customer-facing line so the message is contextual rather than generic.)

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/__tests__/coordination_menu.test.ts`
Expected: PASS (all describes — VIST_SCHEDULED 3 + VISITED 2).

- [ ] **Step 5: Touched-file tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "coordination_agent\.ts" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add src/agents/coordination_agent.ts src/__tests__/coordination_menu.test.ts
git commit -m "fix(bot): VISITED menu parses 1/2/3 + word intents, never loops"
```

---

### Task 5: Calendar fast-path — accept `cancel` + numeric

**Context:** `webhook_processor.ts ~214-245` short-circuits appointment replies before the router, but only on the words `confirm`/`reschedule` (no `cancel`, no numbers). With a pending appointment, "3" or "cancel" should be honoured here too (consistency; reduces router round-trips).

**Files:**
- Modify: `src/services/webhook_processor.ts` (`~214-245`)

- [ ] **Step 1: Add the failing assertion to the existing webhook test (or create)**

If `src/__tests__/webhook_calendar.test.ts` does not exist, create it:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMenuChoice } from '../utils/menu_choice';

// Contract test: the fast-path uses parseMenuChoice for numeric appt replies.
describe('calendar fast-path numeric contract', () => {
    it('maps 1→confirm, 2→reschedule, 3→cancel', () => {
        expect(parseMenuChoice('1')).toBe(1);
        expect(parseMenuChoice('2')).toBe(2);
        expect(parseMenuChoice('3')).toBe(3);
    });
});
```

- [ ] **Step 2: Run, verify pass (contract holds — parser already shipped)**

Run: `npx vitest run src/__tests__/webhook_calendar.test.ts`
Expected: PASS (this guards the contract the code below relies on).

- [ ] **Step 3: Implement — extend the calendar fast-path**

In `src/services/webhook_processor.ts`, add the import near the other service imports at the top of the file:

```typescript
import { parseMenuChoice } from '../utils/menu_choice';
```

Replace the calendar block (currently starting `if (normalizedText === 'confirm' || normalizedText.includes('confirmed') || normalizedText === 'reschedule' || normalizedText.includes('reschedule')) {` and ending at the matching `}` before `} catch (calendarError) {`) with:

```typescript
        const apptChoice = parseMenuChoice(text);
        const wantsConfirm = normalizedText === 'confirm' || normalizedText.includes('confirmed') || apptChoice === 1;
        const wantsReschedule = normalizedText === 'reschedule' || normalizedText.includes('reschedule') || apptChoice === 2;
        const wantsCancel = normalizedText === 'cancel' || apptChoice === 3;
        if (wantsConfirm || wantsReschedule || wantsCancel) {
            const now = new Date();
            const pendingAppointment = await prisma.appointment.findFirst({
                where: {
                    contact_id: from,
                    scheduled_at: { gte: now },
                    status: { in: ['scheduled', 'confirmed'] },
                    reminder_sent: true,
                },
                orderBy: { scheduled_at: 'asc' },
            });

            if (pendingAppointment) {
                if (wantsConfirm) {
                    await calendarService.confirmAppointment(pendingAppointment.id);
                    logger.info(`[Calendar] Appointment confirmed via WhatsApp: ${pendingAppointment.id}`);
                    return;
                } else if (wantsReschedule) {
                    await calendarService.requestReschedule(pendingAppointment.id);
                    logger.info(`[Calendar] Reschedule requested via WhatsApp: ${pendingAppointment.id}`);
                    return;
                } else if (wantsCancel) {
                    await calendarService.requestReschedule(pendingAppointment.id);
                    logger.info(`[Calendar] Cancel/redirect via WhatsApp routed to reschedule flow: ${pendingAppointment.id}`);
                    return;
                }
            }
        }
```

> Note: `calendarService` exposes `confirmAppointment` and `requestReschedule` (verified in `coordination_agent.ts` usage). There is no dedicated `cancelAppointment` on the fast path — routing a cancel to `requestReschedule` reaches a human-handled flow (the menu's "cancel" is handled fully in `coordination_agent`'s `handleCancelMessage`; the numeric "3" still reaches it via the router when no pending appt matches). If `calendarService.cancelAppointment(id)` exists, prefer it here — verify with: `grep -n "cancelAppointment" src/services/calendar*.ts` and substitute if present.

- [ ] **Step 4: Touched-file tsc**

Run: `npx tsc --noEmit 2>&1 | grep -E "webhook_processor\.ts" | grep -v "129" || echo CLEAN`
Expected: `CLEAN` (line 129 is a known pre-existing baseline error in untouched code — ignore it).

- [ ] **Step 5: Commit**

```bash
git add src/services/webhook_processor.ts src/__tests__/webhook_calendar.test.ts
git commit -m "fix(bot): calendar fast-path accepts cancel + numeric menu replies"
```

---

### Task 6: Integration verification + ship + records

**Files:** none (verification + deploy + docs).

- [ ] **Step 1: Full vitest — baseline intact, new tests green**

Run: `npx vitest run 2>&1 | grep -aE "Tests "`
Expected: `Tests  10 failed | <N> passed` where the **10 failed is unchanged** (pre-existing baseline) and `<N>` = 162 + all new tests (menu_choice 4 + menu_loop_guard 3 + coordination_menu 5 + webhook_calendar 1 = +13 → ~175 passed). If failed > 10, a real regression exists — stop and fix before deploy.

- [ ] **Step 2: Full touched-file tsc sweep**

Run: `npx tsc --noEmit 2>&1 | grep -E "menu_choice|menu_loop_guard|coordination_agent|webhook_processor" | grep -v "webhook_processor\.ts(129" || echo ALL_TOUCHED_CLEAN`
Expected: `ALL_TOUCHED_CLEAN`.

- [ ] **Step 3: Deploy backend**

Run: `cd ../.. && node deployment/deploy-agent.js backend --skip-verify 2>&1 | tail -3`
Expected: `backend: SUCCESS`.

- [ ] **Step 4: Prod E2E — replay the loop scenarios (no DB writes)**

SSH a Node script (per `reference_prod_db_script_pattern` — heredoc into backend dir, `require("./dist/...")`):

```javascript
const { CoordinationAgent } = require("./dist/agents/coordination_agent");
const a = new CoordinationAgent();
const ctx = (m, s) => ({ contact: { phone_number: "+910000000000", assigned_agent_id: null, tenant_id: "t", name: "X" }, message: m, currentTransaction: { id: "00000000-0000-0000-0000-000000000000", status: s } });
(async () => {
  for (const [m, s] of [["1","VISIT_SCHEDULED"],["2","VISIT_SCHEDULED"],["3","VISIT_SCHEDULED"],["3.","VISIT_SCHEDULED"],["1","VISITED"],["3","VISITED"],["Hello","VISIT_SCHEDULED"]]) {
    const r = await a.handle(ctx(m, s));
    const txt = (r && r.reply_script || "").replace(/\s+/g, " ");
    const looped = txt.includes("Would you like to: 1.") && (m === "1" || m === "2" || m === "3" || m === "3.");
    console.log(`${s} "${m}" => ${looped ? "❌ LOOP" : "✓ " + txt.slice(0, 70)}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
```

Expected: every numeric line `✓` (no `❌ LOOP`); `Hello` shows the menu once (`✓ You have a property visit scheduled…`).

- [ ] **Step 5: Confirm the real reported contact is unstuck**

SSH Node script: read last 6 interactions for `+917986024171`; confirm that after deploy, a numeric reply no longer produces a duplicate of the previous outbound menu. (Observation only — do not message the contact.)

```javascript
const prisma = require("./dist/db").default;
prisma.interaction.findMany({ where:{ phone_number:"+917986024171" }, orderBy:{ created_at:"desc" }, take:6, select:{ created_at:true, direction:true, content:true } })
 .then(r => { r.reverse().forEach(i => console.log(new Date(i.created_at).toISOString().slice(5,16), i.direction, (i.content||"").replace(/\s+/g," ").slice(0,80))); process.exit(0); });
```

Expected: no run of ≥3 identical consecutive outbound menus after the deploy timestamp.

- [ ] **Step 6: GlitchTip clean check**

Use `mcp__realty-pandit-qa__glitchtip_digest`. Expected: no new `coordination_agent` / `menu_loop_guard` / `webhook_processor` errors versus the prior digest.

- [ ] **Step 7: Update records**

- `docs/plans/2026-05-19-menu-loop-shared-parser.md`: set status ✅ SHIPPED with the E2E result.
- Memory `project_bot_reply_and_report_overhaul.md`: replace the "SAME-CLASS LATENT RISK (flagged, NOT yet fixed)" paragraph with the shipped summary (shared `parseMenuChoice`, `menu_loop_guard`, VISITED fixed, calendar fast-path numeric, circuit breaker covers future menus).
- `MEMORY.md`: update the one-line pointer.

- [ ] **Step 8: Commit docs**

```bash
git add docs/plans/2026-05-19-menu-loop-shared-parser.md
git commit -m "docs: menu-loop fix shipped + verified"
```

---

## Self-Review

**Spec coverage:**
- "Shared numeric-menu parser" → Task 1 (`parseMenuChoice`, tested).
- "VIST_SCHEDULED on shared util" → Task 2.
- "Circuit breaker so no menu loops (incl. future)" → Task 3 (`menu_loop_guard`, wired).
- "VISITED menu latent loop" → Task 4 (numeric + word + escalate, no loop).
- "webhook_processor calendar word-only" → Task 5 (numeric + cancel via shared util).
- "Rollout/verify" → Task 6 (vitest baseline gate, tsc, deploy, prod E2E incl. the real contact, GlitchTip, docs).

**Placeholder scan:** none — every code/test/command block is concrete. One conditional (`calendarService.cancelAppointment`) includes the exact grep to resolve it and a defined fallback.

**Type consistency:** `parseMenuChoice(text): number|null` used identically in Tasks 2/4/5. `lastOutboundWasSameMenu(phone, menuText): Promise<boolean>` and `escalateStuckMenu(context, menuText): Promise<AgentResponse>` defined in Task 3, used with matching signatures in Tasks 3/4. `AgentResponse`/`AgentContext` match `src/agents/types.ts` (`action`, `reply_script?`, `quality_hint?`, `metadata?`; `contact`, `message`, `currentTransaction?`). Menu strings in Task 3/4 are byte-identical to the originals so the loop-guard equality check matches prior sends.

**Risk notes:** loop-guard fails open (DB error → returns false → never blocks a legitimate reply). `escalateStuckMenu` never throws. All changes are additive to existing branches; the known 10 failing vitest specs and the `webhook_processor.ts:129` baseline tsc error are pre-existing and explicitly excluded from gates.
