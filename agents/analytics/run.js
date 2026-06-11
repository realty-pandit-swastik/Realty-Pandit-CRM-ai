#!/usr/bin/env node

/**
 * Analytics Agent - Dashboard Metrics & Performance Monitor
 *
 * Wraps the backend analytics.ts + reports.ts endpoints.
 * Provides quick summaries and conversion tracking.
 *
 * Commands:
 *   status     - Quick overview of key metrics
 *   funnel     - Lead conversion funnel analysis
 *   agents     - Agent performance ranking
 *   sources    - Lead source breakdown with ROI
 *   report     - Generate comprehensive analytics report
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
    reportDir: './reports',
};

class AnalyticsAgent {
    constructor() {
        this.startTime = Date.now();
    }

    log(msg) {
        console.log(`[Analytics] ${msg}`);
    }

    async httpGet(url) {
        return new Promise((resolve) => {
            const start = Date.now();
            https.get(url, { timeout: 15000 }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed = null;
                    try { parsed = JSON.parse(data); } catch { /* ignore */ }
                    resolve({
                        status: res.statusCode,
                        responseTime: Date.now() - start,
                        data: parsed || data,
                        ok: res.statusCode < 400,
                    });
                });
            }).on('error', (e) => {
                resolve({ status: 'ERROR', responseTime: Date.now() - start, error: e.message, ok: false });
            });
        });
    }

    async checkStatus() {
        this.log('Fetching analytics overview...\n');

        const report = {
            timestamp: new Date().toISOString(),
            metrics: {},
            issues: [],
        };

        // 1. API Health
        this.log('1. API Health');
        const health = await this.httpGet(`${config.apiUrl}/health`);
        this.log(`   ${health.ok ? 'OK' : 'FAIL'} HTTP ${health.status} (${health.responseTime}ms)`);

        // 2. Public stats
        this.log('\n2. Platform Stats');
        const stats = await this.httpGet(`${config.apiUrl}/public/stats`);
        if (stats.ok && stats.data) {
            const s = stats.data;
            this.log(`   Properties: ${s.totalProperties || s.properties || 'N/A'}`);
            this.log(`   Agents: ${s.totalAgents || s.agents || 'N/A'}`);
            this.log(`   Cities: ${s.totalCities || s.cities || 'N/A'}`);
            this.log(`   Contacts: ${s.totalContacts || s.contacts || 'N/A'}`);
            report.metrics.publicStats = s;
        } else {
            this.log(`   FAIL: Could not fetch stats (HTTP ${stats.status})`);
        }

        // 3. Analytics endpoints availability
        this.log('\n3. Analytics Endpoints:');
        const endpoints = [
            { name: 'Market Trends', path: '/api/analytics/market-trends' },
            { name: 'User Performance', path: '/api/analytics/user-performance' },
            { name: 'Lead Sources', path: '/api/analytics/lead-sources' },
            { name: 'Property Trends', path: '/api/analytics/property-trends' },
            { name: 'Financial Summary', path: '/api/analytics/financial-summary' },
            { name: 'Advanced Dashboard', path: '/api/analytics/advanced' },
        ];

        for (const ep of endpoints) {
            const resp = await this.httpGet(`${config.apiUrl}${ep.path}`);
            // 401 means endpoint exists but requires auth — that's OK
            const available = resp.status === 401 || resp.ok;
            this.log(`   ${available ? 'OK' : 'FAIL'} ${ep.name.padEnd(20)} HTTP ${resp.status}`);
        }

        // 4. Report endpoints
        this.log('\n4. Report System (8 categories, 26+ endpoints):');
        const reportCategories = [
            'Account Reports (customer outstanding, vendor outstanding, monthly sales)',
            'User Reports (agent performance, task completion)',
            'Call Reports (logs, date-wise, month-wise)',
            'Lead Reports (all leads, last contact, summary, cancelled reasons)',
            'Sold Reports (by property, area, unit type)',
            'Visit Reports (site visits, property visit count)',
            'Customer Reports (converted not sold)',
            'Property Reports (all properties, on hold, availability)',
        ];
        for (const cat of reportCategories) {
            this.log(`   - ${cat}`);
        }

        // 5. Key metrics to track
        this.log('\n5. Key KPIs:');
        this.log('   Lead → Visit conversion rate');
        this.log('   Visit → Deal conversion rate');
        this.log('   Average deal closure time');
        this.log('   Revenue per agent');
        this.log('   Lead source ROI');
        this.log('   Property listing velocity');

        // Save report
        fs.mkdirSync(config.reportDir, { recursive: true });
        report.duration = `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
        fs.writeFileSync(
            path.join(config.reportDir, 'latest-analytics.json'),
            JSON.stringify(report, null, 2)
        );

        this.log(`\nCompleted in ${report.duration}`);
    }

    async run() {
        switch (command) {
            case 'status':
                await this.checkStatus();
                break;
            default:
                this.log(`Unknown command: ${command}`);
                this.log('Available: status');
        }
    }
}

const agent = new AnalyticsAgent();
agent.run().catch(e => { console.error('Analytics agent failed:', e); process.exit(1); });
