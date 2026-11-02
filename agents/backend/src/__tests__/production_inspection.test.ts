import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
const { validateInspection, files } = require('../../../../deploy/production-inspection.cjs');

describe('administrator operational inspection proof', () => {
    const now = Date.parse('2026-10-18T16:00:00Z');
    const hashes = Object.fromEntries(files.map((file: string) => [file, 'current-digest']));
    const report = 'PM2 owners online; nginx current; database connected';
    const proof = { inspectedAt: new Date(now - 1000).toISOString(), revision: 'active', hashes, scriptHash: 'reviewed-script',
        report, reportHash: createHash('sha256').update(report).digest('hex') };
    const verify = (value = proof) => validateInspection(value, 'active', hashes, 'reviewed-script', now);
    it('accepts the fresh unchanged inspection', () => expect(() => verify()).not.toThrow());
    it.each([{ inspectedAt: 'invalid' }, { inspectedAt: new Date(now - 3600001).toISOString() },
        { revision: 'other' }, { scriptHash: 'other' }, { report: 'changed' }, { hashes: {} },
    ])('rejects stale, changed or incomplete inspection %j', change => expect(() => verify({ ...proof, ...change })).toThrow());
});
