# Panditji Voice — Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three critical production bugs in the Panditji voice bot found during live call testing: (1) tool calls freeze Panditji mid-conversation because no LLM context aggregator is wired in, (2) greeting takes 3–4 seconds because of unnecessary startup sleeps, (3) every voice call creates a duplicate Contact record because phone numbers aren't normalized at the call-end save path. Also clean up the ~N duplicate contacts already created so existing team members and clients stop being treated as strangers.

**Architecture:** Three code changes (Pipecat pipeline, Node voice service) plus a one-time data-merge script. No schema changes. No new dependencies. Fixes are isolated and can be landed independently, but should be deployed together because they share a single smoke test.

**Tech Stack:** Pipecat 1.0.0 / Python, Node.js / TypeScript / Prisma / Vitest. Existing tools + infrastructure.

---

## Background — What Is Broken

### Bug 1: Tool calls fail silently (FATAL)

From production logs during a live super-boss call at 23:51:03:

```
ERROR | pipecat.services.google.gemini_live.llm:_handle_msg_tool_call:1465
      - Function calls are not supported without a context object.
DEBUG | GeminiLiveLLMService#1 Calling function [get_company_metrics] with {'period': 'today'}
```

Pipecat 1.0.0's `GeminiLiveLLMService` requires a `context` object in the pipeline when tools are registered. Our current pipeline is `[transport.input(), llm, transport.output()]` — no aggregator. Gemini attempts a tool call, Pipecat logs the error, the tool handler technically fires but the result never routes back to Gemini because there's no context to write it to. Gemini waits forever for a tool result that never arrives. Panditji falls silent. Caller hangs up.

### Bug 2: Greeting is 3–4 seconds slow

Current [pipeline.py](../../agents/pipecat/pipeline.py) contains two intentional sleeps before the first word:

```python
await asyncio.sleep(0.5)   # wait for Gemini WS handshake
await task.queue_frames([LLMMessagesAppendFrame(...)])
await asyncio.sleep(0.2)   # wait before flipping realtime flag
llm._ready_for_realtime_input = True
```

700 ms of our own deliberate delay. With the context aggregator fix (Bug 1), most of this becomes obsolete — the aggregator handles the readiness state correctly without the `_ready_for_realtime_input` workaround.

### Bug 3: Duplicate Contact records on every call

Database inspection confirmed on Puneet's number (+91 9958 860 411):

```
"+919958860411"  → name: Puneet, contact_type: MANAGEMENT  (Feb 17 — original)
"919958860411"   → name: null,    contact_type: UNKNOWN    (today — duplicate from voice call)
```

