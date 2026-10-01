import prisma from '../db';
import audioStorage from './audio_storage';
import logger from '../utils/logger';

/** Complete an upload only after both the file and its database reference exist. */
export async function completeStaffCallUpload(callId: string, file: Express.Multer.File): Promise<void> {
    let uploaded: Awaited<ReturnType<typeof audioStorage.handleMultipartUpload>> | undefined;
    try {
        uploaded = await audioStorage.handleMultipartUpload(file, callId);
        await prisma.staffCall.update({
            where: { id: callId },
            data: { recording_url: uploaded.url, duration: uploaded.duration || null, status: 'PROCESSING' },
        });
    } catch (error) {
        let orphanUrl: string | null = uploaded?.url || null;
        if (uploaded) {
            try {
                await audioStorage.deleteAudioFile(uploaded.publicId);
                orphanUrl = null;
            } catch (cleanupError) {
                logger.error('[StaffCall] Failed to remove orphan recording:', cleanupError);
            }
        }
        await prisma.staffCall.update({
            where: { id: callId }, data: { status: 'REJECTED', recording_url: orphanUrl },
        }).catch(updateError => logger.error('[StaffCall] Failed to mark upload rejected:', updateError));
        throw error;
    }
}
