#!/usr/bin/env node

/**
 * SEO Agent - Sitemap, Meta Tags, JSON-LD & Indexing Manager
 *
 * Commands:
 *   status     - Check SEO health (meta tags, sitemap, robots.txt, JSON-LD)
 *   audit      - Full SEO audit of all public pages
 *   sitemap    - Verify/generate sitemap.xml status
 *   pages      - Check SEO for specific pages
 *
 * Usage: node run.js <command>
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0] || 'status';

const config = {
    websiteUrl: 'https://www.realtypandit.in',
    apiUrl: 'https://api.realtypandit.in',
    reportDir: './reports',
    publicPages: [
        '/',
        '/properties',
        '/about',
        '/contact',
        '/services',
        '/faq',
        '/blog',
        '/tools/emi-calculator',
        '/tools/area-converter',
        '/post-property',
        '/join',
        '/privacy',
        '/terms',
    ],
};

class SEOAgent {
    constructor() {
        this.startTime = Date.now();
        this.results = [];
    }

    log(msg) {
        console.log(`[SEO] ${msg}`);
    }

    async httpGet(url) {
        return new Promise((resolve) => {
            const start = Date.now();
            https.get(url, { timeout: 15000, headers: { 'User-Agent': 'RealtyPanditSEOBot/1.0' } }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        responseTime: Date.now() - start,
                        data,
                        ok: res.statusCode < 400,
                        headers: res.headers,
                    });
                });
            }).on('error', (e) => {
                resolve({ status: 'ERROR', responseTime: Date.now() - start, error: e.message, ok: false, data: '' });
            });
        });
    }

    extractMeta(html) {
        const meta = {};

        // Title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        meta.title = titleMatch ? titleMatch[1].trim() : null;
        meta.titleLength = meta.title?.length || 0;

        // Meta description
        const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/is)
            || html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["']/is);
        meta.description = descMatch ? descMatch[1].trim() : null;
        meta.descriptionLength = meta.description?.length || 0;

        // OG tags
        meta.ogTitle = (html.match(/property=["']og:title["']\s+content=["'](.*?)["']/is) || [])[1] || null;
        meta.ogDescription = (html.match(/property=["']og:description["']\s+content=["'](.*?)["']/is) || [])[1] || null;
        meta.ogImage = (html.match(/property=["']og:image["']\s+content=["'](.*?)["']/is) || [])[1] || null;

        // Canonical
        meta.canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/is) || [])[1] || null;

        // JSON-LD
        const jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
        meta.jsonLdCount = jsonLdMatches?.length || 0;

        // H1
        const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
        meta.h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : null;

        // Robots
        const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["'](.*?)["']/is);
        meta.robots = robotsMatch ? robotsMatch[1] : null;

        return meta;
    }

    async checkStatus() {
        this.log('Running SEO health check...\n');

        const report = {
            timestamp: new Date().toISOString(),
            checks: [],
            issues: [],
        };

        // 1. Check robots.txt
        this.log('1. robots.txt');
        const robotsResp = await this.httpGet(`${config.websiteUrl}/robots.txt`);
        this.log(`   ${robotsResp.ok ? 'OK' : 'MISSING'} HTTP ${robotsResp.status} (${robotsResp.responseTime}ms)`);
        if (robotsResp.ok) {
            const hasSitemap = robotsResp.data.toLowerCase().includes('sitemap');
            this.log(`   ${hasSitemap ? 'OK' : 'MISSING'} Sitemap reference in robots.txt`);
            if (!hasSitemap) report.issues.push({ severity: 'warning', message: 'robots.txt missing Sitemap directive' });
        } else {
            report.issues.push({ severity: 'critical', message: 'robots.txt not found' });
        }
        report.checks.push({ name: 'robots.txt', status: robotsResp.status, ok: robotsResp.ok });

        // 2. Check sitemap.xml
        this.log('\n2. sitemap.xml');
        const sitemapResp = await this.httpGet(`${config.websiteUrl}/sitemap.xml`);
        this.log(`   ${sitemapResp.ok ? 'OK' : 'MISSING'} HTTP ${sitemapResp.status} (${sitemapResp.responseTime}ms)`);
        if (sitemapResp.ok) {
            const urlCount = (sitemapResp.data.match(/<url>/g) || []).length;
            const locCount = (sitemapResp.data.match(/<loc>/g) || []).length;
            this.log(`   URLs in sitemap: ${urlCount || locCount}`);
        } else {
            report.issues.push({ severity: 'critical', message: 'sitemap.xml not found — must be generated by Next.js' });
        }
        report.checks.push({ name: 'sitemap.xml', status: sitemapResp.status, ok: sitemapResp.ok });

        // 3. Check homepage SEO
        this.log('\n3. Homepage SEO:');
        const homeResp = await this.httpGet(config.websiteUrl);
        if (homeResp.ok) {
            const meta = this.extractMeta(homeResp.data);

            this.log(`   Title: ${meta.title || 'MISSING'} (${meta.titleLength} chars)`);
            if (!meta.title) report.issues.push({ severity: 'critical', message: 'Homepage missing <title>' });
            else if (meta.titleLength > 60) report.issues.push({ severity: 'warning', message: `Title too long: ${meta.titleLength} chars (max 60)` });

            this.log(`   Description: ${meta.description ? meta.description.slice(0, 60) + '...' : 'MISSING'} (${meta.descriptionLength} chars)`);
            if (!meta.description) report.issues.push({ severity: 'critical', message: 'Homepage missing meta description' });
            else if (meta.descriptionLength > 160) report.issues.push({ severity: 'warning', message: `Description too long: ${meta.descriptionLength} chars (max 160)` });

            this.log(`   OG Title: ${meta.ogTitle ? 'OK' : 'MISSING'}`);
            this.log(`   OG Image: ${meta.ogImage ? 'OK' : 'MISSING'}`);
            this.log(`   Canonical: ${meta.canonical || 'MISSING'}`);
            this.log(`   JSON-LD: ${meta.jsonLdCount} schema(s)`);
            this.log(`   H1: ${meta.h1 || 'MISSING'}`);
            this.log(`   Robots: ${meta.robots || 'not set (default: index,follow)'}`);

            if (meta.robots && meta.robots.includes('noindex')) {
                report.issues.push({ severity: 'critical', message: 'Homepage has noindex — will NOT appear in Google' });
            }
        }

        // 4. Check key pages
        this.log('\n4. Key Page Load Times:');
        const keyPages = ['/', '/properties', '/about', '/blog', '/contact'];
        for (const page of keyPages) {
            const resp = await this.httpGet(`${config.websiteUrl}${page}`);
            this.log(`   ${resp.ok ? 'OK' : 'FAIL'} ${page.padEnd(15)} HTTP ${resp.status} (${resp.responseTime}ms)`);

            if (resp.responseTime > 3000) {
                report.issues.push({ severity: 'warning', message: `${page} loads slowly: ${resp.responseTime}ms` });
            }
        }

        // 5. SEO recommendations
        this.log('\n5. SEO Checklist:');
        this.log('   [ ] sitemap.xml with all property pages + city/locality pages');
        this.log('   [ ] robots.txt with Sitemap directive');
        this.log('   [ ] JSON-LD RealEstateListing schema on property detail pages');
        this.log('   [ ] JSON-LD Organization schema on homepage');
        this.log('   [ ] OG tags on all public pages (title, description, image)');
        this.log('   [ ] Canonical URLs on all pages');
        this.log('   [ ] City/locality pages: /properties/in/[city]/[locality]');
        this.log('   [ ] Dynamic meta for property pages: "[BHK] [Type] in [Location] | Realty Pandit"');

        // Save report
        fs.mkdirSync(config.reportDir, { recursive: true });
        report.duration = `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
        fs.writeFileSync(
            path.join(config.reportDir, 'latest-seo.json'),
            JSON.stringify(report, null, 2)
        );

        const critical = report.issues.filter(i => i.severity === 'critical').length;
        const warnings = report.issues.filter(i => i.severity === 'warning').length;
        this.log(`\nSummary: ${critical} critical, ${warnings} warnings`);
        this.log(`Completed in ${report.duration}`);
    }

    async auditAllPages() {
        this.log('Running full SEO audit on all public pages...\n');

        const report = {
            timestamp: new Date().toISOString(),
            pages: [],
            issues: [],
        };

        for (const page of config.publicPages) {
            const url = `${config.websiteUrl}${page}`;
            const resp = await this.httpGet(url);

            const result = {
                path: page,
                status: resp.status,
                responseTime: resp.responseTime,
                ok: resp.ok,
            };

            if (resp.ok) {
                const meta = this.extractMeta(resp.data);
                result.meta = meta;

                const issues = [];
                if (!meta.title) issues.push('Missing title');
                if (!meta.description) issues.push('Missing description');
                if (!meta.ogTitle) issues.push('Missing og:title');
                if (!meta.ogImage) issues.push('Missing og:image');
                if (!meta.canonical) issues.push('Missing canonical');
                if (meta.jsonLdCount === 0) issues.push('No JSON-LD schema');
                if (!meta.h1) issues.push('Missing H1');

                const icon = issues.length === 0 ? 'OK' : `${issues.length} issues`;
                this.log(`${icon.padEnd(12)} ${page.padEnd(30)} Title: ${(meta.title || 'NONE').slice(0, 40)}`);

                if (issues.length > 0) {
                    for (const issue of issues) {
                        this.log(`             └─ ${issue}`);
                        report.issues.push({ page, severity: 'warning', message: issue });
                    }
                }

                result.issues = issues;
            } else {
                this.log(`FAIL         ${page.padEnd(30)} HTTP ${resp.status}`);
                report.issues.push({ page, severity: 'critical', message: `HTTP ${resp.status}` });
            }

            report.pages.push(result);
        }

        fs.mkdirSync(config.reportDir, { recursive: true });
        report.duration = `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
        fs.writeFileSync(
            path.join(config.reportDir, 'latest-seo-audit.json'),
            JSON.stringify(report, null, 2)
        );

        const total = report.pages.length;
        const ok = report.pages.filter(p => p.ok && (!p.issues || p.issues.length === 0)).length;
        this.log(`\nAudited ${total} pages: ${ok} clean, ${total - ok} need fixes`);
        this.log(`Completed in ${report.duration}`);
    }

    async run() {
        switch (command) {
            case 'status':
                await this.checkStatus();
                break;
            case 'audit':
                await this.auditAllPages();
                break;
            default:
                this.log(`Unknown command: ${command}`);
                this.log('Available: status, audit');
        }
    }
}

const agent = new SEOAgent();
agent.run().catch(e => { console.error('SEO agent failed:', e); process.exit(1); });