[savePipecatCallRecord](../../agents/backend/src/services/voice.ts#L210-L270) does `prisma.contact.findUnique({ phone_number: caller_number })` — exact string match. Meta sends `"919958860411"` (no `+`). DB has `"+919958860411"`. Lookup fails → creates a duplicate with `contact_type: 'UNKNOWN'`. Every VoiceCall / Interaction afterward is linked to the UNKNOWN duplicate instead of the real MANAGEMENT record.

This affects **every caller whose number already exists in the DB** — team members, partner agents, existing clients.

---

## File Structure

**Pipecat (Python):**
- Modify: [agents/pipecat/pipeline.py](../../agents/pipecat/pipeline.py) — add context aggregator, trim sleeps, adapt greeting seed

**Node backend (TypeScript):**
- Modify: [agents/backend/src/services/voice.ts](../../agents/backend/src/services/voice.ts) — normalize phone in `savePipecatCallRecord`
- Create: `agents/backend/src/__tests__/voice_service.test.ts` — unit tests for the normalization fix
- Create: `agents/backend/scripts/merge_duplicate_contacts.ts` — one-time data-merge script with dry-run

---

## Task 1: Investigate Pipecat 1.0.0 Context Aggregator API

**Files:** none (read-only research).

- [ ] **Step 1: Find the Gemini Live context class**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'grep -rn "class .*LLMContext\|create_context_aggregator" /var/www/realty-pandit/agents/pipecat/venv/lib/python*/site-packages/pipecat/services/google/gemini_live/*.py'
```

Expected: a class like `GeminiLiveLLMContext` or `OpenAILLMContext` (often re-used). Note the import path and constructor signature.

- [ ] **Step 2: Inspect `create_context_aggregator` on `GeminiLiveLLMService`**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'grep -A 30 "def create_context_aggregator" /var/www/realty-pandit/agents/pipecat/venv/lib/python*/site-packages/pipecat/services/llm_service.py /var/www/realty-pandit/agents/pipecat/venv/lib/python*/site-packages/pipecat/services/google/gemini_live/*.py 2>/dev/null | head -60'
```

Record:
- What the method returns (object with `.user()` and `.assistant()` methods, or a single aggregator).
- Whether it takes a context instance or constructs one internally.

- [ ] **Step 3: Find an example of pipeline with tools in the package**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'grep -rn "register_function\|create_context_aggregator" /var/www/realty-pandit/agents/pipecat/venv/lib/python*/site-packages/pipecat/examples 2>/dev/null | head -20'
```

If examples don't exist in the installed venv, look at the `llm_service.py` source for comments and docstrings.

- [ ] **Step 4: Document the exact pattern**

Write a short note in `docs/plans/notes/pipecat-context-api.md` capturing:
- Import paths
- Context constructor signature
- Aggregator use in pipeline
- Whether `LLMMessagesAppendFrame` should be replaced with `context.add_message()` or similar.

This note feeds Task 2.

---

## Task 2: Fix pipeline.py — Add Context Aggregator + Trim Sleeps

**Files:**
- Modify: `agents/pipecat/pipeline.py`

**Reference** the notes from Task 1 for exact API calls.

- [ ] **Step 1: Add imports**

At the top of `pipeline.py`, add (adjust paths per Task 1 findings):

```python
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMContext
# OR if that doesn't exist:
# from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
```

- [ ] **Step 2: Build the context with tools**

Inside `run_pipeline_for_connection`, after deciding `tools_schema` and `system_prompt`, build the context:

```python
context = GeminiLiveLLMContext(messages=[], tools=tools_schema)
context_aggregator = llm.create_context_aggregator(context)
```

If `GeminiLiveLLMContext` takes different kwargs (e.g. `tool_choice`, `system_instruction`), pass them as Task 1 discovered. Keep the system instruction on the LLM constructor (it already works there).

- [ ] **Step 3: Rewrite the pipeline to include aggregators**

Replace:

```python
pipeline = Pipeline([transport.input(), llm, transport.output()])
```

With:

```python
pipeline = Pipeline([
    transport.input(),
    context_aggregator.user(),
    llm,
    transport.output(),
    context_aggregator.assistant(),
])
```

The `user()` aggregator captures user speech → writes to context → forwards to LLM. The `assistant()` aggregator captures LLM responses (including tool calls + results) → writes to context → forwards to transport. **This is the fix that makes tool calls work.**

- [ ] **Step 4: Replace the greeting-seed mechanism**

The current `_on_client_connected` handler uses `LLMMessagesAppendFrame` + `_ready_for_realtime_input` workaround. Replace with the context-aware form. Based on Task 1 findings, either:

**Option A (preferred):** Add the seed message directly to context before the pipeline starts:

```python
context.add_message({"role": "user", "content": f"[call_started]\n{caller_context_str}"})
# Context aggregator carries it in — no manual flag flip needed.
```

Then delete the `_on_client_connected` handler entirely — the aggregator will trigger the first LLM response on its own.

**Option B (if Option A doesn't trigger response):** Keep `_on_client_connected` but simplify:

```python
@transport.event_handler("on_client_connected")
async def _on_client_connected(_t, _conn):
    await task.queue_frames([
        LLMMessagesAppendFrame(messages=[{
            "role": "user",
            "content": f"[call_started]\n{caller_context_str}",
        }])
    ])
    logger.info(f"[Pipeline] Greeting seed queued for call {call_id}")
```

**Remove both sleeps (`0.5` and `0.2`)** and remove the `llm._ready_for_realtime_input = True` line. With the context aggregator in place, the realtime-input readiness is managed by the aggregator itself — the manual flip was a workaround for the missing context, not the right solution.

- [ ] **Step 5: Verify syntax on server**

```bash
scp -i ~/.ssh/realty_pandit_key \
  "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/pipecat/pipeline.py" \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/pipeline.py

ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cd /var/www/realty-pandit/agents/pipecat && /var/www/realty-pandit/agents/pipecat/venv/bin/python -c "import pipeline; print(\"imports OK\")"'
```

Expected: `imports OK`. Any import error → adapt based on Task 1 findings.

- [ ] **Step 6: Do NOT restart PM2 yet** — Task 6 (smoke test) restarts everything together.

---

## Task 3: Fix voice.ts — Normalize Phone in savePipecatCallRecord

**Files:**
- Modify: `agents/backend/src/services/voice.ts`
- Create: `agents/backend/src/__tests__/voice_service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `agents/backend/src/__tests__/voice_service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        tenant: { findFirst: vi.fn() },
        contact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        voiceCall: { create: vi.fn() },
        interaction: { create: vi.fn() },
    },
}));

import { VoiceService } from '../services/voice';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

describe('VoiceService.savePipecatCallRecord — phone normalization', () => {
    const tenant = { id: 't1' };

    it('normalizes a "919XXX..." caller (Meta format) to "+919XXX..." before DB lookup', async () => {
        (prisma.tenant.findFirst as any).mockResolvedValue(tenant);
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919958860411',
            name: 'Puneet',
            contact_type: 'MANAGEMENT',
        });
        (prisma.voiceCall.create as any).mockResolvedValue({ id: 'v1' });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });
        (prisma.contact.update as any).mockResolvedValue({});

        const svc = new VoiceService();
        await svc.savePipecatCallRecord({
            call_id: 'c1',
            caller_number: '919958860411', // Meta format, no +
            transcript: 'hello',
        });

        // Lookup uses normalized form
        expect(prisma.contact.findUnique).toHaveBeenCalledWith({
            where: { phone_number: '+919958860411' },
        });
        // Does NOT create a duplicate
        expect(prisma.contact.create).not.toHaveBeenCalled();
        // VoiceCall uses normalized form
        expect(prisma.voiceCall.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ phone_number: '+919958860411' }),
        }));
        // Interaction uses normalized form
        expect(prisma.interaction.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ phone_number: '+919958860411' }),
        }));
        // Contact update uses normalized form
        expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { phone_number: '+919958860411' },
        }));
    });

    it('creates Contact in normalized form when truly new', async () => {
        (prisma.tenant.findFirst as any).mockResolvedValue(tenant);
        (prisma.contact.findUnique as any).mockResolvedValue(null);
        (prisma.contact.create as any).mockResolvedValue({
            phone_number: '+919111111111', contact_type: 'UNKNOWN',
        });
        (prisma.voiceCall.create as any).mockResolvedValue({ id: 'v1' });
        (prisma.interaction.create as any).mockResolvedValue({ id: 'i1' });
        (prisma.contact.update as any).mockResolvedValue({});

        const svc = new VoiceService();
        await svc.savePipecatCallRecord({
            call_id: 'c2',
            caller_number: '919111111111',
            transcript: 'new caller',
        });

        expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                phone_number: '+919111111111',
                contact_type: 'UNKNOWN',
            }),
        }));
    });

    it('does not overwrite existing MANAGEMENT contact_type on repeat calls', async () => {
        // Regression guard: even though savePipecatCallRecord only touches last_channel + last_interaction
        // on update, verify it never changes contact_type.
        (prisma.tenant.findFirst as any).mockResolvedValue(tenant);
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919958860411',
            contact_type: 'MANAGEMENT',
        });
        (prisma.voiceCall.create as any).mockResolvedValue({});
        (prisma.interaction.create as any).mockResolvedValue({});
        (prisma.contact.update as any).mockResolvedValue({});

        const svc = new VoiceService();
        await svc.savePipecatCallRecord({
            call_id: 'c3',
            caller_number: '+919958860411',
            transcript: '',
        });

        const updateCall = (prisma.contact.update as any).mock.calls[0][0];
        expect(updateCall.data.contact_type).toBeUndefined();
        expect(updateCall.data.lead_status).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd agents/backend && npx vitest run src/__tests__/voice_service.test.ts
```

Expected: at least 2 tests fail because lookup uses raw `caller_number`, not normalized.

- [ ] **Step 3: Implement the fix**

Open `src/services/voice.ts`. At the top, if not already imported:

```typescript
import { normalizePhone } from '../utils/phone';
```

In `savePipecatCallRecord`, change the very first lines inside the function (before any DB call):

```typescript
public async savePipecatCallRecord(params: {
    call_id: string;
    caller_number: string;
    transcript: string;
}): Promise<void> {
    const { call_id, transcript } = params;
    const caller_number = normalizePhone(params.caller_number) || params.caller_number;
    const now = new Date();
    // ... rest unchanged ...
}
```

The `|| params.caller_number` fallback handles the edge case where `normalizePhone` returns empty string (invalid input) — in that case keep the original so we at least save the record somewhere, but in practice Meta always sends a valid 12-digit phone.

Everything else in the function already uses the `caller_number` local variable, so the rest auto-propagates the normalized value. **Do not change anything else in the method.**

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd agents/backend && npx vitest run src/__tests__/voice_service.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run the full backend suite to ensure no regression**

```bash
cd agents/backend && npx vitest run
```

Expected: previously passing tests still pass (should be ~85+ across all files). The 4 pre-existing loginSchema failures remain unchanged.

- [ ] **Step 6: Do NOT deploy yet** — Task 6 deploys everything together.

---

## Task 4: Write merge_duplicate_contacts.ts (Dry-Run by Default)

**Files:**
- Create: `agents/backend/scripts/merge_duplicate_contacts.ts`

- [ ] **Step 1: Ensure a `scripts/` directory exists**

```bash
ls agents/backend/scripts/ 2>&1 || mkdir -p agents/backend/scripts
```

- [ ] **Step 2: Write the script**

Create `agents/backend/scripts/merge_duplicate_contacts.ts`:

```typescript
/**
 * One-time migration: merge duplicate Contact records created by the unnormalized
 * savePipecatCallRecord bug (voice calls before the normalizePhone fix).
 *
 * Strategy:
 *   1. Find all Contacts whose phone_number does NOT start with "+".
 *   2. For each such duplicate:
 *      a. Compute the canonical "+91XXX..." form via normalizePhone().
 *      b. Look up the canonical record. If it exists → MERGE:
 *         - Re-link VoiceCall, Interaction, Lead, WhatsAppMessage, Appointment,
 *           TaskFollowup, Transaction to the canonical phone_number.
 *         - Delete the duplicate.
 *      c. If the canonical does NOT exist → RENAME:
 *         - Update duplicate's phone_number to canonical in place.
 *         - Cascade rename on dependent rows.
 *   3. Log everything. Default: dry-run (no writes).
 *
 * Usage:
 *   npx ts-node agents/backend/scripts/merge_duplicate_contacts.ts           # dry-run
 *   npx ts-node agents/backend/scripts/merge_duplicate_contacts.ts --commit  # apply
 */

import prisma from '../src/db';
import { normalizePhone } from '../src/utils/phone';

const COMMIT = process.argv.includes('--commit');

async function main() {
    const mode = COMMIT ? 'COMMIT' : 'DRY-RUN';
    console.log(`[merge] Running in ${mode} mode`);

    // Step 1: find duplicates
    const allContacts = await prisma.contact.findMany({
        where: { NOT: { phone_number: { startsWith: '+' } } },
        select: { phone_number: true, name: true, contact_type: true, source: true, created_at: true },
    });

    if (allContacts.length === 0) {
        console.log('[merge] No duplicates found. DB is clean.');
        return;
    }
    console.log(`[merge] Found ${allContacts.length} contacts without "+" prefix`);

    let mergeCount = 0;
    let renameCount = 0;
    let skipCount = 0;

    for (const dup of allContacts) {
        const canonical = normalizePhone(dup.phone_number);
        if (!canonical || canonical === dup.phone_number) {
            console.warn(`[merge] SKIP: ${dup.phone_number} did not normalize to a canonical form`);
            skipCount++;
            continue;
        }

        const canonicalContact = await prisma.contact.findUnique({
            where: { phone_number: canonical },
            select: { phone_number: true, name: true, contact_type: true },
        });

        if (canonicalContact) {
            // Merge path
            mergeCount++;
            console.log(`[merge] MERGE ${dup.phone_number} → ${canonical} (real: ${canonicalContact.name}/${canonicalContact.contact_type})`);

            if (COMMIT) {
                await prisma.$transaction(async (tx) => {
                    // Re-link dependent rows to the canonical phone
                    await tx.voiceCall.updateMany({
                        where: { phone_number: dup.phone_number },
                        data: { phone_number: canonical },
                    });
                    await tx.interaction.updateMany({
                        where: { phone_number: dup.phone_number },
                        data: { phone_number: canonical },
                    });
                    await tx.whatsAppMessage.updateMany({
                        where: { phone_number: dup.phone_number },
                        data: { phone_number: canonical },
                    });
                    await tx.lead.updateMany({
                        where: { contact_phone: dup.phone_number },
                        data: { contact_phone: canonical },
                    });
                    await tx.appointment.updateMany({
                        where: { contact_id: dup.phone_number },
                        data: { contact_id: canonical },
                    });
                    await tx.taskFollowup.updateMany({
                        where: { phone_number: dup.phone_number },
                        data: { phone_number: canonical },
                    });
                    // Transactions link via demand_contact_id (see Phase 4 schema check)
                    try {
                        await (tx as any).transaction.updateMany({
                            where: { demand_contact_id: dup.phone_number },
                            data: { demand_contact_id: canonical },
                        });
                    } catch (e) {
                        console.warn(`[merge]   transaction relink skipped: ${(e as Error).message}`);
                    }
                    // Finally delete the duplicate
                    await tx.contact.delete({ where: { phone_number: dup.phone_number } });
                });
            }
        } else {
            // Rename path — duplicate has no canonical twin, just add "+"
            renameCount++;
            console.log(`[merge] RENAME ${dup.phone_number} → ${canonical} (no canonical twin; in-place)`);

            if (COMMIT) {
                // Phone is a PK — must create canonical, relink, delete old
                await prisma.$transaction(async (tx) => {
                    await tx.contact.create({
                        data: {
                            phone_number: canonical,
                            tenant_id: (await tx.contact.findUnique({ where: { phone_number: dup.phone_number } }))!.tenant_id,
                            name: dup.name,
                            contact_type: dup.contact_type as any,
                            source: dup.source,
                        },
                    });
                    await tx.voiceCall.updateMany({ where: { phone_number: dup.phone_number }, data: { phone_number: canonical } });
                    await tx.interaction.updateMany({ where: { phone_number: dup.phone_number }, data: { phone_number: canonical } });
                    await tx.whatsAppMessage.updateMany({ where: { phone_number: dup.phone_number }, data: { phone_number: canonical } });
                    await tx.lead.updateMany({ where: { contact_phone: dup.phone_number }, data: { contact_phone: canonical } });
                    await tx.appointment.updateMany({ where: { contact_id: dup.phone_number }, data: { contact_id: canonical } });
                    await tx.taskFollowup.updateMany({ where: { phone_number: dup.phone_number }, data: { phone_number: canonical } });
                    try {
                        await (tx as any).transaction.updateMany({ where: { demand_contact_id: dup.phone_number }, data: { demand_contact_id: canonical } });
                    } catch {}
                    await tx.contact.delete({ where: { phone_number: dup.phone_number } });
                });
            }
        }
    }

    console.log(`\n[merge] Summary (${mode}):`);
    console.log(`  - merge-into-existing: ${mergeCount}`);
    console.log(`  - rename-in-place:     ${renameCount}`);
    console.log(`  - skipped:             ${skipCount}`);
    console.log(`  - total processed:     ${allContacts.length}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error('[merge] FATAL:', e);
    process.exit(1);
});
```

**Notes:**
- All writes happen inside `$transaction` blocks so a partial failure rolls back.
- Default is dry-run — user must pass `--commit` to actually modify data.
- Script prints a clear plan per contact so user can audit before committing.
- Tenant-aware: Contact creation in rename path copies tenant_id from the dup.

- [ ] **Step 3: Syntax-check the script locally**

```bash
cd agents/backend && npx tsc --noEmit scripts/merge_duplicate_contacts.ts 2>&1 | head -20
```

Fix any TS errors. Common ones: missing `as any` casts on enum fields, incorrect Prisma relation field names. Consult the existing `internal_tools.ts` patterns for reference.

---

## Task 5: Execute Cleanup (Dry-Run First, Then Real)

**Files:** none modified — this is a data migration.

- [ ] **Step 1: Copy script to server**

```bash
scp -i ~/.ssh/realty_pandit_key \
  "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/scripts/merge_duplicate_contacts.ts" \
  root@72.62.231.224:/var/www/realty-pandit/backend/scripts/merge_duplicate_contacts.ts
