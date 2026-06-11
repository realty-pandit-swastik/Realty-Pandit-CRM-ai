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
