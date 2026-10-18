/** Disposable, loopback-only native acceptance server. Never imports server.ts or starts workers. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express from 'express';

async function main() {
    const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
    if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/mobile_test' || process.env.NODE_ENV !== 'test') {
        throw new Error('Preview requires disposable 127.0.0.1:55432/mobile_test and NODE_ENV=test.');
    }
    // The launcher must provide a minimal environment, with no external provider credentials.
    const allowedSecrets = new Set(['JWT_SECRET', 'AGENT_JWT_SECRET']);
    if (Object.keys(process.env).some(key => /TOKEN|SECRET|API_KEY|SMTP|CLOUDINARY|SENTRY|DSN/.test(key) && !allowedSecrets.has(key))) {
        throw new Error('Preview refuses an environment containing external credentials or telemetry configuration.');
    }
    const db = new PrismaClient();
    const tenant = 'mobile-preview-tenant', agent = 'mobile-preview-member', phone = '+919000000081';
    await db.tenant.upsert({ where: { id: tenant }, update: {}, create: { id: tenant, business_name: 'Synthetic mobile acceptance', owner_name: 'Synthetic', primary_phone: phone } });
    await db.agent.upsert({ where: { id: agent }, update: {}, create: { id: agent, tenant_id: tenant, name: 'Synthetic Member', email: 'mobile-preview@example.invalid', phone, role: 'employee', status: 'active', password_hash: await bcrypt.hash('Synthetic-test-password-1', 4) } });
    await db.contact.upsert({ where: { phone_number: phone }, update: {}, create: { phone_number: phone, tenant_id: tenant, assigned_agent_id: agent, name: 'Synthetic Lead', contact_type: 'BUYER', source: '99acres', lifecycle_stage: 'NEW', preferred_location: 'Synthetic locality', notes: 'Synthetic device acceptance record. No customer data.' } });
    await db.owner.upsert({ where: { contact_phone: phone }, update: {}, create: { id: 'mobile-preview-owner', scope: 'INTERNAL', contact_phone: phone } });
    await db.inventory.upsert({ where: { id: 'e3a83915-57ad-427d-b82c-3a56c75221b4' }, update: {}, create: {
        id: 'e3a83915-57ad-427d-b82c-3a56c75221b4', display_id: 'RP-SYNTHETIC-001', tenant_id: tenant, owner_id: 'mobile-preview-owner', owner_phone: phone,
        category: 'residential', type: 'flat', intent: 'sell', status: 'active', location: 'Synthetic locality', display_price: 4200000, customer_price: 4000000, completion_pct: 65, floor_number: 0, roof_rights: false, renovated: false, pre_rented: false, commercial_use: false, description: 'Synthetic property used only for local Android evidence.', specs: { bhk: 2, bathrooms: 0, area: 1000, area_unit: 'sqft', amenities: ['Lift'], parking: [{ type: 'covered', count: 0 }] }, city: 'Test City', locality: 'Test locality', price: 40, price_unit: 'Lakh', media_urls: [], video_urls: [], shared_with_ids: [], assigned_agent_id: agent, uploaded_by_agent_id: agent,
    } });
    for (let index = 0; index < 4; index++) await db.task.upsert({ where: { id: `mobile-preview-task-${index}` }, update: {}, create: {
        id: `mobile-preview-task-${index}`, title: ['Follow up on requirements', 'Confirm tomorrow’s visit', 'Review property documents', 'Update client preferences'][index],
        assigned_to: agent, due_date: new Date(Date.now() + index * 3600_000), tags: [], priority: index === 0 ? 'HIGH' : 'MEDIUM', description: 'Synthetic task for native device acceptance.',
    } });
    await db.appointment.upsert({ where: { id: 'mobile-preview-visit' }, update: {}, create: { id: 'mobile-preview-visit', tenant_id: tenant, contact_id: phone, assigned_to_agent_id: agent,
        title: 'Synthetic property visit', type: 'property_visit', status: 'scheduled', scheduled_at: new Date(Date.now() + 86400_000), location: 'Synthetic locality' } });
    const fs = await import('fs/promises'), path = await import('path'), sharp = (await import('sharp')).default;
    const mediaDirectory = path.join(process.cwd(), 'uploads/properties/e3a83915-57ad-427d-b82c-3a56c75221b4');
    await fs.mkdir(mediaDirectory, { recursive: true });
    await sharp({ create: { width: 640, height: 360, channels: 3, background: '#10243A' } }).composite([{ input: Buffer.from('<svg width="640" height="360"><text x="40" y="180" font-size="28" fill="white">Synthetic property test photo</text></svg>') }]).jpeg().toFile(path.join(mediaDirectory, 'preview-photo.jpg'));
    const categoryId = '93899c39-704f-4541-9d4a-e19815b8df60', typeId = '93899c39-704f-4541-9d4a-e19815b8df61';
    await db.taxonomyNode.upsert({ where: { id: categoryId }, update: {}, create: { id: categoryId, name: 'Synthetic Residential', slug: 'synthetic-residential', node_kind: 'CATEGORY' } });
    await db.taxonomyNode.upsert({ where: { id: typeId }, update: {}, create: { id: typeId, parent_id: categoryId, name: 'Synthetic Flat', slug: 'synthetic-flat', node_kind: 'TYPE' } });
    for (const [key, label, input_type] of [['bhk', 'Bedrooms', 'number'], ['bathrooms', 'Bathrooms', 'number'], ['area', 'Area', 'number'], ['area_unit', 'Area unit', 'text']]) {
        const field = await db.fieldDefinition.upsert({ where: { key }, update: {}, create: { key, label, input_type } });
        await db.nodeField.upsert({ where: { taxonomy_node_id_field_id: { taxonomy_node_id: typeId, field_id: field.id } }, update: {}, create: { taxonomy_node_id: typeId, field_id: field.id } });
    }
    await db.inventory.update({ where: { id: 'e3a83915-57ad-427d-b82c-3a56c75221b4' }, data: {
        media_urls: ['/uploads/properties/e3a83915-57ad-427d-b82c-3a56c75221b4/preview-photo.jpg'],
        video_urls: await fs.stat(path.join(mediaDirectory, 'preview-video.mp4')).then(() => ['/uploads/properties/e3a83915-57ad-427d-b82c-3a56c75221b4/preview-video.mp4']).catch(() => []),
        taxonomy_node_id: typeId, display_price: 4200000, customer_price: 4000000, completion_pct: 65, floor_number: 0,
        roof_rights: false, renovated: false, pre_rented: false, commercial_use: false,
        description: 'Synthetic property for local Android evidence.',
        specs: { bhk: 2, bathrooms: 0, area: 1000, area_unit: 'sqft', amenities: ['Lift'], parking: [{ type: 'covered', count: 0 }] },
        city: 'Test City', locality: 'Test locality', full_address: 'Test locality, Test City',
    } });
    await db.$disconnect();
    const [mobileAuth, leads, inventory, tasks, deals, calendar, auth, csrf, errors, uploads] = await Promise.all([
        import('../routes/mobile_auth'), import('../routes/leads'), import('../routes/inventory'), import('../routes/tasks'), import('../routes/deals'), import('../routes/calendar'),
        import('../middleware/auth'), import('../middleware/csrf'), import('../middleware/error_handler'), import('../middleware/private_uploads'),
    ]);
    const app = express(); app.use(csrf.csrfMiddleware, express.json());
    app.use('/uploads', uploads.blockPrivateUploads, express.static('uploads'));
    app.use('/auth/mobile', mobileAuth.default);
    app.use('/api/personal-whatsapp/handoffs', (await import('../routes/personal_whatsapp_handoffs')).default);
    app.use('/api', auth.authMiddleware);
    app.use('/api/leads', leads.default); app.use('/api/inventory', inventory.default); app.use('/api', tasks.default);
    const [workflow, taxonomy, team] = await Promise.all([import('../routes/workflow'), import('../routes/taxonomy'), import('../routes/team')]);
    app.use('/api/workflow', workflow.default); app.use('/public/taxonomy', taxonomy.default); app.use('/api/team', team.default);
    app.use('/api/deals', deals.default); app.use('/api/calendar', calendar.default);
    app.use(errors.errorHandler);
    app.listen(3303, '127.0.0.1', () => process.stdout.write('Synthetic native acceptance API listening on loopback port 3303. No workers started.\n'));
}
void main().catch(() => { process.stderr.write('Disposable preview could not start. Check local test configuration.\n'); process.exitCode = 1; });