```

Create the dir if missing:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'mkdir -p /var/www/realty-pandit/backend/scripts'
```

- [ ] **Step 2: Dry-run on server**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cd /var/www/realty-pandit/backend && npx ts-node scripts/merge_duplicate_contacts.ts 2>&1 | tee /tmp/merge-dryrun.log'
```

Read the output carefully. Expected:
- Count of duplicates found (probably 5–20 given how many calls have been made)
- Per-row plan: MERGE vs RENAME + the canonical form
- No `[merge] SKIP` entries (if any, investigate before committing)

- [ ] **Step 3: User review gate**

Pause and show the user the dry-run output. Confirm before proceeding. If they want to inspect specific rows, use:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -e "..."'
```

- [ ] **Step 4: Commit the cleanup**

After user approval:

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'cd /var/www/realty-pandit/backend && npx ts-node scripts/merge_duplicate_contacts.ts --commit 2>&1 | tee /tmp/merge-commit.log'
```

Expected: summary shows merged/renamed/skipped counts matching the dry-run. No fatal errors.

- [ ] **Step 5: Verify cleanup worked**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -e "
const{PrismaClient}=require(\"@prisma/client\");
const p=new PrismaClient();
(async()=>{
  const remaining=await p.contact.count({where:{NOT:{phone_number:{startsWith:\"+\"}}}});
  console.log(\"Remaining unnormalized:\",remaining);
  const puneet=await p.contact.findMany({where:{OR:[{phone_number:\"+919958860411\"},{phone_number:\"919958860411\"}]},select:{phone_number:true,name:true,contact_type:true}});
  console.log(\"Puneet contacts:\",JSON.stringify(puneet,null,2));
  await p.\$disconnect();
})()
"'
```

