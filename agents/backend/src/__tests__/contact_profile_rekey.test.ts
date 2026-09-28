import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Auth passthrough that injects a super_boss agent (the global setup mock leaves
// req.agent undefined, but this route reads req.agent.role for scoping).
vi.mock('../middleware/auth', () => {
    const withAgent = (req: any, _res: any, next: any) => {
        req.agent = { id: 'agent-1', email: 'boss@test.in', role: 'super_boss', tenant_id: 'tenant-1' };
        next();
    };
    return {
        authMiddleware: withAgent,
        requireRole: () => withAgent,
        authenticateAgent: withAgent,
        checkPermission: () => withAgent,
    };
});

// Bypass the double-submit CSRF gate so supertest can PATCH directly.
vi.mock('../middleware/csrf', () => ({
    csrfMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import app from '../app';
import prisma from '../db';

const OLD_PHONE = '+919999000011';
const NEW_PHONE = '+919999000022';

const existingContact = {
    phone_number: OLD_PHONE,
    name: 'Dummy Test Lead',
    contact_type: 'BUYER',
    assigned_agent_id: null,
};

// $transaction is not in the global prisma mock — provide a tx double whose
// $executeRaw (the ON UPDATE CASCADE re-key) and contact.update we can assert on.
const txDouble = {
    $executeRaw: vi.fn(),
    contact: { update: vi.fn() },
};

beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).$transaction = vi.fn(async (cb: any) => cb(txDouble));
    txDouble.$executeRaw.mockResolvedValue([{ '?column?': 1 }]);
    txDouble.contact.update.mockResolvedValue({});
});

// Regression cover for editing a lead's phone number after submit (Ext. Leads
// slide-over → PATCH /api/contacts/:phone/profile with { new_phone }).
describe('PATCH /api/contacts/:phone/profile — phone re-key', () => {
    it('re-keys the number, cascades via raw UPDATE, and returns rekeyed:true', async () => {
        // Call order in the route: existing lookup (OLD) → taken-check (NEW, must miss)
        // → final fetch (NEW, returns the re-keyed row).
        let calls = 0;
        (prisma.contact.findUnique as any).mockImplementation(async ({ where }: any) => {
            calls += 1;
            if (where.phone_number === NEW_PHONE) return calls <= 2 ? null : { ...existingContact, phone_number: NEW_PHONE };
            if (where.phone_number === OLD_PHONE) return existingContact;
            return null;
        });

        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: NEW_PHONE });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.rekeyed).toBe(true);
        expect(res.body.new_phone).toBe(NEW_PHONE);
        expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
        expect(txDouble.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('is a no-op (rekeyed:false) when the number is unchanged after normalization', async () => {
        (prisma.contact.findUnique as any).mockImplementation(async ({ where }: any) => {
            if (where.phone_number === OLD_PHONE) return existingContact;
            return { ...existingContact, phone_number: OLD_PHONE };
        });

        // Bare digits normalize to the same E.164 key.
        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: '9999000011' });

        expect(res.status).toBe(200);
        expect(res.body.rekeyed).toBe(false);
        expect(txDouble.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects an un-normalizable number with 400', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue(existingContact);

        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: 'ChiragWadhwa' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/valid phone/i);
        expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });

    it('rejects a number already used by another contact with 409', async () => {
        (prisma.contact.findUnique as any).mockImplementation(async ({ where }: any) => {
            if (where.phone_number === OLD_PHONE) return existingContact;
            if (where.phone_number === NEW_PHONE) return { ...existingContact, phone_number: NEW_PHONE, name: 'Someone Else' };
            return null;
        });

        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: NEW_PHONE });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already uses/i);
        expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });

    it('returns 404 when the lead does not exist', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue(null);

        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: NEW_PHONE });

        expect(res.status).toBe(404);
    });

    it('blocks edits to PARTNER_AGENT / MANAGEMENT contacts with 403', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({ ...existingContact, contact_type: 'PARTNER_AGENT' });

        const res = await request(app)
            .patch(`/api/contacts/${encodeURIComponent(OLD_PHONE)}/profile`)
            .send({ new_phone: NEW_PHONE });

        expect(res.status).toBe(403);
        expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });
});
