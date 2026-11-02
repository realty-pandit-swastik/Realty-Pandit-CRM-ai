import { describe, expect, it } from 'vitest';
const { validateBackup } = require('../../scripts/verify-migration-backup.cjs');

describe('migration backup release gate', () => {
    const now = Date.parse('2026-10-18T16:00:00Z');
    const proof = { createdAt: new Date(now - 1000).toISOString(), revision: 'previous',
        productionSchemaChanged: false, uploadsRestoreVerified: true, databaseBytes: 100, uploadsBytes: 100,
        migrationsRehearsed: ['mobile'], checksums: { mobile: 'reviewed-sql' } };
    const verify = (value = proof) => validateBackup(value, 'previous', ['mobile'], { mobile: 'reviewed-sql' }, now);
    it('accepts the fresh restored backup of the currently active release and exact reviewed SQL', () => expect(() => verify()).not.toThrow());
    it.each([
        { createdAt: new Date(now - 3600001).toISOString() }, { createdAt: 'invalid' },
        { revision: 'other' }, { uploadsRestoreVerified: false }, { productionSchemaChanged: true },
        { databaseBytes: 0 }, { migrationsRehearsed: [] }, { checksums: { mobile: 'changed-sql' } },
    ])('rejects incomplete or mismatched proof %j', change => expect(() => verify({ ...proof, ...change })).toThrow());
});