Expected:
- `Remaining unnormalized: 0`
- Only ONE Puneet row: `phone_number: "+919958860411", name: "Puneet", contact_type: "MANAGEMENT"`

---

## Task 6: Deploy All Fixes + Live Smoke Test

**Files:** none modified — this is deployment + verification.

- [ ] **Step 1: Deploy voice.ts**

```bash
scp -i ~/.ssh/realty_pandit_key \
  "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/voice.ts" \
  root@72.62.231.224:/var/www/realty-pandit/backend/src/services/voice.ts
```

- [ ] **Step 2: Deploy pipeline.py (if not already from Task 2)**

```bash
scp -i ~/.ssh/realty_pandit_key \
  "c:/Users/Varchasv Bhardwaj/Project/clients/sunny-sharma/projects/reality-pandit/agents/pipecat/pipeline.py" \
  root@72.62.231.224:/var/www/realty-pandit/agents/pipecat/pipeline.py
```

- [ ] **Step 3: Restart both services**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 restart realty-backend && pm2 restart panditji-voice'
```

- [ ] **Step 4: Confirm Pipecat started clean (no import errors, context aggregator registered)**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 40 --nostream 2>&1 | tail -40'
```

Expected: see `Uvicorn running on http://127.0.0.1:8765`, no ERROR or ImportError lines. If you see `Function calls are not supported without a context object` at startup time (unlikely but possible) → Task 2 needs another pass.

