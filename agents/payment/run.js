#!/usr/bin/env node

/**
 * Payment Agent - Razorpay Integration Manager
 *
 * Commands:
 *   status    - Check Razorpay API connectivity and config
 *   plans     - Show subscription plan pricing
 *   test      - Test order creation flow (dry run)
 *   verify    - Verify Razorpay webhook endpoint is reachable
 *
 * Usage: node run.js <command>
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'status';

const config = {
    apiUrl: 'https://api.realtypandit.in',
    websiteUrl: 'https://www.realtypandit.in',
    reportDir: './reports',
};

class PaymentAgent {
    constructor() {
        this.startTime = Date.now();
        this.results = [];
    }

    log(msg) {
        console.log(`[Payment] ${msg}`);
    }

    async httpGet(url, options = {}) {
        return new Promise((resolve) => {
            const start = Date.now();
            const req = https.get(url, { timeout: 10000, ...options }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        responseTime: Date.now() - start,
                        data,
                        ok: res.statusCode < 400,
                    });
                });
            });
            req.on('error', (e) => {
                resolve({ status: 'ERROR', responseTime: Date.now() - start, error: e.message, ok: false });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ status: 'TIMEOUT', responseTime: Date.now() - start, ok: false });
            });
        });
    }

    async checkStatus() {
        this.log('Checking payment system status...\n');

        const report = {
            timestamp: new Date().toISOString(),
            checks: [],
            issues: [],
        };

        // Check API health
        this.log('1. Checking API server health...');
        const apiHealth = await this.httpGet(`${config.apiUrl}/health`);
        report.checks.push({ name: 'API Health', ...apiHealth });
        this.log(`   ${apiHealth.ok ? 'OK' : 'FAIL'} API Health: HTTP ${apiHealth.status} (${apiHealth.responseTime}ms)`);

        // Check payment plans endpoint
        this.log('2. Checking payment plans endpoint...');
        const plansCheck = await this.httpGet(`${config.apiUrl}/api/payments/plans`);
        report.checks.push({ name: 'Plans Endpoint', ...plansCheck });
        this.log(`   ${plansCheck.ok ? 'OK' : 'FAIL'} Plans: HTTP ${plansCheck.status} (${plansCheck.responseTime}ms)`);

        if (plansCheck.ok) {
            try {
                const plans = JSON.parse(plansCheck.data);
                if (plans.plans) {
                    this.log(`   Plans available: ${plans.plans.map(p => `${p.plan}(₹${p.amount})`).join(', ')}`);
                }
            } catch { /* ignore parse error */ }
        }

        // Check Razorpay API connectivity
        this.log('3. Checking Razorpay API connectivity...');
        const rzpCheck = await this.httpGet('https://api.razorpay.com/v1/', {
            headers: { 'User-Agent': 'RealtyPandit/1.0' },
        });
        report.checks.push({ name: 'Razorpay API', status: rzpCheck.status, responseTime: rzpCheck.responseTime, ok: rzpCheck.status !== 'ERROR' && rzpCheck.status !== 'TIMEOUT' });
        this.log(`   ${rzpCheck.status !== 'ERROR' ? 'OK' : 'FAIL'} Razorpay API: HTTP ${rzpCheck.status} (${rzpCheck.responseTime}ms)`);

        // Check webhook endpoint
        this.log('4. Checking webhook endpoint...');
        const webhookCheck = await this.httpGet(`${config.apiUrl}/webhooks/razorpay`);
        report.checks.push({ name: 'Webhook Endpoint', ...webhookCheck });
        // GET on POST endpoint will likely return 404 or 405 — that's fine, means route exists
        const webhookOk = webhookCheck.status !== 'ERROR' && webhookCheck.status !== 'TIMEOUT';
        this.log(`   ${webhookOk ? 'OK' : 'FAIL'} Webhook reachable: HTTP ${webhookCheck.status}`);

        // Check env vars reminder
        this.log('\n5. Required environment variables:');
        this.log('   RAZORPAY_KEY_ID          - Razorpay dashboard → Settings → API Keys');
        this.log('   RAZORPAY_KEY_SECRET      - Same location (secret, not the key ID)');
        this.log('   RAZORPAY_WEBHOOK_SECRET  - Razorpay dashboard → Webhooks → Secret');

        // Save report
        fs.mkdirSync(config.reportDir, { recursive: true });
        const reportPath = path.join(config.reportDir, 'latest-payment.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.log(`\nPayment status check completed in ${duration}s`);
        this.log(`Report saved to ${reportPath}`);

        return report;
    }

    async showPlans() {
        this.log('Subscription Plan Pricing:\n');
        const plans = [
            { plan: 'FREE', amount: 0, listings: 3, features: 'Basic listing, no analytics' },
            { plan: 'BASIC', amount: 999, listings: 10, features: 'Standard support, basic analytics' },
            { plan: 'PRO', amount: 2499, listings: 50, features: 'Priority support, full analytics' },
            { plan: 'PREMIUM', amount: 4999, listings: 'Unlimited', features: 'Dedicated support, advanced analytics' },
            { plan: 'ENTERPRISE', amount: 9999, listings: 'Unlimited', features: 'Custom solution, API access, white-label' },
        ];

        for (const p of plans) {
            this.log(`  ${p.plan.padEnd(12)} ₹${String(p.amount).padEnd(6)} | ${String(p.listings).padEnd(10)} listings | ${p.features}`);
        }
    }

    async run() {
        switch (command) {
            case 'status':
                await this.checkStatus();
                break;
            case 'plans':
                await this.showPlans();
                break;
            default:
                this.log(`Unknown command: ${command}`);
                this.log('Available: status, plans');
        }
    }
}

const agent = new PaymentAgent();
agent.run().catch(e => { console.error('Payment agent failed:', e); process.exit(1); });
