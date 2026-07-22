const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Use bash shell for SSH commands on Windows
const BASH_SHELL = process.platform === 'win32'
  ? (require('fs').existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : undefined)
  : undefined;

// Use the persistent source key directly. Previously copied to /tmp/rp_key, but on Windows Node's
// /tmp (C:\tmp) and git-bash ssh's /tmp resolve to different real paths, so `ssh -i /tmp/rp_key`
// could not find the key → false "Nginx/PM2 CRITICAL" alarms. (2026-06-25; see root memory
// reference_windows_bash_python_temp_paths)
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';
const RP_SSH_KEY = path.join(HOME_DIR, '.ssh', 'realty_pandit_key').replace(/\\/g, '/');

const config = {
  sshKey: RP_SSH_KEY,
  sshUser: 'root',
  serverIp: '72.62.231.224',
  services: [
    { name: 'Website', url: 'https://www.realtypandit.in', expectedStatus: 200 },
    { name: 'API', url: 'https://api.realtypandit.in', expectedStatus: [200, 404] },
    { name: 'API Health', url: 'https://api.realtypandit.in/health', expectedStatus: [200, 404] },
    { name: 'Admin', url: 'https://admin.realtypandit.in', expectedStatus: 200 }
  ],
  pm2Processes: ['realty-backend', 'realty-website', 'realty-admin'],
  reportDir: './reports'
};

class MonitorAgent {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  log(msg) {
    console.log(`[Monitor] ${msg}`);
  }

