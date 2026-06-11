/**
 * Production Cleanup Orchestrator — Realty Pandit
 *
 * Cleans all test data from the production database while preserving:
 * - Team member accounts (Agent)
 * - Partner agents (PartnerAgent)
 * - Master/classification data
 * - Tenant config, Workflows, CampaignTemplates, PromptOverrides
 *
 * Usage: node clean-test-data.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Windows bash shell fix (same pattern as deploy-agent.js)
const BASH_SHELL = process.platform === 'win32'
    ? (fs.existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : undefined)
    : undefined;
const SHELL_OPTS = BASH_SHELL ? { shell: BASH_SHELL } : {};

const SSH_KEY_PATH = path.join(os.tmpdir(), 'rp_key').replace(/\\/g, '/');

const config = {
    sshKey: SSH_KEY_PATH,
    sshUser: 'root',
    serverIp: '72.62.231.224',
    remotePath: '/var/www/realty-pandit',
    backupDir: '/root/backups',
};

class CleanupAgent {
    constructor() {
        this.startTime = Date.now();
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    print(msg) {
        console.log(`[Cleanup] ${msg}`);
    }

    exec(cmd, options = {}) {
        this.print(`> ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`);
        try {
            return execSync(cmd, { encoding: 'utf8', timeout: 600000, stdio: 'pipe', ...SHELL_OPTS, ...options }).trim();
        } catch (e) {
            this.print(`  ERROR: ${e.message.substring(0, 200)}`);
            throw e;
        }
    }

    ssh(cmd) {
        return this.exec(`ssh -F /dev/null -i ${config.sshKey} -o StrictHostKeyChecking=no ${config.sshUser}@${config.serverIp} "${cmd}"`);
    }

    scp(local, remote) {
        return this.exec(`scp -F /dev/null -i ${config.sshKey} -o StrictHostKeyChecking=no "${local}" ${config.sshUser}@${config.serverIp}:${remote}`);
    }

    prepareSSH() {
        if (fs.existsSync(SSH_KEY_PATH)) return true;
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const keySource = path.join(homeDir, '.ssh', 'realty_pandit_key');
        if (fs.existsSync(keySource)) {
            fs.copyFileSync(keySource, SSH_KEY_PATH);
            fs.chmodSync(SSH_KEY_PATH, 0o600);
            return true;
        }
        this.print('SSH key not found!');
        return false;
    }

    async run() {
        this.print('========================================');
        this.print('PRODUCTION CLEANUP — REALTY PANDIT');
        this.print('========================================');
        this.print(`Timestamp: ${this.timestamp}`);

        // Prepare SSH
        if (!this.prepareSSH()) {
            this.print('Cannot continue without SSH access');
            return;
        }

        // ─── Step 1: Create backups ───
        this.print('\n========================================');
        this.print('STEP 1: Creating backups');
        this.print('========================================');

        this.ssh(`mkdir -p ${config.backupDir}`);

        // Database backup
        this.print('\nBacking up database (pg_dump)...');
        const dbBackupFile = `${config.backupDir}/pre-cleanup-${this.timestamp}-db.sql`;
        this.ssh(`pg_dump 'postgresql://realty_user:RealtyPandit%402024%23Secure@localhost:5432/reality_pandit' > ${dbBackupFile}`);

        // Verify DB backup
        const dbBackupSize = this.ssh(`stat -c%s ${dbBackupFile} 2>/dev/null || echo 0`);
        this.print(`Database backup: ${dbBackupFile} (${(parseInt(dbBackupSize) / 1024 / 1024).toFixed(1)} MB)`);
        if (parseInt(dbBackupSize) === 0) {
            this.print('ABORT: Database backup is empty!');
            return;
        }

        // Uploads backup
        this.print('\nBacking up uploads directory...');
        const uploadsBackupFile = `${config.backupDir}/pre-cleanup-${this.timestamp}-uploads.tar.gz`;
        this.ssh(`tar czf ${uploadsBackupFile} -C ${config.remotePath}/backend uploads/ 2>/dev/null || true`);

        const uploadsBackupSize = this.ssh(`stat -c%s ${uploadsBackupFile} 2>/dev/null || echo 0`);
        this.print(`Uploads backup: ${uploadsBackupFile} (${(parseInt(uploadsBackupSize) / 1024 / 1024).toFixed(1)} MB)`);

        this.print('\nBackups created successfully.');

        // ─── Step 2: Upload and run DB cleanup script ───
        this.print('\n========================================');
        this.print('STEP 2: Database cleanup');
        this.print('========================================');

        const localScript = path.join(__dirname, 'clean-db-remote.js');
        const remoteScript = '/tmp/clean-db-remote.js';

        this.print('Uploading cleanup script to server...');
        this.scp(localScript.replace(/\\/g, '/'), remoteScript);

        this.print('Running database cleanup...');
        let dbOutput;
        try {
            dbOutput = this.ssh(`cd ${config.remotePath}/backend && node ${remoteScript} 2>&1`);
        } catch (e) {
            this.print('DATABASE CLEANUP FAILED!');
            this.print('The database was NOT modified (transaction rolled back).');
            this.print('Backup is safe at: ' + dbBackupFile);
            this.ssh(`rm -f ${remoteScript}`);
            return;
        }

        // Print the output
        console.log(dbOutput);

        // Check for success marker
        if (!dbOutput.includes('__CLEANUP_SUCCESS__')) {
            this.print('WARNING: Cleanup may not have completed fully. Check output above.');
            this.ssh(`rm -f ${remoteScript}`);
            return;
        }

        this.print('Database cleanup completed successfully!');

        // ─── Step 3: File cleanup ───
        this.print('\n========================================');
        this.print('STEP 3: File cleanup (uploaded media)');
        this.print('========================================');

        const uploadBase = `${config.remotePath}/backend/uploads`;

        // Show what exists before cleanup
        this.print('Current upload directories:');
        try {
            const lsBefore = this.ssh(`du -sh ${uploadBase}/*/ 2>/dev/null || echo "(empty)"`);
            console.log(lsBefore);
        } catch (e) { /* empty uploads dir */ }

        // Delete test media (keep profiles/)
        const dirsToClean = ['properties', 'documents', 'projects', 'staff_calls', 'pending', 'temp'];
        for (const dir of dirsToClean) {
            try {
                this.ssh(`rm -rf ${uploadBase}/${dir}/* 2>/dev/null && echo "${dir}: cleaned" || echo "${dir}: already empty"`);
                this.print(`Cleaned: ${dir}/`);
            } catch (e) {
                this.print(`${dir}/: already empty or not found`);
            }
        }

        // Verify profiles preserved
        try {
            const profilesCheck = this.ssh(`ls ${uploadBase}/profiles/ 2>/dev/null | wc -l`);
            this.print(`\nProfiles preserved: ${profilesCheck} files`);
        } catch (e) {
            this.print('Profiles directory: empty or not found');
        }

        // Clean up remote script
        this.ssh(`rm -f ${remoteScript}`);

        // ─── Step 4: Restart backend ───
        this.print('\n========================================');
        this.print('STEP 4: Restarting backend');
        this.print('========================================');
        this.ssh('pm2 restart realty-backend 2>&1 | tail -3');

        // ─── Summary ───
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.print('\n========================================');
        this.print('CLEANUP COMPLETE');
        this.print('========================================');
        this.print(`Duration: ${elapsed}s`);
        this.print(`DB backup: ${dbBackupFile}`);
        this.print(`Uploads backup: ${uploadsBackupFile}`);
        this.print('');
        this.print('PRESERVED: Agents, Partners, Tenant, Master data, Workflows, Templates');
        this.print('DELETED: All test inventories, contacts, messages, transactions, media files');
        this.print('');
        this.print('To restore if needed:');
        this.print(`  DB: psql DATABASE_URL < ${dbBackupFile}`);
        this.print(`  Files: tar xzf ${uploadsBackupFile} -C ${config.remotePath}/backend/`);
    }
}

const agent = new CleanupAgent();
agent.run().catch(e => {
    console.error('[Cleanup] Fatal error:', e.message);
    process.exit(1);
});
