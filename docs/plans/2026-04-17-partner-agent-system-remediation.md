# Partner Agent System Remediation Implementation Plan

> **For agentic workers:** Execute task-by-task. Each step uses checkbox (`- [ ]`) syntax for tracking. Each task is bite-sized (15–30 min). Deploy + verify after each phase, not after each task.

**Goal:** Enforce strict middleman ownership for Realty Pandit partner agents — partners only see their assigned manager's contact, inventory is globally visible for matching but contacts/source are sanitized for any team member who isn't the owning manager, self-signup defaults to super_boss, admin lead/inventory submission auto-creates + auto-assigns partners, reassignment and manager-deactivation cascade work end-to-end, and post-deal multi-party commission entries are captured.

**Architecture:** Role-based sanitization is layered ON TOP of existing plan-based masking (plan rules stay as-is). A new `OwnershipService` centralizes reassignment + cascade. A new `SanitizationService` strips owner/source from cross-team match results. A new `CommissionService` + `DealCommissionEntry` table captures per-party post-close entries without enforcing rigid splits. Partner portal gets a new "Browse" tab backed by a sanitized listing endpoint. AI `partner_agent.ts` flow is updated to always surface manager contact and never client contacts.

**Tech Stack:** TypeScript, Express 5, Prisma 5 (PostgreSQL), React 19 + Vite (admin), Next.js 16 App Router (agent portal), BullMQ, WhatsApp Cloud API v17, Gemini 2.5 Flash. Testing via `mcp__realty-pandit-qa__qa_verify_task` (browser) + lightweight ts-jest units for pure services.

---

## Scope

### In scope (this plan)

1. DB additions: `DealCommissionEntry`, `PartnerReassignmentLog`, `Inventory.owning_manager_id` (derived cache), `Transaction.owning_manager_id` cache, `Contact.owning_manager_id` cache.
2. `SanitizationService` — one authoritative place that strips owner/source fields for non-owning managers.
3. `OwnershipService` — resolve owning manager for any asset; reassign partner (and cascade all their assets); cascade on manager deactivation → super_boss.
4. Permission engine role layer: `OwningManager`, `ForeignManager`, `SuperBoss`, `Partner` — decides whether owner/source is visible.
5. Admin lead + inventory creation forms: "Source = Partner Agent" autocomplete + inline "+ Add new"; `ensurePartnerAgent` is called on every submit.
6. Admin: `PartnerManagement` reassign button (super_boss only); `TeamManagement` deactivate flow with cascade preview.
7. Admin: `DealCloseDialog` with multi-party commission entry form.
8. Partner portal (Next.js `/agent/*`): persistent manager contact banner; new Browse tab on inventory page with sanitized listings; deal detail pages show manager contact only.
9. Backend endpoints: `POST /api/partners/:id/reassign`, `POST /api/team/:id/deactivate`, `GET /agent/inventory/browse`, `GET /api/deals/:id/commission-entries`, `POST /api/deals/:id/commission-entries`.
10. AI: `partner_agent.ts` prompt + response path always masks client contacts and promotes manager contact; `matching_agent.ts` uses `SanitizationService`.
11. Multi-party appointment metadata: `Appointment.participants` JSON to record who attends (lead_manager, inventory_manager, partner_a, partner_b).

### Out of scope (deferred explicitly)

- **Builder hierarchy / project-tower-unit inventory redesign** — separate plan later.
- **Existing data migration** — 11 existing partner_agents keep current `managing_agent_id`; nulls stay null (not forced to super_boss). New rules apply forward-only.
- **Masking overhaul** — plan-based masking stays unchanged. Role layer is ADDED, not replacing.
- **Rigid commission engine / payouts** — only manual entry capture. No enforcement, no auto-calculation.
- **Builder management admin UI** — deferred with the builder deep-dive.
- **Partner hierarchy (`parent_partner_id`)** visibility semantics — treat sub-agents as inheriting the parent's managing_agent; no new rules in this plan.

---

## File Structure

### Create
- `backend/src/services/ownership_service.ts` — resolve + reassign + cascade
- `backend/src/services/sanitization_service.ts` — owner/source stripping
- `backend/src/services/commission_service.ts` — deal commission entries
- `backend/src/middleware/require_super_boss.ts` — guard
- `backend/src/__tests__/ownership_service.test.ts`
- `backend/src/__tests__/sanitization_service.test.ts`
- `backend/src/__tests__/commission_service.test.ts`
- `backend/src/__tests__/partner_auto_create.test.ts`
- `frontend/src/components/PartnerReassignDialog.tsx`
- `frontend/src/components/TeamDeactivateDialog.tsx`
- `frontend/src/components/DealCloseCommissionDialog.tsx`
- `frontend/src/components/PartnerSourceAutocomplete.tsx`
- `frontend/src/components/mobile/MobilePartnerReassignDialog.tsx` (mobile parity)
- `website/src/app/agent/inventory/browse/page.tsx`
- `website/src/components/agent/ManagerContactBanner.tsx`
- `website/src/lib/agent-browse.ts`

### Modify
- `backend/prisma/schema.prisma` — add 3 tables + 3 cache columns
- `backend/src/services/partner_auto_create.ts` — extend for inventory path; never default `partner_type = HAS_BUYERS`
- `backend/src/services/permission_engine.ts` — add role-layer functions
- `backend/src/services/matching_engine.ts` — wire `SanitizationService` on output
- `backend/src/routes/api.ts` — lead + inventory creation hooks partner autocreate; reassign endpoint
- `backend/src/routes/agent.ts` — add `/agent/inventory/browse`; sanitize existing deal/match responses via service
- `backend/src/routes/deals.ts` — commission entry endpoints; cascade on deal close
- `backend/src/routes/team.ts` — deactivate endpoint
- `backend/src/agents/partner_agent.ts` — sanitize responses; promote manager contact
- `frontend/src/components/PartnerManagement.tsx` — reassign button
- `frontend/src/components/TeamManagement.tsx` — deactivate button
- `frontend/src/components/LeadForm.tsx` — partner source autocomplete
- `frontend/src/components/InventoryModal.tsx` — partner source autocomplete
- `frontend/src/components/mobile/MobileInventoryForm.tsx` — mobile parity for autocomplete
- `frontend/src/components/mobile/MobileLeadForm.tsx` — mobile parity
- `website/src/app/agent/layout.tsx` — wrap with `ManagerContactBanner`
- `website/src/app/agent/inventory/page.tsx` — add Browse tab
- `website/src/app/agent/deals/[id]/page.tsx` — remove all non-manager contact surfaces

---

## Phase A — Foundations (DB + core services)

### Task A1: Schema additions

**Files:**
- Modify: `clients/sunny-sharma/projects/reality-pandit/agents/backend/prisma/schema.prisma`
- Create: `clients/sunny-sharma/projects/reality-pandit/agents/backend/prisma/migrations/<timestamp>_partner_ownership/migration.sql` (via `prisma migrate dev`)

- [ ] **Step 1: Open schema.prisma and add `DealCommissionEntry` model after the `Transaction` model**