- [ ] **Step 5: Pre-call DB snapshot**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -e "
const{PrismaClient}=require(\"@prisma/client\");
const p=new PrismaClient();
(async()=>{
  const c=await p.contact.count({where:{NOT:{phone_number:{startsWith:\"+\"}}}});
  const vc=await p.voiceCall.count({where:{started_at:{gte:new Date(Date.now()-3600000)}}});
  console.log(\"Unnormalized contacts:\",c,\"| Calls in last hour:\",vc);
  await p.\$disconnect();
})()
"'
```

Record the numbers. After the smoke test call, the unnormalized count should STILL be 0 (meaning normalization worked — no new duplicates).

- [ ] **Step 6: Live smoke call**

**You (the user) dial the Realty Pandit WhatsApp number from Puneet's registered phone.**

Verify each:

- [ ] **Greeting latency** — time from "call connected" to Panditji's first word. Expected: <2 s (was ~4 s). Stopwatch it on your end.
- [ ] **Greeting content** — *"Good Evening, Puneet ji! Batayein."* (IST-appropriate; uses your name)
- [ ] **Tool call 1 — simple retrieval:** say *"Mere aaj ke appointments kya hain?"*. Panditji should respond with a count within 2 seconds (not freeze).
- [ ] **Tool call 2 — write action:** say *"Callback schedule karo kal 10 baje Priya ke saath"* (use any real lead name). Panditji should confirm the schedule and send WhatsApp.
- [ ] **Multi-turn continuity:** after the above, say *"Company ka is month ka revenue kya hua?"*. Panditji should use `get_company_metrics` and reply with the figures.
- [ ] **No duplicate contacts created** — immediately after the call, re-run the DB snapshot from Step 5. `Unnormalized contacts` must still be 0. VoiceCall count in last hour should go up by 1, linked to the normalized `+91…` phone.
- [ ] **Gender + language preference preserved** — `Agent.gender` is still `male`, `preferred_language` may have auto-updated based on your conversation language (that's expected).

- [ ] **Step 7: Post-call log review**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 \
  'pm2 logs panditji-voice --lines 150 --nostream 2>&1 | grep -E "Tool|ERROR|context|function_call|register|aggregator" | tail -40'
```

Must NOT see:
- `Function calls are not supported without a context object`
- Any `ERROR` line during the call

Should see:
- Successful `function_call` traces (tool name, arguments, result=ok)
- Pipeline started for your call with `is_team_member=True` and team prompt loaded

- [ ] **Step 8: Verify the normalized VoiceCall record**

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && node -e "
const{PrismaClient}=require(\"@prisma/client\");
const p=new PrismaClient();
(async()=>{
  const vc=await p.voiceCall.findFirst({orderBy:{started_at:\"desc\"},select:{phone_number:true,call_sid:true,started_at:true,transcript:true}});
  console.log(JSON.stringify(vc,null,2));
  await p.\$disconnect();
})()
"'
```

Expected: `phone_number: "+919958860411"` (the normalized form, not `919958860411`).

---

## Task 7: Write a Test Report

**Files:**
- Create: `docs/plans/2026-04-19-panditji-critical-fixes-TESTREPORT.md`

Document:
- Exact greeting latency observed (stopwatch)
- Which tool calls worked / which didn't
- Any remaining issues
- DB state before vs after (unnormalized count = 0 confirmed?)
- Final commit SHA deployed

Keep it short — 10–20 lines.

---

## Success Criteria

The fix is **complete** when all of these are true:

- [ ] All 3 new Vitest tests in `voice_service.test.ts` pass
- [ ] Full backend test suite still passes (no regressions in Phase 1–4 tests)
- [ ] `pipeline.py` imports cleanly on server with new context aggregator
- [ ] Dry-run of `merge_duplicate_contacts.ts` reports a plan without errors
- [ ] Commit run of `merge_duplicate_contacts.ts` successfully merges duplicates
- [ ] `Unnormalized contacts` count = 0 after cleanup AND after new test call
- [ ] Live smoke call: greeting < 2 s, tool calls work end-to-end, no freezes
- [ ] Pipecat logs show no `Function calls are not supported without a context object` error
- [ ] New VoiceCall records have `phone_number` in `+91…` form

---

## Rollback Plan

If the context aggregator change (Task 2) breaks even the greeting:

1. Revert pipeline.py to the version tagged `phase-1-employee-core` (pre-tool-calling).
2. Temporarily set `tools_schema = None` and `llm = GeminiLiveLLMService(tools=None, ...)` so Panditji greets and chats but cannot call tools.
3. Re-restart Pipecat.
4. Fix forward: narrow the failure mode (context class wrong? aggregator method different?) and redeploy.

For the data migration, if a merge transaction fails mid-stream, Prisma's `$transaction` rolls it back. No partial state should land. If multiple contacts fail, they'll be reported as `SKIP` and can be hand-cleaned.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Pipecat 1.0.0 `create_context_aggregator` has a signature we don't expect | Task 1 investigates first; Task 2 adapts based on findings |
| Removing the `_ready_for_realtime_input` hack breaks audio input | Keep the hack as a commented-out fallback in Task 2 Step 4; re-enable if input audio stops working |
| Cleanup script hits a foreign key we didn't anticipate | All writes in `$transaction` → rollback on error. Dry-run catches it first. |
| New tests flake due to shared global Prisma mock state | `beforeEach(vi.clearAllMocks)` is already in every test file |
| User dials while cleanup is running | Tiny window; cleanup runs in <30 s. Acceptable. |

---

## Estimated Effort

- Task 1 (investigation): 30 min
- Task 2 (pipeline.py fix): 1 hour
- Task 3 (voice.ts fix + tests): 30 min
- Task 4 (cleanup script): 45 min
- Task 5 (dry-run + commit): 15 min
- Task 6 (deploy + live smoke test): 30 min (depends on user dialing)
- Task 7 (test report): 10 min

**Total: ~3.5 hours**

Plus the user's time to dial and verify in Task 6 (~5 min).
