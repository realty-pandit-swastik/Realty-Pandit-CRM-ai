#!/usr/bin/env node

/**
 * Realty Pandit Agent Orchestrator
 * Master control for all agents
 *
 * Usage:
 *   node orchestrator.js <command>
 *
 * Commands:
 *   status          - Run monitor agent (check all services health)
 *   scan            - Run browser QA agent (crawl site, find UI bugs)
 *   scan:mobile     - Run browser QA on mobile viewport
 *   scan:full       - Run browser QA on all viewports (desktop + tablet + mobile)
 *   secure          - Run security scan
 *   deploy <comp>   - Deploy component (website|backend|frontend|all)
 *   deploy:dry <c>  - Dry-run deploy
 *   backup          - Full backup (code + db)
 *   backup:code     - Code-only backup
 *   backup:db       - Database backup
 *   backup:list     - List server backups
 *   backup:download - Download latest backup
 *   health          - Quick health check (endpoints only)
 *   all             - Run status + scan + secure (full audit)
 *
 *   payment         - Check Razorpay integration status
 *   payment:plans   - Show subscription plan pricing
 *   notify          - Check notification channels status
 *   notify:templates- List notification templates
 *   meta            - Check Facebook/Meta integration
 *   meta:leads      - Fetch Facebook Lead Ads leads
 *   instagram       - Check Instagram integration
 *   instagram:post  - Auto-post property to Instagram
 *   seo             - Run SEO health check
 *   seo:audit       - Full SEO audit of all pages
 *   analytics       - Show analytics overview
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const AGENTS_DIR = __dirname;
const args = process.argv.slice(2);
const command = args[0];
const extra = args.slice(1);

function runAgent(name, scriptPath, runArgs = [], options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RUNNING: ${name}`);
  console.log(`${'='.repeat(60)}\n`);

  const fullPath = path.join(AGENTS_DIR, scriptPath);

  try {
    execSync(`node "${fullPath}" ${runArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: path.dirname(fullPath),
      timeout: options.timeout || 300000,
      env: { ...process.env }
    });
    console.log(`\n[${name}] Completed.`);
    return true;
  } catch (e) {
    console.error(`\n[${name}] Failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const startTime = Date.now();

  console.log('========================================');
  console.log('  REALTY PANDIT AGENT ORCHESTRATOR');
  console.log('========================================');
  console.log(`Command: ${command || '(none)'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  switch (command) {
    case 'status':
      runAgent('Monitor Agent', 'monitor/run.js');
      break;

    case 'scan':
      runAgent('Browser QA Agent', 'browser-qa/run.js', [], { timeout: 600000 });
      break;

    case 'scan:mobile':
      runAgent('Browser QA Agent (Mobile)', 'browser-qa/run.js', ['--mobile'], { timeout: 600000 });
      break;

    case 'scan:full':
      runAgent('Browser QA Agent (Full)', 'browser-qa/run.js', ['--full'], { timeout: 600000 });
      break;

    case 'verify':
      runAgent('Task Verifier', 'browser-qa/task-verify.js', extra.length ? extra : ['--last'], { timeout: 300000 });
      break;

    case 'secure':
      runAgent('Security Agent', 'security/run.js');
      break;

    case 'deploy':
      if (!extra[0]) {
        console.log('Usage: node orchestrator.js deploy <website|backend|frontend|all>');
        break;
      }
      runAgent('Deploy Agent', 'deployment/deploy-agent.js', extra);
      break;

    case 'deploy:dry':
      if (!extra[0]) {
        console.log('Usage: node orchestrator.js deploy:dry <website|backend|frontend|all>');
        break;
      }
      runAgent('Deploy Agent (Dry Run)', 'deployment/deploy-agent.js', [...extra, '--dry-run']);
      break;

    case 'backup':
      runAgent('Backup Agent (Full)', 'backup/run.js', ['full'], { timeout: 600000 });
      break;

    case 'backup:code':
      runAgent('Backup Agent (Code)', 'backup/run.js', ['code']);
      break;

    case 'backup:db':
      runAgent('Backup Agent (DB)', 'backup/run.js', ['db']);
      break;

    case 'backup:list':
      runAgent('Backup Agent (List)', 'backup/run.js', ['list']);
      break;

    case 'backup:download':
      runAgent('Backup Agent (Download)', 'backup/run.js', ['download'], { timeout: 600000 });
      break;

    case 'health': {
      // Quick endpoint check without SSH
      const https = require('https');
      const urls = [
        { name: 'Website', url: 'https://www.realtypandit.in' },
        { name: 'API', url: 'https://api.realtypandit.in' },
        { name: 'Admin', url: 'https://admin.realtypandit.in' }
      ];
      console.log('Quick Health Check:\n');
      for (const u of urls) {
        await new Promise(resolve => {
          const start = Date.now();
          https.get(u.url, { timeout: 10000 }, (res) => {
            const ms = Date.now() - start;
            const ok = res.statusCode < 400;
            console.log(`  ${ok ? 'OK' : 'FAIL'}  ${u.name.padEnd(10)} HTTP ${res.statusCode}  (${ms}ms)`);
            resolve();
          }).on('error', (e) => {
            console.log(`  FAIL  ${u.name.padEnd(10)} ${e.message}`);
            resolve();
          });
        });
      }
      break;
    }

    // === Payment Agent ===
    case 'payment':
      runAgent('Payment Agent', 'payment/run.js', ['status']);
      break;

    case 'payment:plans':
      runAgent('Payment Agent (Plans)', 'payment/run.js', ['plans']);
      break;

    // === Notification Agent ===
    case 'notify':
      runAgent('Notification Agent', 'notification/run.js', ['status']);
      break;

    case 'notify:templates':
      runAgent('Notification Agent (Templates)', 'notification/run.js', ['templates']);
      break;

    // === Meta/Facebook Agent ===
    case 'meta':
      runAgent('Meta Agent', 'meta/run.js', ['status']);
      break;

    case 'meta:leads':
      runAgent('Meta Agent (Leads)', 'meta/run.js', ['leads']);
      break;

    // === Instagram Agent ===
    case 'instagram':
      runAgent('Instagram Agent', 'instagram/run.js', ['status']);
      break;

    case 'instagram:post':
      runAgent('Instagram Agent (Post)', 'instagram/run.js', ['post']);
      break;

    // === SEO Agent ===
    case 'seo':
      runAgent('SEO Agent', 'seo/run.js', ['status']);
      break;

    case 'seo:audit':
      runAgent('SEO Agent (Full Audit)', 'seo/run.js', ['audit'], { timeout: 600000 });
      break;

    // === Analytics Agent ===
    case 'analytics':
      runAgent('Analytics Agent', 'analytics/run.js', ['status']);
      break;

    // === Full Audit ===
    case 'all':
      console.log('Running full audit: Monitor + Browser QA + Security\n');
      runAgent('Monitor Agent', 'monitor/run.js');
      runAgent('Browser QA Agent', 'browser-qa/run.js', [], { timeout: 600000 });
      runAgent('Security Agent', 'security/run.js');
      break;

    default:
      console.log(`
AVAILABLE COMMANDS:

  Status & Monitoring:
    status              Check server health, PM2, disk, memory
    health              Quick endpoint health check (no SSH)

  Browser Testing:
    scan                Crawl site, find UI bugs (desktop)
    scan:mobile         Test mobile viewport
    scan:full           Test all viewports
    verify              Run last task verification checks
    verify --task=file  Run specific task checks from JSON file

  Security:
    secure              Run security headers & vulnerability scan

  Deployment:
    deploy <component>  Deploy website|backend|frontend|all
    deploy:dry <comp>   Dry-run (shows what would happen)

  Backup:
    backup              Full backup (code + database)
    backup:code         Code-only backup
    backup:db           Database backup only
    backup:list         List backups on server
    backup:download     Download latest backup

  Payment:
    payment             Check Razorpay integration status
    payment:plans       Show subscription plan pricing

  Notifications:
    notify              Check notification channels
    notify:templates    List notification templates

  Social & Marketing:
    meta                Check Facebook/Meta integration
    meta:leads          Fetch Facebook Lead Ads
    instagram           Check Instagram integration
    instagram:post      Auto-post property to Instagram

  SEO:
    seo                 Run SEO health check
    seo:audit           Full SEO audit of all pages

  Analytics:
    analytics           Show analytics overview

  Full Audit:
    all                 Run status + scan + secure
`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nTotal time: ${duration}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
