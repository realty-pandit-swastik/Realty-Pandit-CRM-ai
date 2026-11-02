import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
vi.mock('../services/calendar', () => ({ CalendarService: class { sendAppointmentReminder = vi.fn(async () => {}); } }));
vi.mock('../services/notify', () => ({ notify: vi.fn() }));
vi.mock('../services/catalog_sync', () => ({ upsertCatalogProduct: vi.fn(), deleteCatalogProduct: vi.fn(), syncInventoryById: vi.fn() }));
import leads from '../routes/leads';
import deals from '../routes/deals';
import inventory from '../routes/inventory';
import calendar from '../routes/calendar';
import prisma from '../db';

const db = new PrismaClient(), app = express();
const createdFiles: string[] = [];
app.use(express.json());
app.use('/api/leads', leads); app.use('/api/deals', deals); app.use('/api/inventory', inventory); app.use('/api/calendar', calendar);
const a = 'mobile-object-a', b = 'mobile-object-b', member = 'mobile-object-member', foreign = 'mobile-object-foreign';
const ownPhone = '+919000000031', foreignPhone = '+919000000032', hiddenPhone = '+919000000033';
const auth = (role = 'employee') => jwt.sign({ id: member, tenant_id: a, email: 'objects@example.invalid', role }, process.env.JWT_SECRET!);
const get = (path: string, role = 'employee') => request(app).get(path).auth(auth(role), { type: 'bearer' });
beforeAll(async () => {
    for (const id of [a, b]) await db.tenant.create({ data: { id, business_name: 'Synthetic', owner_name: 'Synthetic', primary_phone: id } });
    for (const [id, tenant_id] of [[member, a], [foreign, b]]) await db.agent.create({ data: { id, tenant_id, name: 'Synthetic', email: `${id}@example.invalid`, role: 'employee',
        password_hash: 'synthetic-noncredential', refresh_token: 'synthetic-noncredential', setup_token: `synthetic-${id}`, google_refresh_token: 'synthetic-noncredential', email_smtp_password: 'synthetic-noncredential' } });
    for (const [phone_number, tenant_id, assigned_agent_id] of [[ownPhone, a, member], [foreignPhone, b, foreign], [hiddenPhone, a, null]]) {
        await db.contact.create({ data: { phone_number: phone_number!, tenant_id: tenant_id!, assigned_agent_id, name: 'Synthetic contact' } });
    }
    for (const [id, tenant_id, coordinator_agent_id, demand_contact_id] of [['mobile-object-own-deal', a, member, ownPhone], ['mobile-object-foreign-deal', b, foreign, foreignPhone], ['mobile-object-hidden-deal', a, null, hiddenPhone]] as const) {
        await db.transaction.create({ data: { id: id!, tenant_id: tenant_id!, coordinator_agent_id, demand_contact_id, type: 'SALE', status: 'NEW' } });
    }
    for (const contact_phone of [ownPhone, foreignPhone]) await db.owner.create({ data: { id: `mobile-object-owner-${contact_phone}`, scope: 'INTERNAL', contact_phone } });
    for (const [id, tenant_id, assigned_agent_id] of [['mobile-object-own-property', a, member], ['mobile-object-foreign-property', b, foreign]]) {
        await db.inventory.create({ data: { id, tenant_id, assigned_agent_id, uploaded_by_agent_id: assigned_agent_id, category: 'residential', type: 'flat', location: 'Synthetic locality', intent: 'sell', owner_phone: tenant_id === a ? ownPhone : foreignPhone, owner_id: `mobile-object-owner-${tenant_id === a ? ownPhone : foreignPhone}`, video_urls: [], price: 40, price_unit: 'Lakh', media_urls: [], shared_with_ids: [], status: 'active' } });
    }
    for (const [id, tenant_id, contact_id, assigned_to_agent_id] of [['mobile-object-own-visit', a, ownPhone, member], ['mobile-object-foreign-visit', b, foreignPhone, foreign], ['mobile-object-bad-link-visit', a, foreignPhone, member], ['mobile-object-hidden-visit', a, ownPhone, null]] as const) {
        await db.appointment.create({ data: { id, tenant_id, contact_id, assigned_to_agent_id, title: 'Synthetic visit', type: 'property_visit', scheduled_at: new Date() } });
    }
});
afterAll(async () => {
    for (const file of createdFiles) await fs.promises.unlink(file).catch(() => {});
    await db.appointment.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.interaction.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.inventory.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.transaction.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.contact.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.agent.deleteMany({ where: { tenant_id: { in: [a, b] } } });
    await db.tenant.deleteMany({ where: { id: { in: [a, b] } } });
    await db.$disconnect(); await prisma.$disconnect();
});
describe('real per-object CRM boundaries', () => {
    it('authorizes and normalizes visit creation before any side effects', async () => {
        const body = { contact_id: ownPhone, title: 'Synthetic scoped visit', type: 'property_visit', scheduled_at: new Date(Date.now() + 86400000).toISOString(), property_id: 'mobile-object-own-property', assigned_to_agent_id: member, notes: 'Native inventory note' };
        const post = (value: object) => request(app).post('/api/calendar/appointments').auth(auth(), { type: 'bearer' }).send(value);
        for (const patch of [{ contact_id: foreignPhone }, { contact_id: hiddenPhone }, { property_id: 'mobile-object-foreign-property' }]) expect((await post({ ...body, ...patch })).status).toBe(404);
        expect((await post({ ...body, assigned_to_agent_id: foreign })).status).toBe(400);
        expect((await post({ ...body, duration: -1 })).status).toBe(400);
        const created = await post({ ...body, contact_id: ownPhone.slice(3) });
        expect(created.status).toBe(200);
        const saved = await db.appointment.findFirst({ where: { tenant_id: a, title: body.title } });
        expect(saved?.contact_id).toBe(ownPhone); expect(saved?.property_id).toBe(body.property_id); expect(saved?.assigned_to_agent_id).toBe(member); expect(saved?.notes).toBe(body.notes);
        if (saved) await db.appointment.delete({ where: { id: saved.id } });
    });

    it('keeps inventory contacts, enrichment, mutations and share recipients tenant scoped for all staff roles', async () => {
        for (const role of ['employee', 'manager', 'super_boss']) {
            for (const suffix of ['contacts', 'enrichment', 'matching-clients']) {
                expect((await get(`/api/inventory/mobile-object-foreign-property/${suffix}`, role)).status).toBe(404);
            }
            for (const suffix of ['clone', 'mark-sold', 'mark-on-hold', 'approve', 'reject', 'transfer-ownership']) {
                expect((await request(app).post(`/api/inventory/mobile-object-foreign-property/${suffix}`).auth(auth(role), { type: 'bearer' }).send({})).status).toBe(suffix === 'transfer-ownership' && role !== 'super_boss' ? 403 : 404);
            }
            const foreignRecipient = await request(app).post('/api/inventory/mobile-object-own-property/share-to-client').auth(auth(role), { type: 'bearer' }).send({ client_phone: foreignPhone, content: { media_urls: [] } });
            expect(foreignRecipient.status).toBe(403);
        }
        expect((await get('/api/inventory/mobile-object-own-property')).body.actions.edit).toBe(true);
        expect((await get('/api/inventory/mobile-object-own-property')).body.can_access_documents).toBe(true);
    });
    it('allows own lead reads and denies foreign/hidden reads and mutations before side effects', async () => {
        expect((await get(`/api/leads/${encodeURIComponent(ownPhone)}`)).status).toBe(200);
        for (const phone of [foreignPhone, hiddenPhone]) {
            expect((await get(`/api/leads/${encodeURIComponent(phone)}`)).status).toBe(404);
            expect((await request(app).patch(`/api/leads/${encodeURIComponent(phone)}/status`).auth(auth(), { type: 'bearer' }).send({ notes: 'Forbidden' })).status).toBe(404);
        }
        expect((await get(`/api/leads/${encodeURIComponent(foreignPhone)}`, 'super_boss')).status).toBe(404);
        expect((await db.contact.findUniqueOrThrow({ where: { phone_number: foreignPhone } })).notes).toBeNull();
    });
    it('uses tenant plus team scope for every deal action', async () => {
        expect((await get('/api/deals/mobile-object-own-deal')).status).toBe(200);
        for (const id of ['mobile-object-foreign-deal', 'mobile-object-hidden-deal']) {
            expect((await get(`/api/deals/${id}`)).status).toBe(404);
            expect((await request(app).post(`/api/deals/${id}/log-action`).auth(auth(), { type: 'bearer' }).send({ action: 'NOTE', notes: 'Forbidden' })).status).toBe(404);
        }
        expect((await get('/api/deals/mobile-object-foreign-deal', 'super_boss')).status).toBe(404);
    });
    it('conditionally saves native note drafts without overwriting a concurrent update', async () => {
        const route = `/api/leads/${encodeURIComponent(ownPhone)}/status`;
        const outcomes = await Promise.all(['First synthetic draft', 'Second synthetic draft'].map(notes => request(app).patch(route).auth(auth(), { type: 'bearer' }).send({ notes, expected_notes: '' })));
        expect(outcomes.map(result => result.status).sort()).toEqual([200, 409]);
        const stored = await db.contact.findUniqueOrThrow({ where: { phone_number: ownPhone } });
        expect(stored.notes).toBe(outcomes[0].status === 200 ? 'First synthetic draft' : 'Second synthetic draft');
        await request(app).patch(route).auth(auth(), { type: 'bearer' }).send({ notes: 'Invalid', expected_notes: '', lifecycle_stage: 'QUALIFIED' }).expect(400);
        await request(app).patch(route).auth(auth(), { type: 'bearer' }).send({ notes: 'Web-compatible save' }).expect(200);
        expect((await db.contact.findUniqueOrThrow({ where: { phone_number: ownPhone } })).notes).toBe('Web-compatible save');
    });
    it('scopes inventory detail/PDF and guards media before accepting a file', async () => {
        for (const path of ['/api/inventory?all=true', '/api/inventory?all=true&search=Synthetic']) {
            const catalogue = await get(path, 'super_boss');
            expect(catalogue.status).toBe(200);
            expect(catalogue.body.data.map((row: { id: string }) => row.id)).toEqual(['mobile-object-own-property']);
        }
        const own = await get('/api/inventory/mobile-object-own-property');
        expect(own.status).toBe(200); expect(own.body.formatted_price).toBe('₹40 Lakh');
        expect((await get('/api/inventory/mobile-object-foreign-property', 'super_boss')).status).toBe(404);
        expect((await request(app).post('/api/inventory/share-pdf').auth(auth('super_boss'), { type: 'bearer' }).send({ inventory_ids: ['mobile-object-foreign-property'], variant: 'brandless' })).status).toBe(404);
        expect((await request(app).post('/api/inventory/mobile-object-foreign-property/upload').auth(auth('super_boss'), { type: 'bearer' })).status).toBe(404);
        expect((await request(app).post('/api/inventory/mobile-object-own-property/upload')).status).toBe(401);
    });
    it('retains calendar response compatibility and validates pagination', async () => {
        const all = await get('/api/calendar/appointments?mine=true');
        expect(all.status).toBe(200); expect(all.body.appointments.map((row: { id: string }) => row.id)).toEqual(['mobile-object-own-visit']); expect(all.body.count).toBe(1);
        const page = await get('/api/calendar/appointments?mine=true&page=1&limit=25');
        expect(page.body.total).toBe(1);
        expect((await get('/api/calendar/appointments?limit=999')).status).toBe(400);
        expect((await get('/api/calendar/appointments/mobile-object-foreign-visit', 'super_boss')).status).toBe(404);
        expect((await get('/api/calendar/appointments/mobile-object-bad-link-visit')).status).toBe(404);
    });
    it('returns only public assignee fields on appointment detail and update', async () => {
        const route = '/api/calendar/appointments/mobile-object-own-visit';
        const detail = await get(route).expect(200);
        const updated = await request(app).patch(route).auth(auth(), { type: 'bearer' }).send({ notes: 'Synthetic safe response' }).expect(200);
        for (const result of [detail, updated]) {
            expect(Object.keys(result.body.appointment.assigned_to_agent).sort()).toEqual(['email', 'id', 'name', 'phone']);
        }
    });
    it('applies inventory privacy to appointment responses while preserving own and shared access', async () => {
        const colleague = 'mobile-object-colleague', propertyId = 'mobile-object-private-property', visitId = 'mobile-object-private-visit';
        const route = `/api/calendar/appointments/${visitId}`;
        const privateFields = { owner_phone: ownPhone, owner_id: `mobile-object-owner-${ownPhone}`, key_holder_phone: '+919000000034', flat_no: 'Synthetic unit', plot_no: 'Synthetic plot' };
        await db.agent.create({ data: { id: colleague, tenant_id: a, name: 'Synthetic colleague', email: `${colleague}@example.invalid`, role: 'employee' } });
        try {
            await db.inventory.create({ data: { id: propertyId, tenant_id: a, assigned_agent_id: colleague, uploaded_by_agent_id: colleague,
                category: 'residential', type: 'flat', location: 'Synthetic locality', intent: 'sell', price: 40, customer_price: 37,
                price_unit: 'Lakh', media_urls: [], video_urls: [], shared_with_ids: [], status: 'active', ...privateFields } });
            await db.appointment.create({ data: { id: visitId, tenant_id: a, contact_id: ownPhone, assigned_to_agent_id: member,
                property_id: propertyId, title: 'Synthetic private-property visit', type: 'property_visit', scheduled_at: new Date() } });
            const responses = async (role = 'employee') => [
                await get(route, role).expect(200),
                await request(app).patch(route).auth(auth(role), { type: 'bearer' }).send({ notes: 'Synthetic privacy check' }).expect(200),
            ];
            const inventory = await get(`/api/inventory/${propertyId}`).expect(200);
            for (const result of await responses()) {
                expect(result.body.appointment).toMatchObject({ id: visitId, title: 'Synthetic private-property visit', status: 'scheduled', contact: { name: 'Synthetic contact' } });
                expect(result.body.appointment.property).toMatchObject({ id: propertyId, type: 'flat', location: 'Synthetic locality', price: '40', customer_price: '37' });
                for (const field of Object.keys(privateFields)) {
                    expect(inventory.body).not.toHaveProperty(field);
                    expect(result.body.appointment.property).not.toHaveProperty(field);
                }
            }
            expect(await db.inventory.findUniqueOrThrow({ where: { id: propertyId } })).toMatchObject(privateFields);
            for (const access of ['assigned', 'uploaded', 'shared', 'super_boss']) {
                await db.inventory.update({ where: { id: propertyId }, data: {
                    assigned_agent_id: access === 'assigned' ? member : colleague,
                    uploaded_by_agent_id: access === 'uploaded' ? member : colleague,
                    shared_with_ids: access === 'shared' ? [member] : [],
                } });
                for (const result of await responses(access === 'super_boss' ? 'super_boss' : 'employee')) {
                    expect(result.body.appointment.property).toMatchObject(privateFields);
                }
            }
        } finally {
            await db.appointment.deleteMany({ where: { id: visitId } });
            await db.inventory.deleteMany({ where: { id: propertyId } });
            await db.agent.delete({ where: { id: colleague } });
        }
    });
    it('validates document content and keeps authorized downloads tenant-bound with safe storage names', async () => {
        const route = '/api/inventory/mobile-object-own-property/documents';
        await request(app).post(route).auth(auth(), { type: 'bearer' }).field('doc_type', 'other')
            .attach('document', Buffer.from('<html>synthetic'), { filename: 'synthetic.pdf', contentType: 'application/pdf' }).expect(400);
        const result = await request(app).post(route).auth(auth(), { type: 'bearer' }).field('doc_type', '../synthetic')
            .attach('document', Buffer.from('%PDF-1.4\nsynthetic\n%%EOF'), { filename: 'synthetic.pdf', contentType: 'application/octet-stream' }).expect(201);
        expect(result.body.file_url).toMatch(/^\/uploads\/properties\/mobile-object-own-property\/documents\/[0-9a-f-]{36}\.pdf$/);
        createdFiles.push(path.resolve(process.cwd(), `.${result.body.file_url}`));
        await get(`${route}/${result.body.id}/download`).expect(200).expect('Content-Type', /application\/pdf/);
        const outsider = jwt.sign({ id: foreign, tenant_id: b, email: 'foreign@example.invalid', role: 'employee' }, process.env.JWT_SECRET!);
        await request(app).get(`${route}/${result.body.id}/download`).auth(outsider, { type: 'bearer' }).expect(404);
    });
    it('guards appointment mutations and assignments before logging or notifying', async () => {
        const route = '/api/calendar/appointments/';
        for (const id of ['mobile-object-foreign-visit', 'mobile-object-bad-link-visit', 'mobile-object-hidden-visit']) {
            await request(app).patch(route + id).auth(auth(), { type: 'bearer' }).send({ status: 'completed' }).expect(404);
            await request(app).delete(route + id).auth(auth(), { type: 'bearer' }).expect(404);
            expect((await db.appointment.findUniqueOrThrow({ where: { id } })).status).toBe('scheduled');
        }
        await request(app).patch(route + 'mobile-object-foreign-visit').auth(auth('super_boss'), { type: 'bearer' }).send({ status: 'completed' }).expect(404);
        await request(app).patch(route + 'mobile-object-own-visit').auth(auth(), { type: 'bearer' }).send({ assigned_to_agent_id: foreign }).expect(403);
        for (const fields of [{ status: 'invalid' }, { scheduled_at: 'not-a-date' }, { duration: -1 }, { notes: { unsafe: true } }]) {
            await request(app).patch(route + 'mobile-object-own-visit').auth(auth(), { type: 'bearer' }).send(fields).expect(400);
        }
        expect(await db.interaction.count({ where: { tenant_id: a, event_type: 'appointment_updated' } })).toBe(0);
        const updated = await request(app).patch(route + 'mobile-object-own-visit').auth(auth(), { type: 'bearer' }).send({ status: 'completed', notes: 'Synthetic visit outcome', duration: 45 }).expect(200);
        expect(updated.body.appointment.status).toBe('completed'); expect(updated.body.appointment.notes).toBe('Synthetic visit outcome');
        const upcoming = await get('/api/calendar/appointments?mine=true&upcoming=true&page=1&limit=25');
        expect(upcoming.body.appointments).toEqual([]); expect(upcoming.body.total).toBe(0);
        expect((await get('/api/calendar/appointments?mine=true')).body.appointments).toHaveLength(1);
        expect(new Date(updated.body.appointment.end_time).getTime() - new Date(updated.body.appointment.scheduled_at).getTime()).toBe(45 * 60000);
        await request(app).patch(route + 'mobile-object-own-visit').auth(auth(), { type: 'bearer' }).send({ notes: '' }).expect(200);
        expect((await db.appointment.findUniqueOrThrow({ where: { id: 'mobile-object-own-visit' } })).notes).toBe('');
        await request(app).delete(route + 'mobile-object-own-visit').auth(auth(), { type: 'bearer' }).expect(200);
        expect((await db.appointment.findUniqueOrThrow({ where: { id: 'mobile-object-own-visit' } })).status).toBe('cancelled');
    });
});
