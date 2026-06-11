const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

/**
 * Task Verification Agent
 *
 * Verifies specific tasks/changes are working on the live site.
 *
 * Usage:
 *   node task-verify.js --task="path/to/task.json"
 *   node task-verify.js --task-inline='{"description":"...","checks":[...]}'
 *   node task-verify.js --last   (re-runs the last saved task)
 *
 * Task JSON format:
 * {
 *   "description": "Added contact form on /contact page",
 *   "checks": [
 *     { "type": "element_exists", "page": "/contact", "selector": "form#contact-form", "description": "Contact form exists" },
 *     { "type": "text_visible", "page": "/contact", "text": "Send Message", "description": "Submit button visible" },
 *     { "type": "no_console_errors", "page": "/contact", "description": "No JS errors on contact page" },
 *     { "type": "api_returns", "url": "/api/properties", "status": 200, "description": "Properties API works" },
 *     { "type": "page_loads", "page": "/properties", "max_time": 3000, "description": "Properties loads under 3s" },
 *     { "type": "element_count", "page": "/", "selector": ".property-card", "min": 1, "description": "At least 1 property card on homepage" },
 *     { "type": "element_text", "page": "/about", "selector": "h1", "contains": "About", "description": "H1 contains About" },
 *     { "type": "link_works", "page": "/", "selector": "a.view-properties", "description": "View properties link works" },
 *     { "type": "form_submits", "page": "/contact", "selector": "form", "fields": {"name": "Test", "email": "test@test.com"}, "description": "Form submission works" },
 *     { "type": "responsive", "page": "/", "description": "Homepage has no horizontal scroll on mobile" },
 *     { "type": "image_loads", "page": "/", "selector": "img.hero-image", "description": "Hero image loads" },
 *     { "type": "style_check", "page": "/", "selector": ".hero", "property": "background-color", "not_equals": "rgba(0, 0, 0, 0)", "description": "Hero has background" }
 *   ]
 * }
 */

const args = process.argv.slice(2);

function getTask() {
  const taskFile = args.find(a => a.startsWith('--task='))?.split('=').slice(1).join('=');
  const taskInline = args.find(a => a.startsWith('--task-inline='))?.split('=').slice(1).join('=');
  const useLast = args.includes('--last');

  if (taskInline) {
    return JSON.parse(taskInline);
  }

  if (taskFile) {
    return JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  }

  if (useLast) {
    const lastTaskPath = path.join(__dirname, 'tasks', 'last-task.json');
    if (fs.existsSync(lastTaskPath)) {
      return JSON.parse(fs.readFileSync(lastTaskPath, 'utf8'));
    }
    console.error('No last task found.');
    process.exit(1);
  }

  // Check if piped via stdin
  if (!process.stdin.isTTY) {
    const input = fs.readFileSync(0, 'utf8');
    return JSON.parse(input);
  }

  console.log('Usage:');
  console.log('  node task-verify.js --task="tasks/my-task.json"');
  console.log('  node task-verify.js --task-inline=\'{"description":"...","checks":[...]}\'');
  console.log('  node task-verify.js --last');
  console.log('\nSee task-verify.js header for check types and format.');
  process.exit(1);
}

class TaskVerifier {
  constructor(task) {
    this.task = task;
    this.results = [];
    this.startTime = Date.now();
  }

  log(msg) {
    console.log(`[TaskVerify] ${msg}`);
  }

