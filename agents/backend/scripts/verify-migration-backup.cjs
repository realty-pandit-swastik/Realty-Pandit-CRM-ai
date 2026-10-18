const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function validateBackup(proof, revision, pending, checksums, now = Date.now()) {
  const age = now - Date.parse(proof.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > 3600000 || proof.revision !== revision ||
      proof.productionSchemaChanged !== false || proof.uploadsRestoreVerified !== true ||
      !(proof.databaseBytes > 0) || !(proof.uploadsBytes > 0)) throw new Error('A fresh restore-tested database/uploads backup is required');
  for (const migration of pending) {
    if (!proof.migrationsRehearsed?.includes(migration) || proof.checksums?.[migration] !== checksums[migration]) {
      throw new Error('Pending migration was not rehearsed with this SQL: ' + migration);
    }
  }
}

async function main() {
  require('dotenv').config({ quiet: true });
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    const applied = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
    if (applied.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Unresolved failed migration');
    const folder = path.join(process.cwd(), 'prisma/migrations');
    const names = fs.readdirSync(folder).filter(name => fs.existsSync(path.join(folder, name, 'migration.sql')));
    const pending = names.filter(name => !applied.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at));
    if (!pending.length) { console.log('No pending migrations'); return; }
    if (process.env.RUN_MIGRATIONS !== '1') throw new Error('Pending migrations require an explicitly authorized workflow dispatch with run_migrations=true');
    const root = fs.realpathSync(process.env.HOSTINGER_DEPLOY_PATH);
    const releaseId = process.env.MIGRATION_RELEASE_ID;
    if (!/^[a-f0-9]{40}$/.test(releaseId || '')) throw new Error('Invalid release identity');
    const proof = JSON.parse(fs.readFileSync(path.join(root, 'backups', 'verified-' + releaseId + '.json'), 'utf8'));
    const currentRevision = fs.readFileSync(path.join(root, 'current/REVISION'), 'utf8').trim();
    const checksums = Object.fromEntries(pending.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(folder, name, 'migration.sql'))).digest('hex')]));
    validateBackup(proof, currentRevision, pending, checksums);
    const backup = fs.realpathSync(proof.folder);
    if (!backup.startsWith(path.join(root, 'backups') + path.sep) ||
        fs.statSync(path.join(backup, 'database.dump')).size !== proof.databaseBytes ||
        fs.statSync(path.join(backup, 'uploads.tgz')).size !== proof.uploadsBytes) throw new Error('Verified backup files are unavailable');
    console.log('Restore-tested backup verified for pending migrations: ' + pending.join(', '));
  } finally { await db.$disconnect(); }
}

module.exports = { validateBackup };
if (require.main === module) main().catch(error => { console.error('Migration gate failed:', error.message); process.exitCode = 1; });
