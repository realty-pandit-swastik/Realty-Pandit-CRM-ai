// Backup production data; restore and rehearse only in a disposable database.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = process.env.HOSTINGER_DEPLOY_PATH;
if (!root || !path.isAbsolute(root) || root === '/') throw new Error('Invalid application root');
const current = fs.realpathSync(path.join(root, 'current'));
if (!current.startsWith(root + '/releases/')) throw new Error('Current release is outside releases');
const appRequire = createRequire(path.join(current, 'backend/package.json'));
appRequire('dotenv').config({ path: path.join(current, 'backend/.env'), quiet: true });
const { PrismaClient } = appRequire('@prisma/client');
const db = new PrismaClient({ log: [] });
const url = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
const suffix = new Date().toISOString().replace(/[^0-9]/g, '') + process.pid;
const cloneName = 'rp_release_restore_' + suffix;
const folder = path.join(root, 'backups', 'release-' + suffix);
const migrations = process.argv.slice(2);
const expected = ['20261008120000_lead_cycle_recycling', '20261008130000_client_role', '20261016010000_mobile_sessions'];
if (migrations.length !== expected.length || migrations.some((p, i) => path.basename(path.dirname(p)) !== expected[i] || path.basename(p) !== 'migration.sql')) throw new Error('Only the three reviewed migrations may be rehearsed');
const checksums = Object.fromEntries(migrations.map((file, i) => [expected[i], createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
function run(command, args, commandEnv = env, capture = false) {
  const result = spawnSync(command, args, { env: commandEnv, encoding: 'utf8', stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'], maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' + (result.error?.code || result.status));
  return result.stdout;
}
async function counts(client) {
  return client.$queryRawUnsafe('SELECT (SELECT count(*)::text FROM contacts) AS contacts, (SELECT count(*)::text FROM inventory) AS inventory, (SELECT count(*)::text FROM transactions) AS transactions');
}
let cloneCreated = false;
let clone;
(async () => {
  const size = await db.$queryRawUnsafe('SELECT pg_database_size(current_database())::text AS bytes');
  const uploads = Number(run('du', ['-sb', path.join(root, 'shared/uploads')], env, true).split(/\s/)[0]);
  const disk = fs.statfsSync(root);
  if (disk.bavail * disk.bsize < 3 * Number(size[0].bytes) + 2 * uploads + 1024 ** 3) throw new Error('Insufficient backup and restore disk capacity');
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(folder, { mode: 0o700 });
  const originalCounts = await counts(db);
  const dump = path.join(folder, 'database.dump');
  run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dump]);
  fs.chmodSync(dump, 0o600);
  await db.$executeRawUnsafe('CREATE DATABASE "' + cloneName + '" TEMPLATE template0');
  cloneCreated = true;
  run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', cloneName, dump]);
  const cloneUrl = new URL(url); cloneUrl.pathname = '/' + cloneName;
  clone = new PrismaClient({ datasources: { db: { url: cloneUrl.toString() } }, log: [] });
  const restoredCounts = await counts(clone);
  // Counts can grow while the dump is taken; a decrease indicates an incomplete restore.
  for (const key of Object.keys(originalCounts[0])) if (BigInt(restoredCounts[0][key]) < BigInt(originalCounts[0][key])) throw new Error('Restore count decreased: ' + key);
  const applied = await clone.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  const pending = migrations.filter((file, i) => !applied.some(row => row.migration_name === expected[i]));
  for (const file of pending) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', file], { ...env, PGDATABASE: cloneName, PGOPTIONS: '-c statement_timeout=300000 -c lock_timeout=5000' });
  const validation = await clone.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='mobile_sessions'");
  if (validation.length !== 9 || !validation.some(row => row.column_name === 'refresh_hash')) throw new Error('Mobile-session schema validation failed');
  const restoredAfterMigration = await counts(clone);
  if (JSON.stringify(restoredAfterMigration) !== JSON.stringify(restoredCounts)) throw new Error('Migration changed existing business record counts');
  const archive = path.join(folder, 'uploads.tgz');
  run('tar', ['-C', path.join(root, 'shared'), '-czf', archive, 'uploads']);
  fs.chmodSync(archive, 0o600);
  run('tar', ['-tzf', archive]);
  const restoredUploads = path.join(folder, 'verify-uploads');
  fs.mkdirSync(restoredUploads, { mode: 0o700 });
  run('tar', ['-xzf', archive, '-C', restoredUploads]);
  run('tar', ['--compare', '-zf', archive, '-C', restoredUploads]);
  fs.rmSync(restoredUploads, { recursive: true });
  const proof = { createdAt: new Date().toISOString(), revision: fs.readFileSync(path.join(current, 'REVISION'), 'utf8').trim(), originalCounts, restoredCounts, migrationsRehearsed: pending.map(file => path.basename(path.dirname(file))), checksums, uploadsRestoreVerified: true, databaseBytes: fs.statSync(dump).size, uploadsBytes: fs.statSync(archive).size, productionSchemaChanged: false };
  fs.writeFileSync(path.join(folder, 'restore-proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
  if (process.env.GITHUB_SHA) fs.writeFileSync(path.join(root, 'backups', 'verified-' + process.env.GITHUB_SHA + '.json'), JSON.stringify({ folder, ...proof }), { mode: 0o600 });
  console.log(JSON.stringify({ backup: folder, proof }));
})().catch(e => { console.error('Backup/restore rehearsal failed:', e.message); process.exitCode = 1; }).finally(async () => {
  if (clone) await clone.$disconnect();
  if (cloneCreated) await db.$executeRawUnsafe('DROP DATABASE "' + cloneName + '"').catch(() => { console.error('Disposable database cleanup failed:', cloneName); process.exitCode = 1; });
  await db.$disconnect();
});