  async run() {
    this.log(`Verifying task: ${this.task.description}`);
    this.log(`Checks to run: ${this.task.checks.length}\n`);

    // Save as last task
    const tasksDir = path.join(__dirname, 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, 'last-task.json'), JSON.stringify(this.task, null, 2));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Collect console errors per page
    const consoleErrors = {};
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const url = page.url();
        if (!consoleErrors[url]) consoleErrors[url] = [];
        consoleErrors[url].push(msg.text());
      }
    });

    for (let i = 0; i < this.task.checks.length; i++) {
      const check = this.task.checks[i];
      this.log(`[${i + 1}/${this.task.checks.length}] ${check.description || check.type}...`);

      const result = await this.runCheck(page, context, check, consoleErrors);
      this.results.push(result);

      const icon = result.passed ? 'PASS' : 'FAIL';
      this.log(`  ${icon} ${result.message}`);
    }

    // Take final screenshot
    const screenshotDir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'task-verify-final.png'), fullPage: true });

    await browser.close();

    // Generate report
    const report = this.generateReport();
    const reportsDir = path.join(__dirname, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'latest-task-verify.json'), JSON.stringify(report, null, 2));

    // Print summary
    console.log(this.generateSummary(report));

    // Exit with error code if any checks failed
    const failedCount = this.results.filter(r => !r.passed).length;
    if (failedCount > 0) {
      process.exitCode = 1;
    }

    return report;
  }

  async runCheck(page, context, check, consoleErrors) {
    const fullUrl = (p) => p.startsWith('http') ? p : `${config.baseUrl}${p}`;

    try {
      switch (check.type) {

        case 'element_exists': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const el = await page.$(check.selector);
          return { ...check, passed: !!el, message: el ? `Found "${check.selector}"` : `Element "${check.selector}" NOT found on ${check.page}` };
        }

        case 'text_visible': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const visible = await page.evaluate((text) => {
            return document.body.innerText.includes(text);
          }, check.text);
          return { ...check, passed: visible, message: visible ? `Text "${check.text}" found` : `Text "${check.text}" NOT visible on ${check.page}` };
        }

        case 'no_console_errors': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          await page.waitForTimeout(2000);
          const url = page.url();
          const errors = consoleErrors[url] || [];
          return { ...check, passed: errors.length === 0, message: errors.length === 0 ? 'No console errors' : `${errors.length} console errors: ${errors.slice(0, 3).join('; ')}`, errors: errors.slice(0, 10) };
        }

        case 'api_returns': {
          const apiUrl = check.url.startsWith('http') ? check.url : `${config.apiUrl}${check.url}`;
          const response = await page.request.get(apiUrl, { timeout: 10000 });
          const status = response.status();
          const expectedStatus = check.status || 200;
          return { ...check, passed: status === expectedStatus, message: `API ${check.url}: HTTP ${status} (expected ${expectedStatus})` };
        }

        case 'page_loads': {
          const start = Date.now();
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const loadTime = Date.now() - start;
          const maxTime = check.max_time || 5000;
          return { ...check, passed: loadTime <= maxTime, message: `${check.page} loaded in ${loadTime}ms (max: ${maxTime}ms)`, loadTime };
        }

        case 'element_count': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const count = await page.$$eval(check.selector, els => els.length);
          const min = check.min || 1;
          const max = check.max || Infinity;
          const passed = count >= min && count <= max;
          return { ...check, passed, message: `Found ${count} "${check.selector}" (expected min:${min}${max < Infinity ? ' max:'+max : ''})`, count };
        }

        case 'element_text': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const el = await page.$(check.selector);
          if (!el) return { ...check, passed: false, message: `Element "${check.selector}" not found` };
          const text = await el.textContent();
          const passed = check.contains ? text.includes(check.contains) : check.equals ? text.trim() === check.equals : false;
          return { ...check, passed, message: passed ? `"${check.selector}" text matches` : `"${check.selector}" text is "${text.slice(0, 100)}" — expected to contain "${check.contains || check.equals}"`, actualText: text.slice(0, 200) };
        }

        case 'link_works': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const link = await page.$(check.selector);
          if (!link) return { ...check, passed: false, message: `Link "${check.selector}" not found` };
          const href = await link.getAttribute('href');
          await link.click();
          await page.waitForLoadState('networkidle');
          const newUrl = page.url();
          const navigated = newUrl !== fullUrl(check.page);
          return { ...check, passed: navigated, message: navigated ? `Link navigated to ${newUrl}` : `Link click did not navigate (href: ${href})` };
        }

        case 'form_submits': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const form = await page.$(check.selector);
          if (!form) return { ...check, passed: false, message: `Form "${check.selector}" not found` };

          // Fill fields
          if (check.fields) {
            for (const [name, value] of Object.entries(check.fields)) {
              const input = await form.$(`[name="${name}"], #${name}, input[placeholder*="${name}" i]`);
              if (input) await input.fill(value);
            }
          }

          // Submit
          const submitBtn = await form.$('button[type="submit"], input[type="submit"], button:last-of-type');
          if (submitBtn) {
            const [response] = await Promise.all([
              page.waitForResponse(r => r.url().includes('api'), { timeout: 10000 }).catch(() => null),
              submitBtn.click()
            ]);
            const passed = response ? response.status() < 400 : true;
            return { ...check, passed, message: response ? `Form submitted, API returned HTTP ${response.status()}` : 'Form submitted (no API call detected)' };
          }
          return { ...check, passed: false, message: 'No submit button found' };
        }

        case 'responsive': {
          const mobilePage = await context.newPage();
          await mobilePage.setViewportSize({ width: 375, height: 812 });
          await mobilePage.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const hasHScroll = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 5);
          await mobilePage.screenshot({ path: path.join(__dirname, 'screenshots', `task-verify-mobile-${check.page.replace(/\//g, '_')}.png`), fullPage: true });
          await mobilePage.close();
          return { ...check, passed: !hasHScroll, message: hasHScroll ? `${check.page} has horizontal scroll on mobile` : `${check.page} is responsive on mobile` };
        }

        case 'image_loads': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const img = await page.$(check.selector);
          if (!img) return { ...check, passed: false, message: `Image "${check.selector}" not found` };
          const loaded = await img.evaluate(el => el.complete && el.naturalWidth > 0);
          return { ...check, passed: loaded, message: loaded ? `Image "${check.selector}" loaded` : `Image "${check.selector}" is broken` };
        }

        case 'style_check': {
          await page.goto(fullUrl(check.page), { waitUntil: 'networkidle', timeout: config.timeout });
          const el = await page.$(check.selector);
          if (!el) return { ...check, passed: false, message: `Element "${check.selector}" not found` };
          const value = await el.evaluate((el, prop) => getComputedStyle(el)[prop], check.property);
          let passed = false;
          if (check.equals) passed = value === check.equals;
          else if (check.not_equals) passed = value !== check.not_equals;
          else if (check.contains) passed = value.includes(check.contains);
          return { ...check, passed, message: `${check.selector} ${check.property}: "${value}"`, actualValue: value };
        }

        default:
          return { ...check, passed: false, message: `Unknown check type: ${check.type}` };
      }
    } catch (e) {
      return { ...check, passed: false, message: `Error: ${e.message}` };
    }
  }

  generateReport() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    return {
      timestamp: new Date().toISOString(),
      duration: `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`,
      task: this.task.description,
      summary: { total: this.results.length, passed, failed },
      allPassed: failed === 0,
      results: this.results
    };
  }

  generateSummary(report) {
    let s = `\n${'='.repeat(50)}\n`;
    s += `TASK VERIFICATION: ${report.task}\n`;
    s += `${'='.repeat(50)}\n\n`;
    s += `Result: ${report.allPassed ? 'ALL CHECKS PASSED' : `${report.summary.failed} CHECKS FAILED`}\n`;
    s += `Total: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed}\n`;
    s += `Duration: ${report.duration}\n\n`;

    for (const r of this.results) {
      s += `  ${r.passed ? 'PASS' : 'FAIL'}  ${r.description || r.type}: ${r.message}\n`;
    }

    if (!report.allPassed) {
      s += `\nFAILED CHECKS:\n`;
      for (const r of this.results.filter(r => !r.passed)) {
        s += `  - ${r.description}: ${r.message}\n`;
      }
    }

    s += `\n${'='.repeat(50)}\n`;
    return s;
  }
}

const task = getTask();
const verifier = new TaskVerifier(task);
verifier.run().catch(e => { console.error('Task verification failed:', e); process.exit(1); });
