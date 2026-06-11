const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const args = process.argv.slice(2);
const isMobile = args.includes('--mobile');
const isFull = args.includes('--full');
const customUrl = args.find(a => a.startsWith('--url='))?.split('=')[1];

class BrowserQAAgent {
  constructor() {
    this.issues = [];
    this.consoleErrors = [];
    this.networkErrors = [];
    this.screenshots = [];
    this.performanceData = [];
    this.pageResults = [];
    this.startTime = Date.now();
  }

  log(msg) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${msg}`);
  }

  addIssue(page, type, severity, message, details = {}) {
    this.issues.push({
      page,
      type,
      severity, // critical, warning, info
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  async run() {
    this.log('Browser QA Agent starting...');

    // Ensure directories exist
    fs.mkdirSync(config.screenshotDir, { recursive: true });
    fs.mkdirSync(config.reportDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    const viewports = isMobile
      ? [{ name: 'mobile', ...config.viewport.mobile }]
      : isFull
        ? [
            { name: 'desktop', ...config.viewport.desktop },
            { name: 'tablet', ...config.viewport.tablet },
            { name: 'mobile', ...config.viewport.mobile }
          ]
        : [{ name: 'desktop', ...config.viewport.desktop }];

    for (const viewport of viewports) {
      this.log(`\n--- Testing ${viewport.name} (${viewport.width}x${viewport.height}) ---`);

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        userAgent: viewport.name === 'mobile'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
          : undefined
      });

      const page = await context.newPage();

      // Collect console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          this.consoleErrors.push({
            url: page.url(),
            text: msg.text(),
            viewport: viewport.name
          });
        }
      });

      // Collect network errors
      page.on('requestfailed', request => {
        this.networkErrors.push({
          url: request.url(),
          failure: request.failure()?.errorText || 'Unknown',
          resourceType: request.resourceType(),
          pageUrl: page.url(),
          viewport: viewport.name
        });
      });

      if (customUrl) {
        await this.testPage(page, { name: 'Custom', path: customUrl }, viewport);
      } else {
        // First, discover actual pages from the site
        const pages = await this.discoverPages(page, config.pages);
        for (const pageConfig of pages) {
          await this.testPage(page, pageConfig, viewport);
        }
      }

      // Check API health
      if (viewport.name === 'desktop') {
        await this.checkApiHealth(page);
      }

      await context.close();
    }

    await browser.close();

    // Generate report
    const report = this.generateReport();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(config.reportDir, `qa-report-${timestamp}.json`);
    const summaryPath = path.join(config.reportDir, `qa-summary-${timestamp}.md`);
    const latestPath = path.join(config.reportDir, 'latest-report.json');
    const latestSummaryPath = path.join(config.reportDir, 'latest-summary.md');

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

    const summary = this.generateMarkdownSummary(report);
    fs.writeFileSync(summaryPath, summary);
    fs.writeFileSync(latestSummaryPath, summary);

    this.log(`\nReport saved to: ${reportPath}`);
    this.log(`Summary saved to: ${summaryPath}`);

    // Print summary to console
    console.log('\n' + '='.repeat(60));
    console.log(summary);

    return report;
  }

  async discoverPages(page, configuredPages) {
    const pages = [...configuredPages];

    try {
      await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });

      // Find all internal links
      const links = await page.evaluate((baseUrl) => {
        const anchors = document.querySelectorAll('a[href]');
        const paths = new Set();
        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (href && (href.startsWith('/') || href.startsWith(baseUrl))) {
            const path = href.replace(baseUrl, '').split('?')[0].split('#')[0];
            if (path && path !== '/' && !path.startsWith('http') && !path.startsWith('mailto')) {
              paths.add(path);
            }
          }
        });
        return [...paths];
      }, config.baseUrl);

      // Add discovered pages that aren't in config
      const configPaths = configuredPages.map(p => p.path);
      for (const link of links) {
        if (!configPaths.some(cp => cp === link || (cp.includes('*') && link.startsWith(cp.replace('/*', ''))))) {
          pages.push({ name: `Discovered: ${link}`, path: link, critical: false, discovered: true });
        }
      }

      this.log(`Discovered ${links.length} internal links, testing ${pages.length} total pages`);
    } catch (e) {
      this.addIssue('Discovery', 'navigation', 'critical', `Failed to load homepage for discovery: ${e.message}`);
    }

    return pages.filter(p => !p.path.includes('*'));
  }

  async testPage(page, pageConfig, viewport) {
    const url = pageConfig.path.startsWith('http')
      ? pageConfig.path
      : `${config.baseUrl}${pageConfig.path}`;

    this.log(`Testing: ${pageConfig.name} (${url}) [${viewport.name}]`);

    const pageResult = {
      name: pageConfig.name,
      url,
      viewport: viewport.name,
      status: 'ok',
      loadTime: 0,
      checks: {}
    };

    try {
      const startNav = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.timeout
      });
      pageResult.loadTime = Date.now() - startNav;

      // Check HTTP status
      const status = response?.status();
      if (status >= 400) {
        this.addIssue(pageConfig.name, 'http', 'critical', `HTTP ${status} error`, { url, status, viewport: viewport.name });
        pageResult.status = 'error';
        pageResult.httpStatus = status;
      }

      // Wait for content to render
      await page.waitForTimeout(1000);

      // Run all checks
      if (config.checks.consoleErrors) {
        pageResult.checks.consoleErrors = this.consoleErrors.filter(e => e.url === url).length;
      }

      if (config.checks.brokenImages) {
        await this.checkBrokenImages(page, pageConfig.name, viewport.name);
      }

      if (config.checks.layoutOverflow) {
        await this.checkLayoutOverflow(page, pageConfig.name, viewport.name);
      }

      if (config.checks.seoBasics) {
        await this.checkSEO(page, pageConfig.name);
      }

      if (config.checks.performanceMetrics) {
        await this.checkPerformance(page, pageConfig.name, viewport.name);
      }

      if (config.checks.accessibility) {
        await this.checkAccessibility(page, pageConfig.name, viewport.name);
      }

      // Check for blank/empty page
      await this.checkBlankPage(page, pageConfig.name, viewport.name);

      // Take screenshot
      const screenshotName = `${pageConfig.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${viewport.name}.png`;
      const screenshotPath = path.join(config.screenshotDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this.screenshots.push({ page: pageConfig.name, viewport: viewport.name, path: screenshotPath });

    } catch (e) {
      this.addIssue(pageConfig.name, 'navigation', 'critical', `Page failed to load: ${e.message}`, { url, viewport: viewport.name });
      pageResult.status = 'failed';
    }

    this.pageResults.push(pageResult);
  }

  async checkBrokenImages(page, pageName, viewportName) {
    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const broken = [];
      images.forEach(img => {
        if (!img.complete || img.naturalWidth === 0) {
          broken.push({ src: img.src, alt: img.alt || '(no alt)' });
        }
      });
      return broken;
    });

    for (const img of brokenImages) {
      this.addIssue(pageName, 'broken-image', 'warning', `Broken image: ${img.src}`, { alt: img.alt, viewport: viewportName });
    }
  }

  async checkLayoutOverflow(page, pageName, viewportName) {
    const overflows = await page.evaluate(() => {
      const issues = [];
      const viewportWidth = window.innerWidth;

      // Check for horizontal scroll
      if (document.documentElement.scrollWidth > viewportWidth + 5) {
        issues.push({
          type: 'horizontal-scroll',
          message: `Page has horizontal scroll (content: ${document.documentElement.scrollWidth}px, viewport: ${viewportWidth}px)`
        });
      }

      // Check for elements overflowing viewport
      const allElements = document.querySelectorAll('*');
      const overflowing = [];
      allElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 5 && rect.width > 0) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className?.toString().slice(0, 50) || '';
          const id = el.id || '';
          overflowing.push(`${tag}${id ? '#'+id : ''}${cls ? '.'+cls.split(' ')[0] : ''}`);
        }
      });

      if (overflowing.length > 0) {
        issues.push({
          type: 'element-overflow',
          message: `${overflowing.length} elements overflow viewport`,
          elements: overflowing.slice(0, 10)
        });
      }

      return issues;
    });

    for (const overflow of overflows) {
      this.addIssue(pageName, 'layout', 'warning', overflow.message, { ...overflow, viewport: viewportName });
    }
  }

  async checkSEO(page, pageName) {
    const seo = await page.evaluate(() => {
      const issues = [];

      const title = document.title;
      if (!title || title.trim() === '') issues.push('Missing page title');
      else if (title.length > 60) issues.push(`Title too long (${title.length} chars)`);

      const metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc || !metaDesc.content) issues.push('Missing meta description');

      const h1s = document.querySelectorAll('h1');
      if (h1s.length === 0) issues.push('Missing H1 tag');
      else if (h1s.length > 1) issues.push(`Multiple H1 tags (${h1s.length})`);

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (!ogTitle) issues.push('Missing og:title');

      const canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) issues.push('Missing canonical URL');

      const viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) issues.push('Missing viewport meta tag');

      return issues;
    });

    for (const issue of seo) {
      this.addIssue(pageName, 'seo', 'info', issue);
    }
  }

  async checkPerformance(page, pageName, viewportName) {
    const perf = await page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0];
      if (!timing) return null;
      return {
        domContentLoaded: Math.round(timing.domContentLoadedEventEnd - timing.startTime),
        fullLoad: Math.round(timing.loadEventEnd - timing.startTime),
        firstByte: Math.round(timing.responseStart - timing.startTime),
        domInteractive: Math.round(timing.domInteractive - timing.startTime)
      };
    });

    if (perf) {
      this.performanceData.push({ page: pageName, viewport: viewportName, ...perf });

      if (perf.fullLoad > 5000) {
        this.addIssue(pageName, 'performance', 'warning', `Slow page load: ${perf.fullLoad}ms`, { ...perf, viewport: viewportName });
      }
      if (perf.firstByte > 2000) {
        this.addIssue(pageName, 'performance', 'warning', `Slow server response (TTFB): ${perf.firstByte}ms`, { viewport: viewportName });
      }
    }
  }

  async checkAccessibility(page, pageName, viewportName) {
    const a11y = await page.evaluate(() => {
      const issues = [];

      // Images without alt
      const imgs = document.querySelectorAll('img:not([alt])');
      if (imgs.length) issues.push(`${imgs.length} images missing alt attribute`);

      // Buttons without text
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        if (!btn.textContent?.trim() && !btn.getAttribute('aria-label')) {
          issues.push('Button without text or aria-label');
        }
      });

      // Links without text
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        if (!link.textContent?.trim() && !link.getAttribute('aria-label') && !link.querySelector('img')) {
          issues.push(`Empty link: ${link.href}`);
        }
      });

      // Form inputs without labels
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      inputs.forEach(input => {
        const id = input.id;
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        const hasAriaLabel = input.getAttribute('aria-label');
        if (!hasLabel && !hasAriaLabel) {
          issues.push(`Form input without label: ${input.type || 'text'}`);
        }
      });

      return issues;
    });

    for (const issue of a11y) {
      this.addIssue(pageName, 'accessibility', 'info', issue, { viewport: viewportName });
    }
  }

  async checkBlankPage(page, pageName, viewportName) {
    const isBlank = await page.evaluate(() => {
      const body = document.body;
      if (!body) return true;
      const text = body.innerText?.trim();
      const children = body.children.length;
      return (!text || text.length < 10) && children < 3;
    });

    if (isBlank) {
      this.addIssue(pageName, 'content', 'critical', 'Page appears blank or has no content', { viewport: viewportName });
    }
  }

  async checkApiHealth(page) {
    this.log('\n--- Checking API Health ---');

    const endpoints = [
      { name: 'API Root', url: `${config.apiUrl}/` },
      { name: 'API Health', url: `${config.apiUrl}/health` },
      { name: 'API Properties (public)', url: `${config.apiUrl}/public/properties` }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(endpoint.url, { timeout: 10000 });
        const status = response.status();
        this.log(`  ${endpoint.name}: HTTP ${status}`);

        if (status >= 400) {
          this.addIssue('API', 'api-health', 'critical', `${endpoint.name} returned HTTP ${status}`, { url: endpoint.url });
        }
      } catch (e) {
        this.addIssue('API', 'api-health', 'critical', `${endpoint.name} unreachable: ${e.message}`, { url: endpoint.url });
      }
    }
  }

  generateReport() {
    const critical = this.issues.filter(i => i.severity === 'critical');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const info = this.issues.filter(i => i.severity === 'info');

    return {
      timestamp: new Date().toISOString(),
      duration: `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`,
      summary: {
        totalIssues: this.issues.length,
        critical: critical.length,
        warnings: warnings.length,
        info: info.length,
        pagesChecked: this.pageResults.length,
        screenshotsTaken: this.screenshots.length
      },
      issues: this.issues,
      consoleErrors: this.consoleErrors,
      networkErrors: this.networkErrors,
      performance: this.performanceData,
      pages: this.pageResults,
      screenshots: this.screenshots
    };
  }

  generateMarkdownSummary(report) {
    let md = `# Browser QA Report - Realty Pandit\n`;
    md += `**Date:** ${report.timestamp}\n`;
    md += `**Duration:** ${report.duration}\n\n`;

    md += `## Summary\n`;
    md += `| Metric | Count |\n|--------|-------|\n`;
    md += `| Pages Checked | ${report.summary.pagesChecked} |\n`;
    md += `| Critical Issues | ${report.summary.critical} |\n`;
    md += `| Warnings | ${report.summary.warnings} |\n`;
    md += `| Info | ${report.summary.info} |\n`;
    md += `| Screenshots | ${report.summary.screenshotsTaken} |\n\n`;

    if (report.summary.critical === 0 && report.summary.warnings === 0) {
      md += `## ALL CHECKS PASSED\n\n`;
    }

    if (report.issues.filter(i => i.severity === 'critical').length > 0) {
      md += `## CRITICAL Issues\n`;
      for (const issue of report.issues.filter(i => i.severity === 'critical')) {
        md += `- **[${issue.page}]** ${issue.message}\n`;
        if (issue.details?.url) md += `  - URL: ${issue.details.url}\n`;
      }
      md += `\n`;
    }

    if (report.issues.filter(i => i.severity === 'warning').length > 0) {
      md += `## Warnings\n`;
      for (const issue of report.issues.filter(i => i.severity === 'warning')) {
        md += `- **[${issue.page}]** ${issue.type}: ${issue.message}\n`;
      }
      md += `\n`;
    }

    if (report.consoleErrors.length > 0) {
      md += `## Console Errors\n`;
      for (const err of report.consoleErrors.slice(0, 20)) {
        md += `- **${err.url}** [${err.viewport}]: ${err.text.slice(0, 200)}\n`;
      }
      md += `\n`;
    }

    if (report.networkErrors.length > 0) {
      md += `## Network Errors\n`;
      for (const err of report.networkErrors.slice(0, 20)) {
        md += `- **${err.resourceType}** ${err.url.slice(0, 100)} - ${err.failure}\n`;
      }
      md += `\n`;
    }

    if (report.performance.length > 0) {
      md += `## Performance\n`;
      md += `| Page | Viewport | TTFB | DOM Ready | Full Load |\n`;
      md += `|------|----------|------|-----------|----------|\n`;
      for (const p of report.performance) {
        md += `| ${p.page} | ${p.viewport} | ${p.firstByte}ms | ${p.domContentLoaded}ms | ${p.fullLoad}ms |\n`;
      }
      md += `\n`;
    }

    if (report.issues.filter(i => i.severity === 'info').length > 0) {
      md += `## Info / Suggestions\n`;
      for (const issue of report.issues.filter(i => i.severity === 'info')) {
        md += `- **[${issue.page}]** ${issue.type}: ${issue.message}\n`;
      }
      md += `\n`;
    }

    md += `## Screenshots\n`;
    for (const ss of report.screenshots) {
      md += `- ${ss.page} (${ss.viewport}): \`${ss.path}\`\n`;
    }

    return md;
  }
}

// Run
const agent = new BrowserQAAgent();
agent.run().catch(e => {
  console.error('Browser QA Agent failed:', e);
  process.exit(1);
});
