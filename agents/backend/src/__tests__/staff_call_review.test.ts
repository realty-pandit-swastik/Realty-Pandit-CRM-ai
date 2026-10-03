import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const db = vi.hoisted(() => ({
    staffCall: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    contact: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    voiceCall: { create: vi.fn() }, interaction: { create: vi.fn(), findMany: vi.fn() },
    leadScore: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    transaction: { updateMany: vi.fn(), findMany: vi.fn() }, shortageEntry: { findMany: vi.fn() }, task: { updateMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../middleware/auth', () => ({ authMiddleware: (req: any, _res: any, next: any) => { req.agent = { id: 'a1', tenant_id: 't1', role: 'employee' }; next(); }, checkPermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['a1']) }));
vi.mock('../middleware/contact_visibility', () => ({ buildContactVisibilityFilter: vi.fn().mockReturnValue({ assigned_agent_id: 'a1' }) }));
vi.mock('../services/audio_storage', () => ({ default: { deleteAudioFile: vi.fn() } }));
vi.mock('../services/staff_call_upload', () => ({ completeStaffCallUpload: vi.fn() }));
vi.mock('../services/call_followup', () => ({ runCallFollowup: vi.fn().mockResolvedValue({ shared: 0 }) }));
vi.mock('../services/call_demand', () => ({ approvedCallFields: vi.fn().mockResolvedValue({ contact_type: 'BUYER', intent: 'buy', budget_min: 4000000, budget_max: 6000000, demand_taxonomy_node_id: 'flat', demand_schema_values: { bhk: '2' } }), callMatchCriteria: vi.fn() }));
vi.mock('../services/matching_engine', () => ({ MatchingEngine: class {} }));
vi.mock('../services/transcription', () => ({ default: {} }));
vi.mock('../services/call_extractor', () => ({ default: {} }));
import router from '../routes/staff_calls';
import audioStorage from '../services/audio_storage';
import { runCallFollowup } from '../services/call_followup';
const app = express(); app.use(express.json()); app.use('/calls', router);
const CALL = { id: 'c1', tenant_id: 't1', staff_agent_id: 'a1', staff_agent: { tenant_id: 't1' }, status: 'READY_FOR_REVIEW', phone_number: '+919800000001', ai_extraction: { intent: 'BUY', bhk: '2', propertyType: 'flat', budgetMin: 40, budgetMax: 60 }, created_at: new Date(), duration: 60 };

beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async fn => fn(db));
    db.contact.findUnique.mockResolvedValue({ tenant_id: 't1' });
    db.contact.upsert.mockResolvedValue({ phone_number: CALL.phone_number });
    db.leadScore.findUnique.mockResolvedValue(null);
    db.staffCall.findUnique.mockResolvedValue({ ...CALL });
    db.staffCall.updateMany.mockResolvedValue({ count: 1 });
    db.contact.findFirst.mockResolvedValue(null);
    db.transaction.findMany.mockResolvedValue([]);
    db.interaction.findMany.mockResolvedValue([]);
    db.shortageEntry.findMany.mockResolvedValue([]);
});

describe('staff call review atomicity', () => {
    it('two simultaneous approvals produce one history, score and followup outcome', async () => {
        let claimed = false;
        db.staffCall.updateMany.mockImplementation(async args => {
            if (args.where.status === 'READY_FOR_REVIEW') {
                if (claimed) return { count: 0 };
                claimed = true; return { count: 1 };
            }
            return { count: 1 };
        });
        db.staffCall.findUnique.mockResolvedValueOnce({ ...CALL }).mockResolvedValueOnce({ ...CALL }).mockResolvedValue({ ...CALL, status: 'APPROVED', followup_status: 'PENDING' });
        const replies = await Promise.all([request(app).post('/calls/c1/submit').send({}), request(app).post('/calls/c1/submit').send({})]);
        expect(replies.map(r => r.status)).toEqual([200, 200]);
        expect(db.voiceCall.create).toHaveBeenCalledTimes(1);
        expect(db.interaction.create).toHaveBeenCalledTimes(1);
        expect(db.leadScore.create).toHaveBeenCalledTimes(1);
        expect(runCallFollowup).toHaveBeenCalledTimes(1);
        expect(db.staffCall.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ followup_status: 'PENDING', auto_share: false }) }));
        expect(db.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ source: 'staff_call', tenant_id: 't1' }), data: expect.objectContaining({ demand_taxonomy_node_id: 'flat', demand_schema_values: { bhk: '2' }, demand_budget_max: 6000000 }) }));
    });
    it('approval remains successful when immediate followup fails; outbox remains committed', async () => {
        vi.mocked(runCallFollowup).mockRejectedValueOnce(new Error('worker unavailable'));
        const reply = await request(app).post('/calls/c1/submit').send({});
        expect(reply.status).toBe(200);
        expect(reply.body.followup).toBeNull();
        expect(db.voiceCall.create).toHaveBeenCalledTimes(1);
    });
    it('rejection winning the claim prevents subsequent approval writes', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, status: 'REJECTED' });
        const reply = await request(app).post('/calls/c1/submit').send({});
        expect(reply.status).toBe(400);
        expect(db.contact.upsert).not.toHaveBeenCalled();
    });
    it('seller approval never overwrites a buyer enquiry', async () => {
        const reply = await request(app).post('/calls/c1/submit').send({ edited_data: { intent: 'SELL' } });
        expect(reply.status).toBe(200);
        expect(db.transaction.updateMany).not.toHaveBeenCalled();
    });
    it('caller dossier denies invisible contacts before reading activity', async () => {
        const reply = await request(app).get('/calls/caller-id?phone=9800000001');
        expect(reply.status).toBe(200);
        expect(reply.body.found).toBe(false);
        expect(db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1', AND: [{ assigned_agent_id: 'a1' }] }) }));
        expect(db.transaction.findMany).not.toHaveBeenCalled();
        expect(db.interaction.findMany).not.toHaveBeenCalled();
    });
    it('visible caller dossier scopes enquiries and activity to tenant and staff team', async () => {
        db.contact.findFirst.mockResolvedValue({ id: 'p1', phone_number: CALL.phone_number, name: 'Synthetic', contact_type: 'BUYER' });
        const reply = await request(app).get('/calls/caller-id?phone=9800000001');
        expect(reply.status).toBe(200);
        expect(reply.body.found).toBe(true);
        expect(db.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1', OR: [{ coordinator_agent_id: { in: ['a1'] } }, { executive_agent_id: { in: ['a1'] } }] }) }));
        expect(db.interaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 't1' }) }));
    });
    it('rejecting a draft leaves contact requirements untouched and wins before deletion', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, recording_url: 'uploads/staff_calls/c1/recording.mp3' });
        expect((await request(app).post('/calls/c1/reject')).status).toBe(200);
        expect(db.contact.upsert).not.toHaveBeenCalled();
        expect(db.transaction.updateMany).not.toHaveBeenCalled();
        expect(audioStorage.deleteAudioFile).toHaveBeenCalledTimes(1);
    });
    it('losing rejection to approval never deletes approved audio', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, recording_url: 'uploads/staff_calls/c1/recording.mp3' });
        db.staffCall.updateMany.mockResolvedValue({ count: 0 });
        expect((await request(app).post('/calls/c1/reject')).status).toBe(409);
        expect(audioStorage.deleteAudioFile).not.toHaveBeenCalled();
    });
    it('denies another tenant approval even when agent id matches', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, tenant_id: 'foreign' });
        expect((await request(app).post('/calls/c1/submit').send({})).status).toBe(403);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
    it('repeated approved submission does not write history or re-dispatch followup', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, status: 'APPROVED' });
        expect((await request(app).post('/calls/c1/submit').send({})).status).toBe(200);
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(runCallFollowup).not.toHaveBeenCalled();
    });
});
