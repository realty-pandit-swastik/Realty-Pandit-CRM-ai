const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use bash shell for SSH/SCP/tar commands on Windows
const BASH_SHELL = process.platform === 'win32'
  ? (fs.existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : undefined)
  : undefined;
const SHELL_OPTS = BASH_SHELL ? { shell: BASH_SHELL } : {};

// On Windows with Git Bash, /tmp/ in the shell maps to %TEMP%, not C:\tmp
// Use the OS temp dir so Node.js fs and Git Bash ssh see the same file
const os = require('os');
const SSH_KEY_PATH = path.join(os.tmpdir(), 'rp_key').replace(/\\/g, '/');

const config = {
  sshKey: SSH_KEY_PATH,
  sshUser: 'root',
  serverIp: '72.62.231.224',
  remotePath: '/var/www/realty-pandit',
  localAgentsPath: path.resolve(__dirname, '..'),
  components: {
    website: { local: 'website', remote: 'website', pm2: 'realty-website', build: 'npm run build' },
    backend: { local: 'backend', remote: 'backend', pm2: 'realty-backend', build: 'npx tsc' },
    frontend: { local: 'frontend', remote: 'frontend', pm2: 'realty-admin', build: 'npm run build' }
  }
};

const args = process.argv.slice(2);
const component = args[0]; // website, backend, frontend, or 'all'
const skipBuild = args.includes('--skip-build');
const skipVerify = args.includes('--skip-verify');
const dryRun = args.includes('--dry-run');
const taskFile = args.find(a => a.startsWith('--task='))?.split('=').slice(1).join('=');
const taskInline = args.find(a => a.startsWith('--task-inline='))?.split('=').slice(1).join('=');

class DeployAgent {
  constructor() {
    this.startTime = Date.now();
    this.log = [];
  }

  print(msg) {
    console.log(`[Deploy] ${msg}`);
    this.log.push({ time: new Date().toISOString(), msg });
  }

  exec(cmd, options = {}) {
    this.print(`> ${cmd}`);
    if (dryRun) {
      this.print('  (dry-run, skipped)');
      return 'dry-run';
    }
    try {
      return execSync(cmd, { encoding: 'utf8', timeout: 120000, stdio: 'pipe', ...SHELL_OPTS, ...options }).trim();
    } catch (e) {
      this.print(`  ERROR: ${e.message}`);
      throw e;
    }
  }

  ssh(cmd) {
    return this.exec(`ssh -F /dev/null -i ${config.sshKey} -o StrictHostKeyChecking=no ${config.sshUser}@${config.serverIp} "${cmd}"`);
  }

