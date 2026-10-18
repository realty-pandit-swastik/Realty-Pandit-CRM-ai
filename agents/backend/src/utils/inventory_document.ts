import path from 'path';
import { ValidationError } from '../middleware/error_handler';

const TYPES: Record<string, string> = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function inventoryDocumentType(file: { originalname: string; mimetype: string; buffer: Buffer }) {
    const extension = path.extname(file.originalname).toLowerCase(), mimeType = TYPES[extension];
    const declared = file.mimetype.toLowerCase();
    if (!mimeType || (declared && declared !== 'application/octet-stream' && declared !== mimeType)) {
        throw new ValidationError('Document name and file type do not match.');
    }
    const bytes = file.buffer, hex = bytes.subarray(0, 8).toString('hex');
    const matches = extension === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' :
        ['.jpg', '.jpeg'].includes(extension) ? hex.startsWith('ffd8ff') :
        extension === '.png' ? hex === '89504e470d0a1a0a' :
        extension === '.webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' :
        ['.docx', '.xlsx'].includes(extension) ? hex.startsWith('504b0304') : hex === 'd0cf11e0a1b11ae1';
    if (!matches) throw new ValidationError('Document contents do not match its file type.');
    return { extension, mimeType };
}
