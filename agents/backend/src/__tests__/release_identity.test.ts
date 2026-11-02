import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseFingerprint, readReleaseRevision } from '../utils/release_identity';
describe('release identity', () => {
    it('accepts only a complete immutable Git revision marker', () => {
        const root=mkdtempSync(join(tmpdir(),'rp-release-id-'));
        try {
            expect(readReleaseRevision(root)).toBeNull();
            writeFileSync(join(root,'REVISION'),'../unsafe');expect(readReleaseRevision(root)).toBeNull();
            writeFileSync(join(root,'REVISION'),'a'.repeat(40)+'\n');expect(readReleaseRevision(root)).toBe('a'.repeat(40));
        } finally {rmSync(root,{recursive:true,force:true});}
    });
    it('binds the running database without returning its connection metadata', () => {
        const source={name:'reality_pandit',oid:'123',started:'2026-01-01 00:00:00.123456'};
        const hash=databaseFingerprint(source);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(databaseFingerprint({...source})).toBe(hash);
        for(const changed of [{name:'wrong'},{oid:'999'},{started:'2026-01-02 00:00:00'}])expect(databaseFingerprint({...source,...changed})).not.toBe(hash);
    });
});
