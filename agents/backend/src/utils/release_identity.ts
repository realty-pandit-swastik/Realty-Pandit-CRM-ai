import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read once on process startup; an old worker must not report a newly switched symlink's SHA. */
export function readReleaseRevision(root: string): string | null {
    try {
        const physical = realpathSync(root);
        const revision = readFileSync(resolve(physical, 'REVISION'), 'utf8').trim();
        return /^[a-f0-9]{40}$/.test(revision) ? revision : null;
    } catch { return null; }
}
export const RELEASE_REVISION = readReleaseRevision(resolve(__dirname, '../../..'));
export function databaseFingerprint(row: { name: string; oid: string; started: string }): string {
    return createHash('sha256').update(JSON.stringify({ name: row.name, oid: row.oid, started: row.started })).digest('hex');
}
export const DATABASE_IDENTITY_SQL = `SELECT current_database()::text AS name,
    (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    (pg_postmaster_start_time() AT TIME ZONE 'UTC')::text AS started`;
