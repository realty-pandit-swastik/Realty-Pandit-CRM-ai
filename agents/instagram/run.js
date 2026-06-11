#!/usr/bin/env node

/**
 * Instagram Agent - Property Post Automation & DM Management
 *
 * Commands:
 *   status       - Check Instagram API connectivity
 *   post         - Auto-create property post from latest listings
 *   recent       - Show recent Instagram posts
 *   insights     - Fetch account insights
 *
 * Usage: node run.js <command>
 *
 * Required env vars:
 *   IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID
 *
 * Uses Instagram Graph API (via Meta Business Suite)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'status';

const config = {
    apiUrl: 'https://api.realtypandit.in',
    fbGraphUrl: 'https://graph.facebook.com/v19.0',
    reportDir: './reports',
    accessToken: process.env.IG_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || '',
    accountId: process.env.IG_BUSINESS_ACCOUNT_ID || '',
};

class InstagramAgent {
    constructor() {
        this.startTime = Date.now();
    }

    log(msg) {
        console.log(`[Instagram] ${msg}`);
    }

    async httpRequest(url, method = 'GET', body = null) {
        return new Promise((resolve) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method,
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' },
            };

            const start = Date.now();
            const req = https.request(options, (res) => {
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

            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    async checkStatus() {
        this.log('Checking Instagram integration status...\n');

        const report = {
            timestamp: new Date().toISOString(),
            checks: [],
            issues: [],
        };

        // 1. Check env vars
        this.log('1. Environment Variables:');
        const envVars = [
            ['IG_ACCESS_TOKEN / FB_ACCESS_TOKEN', !!config.accessToken],
            ['IG_BUSINESS_ACCOUNT_ID', !!config.accountId],
        ];
        for (const [name, set] of envVars) {
            this.log(`   ${set ? 'OK' : 'MISSING'} ${name}`);
            if (!set) report.issues.push({ type: 'config', severity: 'critical', message: `${name} not set` });
        }

        // 2. Check Instagram Graph API
        this.log('\n2. Instagram Graph API:');
        if (config.accessToken && config.accountId) {
            const igCheck = await this.httpRequest(
                `${config.fbGraphUrl}/${config.accountId}?fields=name,username,media_count,followers_count&access_token=${config.accessToken}`
            );
            this.log(`   ${igCheck.ok ? 'OK' : 'FAIL'} API: HTTP ${igCheck.status} (${igCheck.responseTime}ms)`);
            report.checks.push({ name: 'Instagram API', ...igCheck });

            if (igCheck.ok) {
                try {
                    const account = JSON.parse(igCheck.data);
                    this.log(`   Account: @${account.username || account.name}`);
                    this.log(`   Posts: ${account.media_count || 0}`);
                    this.log(`   Followers: ${account.followers_count || 0}`);
                } catch { /* ignore */ }
            }
        } else {
            this.log('   SKIP - Credentials not configured');
        }

        // 3. Property API check (for auto-posting content)
        this.log('\n3. Property Content Source:');
        const propsCheck = await this.httpRequest(`${config.apiUrl}/public/properties?limit=1`);
        this.log(`   ${propsCheck.ok ? 'OK' : 'FAIL'} Properties API: HTTP ${propsCheck.status}`);

        // 4. Auto-post workflow
        this.log('\n4. Auto-Post Workflow:');
        this.log('   New Property Listed → Cloudinary Image URL');
        this.log('   → Generate Caption (title, price, location, BHK, link)');
        this.log('   → Instagram Graph API → Create Media Container');
        this.log('   → Publish Container → Post Live');
        this.log('   → Hashtags: #realtypandit #property #realestate #[city]');

        // 5. Content types
        this.log('\n5. Content Types:');
        this.log('   Feed Post  - Single property with hero image');
        this.log('   Carousel   - Multiple property images (up to 10)');
        this.log('   Story      - New listing announcement (24h)');
        this.log('   Reel       - Property walkthrough (future)');

        // Save report
        fs.mkdirSync(config.reportDir, { recursive: true });
        report.duration = `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
        fs.writeFileSync(
            path.join(config.reportDir, 'latest-instagram.json'),
            JSON.stringify(report, null, 2)
        );

        this.log(`\nCompleted in ${report.duration}`);
    }

    /**
     * Auto-create an Instagram post from a property listing
     */
    async createPropertyPost() {
        if (!config.accessToken || !config.accountId) {
            this.log('ERROR: IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID required');
            return;
        }

        this.log('Fetching latest property for Instagram post...\n');

        // Get latest featured property
        const propsResp = await this.httpRequest(`${config.apiUrl}/public/featured-properties?limit=1`);
        if (!propsResp.ok) {
            this.log('FAIL: Could not fetch properties');
            return;
        }

        try {
            const propsData = JSON.parse(propsResp.data);
            const properties = propsData.properties || propsData.data || [];

            if (properties.length === 0) {
                this.log('No properties available for posting');
                return;
            }

            const prop = properties[0];
            const imageUrl = prop.images?.[0]?.url || prop.image_url || prop.thumbnail;

            if (!imageUrl) {
                this.log('FAIL: Property has no image');
                return;
            }

            // Generate caption
            const price = prop.price ? `₹${(prop.price / 100000).toFixed(0)}L` : '';
            const bhk = prop.bhk ? `${prop.bhk} BHK` : '';
            const type = prop.property_type || '';
            const location = prop.locality || prop.city || '';

            const caption = [
                `🏠 ${bhk} ${type} ${prop.intent === 'sell' ? 'for Sale' : 'for Rent'}`,
                price ? `💰 ${price}` : '',
                location ? `📍 ${location}` : '',
                '',
                prop.title || '',
                '',
                `🔗 View: https://www.realtypandit.in/properties/${prop.id}`,
                '',
                '#realtypandit #property #realestate #india',
                location ? `#${location.toLowerCase().replace(/\s+/g, '')}` : '',
                '#investment #home #flat #house',
            ].filter(Boolean).join('\n');

            this.log(`Caption:\n${caption}\n`);
            this.log(`Image: ${imageUrl}`);

            // Step 1: Create media container
            this.log('\nCreating media container...');
            const containerResp = await this.httpRequest(
                `${config.fbGraphUrl}/${config.accountId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${config.accessToken}`,
                'POST'
            );

            if (!containerResp.ok) {
                this.log(`FAIL: Container creation failed: HTTP ${containerResp.status}`);
                this.log(containerResp.data);
                return;
            }

            const container = JSON.parse(containerResp.data);
            this.log(`OK: Container created: ${container.id}`);

            // Step 2: Publish
            this.log('Publishing...');
            const publishResp = await this.httpRequest(
                `${config.fbGraphUrl}/${config.accountId}/media_publish?creation_id=${container.id}&access_token=${config.accessToken}`,
                'POST'
            );

            if (publishResp.ok) {
                const published = JSON.parse(publishResp.data);
                this.log(`OK: Published! Post ID: ${published.id}`);
            } else {
                this.log(`FAIL: Publish failed: HTTP ${publishResp.status}`);
                this.log(publishResp.data);
            }

        } catch (e) {
            this.log(`Error: ${e.message}`);
        }
    }

    async run() {
        switch (command) {
            case 'status':
                await this.checkStatus();
                break;
            case 'post':
                await this.createPropertyPost();
                break;
            default:
                this.log(`Unknown command: ${command}`);
                this.log('Available: status, post');
        }
    }
}

const agent = new InstagramAgent();
agent.run().catch(e => { console.error('Instagram agent failed:', e); process.exit(1); });