  async checkUrl(service) {
    return new Promise((resolve) => {
      const start = Date.now();
      const client = service.url.startsWith('https') ? https : http;

      const req = client.get(service.url, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - start;
        const expected = Array.isArray(service.expectedStatus) ? service.expectedStatus : [service.expectedStatus];
        resolve({
          name: service.name,
          url: service.url,
          status: res.statusCode,
          responseTime,
          ok: expected.includes(res.statusCode),
          headers: {
            server: res.headers['server'],
            contentType: res.headers['content-type'],
            xPoweredBy: res.headers['x-powered-by']
          }
        });
      });

      req.on('error', (e) => {
        resolve({
          name: service.name,
          url: service.url,
          status: 'ERROR',
          responseTime: Date.now() - start,
          ok: false,
          error: e.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          name: service.name,
          url: service.url,
          status: 'TIMEOUT',
          responseTime: Date.now() - start,
          ok: false,
          error: 'Request timed out (10s)'
        });
      });
    });
  }

  prepareSSH() {
    // Persistent source key used directly (no fragile /tmp copy). Just verify it exists.
    return fs.existsSync(config.sshKey);
  }

  sshCommand(cmd) {
    try {
      return execSync(
        `ssh -i "${config.sshKey}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${config.sshUser}@${config.serverIp} "${cmd}"`,
        { encoding: 'utf8', timeout: 30000, stdio: 'pipe', ...(BASH_SHELL ? { shell: BASH_SHELL } : {}) }
      ).trim();
    } catch (e) {
      return `ERROR: ${e.message}`;
    }
  }

  async run() {
    this.log('Starting health check...\n');
    fs.mkdirSync(config.reportDir, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      endpoints: [],
      server: {},
      pm2: [],
      disk: null,
      memory: null,
      issues: []
    };

    // Check all endpoints
    this.log('Checking endpoints...');
    for (const service of config.services) {
      const result = await this.checkUrl(service);
      report.endpoints.push(result);
      const icon = result.ok ? 'OK' : 'FAIL';
      this.log(`  ${icon} ${result.name}: HTTP ${result.status} (${result.responseTime}ms)`);
      if (!result.ok) {
        report.issues.push({ type: 'endpoint', severity: 'critical', message: `${result.name} is ${result.status}: ${result.error || ''}` });
      }
    }

    // SSH into server for system checks
    this.log('\nChecking server via SSH...');
    const sshOk = this.prepareSSH();

    if (sshOk) {
      // PM2 status
      this.log('  Checking PM2 processes...');
      const pm2Output = this.sshCommand('pm2 jlist 2>/dev/null');
      if (!pm2Output.startsWith('ERROR')) {
        try {
          const pm2List = JSON.parse(pm2Output);
          for (const proc of pm2List) {
            const status = {
              name: proc.name,
              status: proc.pm2_env?.status,
              cpu: proc.monit?.cpu,
              memory: Math.round((proc.monit?.memory || 0) / 1024 / 1024),
              restarts: proc.pm2_env?.restart_time,
              uptime: proc.pm2_env?.pm_uptime ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 1000 / 60) : 0
            };
            report.pm2.push(status);
            this.log(`    ${status.name}: ${status.status} | CPU: ${status.cpu}% | RAM: ${status.memory}MB | Restarts: ${status.restarts}`);

            if (status.status !== 'online') {
              report.issues.push({ type: 'pm2', severity: 'critical', message: `${status.name} is ${status.status}` });
            }
            if (status.restarts > 10) {
              report.issues.push({ type: 'pm2', severity: 'warning', message: `${status.name} has ${status.restarts} restarts` });
            }
          }
        } catch { this.log('    Could not parse PM2 output'); }
      } else {
        this.log(`    ${pm2Output}`);
      }

      // Disk usage
      this.log('  Checking disk usage...');
      const diskOutput = this.sshCommand("df -h / | tail -1 | awk '{print $5}'");
      if (!diskOutput.startsWith('ERROR')) {
        report.disk = diskOutput;
        this.log(`    Disk usage: ${diskOutput}`);
        const pct = parseInt(diskOutput);
        if (pct > 90) report.issues.push({ type: 'disk', severity: 'critical', message: `Disk usage at ${diskOutput}` });
        else if (pct > 80) report.issues.push({ type: 'disk', severity: 'warning', message: `Disk usage at ${diskOutput}` });
      }

      // Memory
      this.log('  Checking memory...');
      const memOutput = this.sshCommand("free -m | awk 'NR==2{printf \"%s/%sMB (%.0f%%)\", $3,$2,$3*100/$2}'");
      if (!memOutput.startsWith('ERROR')) {
        report.memory = memOutput;
        this.log(`    Memory: ${memOutput}`);
      }

      // Recent errors in PM2 logs
      this.log('  Checking recent errors...');
      const recentErrors = this.sshCommand("pm2 logs --nostream --lines 50 2>/dev/null | grep -i 'error\\|ERR\\|fail\\|crash' | tail -10");
      if (recentErrors && !recentErrors.startsWith('ERROR')) {
        report.recentErrors = recentErrors.split('\n').filter(l => l.trim());
        if (report.recentErrors.length > 0) {
          this.log(`    Found ${report.recentErrors.length} recent error lines`);
          report.issues.push({ type: 'logs', severity: 'warning', message: `${report.recentErrors.length} recent errors in PM2 logs` });
        }
      }

      // Nginx status
      const nginxStatus = this.sshCommand("systemctl is-active nginx");
      report.server.nginx = nginxStatus;
      this.log(`  Nginx: ${nginxStatus}`);
      if (nginxStatus !== 'active') {
        report.issues.push({ type: 'nginx', severity: 'critical', message: `Nginx is ${nginxStatus}` });
      }

      // SSL cert expiry
      const sslExpiry = this.sshCommand("echo | openssl s_client -servername www.realtypandit.in -connect www.realtypandit.in:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2");
      if (sslExpiry && !sslExpiry.startsWith('ERROR')) {
        report.server.sslExpiry = sslExpiry;
        this.log(`  SSL expires: ${sslExpiry}`);
      }
    } else {
      this.log('  SSH key not found, skipping server checks');
      report.issues.push({ type: 'ssh', severity: 'warning', message: 'Could not SSH to server - key not found' });
    }

    // Generate summary
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    report.duration = `${duration}s`;

    let summary = `\n${'='.repeat(50)}\n`;
    summary += `MONITOR REPORT - ${report.timestamp}\n`;
    summary += `Duration: ${duration}s\n`;
    summary += `${'='.repeat(50)}\n\n`;

    if (report.issues.length === 0) {
      summary += `ALL SYSTEMS HEALTHY\n`;
    } else {
      const critical = report.issues.filter(i => i.severity === 'critical');
      const warnings = report.issues.filter(i => i.severity === 'warning');
      if (critical.length) {
        summary += `CRITICAL (${critical.length}):\n`;
        critical.forEach(i => { summary += `  - ${i.message}\n`; });
      }
      if (warnings.length) {
        summary += `WARNINGS (${warnings.length}):\n`;
        warnings.forEach(i => { summary += `  - ${i.message}\n`; });
      }
    }

    console.log(summary);

    // Save report
    const reportPath = path.join(config.reportDir, 'latest-monitor.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`Report saved to ${reportPath}`);

    return report;
  }
}

const agent = new MonitorAgent();
agent.run().catch(e => { console.error('Monitor failed:', e); process.exit(1); });