  scp(local, remote) {
    return this.exec(
      `scp -F /dev/null -i ${config.sshKey} -o StrictHostKeyChecking=no -r "${local}" ${config.sshUser}@${config.serverIp}:${remote}`
    );
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

  async deploy(comp) {
    const c = config.components[comp];
    if (!c) {
      this.print(`Unknown component: ${comp}`);
      return false;
    }

    this.print(`\n${'='.repeat(40)}`);
    this.print(`Deploying: ${comp}`);
    this.print(`${'='.repeat(40)}`);

    const localPath = path.join(config.localAgentsPath, c.local);

    if (!fs.existsSync(localPath)) {
      this.print(`Local path not found: ${localPath}`);
      return false;
    }

    // Step 1: Upload changed files using rsync-like approach via tar + scp
    this.print(`\nStep 1: Uploading ${comp} files...`);

    // Create a tar of source files (excluding heavy dirs)
    const excludes = 'node_modules .next dist .git .env .env.local';
    const tarName = `${comp}-deploy.tar.gz`;
    const tarPath = `/tmp/${tarName}`;

    this.exec(`cd "${localPath}" && tar czf ${tarPath} --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.env --exclude=.env.local -C "${localPath}" .`);

    // Upload tar
    this.scp(tarPath, `/tmp/${tarName}`);

    // Extract on server
    this.ssh(`mkdir -p ${config.remotePath}/${c.remote} && cd ${config.remotePath}/${c.remote} && tar xzf /tmp/${tarName} && rm /tmp/${tarName}`);

    // Step 2: Install deps if package.json changed
    this.print(`\nStep 2: Installing dependencies...`);
    this.ssh(`cd ${config.remotePath}/${c.remote} && npm install 2>&1 | tail -5`);

    // Step 3: Build (run as root to avoid permission issues with root-owned .next artifacts)
    if (!skipBuild) {
      this.print(`\nStep 3: Building ${comp}...`);
      // Clean stale build artifacts to prevent chunk hash mismatches
      if (comp === 'website') {
        this.print('  Cleaning stale .next build artifacts...');
        this.ssh(`rm -rf ${config.remotePath}/${c.remote}/.next`);
      } else if (comp === 'frontend') {
        this.print('  Cleaning stale dist artifacts...');
        this.ssh(`rm -rf ${config.remotePath}/${c.remote}/dist`);
      } else if (comp === 'backend') {
        this.print('  Regenerating Prisma client...');
        this.ssh(`cd ${config.remotePath}/${c.remote} && npx prisma generate 2>&1 | tail -3`);
      }
      this.ssh(`cd ${config.remotePath}/${c.remote} && ${c.build} 2>&1 | tail -20`);
    }

    // Step 4: Restart PM2 (runs as root since PM2 daemon is owned by root)
    this.print(`\nStep 4: Restarting ${c.pm2}...`);
    this.ssh(`pm2 restart ${c.pm2} 2>&1`);

    // Step 5: Verify
    this.print(`\nStep 5: Verifying...`);
    const status = this.ssh(`pm2 show ${c.pm2} 2>/dev/null | grep status`);
    this.print(`  ${status}`);

    const isOnline = status.includes('online');
    this.print(isOnline ? `\n${comp} deployed successfully!` : `\nWARNING: ${comp} may not be running correctly!`);

    return isOnline;
  }

  async run() {
    this.print('Deploy Agent starting...');

    if (!this.prepareSSH()) {
      this.print('Cannot continue without SSH access');
      return;
    }

    // Backup before deploy
    this.print('\nCreating pre-deploy backup...');
    this.ssh(`cd ${config.remotePath} && tar czf /root/backups/pre-deploy-$(date +%Y%m%d-%H%M%S).tar.gz --exclude=node_modules --exclude=.next --exclude=dist website/src backend/src frontend/src 2>/dev/null || mkdir -p /root/backups`);

    const components = component === 'all'
      ? Object.keys(config.components)
      : [component];

    const results = {};
    for (const comp of components) {
      results[comp] = await this.deploy(comp);
    }

    // Summary
    this.print(`\n${'='.repeat(40)}`);
    this.print('DEPLOYMENT SUMMARY');
    this.print(`${'='.repeat(40)}`);
    const allSuccess = Object.values(results).every(Boolean);
    for (const [comp, success] of Object.entries(results)) {
      this.print(`  ${comp}: ${success ? 'SUCCESS' : 'FAILED'}`);
    }
    this.print(`Duration: ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);

    // Post-deploy verification: health check + browser QA
    if (!skipVerify && !dryRun && allSuccess) {
      await this.postDeployVerify(components);
    } else if (!allSuccess) {
      this.print('\nSkipping post-deploy verification — deployment had failures.');
    }
  }

  async postDeployVerify(deployedComponents) {
    this.print(`\n${'='.repeat(40)}`);
    this.print('POST-DEPLOY VERIFICATION');
    this.print(`${'='.repeat(40)}`);

    // Step 1: Wait for services to stabilize
    this.print('\nWaiting 5s for services to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 2: Health check — verify all endpoints respond
    this.print('\n--- Endpoint Health Check ---');
    const https = require('https');
    const endpoints = [
      { name: 'Website', url: 'https://www.realtypandit.in' },
      { name: 'API', url: 'https://api.realtypandit.in' },
      { name: 'Admin', url: 'https://admin.realtypandit.in' }
    ];

    let healthOk = true;
    for (const ep of endpoints) {
      const result = await new Promise(resolve => {
        const start = Date.now();
        https.get(ep.url, { timeout: 15000 }, (res) => {
          resolve({ name: ep.name, status: res.statusCode, time: Date.now() - start, ok: res.statusCode < 400 });
        }).on('error', (e) => {
          resolve({ name: ep.name, status: 'ERROR', time: 0, ok: false, error: e.message });
        });
      });
      this.print(`  ${result.ok ? 'OK' : 'FAIL'}  ${result.name}: HTTP ${result.status} (${result.time}ms)`);
      if (!result.ok) healthOk = false;
    }

    if (!healthOk) {
      this.print('\nHEALTH CHECK FAILED — some endpoints are down!');
      this.print('Checking PM2 logs for errors...');
      for (const comp of deployedComponents) {
        const c = config.components[comp];
        if (c) {
          const logs = this.ssh(`su - realty -c "pm2 logs ${c.pm2} --nostream --lines 20 2>/dev/null" | tail -15`);
          this.print(`\n[${c.pm2} logs]:\n${logs}`);
        }
      }
      return false;
    }

    this.print('\nAll endpoints healthy.');

    // Step 3: PM2 process verification
    this.print('\n--- PM2 Process Check ---');
    for (const comp of deployedComponents) {
      const c = config.components[comp];
      if (c) {
        const status = this.ssh(`pm2 show ${c.pm2} 2>/dev/null | grep status`);
        this.print(`  [${c.pm2}] ${status.replace(/\\n/g, ' | ')}`);
      }
    }

    // Step 4: Run Browser QA agent to verify UI
    this.print('\n--- Browser QA Verification ---');
    const browserQAPath = path.join(config.localAgentsPath, 'browser-qa', 'run.js');

    if (fs.existsSync(browserQAPath)) {
      try {
        this.print('Running Browser QA scan on live site...');
        execSync(`node "${browserQAPath}"`, {
          stdio: 'inherit',
          cwd: path.join(config.localAgentsPath, 'browser-qa'),
          timeout: 300000
        });

        // Read the QA summary
        const summaryPath = path.join(config.localAgentsPath, 'browser-qa', 'reports', 'latest-summary.md');
        if (fs.existsSync(summaryPath)) {
          const summary = fs.readFileSync(summaryPath, 'utf8');

          // Check for critical issues
          const criticalMatch = summary.match(/Critical Issues \| (\d+)/);
          const criticalCount = criticalMatch ? parseInt(criticalMatch[1]) : 0;

          if (criticalCount > 0) {
            this.print(`\nBROWSER QA FOUND ${criticalCount} CRITICAL ISSUES!`);
            this.print('Check the full report at: agents/browser-qa/reports/latest-summary.md');
            this.print('\nCritical issues after deploy — review needed.\n');
          } else {
            this.print('\nBrowser QA: No critical issues found. Deployment verified!');
          }
        }
      } catch (e) {
        this.print(`Browser QA failed to run: ${e.message}`);
        this.print('Manual verification recommended.');
      }
    } else {
      this.print('Browser QA agent not found. Skipping UI verification.');
    }

    // Step 5: Task-specific verification (if a task was provided)
    const taskVerifyPath = path.join(config.localAgentsPath, 'browser-qa', 'task-verify.js');
    const hasTask = taskFile || taskInline;
    const lastTaskPath = path.join(config.localAgentsPath, 'browser-qa', 'tasks', 'last-task.json');
    const hasLastTask = fs.existsSync(lastTaskPath);

    if (fs.existsSync(taskVerifyPath) && (hasTask || hasLastTask)) {
      this.print('\n--- Task-Specific Verification ---');
      try {
        let taskArg = '';
        if (taskFile) {
          taskArg = `--task="${taskFile}"`;
        } else if (taskInline) {
          taskArg = `--task-inline=${JSON.stringify(taskInline)}`;
        } else if (hasLastTask) {
          this.print('Re-running last task verification...');
          taskArg = '--last';
        }

        execSync(`node "${taskVerifyPath}" ${taskArg}`, {
          stdio: 'inherit',
          cwd: path.join(config.localAgentsPath, 'browser-qa'),
          timeout: 300000
        });

        // Check task results
        const taskReportPath = path.join(config.localAgentsPath, 'browser-qa', 'reports', 'latest-task-verify.json');
        if (fs.existsSync(taskReportPath)) {
          const taskReport = JSON.parse(fs.readFileSync(taskReportPath, 'utf8'));
          if (!taskReport.allPassed) {
            this.print(`\nTASK VERIFICATION: ${taskReport.summary.failed} of ${taskReport.summary.total} checks FAILED!`);
            this.print('The deployed changes are NOT working as expected.');
            this.print('Check: agents/browser-qa/reports/latest-task-verify.json');
          } else {
            this.print(`\nTASK VERIFICATION: All ${taskReport.summary.total} checks PASSED!`);
            this.print('Deployed changes are working correctly.');
          }
        }
      } catch (e) {
        this.print(`Task verification error: ${e.message}`);
      }
    }

    this.print(`\n${'='.repeat(40)}`);
    this.print('POST-DEPLOY VERIFICATION COMPLETE');
    this.print(`${'='.repeat(40)}`);
    return true;
  }
}

if (!component) {
  console.log('Usage: node deploy-agent.js <website|backend|frontend|all> [--skip-build] [--skip-verify] [--dry-run]');
  process.exit(1);
}

const agent = new DeployAgent();
agent.run().catch(e => { console.error('Deploy failed:', e); process.exit(1); });
