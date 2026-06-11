const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const config = {
  targets: [
    { name: 'Website', url: 'https://www.realtypandit.in' },
    { name: 'API', url: 'https://api.realtypandit.in' },
    { name: 'Admin', url: 'https://admin.realtypandit.in' }
  ],
  reportDir: './reports'
};

class SecurityAgent {
  constructor() {
    this.findings = [];
    this.startTime = Date.now();
  }

  log(msg) {
    console.log(`[Security] ${msg}`);
  }

  addFinding(target, category, severity, title, description, recommendation) {
    this.findings.push({ target, category, severity, title, description, recommendation });
  }

  fetchHeaders(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { timeout: 10000 }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers, url });
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    });
  }

  fetchBody(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, url }));
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    });
  }

  async run() {
    this.log('Starting security scan...\n');
    fs.mkdirSync(config.reportDir, { recursive: true });

    for (const target of config.targets) {
      this.log(`\n--- Scanning ${target.name} (${target.url}) ---`);

      try {
        const result = await this.fetchHeaders(target.url);

        // Security Headers Check
        this.checkSecurityHeaders(target.name, result.headers);

        // HTTPS Check
        this.checkHTTPS(target.name, target.url);

        // Information Disclosure
        this.checkInfoDisclosure(target.name, result.headers);

        // Cookie Security
        this.checkCookies(target.name, result.headers);

        // CORS
        this.checkCORS(target.name, result.headers);

      } catch (e) {
        this.log(`  ERROR scanning ${target.name}: ${e.message}`);
        this.addFinding(target.name, 'availability', 'critical', 'Target unreachable', e.message, 'Verify the service is running');
      }
    }

    // API-specific checks
    this.log('\n--- API Security Checks ---');
    await this.checkApiSecurity();

    // Check for common exposed paths
    this.log('\n--- Exposed Paths Check ---');
    await this.checkExposedPaths();

    // Generate report
    const report = this.generateReport();
    const reportPath = path.join(config.reportDir, 'latest-security.json');
    const summaryPath = path.join(config.reportDir, 'latest-security.md');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(summaryPath, this.generateMarkdown(report));

    console.log('\n' + this.generateMarkdown(report));
    this.log(`Report saved to ${reportPath}`);

    return report;
  }

  checkSecurityHeaders(target, headers) {
    const required = [
      { header: 'strict-transport-security', name: 'HSTS', rec: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains' },
      { header: 'x-content-type-options', name: 'X-Content-Type-Options', rec: 'Add: X-Content-Type-Options: nosniff' },
      { header: 'x-frame-options', name: 'X-Frame-Options', rec: 'Add: X-Frame-Options: DENY or SAMEORIGIN' },
      { header: 'x-xss-protection', name: 'X-XSS-Protection', rec: 'Add: X-XSS-Protection: 1; mode=block' },
      { header: 'content-security-policy', name: 'CSP', rec: 'Add a Content-Security-Policy header' },
      { header: 'referrer-policy', name: 'Referrer-Policy', rec: 'Add: Referrer-Policy: strict-origin-when-cross-origin' },
      { header: 'permissions-policy', name: 'Permissions-Policy', rec: 'Add Permissions-Policy to restrict browser features' }
    ];

    for (const check of required) {
      if (!headers[check.header]) {
        const severity = ['strict-transport-security', 'content-security-policy'].includes(check.header) ? 'high' : 'medium';
        this.addFinding(target, 'headers', severity, `Missing ${check.name} header`, `The ${check.name} header is not set`, check.rec);
        this.log(`  MISSING: ${check.name}`);
      } else {
        this.log(`  OK: ${check.name}: ${headers[check.header].toString().slice(0, 60)}`);
      }
    }
  }

  checkHTTPS(target, url) {
    if (!url.startsWith('https://')) {
      this.addFinding(target, 'transport', 'critical', 'Not using HTTPS', 'Site is served over HTTP', 'Enable HTTPS with a valid SSL certificate');
    }
  }

  checkInfoDisclosure(target, headers) {
    // Server header
    if (headers['server']) {
      this.addFinding(target, 'info-disclosure', 'low', 'Server header exposed', `Server: ${headers['server']}`, 'Remove or genericize the Server header in Nginx config');
      this.log(`  INFO: Server header: ${headers['server']}`);
    }

    // X-Powered-By
    if (headers['x-powered-by']) {
      this.addFinding(target, 'info-disclosure', 'medium', 'X-Powered-By exposed', `X-Powered-By: ${headers['x-powered-by']}`, 'Remove X-Powered-By header (in Express: app.disable("x-powered-by"))');
      this.log(`  WARN: X-Powered-By: ${headers['x-powered-by']}`);
    }
  }

  checkCookies(target, headers) {
    const cookies = headers['set-cookie'];
    if (cookies) {
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      for (const cookie of cookieArr) {
        if (!cookie.toLowerCase().includes('httponly')) {
          this.addFinding(target, 'cookies', 'medium', 'Cookie missing HttpOnly', cookie.split(';')[0], 'Add HttpOnly flag to cookies');
        }
        if (!cookie.toLowerCase().includes('secure')) {
          this.addFinding(target, 'cookies', 'medium', 'Cookie missing Secure', cookie.split(';')[0], 'Add Secure flag to cookies');
        }
        if (!cookie.toLowerCase().includes('samesite')) {
          this.addFinding(target, 'cookies', 'low', 'Cookie missing SameSite', cookie.split(';')[0], 'Add SameSite=Strict or SameSite=Lax');
        }
      }
    }
  }

  checkCORS(target, headers) {
    const acao = headers['access-control-allow-origin'];
    if (acao === '*') {
      this.addFinding(target, 'cors', 'high', 'CORS allows all origins', 'Access-Control-Allow-Origin: *', 'Restrict CORS to specific trusted domains');
      this.log(`  WARN: CORS is open (*)`)
    }
  }

  async checkApiSecurity() {
    const apiUrl = config.targets.find(t => t.name === 'API')?.url;
    if (!apiUrl) return;

    // Check if API returns errors with stack traces
    const testPaths = [
      '/api/nonexistent',
      '/api/../../../etc/passwd',
      '/api/properties?id=1%27%20OR%201=1--'
    ];

    for (const testPath of testPaths) {
      try {
        const result = await this.fetchBody(`${apiUrl}${testPath}`);
        if (result.body.includes('stack') || result.body.includes('node_modules') || result.body.includes('at ')) {
          this.addFinding('API', 'info-disclosure', 'high', 'Stack trace in error response', `Path: ${testPath}`, 'Disable verbose error messages in production');
          this.log(`  WARN: Stack trace exposed at ${testPath}`);
        }
        if (result.body.includes('root:') || result.body.includes('/etc/')) {
          this.addFinding('API', 'path-traversal', 'critical', 'Possible path traversal', `Path: ${testPath}`, 'Sanitize all file path inputs');
          this.log(`  CRITICAL: Path traversal possible at ${testPath}`);
        }
      } catch {}
    }
  }

  async checkExposedPaths() {
    const sensitivePaths = [
      { path: '/.env', desc: 'Environment file' },
      { path: '/.git/config', desc: 'Git config' },
      { path: '/wp-admin', desc: 'WordPress admin' },
      { path: '/phpmyadmin', desc: 'phpMyAdmin' },
      { path: '/api/docs', desc: 'API documentation' },
      { path: '/api/swagger', desc: 'Swagger UI' },
      { path: '/.well-known/security.txt', desc: 'Security.txt' }
    ];

    for (const target of config.targets) {
      for (const check of sensitivePaths) {
        try {
          const result = await this.fetchHeaders(`${target.url}${check.path}`);
          if (result.status === 200) {
            const severity = ['.env', '.git'].some(s => check.path.includes(s)) ? 'critical' : 'low';
            this.addFinding(target.name, 'exposed-path', severity, `${check.desc} accessible`, `${target.url}${check.path} returns 200`, `Block access to ${check.path} in Nginx`);
            this.log(`  ${severity === 'critical' ? 'CRITICAL' : 'INFO'}: ${check.desc} accessible at ${target.url}${check.path}`);
          }
        } catch {}
      }
    }
  }

  generateReport() {
    const critical = this.findings.filter(f => f.severity === 'critical');
    const high = this.findings.filter(f => f.severity === 'high');
    const medium = this.findings.filter(f => f.severity === 'medium');
    const low = this.findings.filter(f => f.severity === 'low');

    return {
      timestamp: new Date().toISOString(),
      duration: `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`,
      summary: { total: this.findings.length, critical: critical.length, high: high.length, medium: medium.length, low: low.length },
      findings: this.findings
    };
  }

  generateMarkdown(report) {
    let md = `# Security Scan Report - Realty Pandit\n`;
    md += `**Date:** ${report.timestamp}\n\n`;
    md += `## Summary: ${report.summary.total} findings\n`;
    md += `| Severity | Count |\n|----------|-------|\n`;
    md += `| Critical | ${report.summary.critical} |\n`;
    md += `| High | ${report.summary.high} |\n`;
    md += `| Medium | ${report.summary.medium} |\n`;
    md += `| Low | ${report.summary.low} |\n\n`;

    for (const sev of ['critical', 'high', 'medium', 'low']) {
      const items = report.findings.filter(f => f.severity === sev);
      if (items.length) {
        md += `## ${sev.toUpperCase()} (${items.length})\n`;
        for (const f of items) {
          md += `### ${f.title}\n- **Target:** ${f.target}\n- **Category:** ${f.category}\n- **Detail:** ${f.description}\n- **Fix:** ${f.recommendation}\n\n`;
        }
      }
    }
    return md;
  }
}

const agent = new SecurityAgent();
agent.run().catch(e => { console.error('Security scan failed:', e); process.exit(1); });
