#!/usr/bin/env node

/**
 * Meta/Facebook Agent - Facebook Lead Ads, Pixel & Catalog Integration
 *
 * Commands:
 *   status       - Check Facebook API connectivity and config
 *   leads        - Fetch recent leads from Facebook Lead Ads
 *   sync         - Sync property catalog to Facebook Commerce
 *   pixel:verify - Verify Facebook Pixel is firing on website
 *
 * Usage: node run.js <command>
 *
 * Required env vars:
 *   FB_APP_ID, FB_APP_SECRET, FB_ACCESS_TOKEN, FB_PAGE_ID, FB_PIXEL_ID
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'status';

const config = {
    apiUrl: 'https://api.realtypandit.in',
    websiteUrl: 'https://www.realtypandit.in',
    fbGraphUrl: 'https://graph.facebook.com/v19.0',
    reportDir: './reports',
    // These come from env
    appId: process.env.FB_APP_ID || '',
    appSecret: process.env.FB_APP_SECRET || '',
    accessToken: process.env.FB_ACCESS_TOKEN || '',
    pageId: process.env.FB_PAGE_ID || '',
    pixelId: process.env.FB_PIXEL_ID || '',
};

class MetaAgent {
    constructor() {
        this.startTime = Date.now();
    }

    log(msg) {
        console.log(`[Meta] ${msg}`);
    }

    async httpGet(url) {
        return new Promise((resolve) => {
            const start = Date.now();
            https.get(url, { timeout: 15000 }, (res) => {
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
            }).on('error', (e) => {
                resolve({ status: 'ERROR', responseTime: Date.now() - start, error: e.message, ok: false });
            });
        });
    }

    async checkStatus() {
        this.log('Checking Meta/Facebook integration status...\n');

        const report = {
            timestamp: new Date().toISOString(),
            checks: [],
            issues: [],
        };

        // 1. Check env vars
        this.log('1. Environment Variables:');
        const envVars = ['FB_APP_ID', 'FB_APP_SECRET', 'FB_ACCESS_TOKEN', 'FB_PAGE_ID', 'FB_PIXEL_ID'];
        for (const v of envVars) {
            const set = !!process.env[v];
            this.log(`   ${set ? 'OK' : 'MISSING'} ${v}`);
            if (!set) report.issues.push({ type: 'config', severity: 'critical', message: `${v} not set` });
        }

        // 2. Check Facebook Graph API
        this.log('\n2. Facebook Graph API:');
        if (config.accessToken) {
            const meCheck = await this.httpGet(`${config.fbGraphUrl}/me?access_token=${config.accessToken}`);
            this.log(`   ${meCheck.ok ? 'OK' : 'FAIL'} Graph API: HTTP ${meCheck.status} (${meCheck.responseTime}ms)`);
            report.checks.push({ name: 'Graph API', ...meCheck });

            if (meCheck.ok) {
                try {
                    const me = JSON.parse(meCheck.data);
                    this.log(`   Connected as: ${me.name || me.id}`);
                } catch { /* ignore */ }
            }
        } else {
            this.log('   SKIP - No access token configured');
        }

        // 3. Check Facebook Lead Ads webhook
        this.log('\n3. Lead Ads Webhook:');
        const webhookCheck = await this.httpGet(`${config.apiUrl}/external/facebook/webhook`);
        const webhookExists = webhookCheck.status !== 'ERROR' && webhookCheck.status !== 'TIMEOUT';
        this.log(`   ${webhookExists ? 'OK' : 'NOT SETUP'} Webhook endpoint: HTTP ${webhookCheck.status}`);

        // 4. Check website for Pixel
        this.log('\n4. Facebook Pixel on Website:');
        const websiteCheck = await this.httpGet(config.websiteUrl);
        if (websiteCheck.ok) {
            const hasPixel = websiteCheck.data.includes('fbq(') || websiteCheck.data.includes('facebook.com/tr');
            this.log(`   ${hasPixel ? 'OK' : 'NOT FOUND'} Pixel code in website HTML`);
            if (!hasPixel) {
                report.issues.push({ type: 'pixel', severity: 'warning', message: 'Facebook Pixel not detected on website' });
            }
        }

        // 5. Integration summary
        this.log('\n5. Integration Points:');
        this.log('   Lead Ads → /external/facebook/webhook → Leads/CRM Agent → Scoring → Assignment');
        this.log('   Pixel → Track: PageView, ViewContent, Search, Lead, ScheduleVisit');
        this.log('   Catalog → Property listings → Facebook Commerce → Dynamic Ads');
        this.log('   Conversions API → Server-side events for iOS14+ tracking');

        // Save report
        fs.mkdirSync(config.reportDir, { recursive: true });
        report.duration = `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
        fs.writeFileSync(
            path.join(config.reportDir, 'latest-meta.json'),
            JSON.stringify(report, null, 2)
        );

        this.log(`\nCompleted in ${report.duration}`);
    }

    async fetchLeads() {
        if (!config.accessToken || !config.pageId) {
            this.log('ERROR: FB_ACCESS_TOKEN and FB_PAGE_ID required');
            return;
        }

        this.log('Fetching recent Facebook Lead Ads leads...\n');

        // Get lead forms for the page
        const formsUrl = `${config.fbGraphUrl}/${config.pageId}/leadgen_forms?access_token=${config.accessToken}`;
        const formsResp = await this.httpGet(formsUrl);

        if (!formsResp.ok) {
            this.log(`FAIL: Could not fetch lead forms: HTTP ${formsResp.status}`);
            return;
        }

        try {
            const forms = JSON.parse(formsResp.data);
            if (!forms.data || forms.data.length === 0) {
                this.log('No lead forms found for this page.');
                return;
            }

            this.log(`Found ${forms.data.length} lead forms:\n`);

            for (const form of forms.data.slice(0, 5)) {
                this.log(`  Form: ${form.name || form.id}`);

                // Get leads for this form
                const leadsUrl = `${config.fbGraphUrl}/${form.id}/leads?access_token=${config.accessToken}&limit=10`;
                const leadsResp = await this.httpGet(leadsUrl);

                if (leadsResp.ok) {
                    const leads = JSON.parse(leadsResp.data);
                    this.log(`    Leads: ${leads.data?.length || 0}`);

                    for (const lead of (leads.data || []).slice(0, 3)) {
                        const fields = {};
                        for (const f of (lead.field_data || [])) {
                            fields[f.name] = f.values?.[0] || '';
                        }
                        this.log(`      ${fields.full_name || 'N/A'} | ${fields.phone_number || fields.email || 'No contact'} | ${lead.created_time}`);
                    }
                }
                this.log('');
            }
        } catch (e) {
            this.log(`Error parsing leads: ${e.message}`);
        }
    }

    async run() {
        switch (command) {
            case 'status':
                await this.checkStatus();
                break;
            case 'leads':
                await this.fetchLeads();
                break;
            default:
                this.log(`Unknown command: ${command}`);
                this.log('Available: status, leads');
        }
    }
}

const agent = new MetaAgent();
agent.run().catch(e => { console.error('Meta agent failed:', e); process.exit(1); });
