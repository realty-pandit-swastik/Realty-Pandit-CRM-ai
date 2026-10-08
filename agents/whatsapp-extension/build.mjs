import { execFileSync } from 'node:child_process';
import { readdir, mkdir, cp, copyFile, rm } from 'node:fs/promises';

for (const file of await readdir('src')) {
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', `src/${file}`]);
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
await cp('src', 'dist', { recursive: true });
await copyFile('node_modules/@wppconnect/wa-js/dist/wppconnect-wa.js', 'dist/vendor/wppconnect-wa.js');
await copyFile('node_modules/@wppconnect/wa-js/LICENSE', 'dist/vendor/WA-JS-LICENSE');
console.log('Extension built in dist/. Load that directory as an unpacked extension.');
