import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ staffCall: { update: vi.fn() } }));
const storage = vi.hoisted(() => ({ handleMultipartUpload: vi.fn(), deleteAudioFile: vi.fn() }));
vi.mock('../db', () => ({ default: db }));
vi.mock('../services/audio_storage', () => ({ default: storage }));

import { completeStaffCallUpload } from '../services/staff_call_upload';

const file = { path: '/tmp/recording.mp3' } as Express.Multer.File;

beforeEach(() => {
    vi.clearAllMocks();
    storage.handleMultipartUpload.mockResolvedValue({
        url: 'uploads/staff_calls/call-1/recording.mp3', publicId: 'call-1/recording.mp3',
    });
});

it('finishes only after the recording URL is saved', async () => {
    db.staffCall.update.mockResolvedValue({});
    await completeStaffCallUpload('call-1', file);
    expect(db.staffCall.update).toHaveBeenCalledWith({ where: { id: 'call-1' }, data: {
        recording_url: 'uploads/staff_calls/call-1/recording.mp3', duration: null, status: 'PROCESSING',
    } });
    expect(storage.deleteAudioFile).not.toHaveBeenCalled();
});

it('removes copied audio and rejects the call when the database update fails', async () => {
    db.staffCall.update.mockRejectedValueOnce(new Error('database offline')).mockResolvedValueOnce({});
    storage.deleteAudioFile.mockResolvedValue(undefined);
    await expect(completeStaffCallUpload('call-1', file)).rejects.toThrow('database offline');
    expect(storage.deleteAudioFile).toHaveBeenCalledWith('call-1/recording.mp3');
    expect(db.staffCall.update).toHaveBeenLastCalledWith({ where: { id: 'call-1' }, data: { status: 'REJECTED', recording_url: null } });
});

it('keeps a failed-to-delete recording referenced for retention', async () => {
    db.staffCall.update.mockRejectedValueOnce(new Error('database offline')).mockResolvedValueOnce({});
    storage.deleteAudioFile.mockRejectedValue(new Error('disk busy'));
    await expect(completeStaffCallUpload('call-1', file)).rejects.toThrow('database offline');
    expect(db.staffCall.update).toHaveBeenLastCalledWith({ where: { id: 'call-1' }, data: {
        status: 'REJECTED', recording_url: 'uploads/staff_calls/call-1/recording.mp3',
    } });
});
