import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
await mkdir('release', { recursive: true });
const filename = `realty-pandit-my-whatsapp-${manifest.version}.zip`;
await rm(`release/${filename}`, { force: true });
execFileSync('zip', ['-qr', `../release/${filename}`, '.'], { cwd: 'dist' });
console.log(`Store upload package: release/${filename}`);
