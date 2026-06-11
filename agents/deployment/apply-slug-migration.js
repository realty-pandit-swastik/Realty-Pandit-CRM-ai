const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SSH_KEY_PATH = path.join(os.tmpdir(), 'rp_key').replace(/\\/g, '/');
const BASH_SHELL = 'C:/Program Files/Git/bin/bash.exe';
const SHELL_OPTS = { shell: BASH_SHELL, encoding: 'utf8', timeout: 120000 };

const homeDir = process.env.HOME || process.env.USERPROFILE;
const keySource = path.join(homeDir, '.ssh', 'realty_pandit_key');
if (!fs.existsSync(SSH_KEY_PATH)) {
    fs.copyFileSync(keySource, SSH_KEY_PATH);
    fs.chmodSync(SSH_KEY_PATH, 0o600);
}

function ssh(cmd) {
    console.log(`> ssh: ${cmd}`);
    const result = execSync(
        `ssh -F /dev/null -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no root@72.62.231.224 "${cmd}"`,
        SHELL_OPTS
    ).trim();
    console.log(result);
    return result;
}

// Step 1: Rebuild backend
console.log('\n=== Step 1: Rebuild backend ===');
ssh('cd /var/www/realty-pandit/backend && npx tsc 2>&1 | tail -5');

// Step 2: Restart backend
console.log('\n=== Step 2: Restart backend ===');
ssh('pm2 restart realty-backend 2>&1 | tail -5');

// Step 3: Run force backfill (regenerate ALL slugs)
console.log('\n=== Step 3: Force regenerate all slugs ===');
try {
    ssh('cd /var/www/realty-pandit/backend && node dist/scripts/backfill-slugs.js --force 2>&1');
} catch (e) {
    console.log('Backfill output:', e.stdout || e.message);
}

// Step 4: Verify API
console.log('\n=== Step 4: Verify API ===');
try {
    ssh('sleep 2 && curl -s http://localhost:7071/public/properties?limit=3 2>&1 | head -c 800');
} catch (e) {
    console.log('API check:', e.message.split('\\n')[0]);
}

console.log('\n=== Done ===');