```prisma
model DealCommissionEntry {
  id             String      @id @default(uuid())
  transaction_id String
  transaction    Transaction @relation(fields: [transaction_id], references: [id], onDelete: Cascade)

  // Party that earned this slice
  party_type     CommissionPartyType
  // One of: agent_id (internal), partner_agent_id, or null (platform)
  agent_id         String?
  partner_agent_id String?

  // Amount + optional notes
  amount   Decimal @db.Decimal(12, 2)
  currency String  @default("INR")
  notes    String?

  entered_by_agent_id String
  entered_at          DateTime @default(now())

  @@index([transaction_id])
  @@index([agent_id])
  @@index([partner_agent_id])
  @@map("deal_commission_entries")
}

enum CommissionPartyType {
  INTERNAL_AGENT
  PARTNER_AGENT
  PLATFORM
}
```

- [ ] **Step 2: Add `PartnerReassignmentLog` for audit trail**

```prisma
model PartnerReassignmentLog {
  id                 String   @id @default(uuid())
  partner_agent_id   String
  from_agent_id      String?
  to_agent_id        String
  performed_by_agent String
  reason             String?
  created_at         DateTime @default(now())

  @@index([partner_agent_id])
  @@index([to_agent_id])
  @@map("partner_reassignment_logs")
}
```

- [ ] **Step 3: Add owning_manager_id caches (denormalised for fast filter queries)**

Inside `model Inventory { ... }`:
```prisma
  owning_manager_id String?
  owning_manager    Agent?  @relation("InventoryOwningManager", fields: [owning_manager_id], references: [id])
  @@index([owning_manager_id])
```

Inside `model Transaction { ... }`:
```prisma
  owning_manager_id String?
  owning_manager    Agent?  @relation("TransactionOwningManager", fields: [owning_manager_id], references: [id])
  @@index([owning_manager_id])
```

Inside `model Contact { ... }` (just below `created_by`):
```prisma
  owning_manager_id String?
  owning_manager    Agent?  @relation("ContactOwningManager", fields: [owning_manager_id], references: [id])
  @@index([owning_manager_id])
```

Inside `model Agent { ... }` add the reverse relations:
```prisma
  inventory_owned_as_manager   Inventory[]   @relation("InventoryOwningManager")
  transactions_owned_as_manager Transaction[] @relation("TransactionOwningManager")
  contacts_owned_as_manager    Contact[]     @relation("ContactOwningManager")
```

- [ ] **Step 4: Generate migration locally (do NOT run on prod)**

Run: `cd clients/sunny-sharma/projects/reality-pandit/agents/backend && npx prisma migrate dev --name partner_ownership --create-only`
Expected: creates `prisma/migrations/<timestamp>_partner_ownership/migration.sql`

- [ ] **Step 5: Commit schema + migration**

```bash
cd "clients/sunny-sharma/projects/reality-pandit/agents/backend"
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add deal commission entries, reassignment log, owning_manager_id caches"
```

---

### Task A2: SanitizationService

**Files:**
- Create: `backend/src/services/sanitization_service.ts`
- Create: `backend/src/__tests__/sanitization_service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/__tests__/sanitization_service.test.ts
import { SanitizationService, Viewer } from '../services/sanitization_service';

describe('SanitizationService.sanitizeInventory', () => {
  const svc = new SanitizationService();
  const raw = {
    id: 'inv1',
    title: '3BHK in Dwarka',
    owning_manager_id: 'agent-X',
    source_partner_agent_id: 'partner-1',
    owner: { id: 'owner-9', name: 'Ravi Kumar', phone_number: '+919876543210' },
    key_holder: { name: 'Amit', phone_number: '+919811122233' },
  } as any;

  it('returns full data to owning manager', () => {
    const v: Viewer = { role: 'agent', agentId: 'agent-X', isSuperBoss: false };
    const out = svc.sanitizeInventory(raw, v);
    expect(out.owner.phone_number).toBe('+919876543210');
    expect(out.source_partner_agent_id).toBe('partner-1');
  });

  it('returns full data to super_boss', () => {
    const v: Viewer = { role: 'agent', agentId: 'agent-Y', isSuperBoss: true };
    const out = svc.sanitizeInventory(raw, v);
    expect(out.owner.phone_number).toBe('+919876543210');
  });

  it('strips owner + source for foreign manager', () => {
    const v: Viewer = { role: 'agent', agentId: 'agent-Y', isSuperBoss: false };
    const out = svc.sanitizeInventory(raw, v);
    expect(out.owner).toBeUndefined();
    expect(out.key_holder).toBeUndefined();
    expect(out.source_partner_agent_id).toBeUndefined();
    expect(out.owning_manager_id).toBeUndefined();
    expect(out.title).toBe('3BHK in Dwarka');
  });

  it('strips owner + source + exact address for partner viewer', () => {
    const v: Viewer = { role: 'partner', partnerAgentId: 'partner-2' };
    const out = svc.sanitizeInventory({ ...raw, address_full: '123 Main St, Apt 4B', locality: 'Dwarka' }, v);
    expect(out.owner).toBeUndefined();
    expect(out.address_full).toBeUndefined();
    expect(out.locality).toBe('Dwarka'); // locality OK for display
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd clients/sunny-sharma/projects/reality-pandit/agents/backend && npx jest __tests__/sanitization_service.test.ts`
Expected: `Cannot find module '../services/sanitization_service'`

- [ ] **Step 3: Implement the service**

```typescript
// backend/src/services/sanitization_service.ts
export type Viewer =
  | { role: 'agent'; agentId: string; isSuperBoss: boolean }
  | { role: 'partner'; partnerAgentId: string };

const OWNER_FIELDS = ['owner', 'key_holder', 'owner_contact', 'owner_phone', 'owner_name', 'owner_email'];
const SOURCE_FIELDS = ['source_partner_agent_id', 'source_partner_agent', 'owning_manager_id', 'owning_manager', 'referral_partner_id'];
const ADDRESS_FIELDS = ['address_full', 'address_line1', 'address_line2', 'house_number', 'plot_number'];

export class SanitizationService {
  sanitizeInventory(raw: any, viewer: Viewer): any {
    if (!raw) return raw;
    if (this.canSeeOwner(raw, viewer)) return raw;

    const cleaned = { ...raw };
    for (const f of OWNER_FIELDS) delete cleaned[f];
    for (const f of SOURCE_FIELDS) delete cleaned[f];
    if (viewer.role === 'partner') {
      for (const f of ADDRESS_FIELDS) delete cleaned[f];
    }
    return cleaned;
  }

  sanitizeInventoryList(rows: any[], viewer: Viewer): any[] {
    return rows.map((r) => this.sanitizeInventory(r, viewer));
  }

  sanitizeContact(raw: any, viewer: Viewer): any {
    if (!raw) return raw;
    if (this.canSeeContact(raw, viewer)) return raw;
    const cleaned = { ...raw };
    delete cleaned.phone_number;
    delete cleaned.email;
    delete cleaned.name;
    return cleaned;
  }

  private canSeeOwner(raw: { owning_manager_id?: string | null }, v: Viewer): boolean {
    if (v.role === 'partner') return false; // never
    if (v.isSuperBoss) return true;
    if (!raw.owning_manager_id) return false;
    return raw.owning_manager_id === v.agentId;
  }

  private canSeeContact(raw: { owning_manager_id?: string | null }, v: Viewer): boolean {
    return this.canSeeOwner(raw, v);
  }
}

export const sanitizationService = new SanitizationService();
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx jest __tests__/sanitization_service.test.ts`
Expected: all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/sanitization_service.ts src/__tests__/sanitization_service.test.ts
git commit -m "feat(backend): SanitizationService — role-based owner/source stripping"
```

---

### Task A3: OwnershipService — resolve + reassign + cascade

**Files:**
- Create: `backend/src/services/ownership_service.ts`
- Create: `backend/src/__tests__/ownership_service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/ownership_service.test.ts
import prisma from '../db';
import { OwnershipService } from '../services/ownership_service';

