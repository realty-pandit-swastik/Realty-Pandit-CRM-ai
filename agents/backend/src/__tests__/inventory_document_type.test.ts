import { expect, it } from 'vitest';
import { inventoryDocumentType } from '../utils/inventory_document';

it('checks document extension, MIME and signatures, retaining native octet-stream fallback', () => {
    const pdf = Buffer.from('%PDF-1.4\nsynthetic');
    expect(inventoryDocumentType({ originalname: 'synthetic.pdf', mimetype: 'application/octet-stream', buffer: pdf })).toEqual({ extension: '.pdf', mimeType: 'application/pdf' });
    expect(() => inventoryDocumentType({ originalname: 'synthetic.html', mimetype: 'application/pdf', buffer: pdf })).toThrow();
    expect(() => inventoryDocumentType({ originalname: 'synthetic.pdf', mimetype: 'application/pdf', buffer: Buffer.from('<html>') })).toThrow();
    expect(() => inventoryDocumentType({ originalname: 'synthetic.png', mimetype: 'application/pdf', buffer: pdf })).toThrow();
    expect(inventoryDocumentType({ originalname: 'synthetic.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('504b030400000000', 'hex') }).extension).toBe('.docx');
});
