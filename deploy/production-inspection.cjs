// A root-owned, short-lived report lets the restricted deploy user verify admin inspection.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const certificate = '/var/lib/realty-pandit/operational-preflight.json';
const files = ['backend/package-lock.json', 'frontend/package-lock.json', 'website/package-lock.json',
  'backend/server-bootstrap.js', 'backend/src/app.ts', 'backend/src/server.ts',
  'backend/src/middleware/auth.ts', 'backend/src/routes/inventory.ts'];
const digest = value => createHash('sha256').update(value).digest('hex');

function validateInspection(proof, revision, hashes, scriptHash, now = Date.now()) {
  const age = now - Date.parse(proof.inspectedAt);
  if (!Number.isFinite(age) || age < 0 || age > 3600000 || proof.revision !== revision ||
      proof.scriptHash !== scriptHash || typeof proof.report !== 'string' || digest(proof.report) !== proof.reportHash) {
    throw new Error('Fresh administrator inspection of the active release is required');
  }
  for (const name of files) if (proof.hashes?.[name] !== hashes[name]) throw new Error('Inspected production file changed: ' + name);
}

function main() {
  const root = fs.realpathSync(process.env.HOSTINGER_DEPLOY_PATH);
  const current = fs.realpathSync(path.join(root, 'current'));
  if (!current.startsWith(path.join(root, 'releases') + path.sep)) throw new Error('Current release is outside releases');
  const revision = fs.readFileSync(path.join(current, 'REVISION'), 'utf8').trim();
  const hashes = Object.fromEntries(files.map(name => [name, digest(fs.readFileSync(path.join(current, name)))]));
  const script = path.join(__dirname, 'production-preflight.sh');
  const scriptHash = digest(fs.readFileSync(script));
  if (process.argv[2] === 'record') {
    if (process.getuid() !== 0) throw new Error('Only the administrator can record inspection');
    const result = spawnSync('bash', [script], { env: process.env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new Error('Privileged preflight did not pass; no certificate recorded');
    const folder = path.dirname(certificate);
    fs.mkdirSync(folder, { recursive: true, mode: 0o755 });
    const owner = fs.lstatSync(folder);
    if (!owner.isDirectory() || owner.uid !== 0 || (owner.mode & 0o022)) throw new Error('Inspection directory must be root-owned and protected');
    const temporary = certificate + '.' + process.pid;
    fs.writeFileSync(temporary, JSON.stringify({ inspectedAt: new Date().toISOString(), revision, hashes, scriptHash,
      report: result.stdout, reportHash: digest(result.stdout) }), { mode: 0o644, flag: 'wx' });
    fs.renameSync(temporary, certificate);
    console.log(result.stdout);
    console.log('Fresh root-owned operational inspection recorded');
  } else if (process.argv[2] === 'verify') {
    const owner = fs.lstatSync(certificate);
    if (!owner.isFile() || owner.uid !== 0 || (owner.mode & 0o022)) throw new Error('Inspection certificate is not protected');
    const proof = JSON.parse(fs.readFileSync(certificate, 'utf8'));
    validateInspection(proof, revision, hashes, scriptHash);
    console.log('Verified administrator inspection of the active release:');
    console.log(proof.report);
  } else throw new Error('Use record or verify');
}
module.exports = { validateInspection, files };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
