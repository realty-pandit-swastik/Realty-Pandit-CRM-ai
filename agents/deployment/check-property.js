const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SSH_KEY_PATH = path.join(os.tmpdir(), 'rp_key').replace(/\\/g, '/');
const BASH_SHELL = 'C:/Program Files/Git/bin/bash.exe';
const SHELL_OPTS = { shell: BASH_SHELL, encoding: 'utf8', timeout: 60000 };

const homeDir = process.env.HOME || process.env.USERPROFILE;
const keySource = path.join(homeDir, '.ssh', 'realty_pandit_key');
if (!fs.existsSync(SSH_KEY_PATH)) {
    fs.copyFileSync(keySource, SSH_KEY_PATH);
    fs.chmodSync(SSH_KEY_PATH, 0o600);
}

function run(cmd) {
    return execSync(cmd, SHELL_OPTS).trim();
}

// Upload and run
run(`scp -F /dev/null -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no "c:/tmp/check-props.js" root@72.62.231.224:/var/www/realty-pandit/backend/check-props.js`);
const result = run(`ssh -F /dev/null -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no root@72.62.231.224 "cd /var/www/realty-pandit/backend && node check-props.js && rm check-props.js"`);
console.log(result);