jest.mock('../db', () => ({
  __esModule: true,
  default: {
    partnerAgent: { findUnique: jest.fn(), update: jest.fn() },
    inventory: { updateMany: jest.fn() },
    transaction: { updateMany: jest.fn() },
    contact: { updateMany: jest.fn() },
    agent: { update: jest.fn(), findFirst: jest.fn() },
    partnerReassignmentLog: { create: jest.fn() },
    $transaction: jest.fn((fn) => fn(prisma)),
  },
}));

describe('OwnershipService.reassignPartner', () => {
  const svc = new OwnershipService();

  it('moves partner + cascades inventory + transactions + contacts', async () => {
    (prisma.partnerAgent.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', managing_agent_id: 'old' });
    (prisma.partnerAgent.update as jest.Mock).mockResolvedValue({});
    (prisma.inventory.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.transaction.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 4 });
    (prisma.partnerReassignmentLog.create as jest.Mock).mockResolvedValue({});

    const result = await svc.reassignPartner('p1', 'new', 'super-1', 'restructure');

    expect(prisma.partnerAgent.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { managing_agent_id: 'new' },
    });
    expect(prisma.partnerReassignmentLog.create).toHaveBeenCalled();
    expect(result).toEqual({ partnerId: 'p1', fromAgentId: 'old', toAgentId: 'new', counts: { inventory: 3, transactions: 2, contacts: 4 } });
  });
});

describe('OwnershipService.cascadeOnAgentDeactivation', () => {
  it('transfers all owned assets to super_boss', async () => {
    const svc = new OwnershipService();
    (prisma.agent.findFirst as jest.Mock).mockResolvedValue({ id: 'super-1' });
    (prisma.partnerAgent.update as jest.Mock).mockResolvedValue({});
    (prisma.inventory.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.transaction.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.agent.update as jest.Mock).mockResolvedValue({});

    const result = await svc.cascadeOnAgentDeactivation('old', 'super-1');

    expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
      where: { owning_manager_id: 'old' },
      data: { owning_manager_id: 'super-1' },
    });
    expect(result.counts.inventory).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx jest __tests__/ownership_service.test.ts`

- [ ] **Step 3: Implement service**

```typescript
// backend/src/services/ownership_service.ts
import prisma from '../db';
import logger from '../utils/logger';

export interface ReassignResult {
  partnerId: string;
  fromAgentId: string | null;
  toAgentId: string;
  counts: { inventory: number; transactions: number; contacts: number };
}

export class OwnershipService {
  async reassignPartner(
    partnerId: string,
    toAgentId: string,
    performedBy: string,
    reason?: string,
  ): Promise<ReassignResult> {
    const partner = await prisma.partnerAgent.findUnique({
      where: { id: partnerId },
      select: { id: true, managing_agent_id: true, phone_number: true },
    });
    if (!partner) throw new Error(`Partner ${partnerId} not found`);
    const fromAgentId = partner.managing_agent_id;

    return await prisma.$transaction(async (tx) => {
      await tx.partnerAgent.update({
        where: { id: partnerId },
        data: { managing_agent_id: toAgentId },
      });

      const inv = await tx.inventory.updateMany({
        where: { owning_manager_id: fromAgentId ?? undefined, source_partner_agent_id: partnerId } as any,
        data: { owning_manager_id: toAgentId },
      });
      const txn = await tx.transaction.updateMany({
        where: { owning_manager_id: fromAgentId ?? undefined },
        data: { owning_manager_id: toAgentId },
      });
      const contacts = await tx.contact.updateMany({
        where: { owning_manager_id: fromAgentId ?? undefined, referral_partner_id: partnerId } as any,
        data: { owning_manager_id: toAgentId },
      });

      await tx.partnerReassignmentLog.create({
        data: {
          partner_agent_id: partnerId,
          from_agent_id: fromAgentId,
          to_agent_id: toAgentId,
          performed_by_agent: performedBy,
          reason,
        },
      });

      logger.info(`[Ownership] reassigned partner=${partnerId} ${fromAgentId} -> ${toAgentId}`);
      return { partnerId, fromAgentId, toAgentId, counts: { inventory: inv.count, transactions: txn.count, contacts: contacts.count } };
    });
  }

  async cascadeOnAgentDeactivation(agentId: string, superBossId?: string) {
    const superBoss = superBossId
      ? await prisma.agent.findFirst({ where: { id: superBossId } })
      : await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'ACTIVE' } as any });
    if (!superBoss) throw new Error('No super_boss found to receive assets');

    return await prisma.$transaction(async (tx) => {
      await tx.partnerAgent.updateMany({
        where: { managing_agent_id: agentId },
        data: { managing_agent_id: superBoss.id },
      });
      const inv = await tx.inventory.updateMany({
        where: { owning_manager_id: agentId },
        data: { owning_manager_id: superBoss.id },
      });
      const txn = await tx.transaction.updateMany({
        where: { owning_manager_id: agentId },
        data: { owning_manager_id: superBoss.id },
      });
      const contacts = await tx.contact.updateMany({
        where: { owning_manager_id: agentId },
        data: { owning_manager_id: superBoss.id },
      });
      await tx.agent.update({ where: { id: agentId }, data: { status: 'INACTIVE' } as any });

      logger.warn(`[Ownership] cascaded on deactivation agent=${agentId} -> super=${superBoss.id}`);
      return { fromAgentId: agentId, toAgentId: superBoss.id, counts: { inventory: inv.count, transactions: txn.count, contacts: contacts.count } };
    });
  }

  async resolveOwningManagerForPartner(partnerId: string): Promise<string | null> {
    const p = await prisma.partnerAgent.findUnique({
      where: { id: partnerId },
      select: { managing_agent_id: true },
    });
    return p?.managing_agent_id ?? null;
  }
}

export const ownershipService = new OwnershipService();
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest __tests__/ownership_service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/ownership_service.ts src/__tests__/ownership_service.test.ts
git commit -m "feat(backend): OwnershipService — reassign partner + deactivation cascade"
```

---

### Task A4: CommissionService + entries

**Files:**
- Create: `backend/src/services/commission_service.ts`
- Create: `backend/src/__tests__/commission_service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { CommissionService } from '../services/commission_service';
import prisma from '../db';

jest.mock('../db', () => ({
  __esModule: true,
  default: {
    dealCommissionEntry: { create: jest.fn(), findMany: jest.fn() },
    transaction: { findUnique: jest.fn() },
  },
}));

describe('CommissionService', () => {
  const svc = new CommissionService();

  it('records an entry with INTERNAL_AGENT party', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.dealCommissionEntry.create as jest.Mock).mockResolvedValue({ id: 'e1' });
    await svc.recordEntry('t1', { partyType: 'INTERNAL_AGENT', agentId: 'a1', amount: 25000, enteredBy: 'a1' });
    expect(prisma.dealCommissionEntry.create).toHaveBeenCalled();
  });

  it('rejects unknown transaction', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(svc.recordEntry('nope', { partyType: 'PLATFORM', amount: 100, enteredBy: 'a1' })).rejects.toThrow();
  });

  it('summarizes total + per-party breakdown', async () => {
    (prisma.dealCommissionEntry.findMany as jest.Mock).mockResolvedValue([
      { party_type: 'INTERNAL_AGENT', amount: 25000, agent_id: 'a1', partner_agent_id: null },
      { party_type: 'PARTNER_AGENT', amount: 25000, agent_id: null, partner_agent_id: 'p1' },
      { party_type: 'PLATFORM', amount: 10000, agent_id: null, partner_agent_id: null },
    ]);
    const s = await svc.summarize('t1');
    expect(Number(s.total)).toBe(60000);
    expect(s.entries.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest __tests__/commission_service.test.ts`

- [ ] **Step 3: Implement**

```typescript
// backend/src/services/commission_service.ts
import prisma from '../db';
import { Prisma } from '@prisma/client';

export type PartyType = 'INTERNAL_AGENT' | 'PARTNER_AGENT' | 'PLATFORM';
export interface CommissionInput {
  partyType: PartyType;
  agentId?: string;
  partnerAgentId?: string;
  amount: number;
  currency?: string;
  notes?: string;
  enteredBy: string;
}

export class CommissionService {
  async recordEntry(transactionId: string, input: CommissionInput) {
    const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!txn) throw new Error(`Transaction ${transactionId} not found`);
    if (input.partyType === 'INTERNAL_AGENT' && !input.agentId) throw new Error('agentId required for INTERNAL_AGENT entry');
    if (input.partyType === 'PARTNER_AGENT' && !input.partnerAgentId) throw new Error('partnerAgentId required for PARTNER_AGENT entry');

    return prisma.dealCommissionEntry.create({
      data: {
        transaction_id: transactionId,
        party_type: input.partyType,
        agent_id: input.agentId ?? null,
        partner_agent_id: input.partnerAgentId ?? null,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency ?? 'INR',
        notes: input.notes,
        entered_by_agent_id: input.enteredBy,
      },
    });
  }

  async summarize(transactionId: string) {
    const entries = await prisma.dealCommissionEntry.findMany({ where: { transaction_id: transactionId } });
    const total = entries.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
    return { total, entries };
  }
}

export const commissionService = new CommissionService();
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest __tests__/commission_service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/commission_service.ts src/__tests__/commission_service.test.ts
git commit -m "feat(backend): CommissionService — manual post-deal entry capture"
```

---

### Task A5: Permission engine role layer

**Files:**
- Modify: `backend/src/services/permission_engine.ts` (append, don't replace existing logic)

- [ ] **Step 1: Add role-layer helpers at the bottom of the file (after existing `permissionEngine` export)**

```typescript
// ---- Role-layer (added 2026-04-17 — stacks on top of plan-based masking) ----
import { sanitizationService, Viewer } from './sanitization_service';
export { Viewer } from './sanitization_service';

export function viewerFromAgent(agentId: string, role: string): Viewer {
  return { role: 'agent', agentId, isSuperBoss: role === 'super_boss' };
}

export function viewerFromPartner(partnerAgentId: string): Viewer {
  return { role: 'partner', partnerAgentId };
}

export function applyRoleMask<T>(row: T, viewer: Viewer): T {
  return sanitizationService.sanitizeInventory(row, viewer) as T;
}

export function applyRoleMaskList<T>(rows: T[], viewer: Viewer): T[] {
  return sanitizationService.sanitizeInventoryList(rows, viewer) as T[];
}
```

- [ ] **Step 2: Quick smoke test**

Run: `npx tsc --noEmit -p .`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/permission_engine.ts
git commit -m "feat(backend): permission engine role layer over plan-based masking"
```

---

### Task A6: require_super_boss middleware

**Files:**
- Create: `backend/src/middleware/require_super_boss.ts`

- [ ] **Step 1: Implement**

```typescript
// backend/src/middleware/require_super_boss.ts
import { Request, Response, NextFunction } from 'express';

export function requireSuperBoss(req: Request, res: Response, next: NextFunction) {
  const role = (req as any).user?.role;
  if (role !== 'super_boss') return res.status(403).json({ error: 'super_boss role required' });
  next();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/require_super_boss.ts
git commit -m "feat(backend): requireSuperBoss middleware"
```

---

## Phase B — Backend endpoints

### Task B1: Extend `partner_auto_create.ts` (inventory path + don't default to HAS_BUYERS)

**Files:**
- Modify: `backend/src/services/partner_auto_create.ts`
- Create: `backend/src/__tests__/partner_auto_create.test.ts`

- [ ] **Step 1: Update `ensurePartnerAgent` signature to accept `context: 'lead' | 'inventory' | 'manual'` and stop hard-coding `partner_type = HAS_BUYERS`**

Replace the `create` block:
```typescript
const partner = await prisma.partnerAgent.create({
  data: {
    phone_number: normalizedPhone,
    name: name || 'Partner Agent',
    partner_category: 'INDIVIDUAL',
    business_name: name || 'Pending Registration',
    business_address: 'Pending',
    status: 'PENDING_PAYMENT',
    verified: false,
    package_type: 'FREE',
    partner_type: 'BOTH', // default to BOTH per locked decision
    managing_agent_id: managingAgentId,
    onboarded_by_agent_id: managingAgentId,
    onboarded_at: new Date(),
  },
});
```

- [ ] **Step 2: Add a written test for the new default**

```typescript
// backend/src/__tests__/partner_auto_create.test.ts
import { ensurePartnerAgent } from '../services/partner_auto_create';
import prisma from '../db';

jest.mock('../db', () => ({
  __esModule: true,
  default: {
    partnerAgent: { findUnique: jest.fn(), create: jest.fn() },
    contact: { upsert: jest.fn() },
    interaction: { create: jest.fn() },
  },
}));

describe('ensurePartnerAgent', () => {
  it('creates partner with partner_type = BOTH by default', async () => {
    (prisma.partnerAgent.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.partnerAgent.create as jest.Mock).mockResolvedValue({ id: 'p1' });
    (prisma.contact.upsert as jest.Mock).mockResolvedValue({});
    (prisma.interaction.create as jest.Mock).mockResolvedValue({});

    await ensurePartnerAgent('+919876543210', 'Raj', 'tenant-1', 'agent-1');
    const call = (prisma.partnerAgent.create as jest.Mock).mock.calls[0][0];
    expect(call.data.partner_type).toBe('BOTH');
    expect(call.data.managing_agent_id).toBe('agent-1');
  });

  it('returns existing without touching anything', async () => {
    (prisma.partnerAgent.findUnique as jest.Mock).mockResolvedValue({ id: 'p-exists' });
    const res = await ensurePartnerAgent('+919876543210', 'Raj', 't1', 'a1');
    expect(res).toEqual({ partnerId: 'p-exists', wasCreated: false, partnerPhone: '+919876543210' });
    expect(prisma.partnerAgent.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run — expect PASS**

Run: `npx jest __tests__/partner_auto_create.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/services/partner_auto_create.ts src/__tests__/partner_auto_create.test.ts
git commit -m "fix(backend): partner auto-create defaults to partner_type=BOTH"
```

---

### Task B2: Hook partner autocreate into admin lead + inventory submission

**Files:**
- Modify: `backend/src/routes/api.ts` — search for the POST lead + POST inventory handlers
- Modify: `backend/src/routes/inventory.ts` if POST `/inventory` lives there

- [ ] **Step 1: Read current handlers**

Run: `rg "router.post\\('/leads'|router.post\\('/inventory'" backend/src/routes -n`

- [ ] **Step 2: In each handler body, near the start, accept optional `source_partner_phone` + `source_partner_name` from `req.body`. After basic validation, before DB writes:**

```typescript
import { ensurePartnerAgent } from '../services/partner_auto_create';

// ... inside handler
let sourcePartnerId: string | undefined;
if (req.body.source_partner_phone) {
  const result = await ensurePartnerAgent(
    req.body.source_partner_phone,
    req.body.source_partner_name ?? '',
    (req as any).user.tenant_id,
    (req as any).user.id, // current admin user becomes manager IF new
  );
  sourcePartnerId = result.partnerId;
}
```

- [ ] **Step 3: When creating the Inventory row, also set:**

```typescript
owning_manager_id: sourcePartnerId
  ? (await prisma.partnerAgent.findUnique({ where: { id: sourcePartnerId }, select: { managing_agent_id: true } }))?.managing_agent_id ?? (req as any).user.id
  : (req as any).user.id,
source_partner_agent_id: sourcePartnerId ?? null,
```

Apply same logic to the lead/contact/transaction create path for `owning_manager_id`.

- [ ] **Step 4: Run TS type check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.ts src/routes/inventory.ts
git commit -m "feat(backend): admin lead+inventory submission auto-creates partner and sets owning_manager_id"
```

---

### Task B3: Reassignment endpoint

**Files:**
- Modify: `backend/src/routes/api.ts`

- [ ] **Step 1: Add endpoint near other partner routes**

```typescript
import { requireSuperBoss } from '../middleware/require_super_boss';
import { ownershipService } from '../services/ownership_service';

router.post('/partners/:id/reassign', authMiddleware, requireSuperBoss, async (req, res) => {
  const { to_agent_id, reason } = req.body;
  if (!to_agent_id) return res.status(400).json({ error: 'to_agent_id required' });
  const user = (req as any).user;
  try {
    const result = await ownershipService.reassignPartner(req.params.id, to_agent_id, user.id, reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Curl smoke test (offline — just verify route boots)**

Run: `npx tsc --noEmit && node -e "require('./dist/routes/api')"` (after build)

- [ ] **Step 3: Commit**

```bash
git add src/routes/api.ts
git commit -m "feat(api): POST /api/partners/:id/reassign (super_boss only)"
```

---

### Task B4: Manager deactivation endpoint + cascade

**Files:**
- Modify: `backend/src/routes/team.ts`

- [ ] **Step 1: Add endpoint**

```typescript
import { requireSuperBoss } from '../middleware/require_super_boss';
import { ownershipService } from '../services/ownership_service';

router.post('/:id/deactivate', authMiddleware, requireSuperBoss, async (req, res) => {
  try {
    const result = await ownershipService.cascadeOnAgentDeactivation(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/team.ts
git commit -m "feat(api): POST /api/team/:id/deactivate with super_boss cascade"
```

---

### Task B5: Partner portal masked browse endpoint

**Files:**
- Modify: `backend/src/routes/agent.ts`

- [ ] **Step 1: Add route**

```typescript
import { sanitizationService } from '../services/sanitization_service';

router.get('/inventory/browse', agentAuth, async (req, res) => {
  const viewer = { role: 'partner' as const, partnerAgentId: (req as any).agent.id };
  const { city, locality, type, bhk, budget_min, budget_max, page = 1, limit = 20 } = req.query as any;
  const where: any = { status: 'ACTIVE' };
  if (city) where.city = city;
  if (locality) where.locality = locality;
  if (type) where.property_type = type;
  if (bhk) where.bhk = Number(bhk);
  if (budget_min) where.price = { ...(where.price ?? {}), gte: Number(budget_min) };
  if (budget_max) where.price = { ...(where.price ?? {}), lte: Number(budget_max) };

  const [rows, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: { owner: { select: { id: true, name: true, phone_number: true } }, key_holder: { select: { id: true, name: true, phone_number: true } } },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { created_at: 'desc' },
    }),
    prisma.inventory.count({ where }),
  ]);
  res.json({ rows: sanitizationService.sanitizeInventoryList(rows, viewer), total, page: Number(page), limit: Number(limit) });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/agent.ts
git commit -m "feat(agent-api): GET /agent/inventory/browse (masked cross-partner search)"
```

---

### Task B6: Wire existing deal/match responses through `sanitizationService`

**Files:**
- Modify: `backend/src/routes/agent.ts` (find the `GET /agent/deals/:id/matches` handler around line 1321 per prior investigation)

- [ ] **Step 1: Replace the manual field stripping in the matches handler with one call:**

```typescript
const viewer = { role: 'partner' as const, partnerAgentId: (req as any).agent.id };
const safe = sanitizationService.sanitizeInventoryList(matches, viewer);
res.json({ matches: safe });
```

- [ ] **Step 2: Repeat for any `GET /agent/deals` responses (around line 1219) that include `owner` / `key_holder` today**

- [ ] **Step 3: Commit**

```bash
git add src/routes/agent.ts
git commit -m "refactor(agent-api): route deal/match responses through SanitizationService"
```

---

### Task B7: Commission entry endpoints

**Files:**
- Modify: `backend/src/routes/deals.ts`

- [ ] **Step 1: Add endpoints**

```typescript
import { commissionService } from '../services/commission_service';

router.post('/:id/commission-entries', authMiddleware, async (req, res) => {
  const user = (req as any).user;
  try {
    const entry = await commissionService.recordEntry(req.params.id, { ...req.body, enteredBy: user.id });
    res.json(entry);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/commission-entries', authMiddleware, async (req, res) => {
  const summary = await commissionService.summarize(req.params.id);
  res.json(summary);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/deals.ts
git commit -m "feat(api): deal commission entry endpoints (manual capture)"
```

---

### Task B8: Deploy Phase A + B to staging/prod

- [ ] **Step 1: Run migration on remote DB**

Run migration via deploy flow — use the existing pattern (prisma migrate resolve / prisma migrate deploy) described in `feedback_pwa_deploy.md`.

- [ ] **Step 2: Deploy backend**

Use `mcp__realty-pandit-qa__deploy` with `component: "backend"`.

- [ ] **Step 3: Health check**

Use `mcp__realty-pandit-qa__server_health`. Expected: all services up, no error spikes.

- [ ] **Step 4: Verify endpoints respond**

```
mcp__realty-pandit-qa__qa_verify_task
  description: "Partner ownership endpoints respond"
  checks: [
    "api:/api/partners:200",
    "api:/agent/inventory/browse:401",  // no auth = 401
    "noerrors:/"
  ]
```

---

## Phase C — Admin UI

### Task C1: `PartnerSourceAutocomplete` component

**Files:**
- Create: `frontend/src/components/PartnerSourceAutocomplete.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';

interface Props {
  value: { partner_id?: string; phone?: string; name?: string };
  onChange: (v: { partner_id?: string; phone?: string; name?: string }) => void;
}

export function PartnerSourceAutocomplete({ value, onChange }: Props) {
  const [query, setQuery] = useState(value.phone ?? '');
  const [results, setResults] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (query.length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/partners?search=${encodeURIComponent(query)}`, { credentials: 'include' });
      const data = await res.json();
      setResults(data.rows ?? []);
      setShowCreate(data.rows?.length === 0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div style={{ position: 'relative' }}>
      <label>Source partner (optional)</label>
      <input
        type="text"
        value={query}
        placeholder="phone or name"
        onChange={(e) => { setQuery(e.target.value); onChange({ phone: e.target.value }); }}
      />
      {results.length > 0 && (
        <ul style={{ position: 'absolute', background: 'white', border: '1px solid #ddd', width: '100%', zIndex: 10 }}>
          {results.map((r) => (
            <li key={r.id} onClick={() => { onChange({ partner_id: r.id, phone: r.phone_number, name: r.name }); setResults([]); }}>
              {r.name} — {r.phone_number}
            </li>
          ))}
        </ul>
      )}
      {showCreate && query.length >= 10 && (
        <button type="button" onClick={() => onChange({ phone: query, name: '' })}>
          + Add new partner {query}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PartnerSourceAutocomplete.tsx
git commit -m "feat(admin): PartnerSourceAutocomplete component"
```

---

### Task C2: Wire autocomplete into `LeadForm.tsx` + `InventoryModal.tsx`

**Files:**
- Modify: `frontend/src/components/LeadForm.tsx`
- Modify: `frontend/src/components/InventoryModal.tsx`
- Modify: `frontend/src/components/mobile/MobileLeadForm.tsx`
- Modify: `frontend/src/components/mobile/MobileInventoryForm.tsx`

- [ ] **Step 1: In each form, import the component and render it in the form**

```tsx
import { PartnerSourceAutocomplete } from './PartnerSourceAutocomplete';
// inside form state
const [sourcePartner, setSourcePartner] = useState<{partner_id?: string; phone?: string; name?: string}>({});
// inside render
<PartnerSourceAutocomplete value={sourcePartner} onChange={setSourcePartner} />
```

- [ ] **Step 2: On submit, include `source_partner_phone` + `source_partner_name` (OR `source_partner_id`) in the POST payload**

- [ ] **Step 3: Mobile twins — identical integration per `feedback_mobile_components.md`**

- [ ] **Step 4: Commit**

```bash
git add src/components/LeadForm.tsx src/components/InventoryModal.tsx src/components/mobile/MobileLeadForm.tsx src/components/mobile/MobileInventoryForm.tsx
git commit -m "feat(admin): lead+inventory forms capture source partner (desktop + mobile)"
```

---

### Task C3: `PartnerReassignDialog` + button on `PartnerManagement`

**Files:**
- Create: `frontend/src/components/PartnerReassignDialog.tsx`
- Modify: `frontend/src/components/PartnerManagement.tsx`

- [ ] **Step 1: Implement the dialog**

```tsx
interface Props { partnerId: string; currentManagerId?: string | null; onClose: () => void; onSuccess: () => void; }
export function PartnerReassignDialog({ partnerId, currentManagerId, onClose, onSuccess }: Props) {
  const [agents, setAgents] = useState<any[]>([]);
  const [toAgentId, setToAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/team', { credentials: 'include' }).then(r => r.json()).then(d => setAgents(d.rows ?? [])); }, []);

  async function submit() {
    setLoading(true);
    const res = await fetch(`/api/partners/${partnerId}/reassign`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_agent_id: toAgentId, reason }),
    });
    setLoading(false);
    if (res.ok) onSuccess(); else alert((await res.json()).error);
  }

  return (
    <div className="modal">
      <h3>Reassign Partner</h3>
      <select value={toAgentId} onChange={(e) => setToAgentId(e.target.value)}>
        <option value="">Choose new manager...</option>
        {agents.filter(a => a.id !== currentManagerId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button onClick={submit} disabled={!toAgentId || loading}>Reassign</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 2: In `PartnerManagement.tsx`, add "Reassign" button next to each partner row (only visible if `currentUser.role === 'super_boss'`)**

- [ ] **Step 3: Visual verification**

Use `mcp__realty-pandit-qa__qa_verify_task`:
```
description: "Super boss can see Reassign button on partners page"
checks: ["exists:/#partners:button:text=Reassign", "responsive:/#partners"]
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PartnerReassignDialog.tsx src/components/PartnerManagement.tsx
git commit -m "feat(admin): super_boss can reassign partner with cascade preview"
```

---

### Task C4: `TeamDeactivateDialog` + button on `TeamManagement`

**Files:**
- Create: `frontend/src/components/TeamDeactivateDialog.tsx`
- Modify: `frontend/src/components/TeamManagement.tsx`

- [ ] **Step 1: Fetch preview counts before confirming**

```tsx
interface Props { agentId: string; onClose: () => void; onSuccess: () => void; }
export function TeamDeactivateDialog({ agentId, onClose, onSuccess }: Props) {
  const [counts, setCounts] = useState<{partners: number; inventory: number; contacts: number} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/team/${agentId}/ownership-summary`, { credentials: 'include' })
      .then(r => r.json()).then(setCounts);
  }, [agentId]);

  async function submit() {
    setLoading(true);
    const res = await fetch(`/api/team/${agentId}/deactivate`, { method: 'POST', credentials: 'include' });
    setLoading(false);
    if (res.ok) onSuccess(); else alert((await res.json()).error);
  }

  return (
    <div className="modal">
      <h3>Deactivate team member?</h3>
      {counts && <p>This will transfer <b>{counts.partners} partners, {counts.inventory} listings, {counts.contacts} leads</b> to the super boss.</p>}
      <button onClick={submit} disabled={loading}>Confirm deactivation</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 2: Add corresponding `GET /api/team/:id/ownership-summary` endpoint**

In `backend/src/routes/team.ts`:
```typescript
router.get('/:id/ownership-summary', authMiddleware, requireSuperBoss, async (req, res) => {
  const [partners, inventory, contacts] = await Promise.all([
    prisma.partnerAgent.count({ where: { managing_agent_id: req.params.id } }),
    prisma.inventory.count({ where: { owning_manager_id: req.params.id } }),
    prisma.contact.count({ where: { owning_manager_id: req.params.id } }),
  ]);
  res.json({ partners, inventory, contacts });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TeamDeactivateDialog.tsx src/components/TeamManagement.tsx src/routes/team.ts
git commit -m "feat(admin): deactivate team member with cascade preview"
```

---

### Task C5: `DealCloseCommissionDialog`

**Files:**
- Create: `frontend/src/components/DealCloseCommissionDialog.tsx`
- Modify: wherever deals are closed (likely `DealPipeline.tsx`)

- [ ] **Step 1: Implement dialog with N+1 rows (one per party, "+ Add party" button)**

```tsx
interface Entry { partyType: 'INTERNAL_AGENT'|'PARTNER_AGENT'|'PLATFORM'; agentId?: string; partnerAgentId?: string; amount: number; notes?: string; }

export function DealCloseCommissionDialog({ dealId, onClose }: {dealId: string; onClose: () => void}) {
  const [entries, setEntries] = useState<Entry[]>([{ partyType: 'PLATFORM', amount: 0 }]);
  // ... render each row with party selector + amount input
  async function submit() {
    for (const e of entries) {
      await fetch(`/api/deals/${dealId}/commission-entries`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(e),
      });
    }
    onClose();
  }
  // ...
}
```

- [ ] **Step 2: Hook into existing deal close flow — render the dialog when the user moves a deal to `CLOSED_WON`**

- [ ] **Step 3: Commit**

```bash
git add src/components/DealCloseCommissionDialog.tsx src/components/DealPipeline.tsx
git commit -m "feat(admin): commission entry dialog on deal close"
```

---

### Task C6: Deploy admin + verify

- [ ] **Step 1: Deploy**

`mcp__realty-pandit-qa__deploy` with `component: "admin"` (a.k.a. frontend).

- [ ] **Step 2: Visual proof (screenshot before + after per user preference)**

`mcp__realty-pandit-qa__qa_verify_task` with checks:
```
exists:/#partners:button:text=Reassign
exists:/#team:button:text=Deactivate
exists:/#inventory form input[placeholder*="partner"]
exists:/#leads form input[placeholder*="partner"]
noerrors:/
responsive:/#partners
```

---

## Phase D — Partner portal (Next.js website)

### Task D1: `ManagerContactBanner`

**Files:**
- Create: `website/src/components/agent/ManagerContactBanner.tsx`
- Modify: `website/src/app/agent/layout.tsx`

- [ ] **Step 1: Implement banner**

```tsx
'use client';
import { useEffect, useState } from 'react';

export function ManagerContactBanner() {
  const [mgr, setMgr] = useState<{name: string; phone: string; email?: string} | null>(null);
  useEffect(() => {
    fetch('/agent/me/manager', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null).then(setMgr);
  }, []);
  if (!mgr) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
      Your manager: <b>{mgr.name}</b> — <a href={`tel:${mgr.phone}`}>{mgr.phone}</a>
      {mgr.email && <> · <a href={`mailto:${mgr.email}`}>{mgr.email}</a></>}
    </div>
  );
}
```

- [ ] **Step 2: Add backend endpoint `GET /agent/me/manager` in `backend/src/routes/agent.ts`**

```typescript
router.get('/me/manager', agentAuth, async (req, res) => {
  const partner = await prisma.partnerAgent.findUnique({
    where: { id: (req as any).agent.id },
    include: { managing_agent: { select: { id: true, name: true, phone_number: true, email: true } } },
  });
  if (!partner?.managing_agent) return res.status(404).json({ error: 'No manager assigned' });
  res.json({ name: partner.managing_agent.name, phone: partner.managing_agent.phone_number, email: partner.managing_agent.email });
});
```

- [ ] **Step 3: Wrap `agent/layout.tsx` with the banner**

```tsx
import { ManagerContactBanner } from '@/components/agent/ManagerContactBanner';
// inside layout
<ManagerContactBanner />
{children}
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/agent/ManagerContactBanner.tsx website/src/app/agent/layout.tsx backend/src/routes/agent.ts
git commit -m "feat(portal): partner sees their manager contact on every agent page"
```

---

### Task D2: Browse tab + page

**Files:**
- Create: `website/src/app/agent/inventory/browse/page.tsx`
- Create: `website/src/lib/agent-browse.ts`
- Modify: `website/src/app/agent/inventory/page.tsx`

- [ ] **Step 1: Add tab switcher to inventory page**

```tsx
// inventory/page.tsx — add at top
<nav className="flex gap-4">
  <Link href="/agent/inventory">My inventory</Link>
  <Link href="/agent/inventory/browse">Browse all</Link>
</nav>
```

- [ ] **Step 2: Implement browse page with filters + list of sanitized cards**

```tsx
// agent/inventory/browse/page.tsx
'use client';
import { useEffect, useState } from 'react';
export default function BrowsePage() {
  const [filters, setFilters] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const qs = new URLSearchParams(filters).toString();
    fetch(`/agent/inventory/browse?${qs}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setRows(d.rows ?? []));
  }, [filters]);
  return (
    <div>
      <h1>Browse inventory</h1>
      {/* filter inputs omitted for brevity */}
      <ul>
        {rows.map(r => (
          <li key={r.id}>
            <b>{r.title}</b> — {r.locality}, {r.city} · ₹{r.price?.toLocaleString('en-IN')}
            {/* NO owner, NO phone, NO source shown */}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/app/agent/inventory/browse website/src/app/agent/inventory/page.tsx website/src/lib/agent-browse.ts
git commit -m "feat(portal): partner can browse cross-partner inventory with masked owner+source"
```

---

### Task D3: Deal detail pages — strip non-manager contacts

**Files:**
- Modify: `website/src/app/agent/deals/[id]/page.tsx`
- Modify: `website/src/app/agent/deals/[id]/browse/page.tsx`

- [ ] **Step 1: Audit current markup**

Run: `rg "owner|phone|key_holder" website/src/app/agent/deals -n`

- [ ] **Step 2: Remove any direct rendering of owner/key_holder/source; replace with:**

```tsx
<div className="rounded bg-slate-50 p-3 text-sm">
  For owner coordination, contact your manager — see banner at top.
</div>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/app/agent/deals
git commit -m "feat(portal): remove all non-manager contact surfaces from deal pages"
```

---

### Task D4: Deploy website + verify

- [ ] **Step 1: Deploy**

`mcp__realty-pandit-qa__deploy` component: `"website"`.

- [ ] **Step 2: Verify**

```
mcp__realty-pandit-qa__qa_verify_task
description: "Partner portal shows manager contact + masked browse"
checks: [
  "exists:/agent/dashboard .manager-contact-banner",
  "exists:/agent/inventory/browse",
  "text:/agent/inventory/browse:Browse inventory",
  "noerrors:/agent/inventory/browse",
  "responsive:/agent/inventory/browse"
]
```

---

## Phase E — AI / WhatsApp flow

### Task E1: Update `partner_agent.ts`

**Files:**
- Modify: `backend/src/agents/partner_agent.ts`

- [ ] **Step 1: Update system prompt to explicitly forbid sharing client contacts**

Find the existing system prompt string. Append:
```
CRITICAL VISIBILITY RULES:
- NEVER share buyer/owner phone numbers, emails, or full names.
- Always remind the partner to coordinate through their assigned manager.
- If the partner asks for a contact, respond: "I'll connect you with your manager who will handle coordination."
- When presenting matches, always redact owner details and source.
```

- [ ] **Step 2: In response-building code, run match rows through `sanitizationService.sanitizeInventoryList(rows, { role: 'partner', partnerAgentId })` before formatting for WhatsApp**

- [ ] **Step 3: Include manager contact at end of every match response**

```typescript
const manager = await ownershipService.resolveOwningManagerForPartner(partnerId);
const managerAgent = manager ? await prisma.agent.findUnique({ where: { id: manager }, select: { name: true, phone_number: true } }) : null;
const footer = managerAgent ? `\n\nFor any coordination, contact ${managerAgent.name} (${managerAgent.phone_number})` : '';
```

- [ ] **Step 4: Commit**

```bash
git add src/agents/partner_agent.ts
git commit -m "feat(ai): partner_agent flow strips client contacts + promotes manager"
```

---

### Task E2: Update `matching_engine.ts`

**Files:**
- Modify: `backend/src/services/matching_engine.ts`

- [ ] **Step 1: In the public `findMatches` entrypoint, accept optional `viewer: Viewer` and run results through `sanitizationService.sanitizeInventoryList` before returning**

- [ ] **Step 2: Update all callers in `routes/agent.ts` + `routes/leads.ts` to pass the appropriate viewer**

- [ ] **Step 3: Commit**

```bash
git add src/services/matching_engine.ts src/routes/agent.ts src/routes/leads.ts
git commit -m "refactor(matching): viewer-aware output sanitization"
```

---

### Task E3: Deploy + verify AI flow

- [ ] **Step 1: Deploy backend**

- [ ] **Step 2: Send test WhatsApp from a known partner number, request matches**

Manual test — reply should (a) contain property details, (b) NOT contain any owner phone/name, (c) end with the manager's name + phone.

---

## Phase F — End-to-end QA matrix

### Task F1: Golden-path verification

- [ ] **Scenario 1 — Admin adds inventory on behalf of new partner**
  - Open admin → Inventory → + New.
  - Fill form, enter new partner phone `+919900001111` + name `Test Partner`.
  - Submit.
  - **Expect:** Partner auto-created (visible in Partners view), `managing_agent_id = current user`, inventory's `owning_manager_id` = current user, `source_partner_agent_id` = new partner id.

- [ ] **Scenario 2 — Cross-team match sanitization**
  - Team member A (not super_boss) logs in.
  - Opens Inventory view, filters to see all inventory.
  - **Expect:** Inventory owned by other managers shows title/locality/price/BHK, does NOT show owner name/phone/source.

- [ ] **Scenario 3 — Partner self-browse masking**
  - Log in as a partner agent (not super_boss).
  - Navigate to `/agent/inventory/browse`.
  - **Expect:** Listings have no owner, no full address, no source_partner info. Manager contact banner visible at top of every page.

- [ ] **Scenario 4 — Super_boss reassigns**
  - Super_boss logs in, opens Partners, clicks Reassign on a partner.
  - Selects a new manager, confirms.
  - **Expect:** API returns `counts` object; PartnerReassignmentLog row created; partner's `managing_agent_id` updated; all their inventory/contacts/transactions now carry the new `owning_manager_id`.

- [ ] **Scenario 5 — Manager deactivation cascade**
  - Super_boss deactivates a team member.
  - **Expect:** All their partners/inventory/contacts/transactions flow to super_boss. Agent row `status = INACTIVE`.

- [ ] **Scenario 6 — Commission entry**
  - Close a deal as CLOSED_WON.
  - Dialog opens, enter 3 parties (Partner A 25k, Partner B 25k, Platform 10k).
  - **Expect:** 3 `DealCommissionEntry` rows created, `GET /api/deals/:id/commission-entries` returns sum 60,000.

- [ ] **Scenario 7 — Self-signup → super_boss default**
  - Register a fresh partner via `/join/agent` (OTP flow).
  - **Expect:** New `PartnerAgent` row has `managing_agent_id = <super_boss.id>`.

- [ ] **Scenario 8 — Partner AI WhatsApp**
  - From a registered partner WhatsApp number, message: "2 BHK in Dwarka under 80L, got any?"
  - **Expect:** AI reply lists matching properties without owner contact. Ends with `"For any coordination, contact <Manager Name> (<Manager Phone>)"`.

### Task F2: Check self-signup assignment path

**Files:**
- Modify: `backend/src/routes/agent.ts` (the OTP registration / `/join/agent` submission handler)

- [ ] **Step 1: In the create-partner handler, when `managing_agent_id` is unset, assign to super_boss**

```typescript
const superBoss = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'ACTIVE' as any } });
const managingAgentId = body.managing_agent_id ?? superBoss?.id;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/agent.ts
git commit -m "feat(portal): self-signup defaults managing_agent_id to super_boss"
```

### Task F3: Regression sweep

- [ ] Run `mcp__realty-pandit-qa__qa_scan` on admin + website
- [ ] Confirm no new critical/high errors in GlitchTip (check `memory/glitchtip_errors.md` digest)
- [ ] Mark plan complete

---

## Rollout order (summary)

1. **Phase A** (schema + foundation services) — safe, no UI impact. Deploy backend. Verify endpoints respond.
2. **Phase B** (backend routes) — new endpoints behind super_boss guard. Deploy backend. Verify endpoints respond.
3. **Phase C** (admin UI) — deploy admin. Visual verify.
4. **Phase D** (partner portal) — deploy website. Visual verify.
5. **Phase E** (AI flow) — deploy backend. Manual WhatsApp test.
6. **Phase F** (QA matrix) — full sweep.

Each phase ends with a deploy + automated verify. If any check fails, fix → re-deploy → re-verify (max 3×). If still failing, stop and report.

---

## Self-review notes

- **Spec coverage check:** every Stage-2 locked decision has a task — partner self-browse (D2), multi-party visit (participants JSON optional — covered in dialog notes D3), post-deal commission entry (A4 + B7 + C5), forward-only migration (explicit out-of-scope), masking plan-based preservation (A5 adds layer, doesn't replace), single-manager ownership + super_boss fallback (A3 + F2), reassignment (A3 + B3 + C3), deactivation cascade (A3 + B4 + C4), partner_type=BOTH default (B1).
- **Placeholder scan:** no "TODO/TBD" in code blocks.
- **Type consistency:** `Viewer`, `PartyType`, `CommissionPartyType` used consistently. `ownershipService` and `sanitizationService` singletons used in routes.
- **Gaps knowingly deferred:** `source_partner_agent_id` field may need to be added to `Inventory` model if not already present — Task A1 Step 3 does not add it; add as a separate small task A1b if schema inspection shows it's missing. Builder system entirely deferred.

---

## Out of scope (restated for clarity)

- Builder management UI + hierarchical project/tower/unit inventory
- Backfilling existing 11 partner agents
- Overhauling plan-based masking
- Rigid commission split / payout automation
- Partner hierarchy (parent_partner_id) new semantics
- Commission payout to bank accounts / invoicing
- Partner-to-partner messaging / chat
