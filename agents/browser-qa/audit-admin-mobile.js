const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const ADMIN_URL = config.adminUrl || 'https://admin.realtypandit.in';
const LOGIN_PHONE = '9217151405';
const LOGIN_PASSWORD = 'real3121';
const MOBILE_VIEWPORT = { width: 375, height: 812 };
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'admin-mobile-audit');
const REPORT_DIR = path.join(__dirname, 'reports');

// Bottom nav direct tabs
const BOTTOM_TABS = ['Home', 'Chats', 'Inventory', 'Team'];

// Menu drawer tabs (click Menu first, then these)
const DRAWER_TABS = [
  'Dashboard', 'Calendar', 'Emails', 'Call Log', 'Inventory',
  'Ext. Leads', 'Partner Agents', 'Team',
  'Reports', 'AI Agents', 'Agent Logs', 'Override',
  'Workflows', 'Marketing', 'Tasks', 'Analytics',
  'Deal Pipeline', 'Buyer Lead', 'Property Map', 'Live Status'
];

class AdminMobileAudit {
  constructor() {
    this.issues = [];
    this.screenshots = [];
    this.startTime = Date.now();
    this.tabIndex = 0;
  }

  log(msg) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${msg}`);
  }

  addIssue(tab, severity, category, message, details = '') {
    this.issues.push({ tab, severity, category, message, details });
  }

  async run() {
    this.log('=== Admin Panel Mobile UI/UX Audit ===');
    this.log(`Target: ${ADMIN_URL}`);
    this.log(`Viewport: ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} (iPhone 13/14)`);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Collect console errors per tab
    let currentTab = 'Login';
    const consoleErrorsByTab = {};
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        if (!consoleErrorsByTab[currentTab]) consoleErrorsByTab[currentTab] = [];
        consoleErrorsByTab[currentTab].push(msg.text());
      }
    });

    try {
      // Step 1: Login
      this.log('Logging in...');
      await page.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Fill login form
      const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="number" i], input[placeholder*="9876" i]').first();
      const passwordInput = page.locator('input[type="password"]').first();

      await phoneInput.fill(LOGIN_PHONE);
      await passwordInput.fill(LOGIN_PASSWORD);

      // Click Login button
      await page.locator('button:has-text("Login"), button:has-text("Sign In")').first().click();

      // Wait for navigation away from login
      await page.waitForTimeout(5000);
      await page.waitForLoadState('networkidle').catch(() => {});

      // Verify login succeeded by checking for dashboard content
      const dashboardVisible = await page.locator('text=Dashboard, text=Good, text=afternoon, text=morning').first().isVisible().catch(() => false);
      const stillOnLogin = await page.locator('text=Management Dashboard').isVisible().catch(() => false);

      if (stillOnLogin && !dashboardVisible) {
        this.log('ERROR: Login failed!');
        this.addIssue('Login', 'critical', 'Auth', 'Login failed - cannot proceed with audit');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-login-failed.png'), fullPage: true });
        await browser.close();
        this.generateReport();
        return;
      }

      this.log('Login successful!');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-logged-in.png'), fullPage: true });

      // Step 2: Audit bottom nav tabs first (Home, Chats, Inventory, Team)
      for (const tabLabel of BOTTOM_TABS) {
        this.tabIndex++;
        currentTab = tabLabel;
        this.log(`\n--- [${this.tabIndex}] Bottom Tab: ${tabLabel} ---`);

        try {
          // Click bottom nav tab
          const tabButton = page.locator(`button:has-text("${tabLabel}")`).last();
          await tabButton.click();
          await page.waitForTimeout(2000);
          await page.waitForLoadState('networkidle').catch(() => {});

          await this.auditCurrentView(page, tabLabel);
        } catch (err) {
          this.log(`  ERROR: ${err.message}`);
          this.addIssue(tabLabel, 'critical', 'Navigation', `Could not navigate: ${err.message}`);
        }
      }

      // Step 3: Audit drawer tabs (open Menu, click each item)
      for (const tabLabel of DRAWER_TABS) {
        // Skip tabs we already audited from bottom nav
        if (['Dashboard', 'Inventory', 'Team'].includes(tabLabel) &&
            this.screenshots.some(s => s.tab === tabLabel)) continue;

        this.tabIndex++;
        currentTab = tabLabel;
        this.log(`\n--- [${this.tabIndex}] Drawer Tab: ${tabLabel} ---`);

        try {
          // Open the Menu drawer - click the last bottom nav button (☰ Menu)
          const menuButton = page.locator('button:has-text("Menu")').last();
          await menuButton.click();
          await page.waitForTimeout(800);

          // Take screenshot of menu drawer
          if (this.tabIndex === BOTTOM_TABS.length + 1) {
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-menu-drawer.png'), fullPage: false });
            this.screenshots.push({ tab: 'Menu Drawer', path: '05-menu-drawer.png' });
          }

          // Click the nav item in the drawer
          const navItem = page.locator(`nav button:has-text("${tabLabel}")`).first();
          const navItemVisible = await navItem.isVisible().catch(() => false);

          if (navItemVisible) {
            await navItem.click();
          } else {
            // Try scrolling in the drawer nav
            const drawerNav = page.locator('nav').first();
            await drawerNav.evaluate(el => el.scrollTop = el.scrollHeight);
            await page.waitForTimeout(300);

            const navItemAfterScroll = page.locator(`button:has-text("${tabLabel}")`).first();
            if (await navItemAfterScroll.isVisible().catch(() => false)) {
              await navItemAfterScroll.click();
            } else {
              this.log(`  Could not find "${tabLabel}" in drawer`);
              this.addIssue(tabLabel, 'warning', 'Navigation', `Tab not found in menu drawer (may require specific permissions)`);
              // Close drawer
              await page.locator('text=✕, button:has-text("✕")').first().click().catch(() => {});
              await page.waitForTimeout(300);
              continue;
            }
          }

          await page.waitForTimeout(2000);
          await page.waitForLoadState('networkidle').catch(() => {});

          await this.auditCurrentView(page, tabLabel);
        } catch (err) {
          this.log(`  ERROR: ${err.message}`);
          this.addIssue(tabLabel, 'critical', 'Navigation', `Could not navigate: ${err.message}`);
          // Try closing drawer if open
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      }

    } catch (err) {
      this.log(`FATAL ERROR: ${err.message}`);
    } finally {
      await browser.close();
    }

    // Add console errors to issues
    for (const [tab, errors] of Object.entries(consoleErrorsByTab)) {
      for (const err of errors.slice(0, 3)) {
        this.addIssue(tab, 'critical', 'ConsoleError', 'JS Console Error', err.substring(0, 200));
      }
    }

    this.generateReport();
  }

  async auditCurrentView(page, tabName) {
    const prefix = String(this.tabIndex).padStart(2, '0');
    const slug = tabName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Full page screenshot
    const ssPath = path.join(SCREENSHOT_DIR, `${prefix}-${slug}.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    this.screenshots.push({ tab: tabName, path: `${prefix}-${slug}.png` });
    this.log(`  Screenshot: ${prefix}-${slug}.png`);

    // Viewport-only screenshot (what user actually sees)
    const viewPath = path.join(SCREENSHOT_DIR, `${prefix}-${slug}-viewport.png`);
    await page.screenshot({ path: viewPath, fullPage: false });
    this.screenshots.push({ tab: `${tabName} (viewport)`, path: `${prefix}-${slug}-viewport.png` });

    // === RUN ALL CHECKS ===

    // 1. Horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > MOBILE_VIEWPORT.width + 5) {
      this.addIssue(tabName, 'critical', 'Horizontal Overflow', `Content wider than viewport`, `scrollWidth: ${scrollWidth}px vs viewport: ${MOBILE_VIEWPORT.width}px — causes horizontal scroll`);
    }

    // 2. Overlapping interactive elements
    const overlaps = await page.evaluate(() => {
      const issues = [];
      const interactive = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
      const rects = [];

      interactive.forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
            && rect.top < window.innerHeight * 3 && rect.top > -10) {
          rects.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.textContent || '').trim().substring(0, 40).replace(/\n/g, ' '),
            rect: { top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }
          });
        }
      });

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].rect;
          const b = rects[j].rect;
          // Check overlap
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smallerArea = Math.min(a.width * a.height, b.width * b.height);
          if (smallerArea > 100 && overlapArea / smallerArea > 0.2) {
            issues.push({
              el1: `${rects[i].tag}("${rects[i].text}")`,
              el2: `${rects[j].tag}("${rects[j].text}")`,
              pct: Math.round(overlapArea / smallerArea * 100),
              pos: `(${a.left},${a.top}) vs (${b.left},${b.top})`
            });
          }
        }
      }
      return issues.slice(0, 15);
    });

    for (const o of overlaps) {
      this.addIssue(tabName, 'critical', 'Overlap', `${o.el1} overlaps ${o.el2} (${o.pct}%)`, o.pos);
    }

    // 3. Elements cut off right edge
    const cutOff = await page.evaluate(() => {
      const issues = [];
      const all = document.querySelectorAll('button, .card, [class*="card"], table, form, input, select, textarea, [class*="container"], [class*="panel"], [class*="grid"]');
      all.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 20 && rect.top >= 0 && rect.top < window.innerHeight * 2 && rect.right > window.innerWidth + 2) {
          issues.push({
            el: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.toString().split(' ')[0].substring(0, 20) : ''}`,
            text: (el.innerText || '').trim().substring(0, 30).replace(/\n/g, ' '),
            overflow: Math.round(rect.right - window.innerWidth)
          });
        }
      });
      return issues.slice(0, 10);
    });

    for (const c of cutOff) {
      this.addIssue(tabName, 'warning', 'Cut Off', `Element extends past right edge: ${c.el}("${c.text}")`, `Overflows by ${c.overflow}px`);
    }

    // 4. Touch targets too small (< 44x44 recommended by Apple/Google)
    const smallTargets = await page.evaluate(() => {
      const issues = [];
      const targets = document.querySelectorAll('button, a, input, select, [role="button"], [role="tab"]');
      const seen = new Set();
      targets.forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && rect.top >= 0 && rect.top < window.innerHeight * 2) {
          const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
          if ((rect.height < 36 || rect.width < 36) && !seen.has(key)) {
            seen.add(key);
            issues.push({
              el: el.tagName.toLowerCase(),
              text: (el.innerText || '').trim().substring(0, 25).replace(/\n/g, ' '),
              w: Math.round(rect.width),
              h: Math.round(rect.height)
            });
          }
        }
      });
      return issues.slice(0, 8);
    });

    for (const t of smallTargets) {
      this.addIssue(tabName, 'warning', 'Small Touch Target', `${t.el}("${t.text}") is ${t.w}x${t.h}px`, `Min recommended: 44x44px`);
    }

    // 5. Text too small (< 12px)
    const smallText = await page.evaluate(() => {
      const issues = [];
      const seen = new Set();
      const els = document.querySelectorAll('p, span, label, td, th, li, h1, h2, h3, h4, h5, h6, div, a, button');
      els.forEach(el => {
        if (el.children.length > 3) return; // Skip containers with many children
        const text = (el.innerText || '').trim();
        if (text.length < 2 || text.length > 100) return;
        const style = window.getComputedStyle(el);
        const fs = parseFloat(style.fontSize);
        const rect = el.getBoundingClientRect();
        if (fs < 12 && fs > 0 && rect.width > 0 && rect.top >= 0 && rect.top < window.innerHeight * 2 && !seen.has(text.substring(0, 20))) {
          seen.add(text.substring(0, 20));
          issues.push({ text: text.substring(0, 35), fs: Math.round(fs * 10) / 10, tag: el.tagName.toLowerCase() });
        }
      });
      return issues.slice(0, 10);
    });

    for (const t of smallText) {
      this.addIssue(tabName, 'warning', 'Small Text', `"${t.text}" at ${t.fs}px`, `Min recommended: 12px for mobile readability`);
    }

    // 6. Tables that overflow
    const tables = await page.evaluate(() => {
      const issues = [];
      document.querySelectorAll('table, [role="grid"], [class*="table"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth + 5) {
          issues.push({ w: Math.round(rect.width), overflow: Math.round(rect.width - window.innerWidth) });
        }
      });
      return issues;
    });

    for (const t of tables) {
      this.addIssue(tabName, 'critical', 'Table Overflow', `Table/grid wider than viewport`, `Width: ${t.w}px, overflows by ${t.overflow}px`);
    }

    // 7. Fixed/sticky elements eating viewport
    const fixedInfo = await page.evaluate(() => {
      let count = 0, totalH = 0;
      const details = [];
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if ((style.position === 'fixed' || style.position === 'sticky') && el.offsetHeight > 20 && el.offsetWidth > 100) {
          count++;
          totalH += el.offsetHeight;
          details.push(`${el.tagName.toLowerCase()}(${el.offsetHeight}px)`);
        }
      });
      return { count, totalH, vh: window.innerHeight, details: details.slice(0, 5) };
    });

    if (fixedInfo.totalH > fixedInfo.vh * 0.25) {
      this.addIssue(tabName, 'warning', 'Fixed Elements', `Fixed elements use ${Math.round(fixedInfo.totalH / fixedInfo.vh * 100)}% of viewport`, `${fixedInfo.count} elements: ${fixedInfo.details.join(', ')}`);
    }

    // 8. Bottom nav content overlap (content hidden behind fixed bottom bar)
    const bottomOverlap = await page.evaluate(() => {
      const fixedBottom = [];
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && el.offsetHeight > 40) {
          const rect = el.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.5) {
            fixedBottom.push({ h: Math.round(rect.height), top: Math.round(rect.top) });
          }
        }
      });

      if (fixedBottom.length === 0) return null;

      const main = document.querySelector('main, [class*="content"], [class*="main"]');
      if (!main) return null;
      const style = window.getComputedStyle(main);
      const pb = parseFloat(style.paddingBottom) || 0;
      const mb = parseFloat(style.marginBottom) || 0;
      const navH = fixedBottom[0].h;

      if (pb + mb < navH - 10) {
        return { navH, padding: Math.round(pb + mb), gap: Math.round(navH - pb - mb) };
      }
      return null;
    });

    if (bottomOverlap) {
      this.addIssue(tabName, 'critical', 'Content Hidden', `Bottom nav (${bottomOverlap.navH}px) covers content`, `Content padding: ${bottomOverlap.padding}px, gap: ${bottomOverlap.gap}px — last items hidden behind nav bar`);
    }

    // 9. Scrollable content check - does content area scroll properly?
    const scrollIssue = await page.evaluate(() => {
      const main = document.querySelector('main, [class*="content"], [class*="main"]');
      if (!main) return null;
      const style = window.getComputedStyle(main);
      const rect = main.getBoundingClientRect();
      if (style.overflow === 'hidden' && main.scrollHeight > rect.height + 50) {
        return { visibleH: Math.round(rect.height), totalH: main.scrollHeight };
      }
      return null;
    });

    if (scrollIssue) {
      this.addIssue(tabName, 'critical', 'Scroll Blocked', `Content area has overflow:hidden but has scrollable content`, `Visible: ${scrollIssue.visibleH}px, Total: ${scrollIssue.totalH}px`);
    }

    // 10. Check for z-index stacking issues (elements visually on top of nav)
    const zIndexIssues = await page.evaluate(() => {
      const issues = [];
      const navButtons = document.querySelectorAll('nav button, [class*="bottom"] button');
      navButtons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.8) {
          // Check if something is on top of this button
          const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (center && center !== btn && !btn.contains(center) && !center.closest('nav')) {
            issues.push({
              blocked: (btn.innerText || '').trim().substring(0, 20),
              by: `${center.tagName.toLowerCase()}("${(center.innerText || '').trim().substring(0, 20)}")`
            });
          }
        }
      });
      return issues;
    });

    for (const z of zIndexIssues) {
      this.addIssue(tabName, 'critical', 'Z-Index Conflict', `Bottom nav "${z.blocked}" hidden behind ${z.by}`, `User cannot tap this nav button`);
    }
  }

  generateReport() {
    const critical = this.issues.filter(i => i.severity === 'critical');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const infos = this.issues.filter(i => i.severity === 'info');

    // Group by tab
    const byTab = {};
    for (const issue of this.issues) {
      if (!byTab[issue.tab]) byTab[issue.tab] = [];
      byTab[issue.tab].push(issue);
    }

    // Deduplicate global issues (same issue on every tab = global issue)
    const globalIssues = [];
    const issueCounts = {};
    for (const issue of this.issues) {
      const key = `${issue.category}|${issue.message}`;
      issueCounts[key] = (issueCounts[key] || 0) + 1;
    }

    let report = `# Admin Panel Mobile UI/UX Audit Report\n\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n`;
    report += `**Viewport**: ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} (iPhone 13/14)\n`;
    report += `**Target**: ${ADMIN_URL}\n`;
    report += `**Duration**: ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)} minutes\n\n`;

    report += `## Summary\n\n`;
    report += `| Severity | Count |\n|----------|-------|\n`;
    report += `| CRITICAL | ${critical.length} |\n`;
    report += `| WARNING | ${warnings.length} |\n`;
    report += `| INFO | ${infos.length} |\n`;
    report += `| **TOTAL** | **${this.issues.length}** |\n\n`;

    // Global issues (appear on most tabs)
    report += `## Global Issues (appear on most/all tabs)\n\n`;
    const reportedGlobal = new Set();
    for (const [key, count] of Object.entries(issueCounts)) {
      if (count >= 3 && !reportedGlobal.has(key)) {
        reportedGlobal.add(key);
        const sample = this.issues.find(i => `${i.category}|${i.message}` === key);
        report += `- **[${sample.severity.toUpperCase()}] ${sample.category}**: ${sample.message} — ${sample.details} *(affects ${count} tabs)*\n`;
      }
    }
    report += `\n`;

    // Per-tab issues (unique to that tab)
    report += `## Per-Tab Issues\n\n`;
    const allTabs = [...new Set(this.issues.map(i => i.tab))];
    for (const tab of allTabs) {
      const tabIssues = (byTab[tab] || []).filter(i => {
        const key = `${i.category}|${i.message}`;
        return issueCounts[key] < 3; // Only show unique-to-tab issues
      });

      if (tabIssues.length === 0) {
        report += `### ${tab} — no unique issues\n\n`;
      } else {
        const tabCrit = tabIssues.filter(i => i.severity === 'critical').length;
        report += `### ${tab} (${tabCrit} critical, ${tabIssues.length - tabCrit} other)\n\n`;
        for (const issue of tabIssues) {
          report += `- **[${issue.severity.toUpperCase()}] ${issue.category}**: ${issue.message} — ${issue.details}\n`;
        }
        report += `\n`;
      }
    }

    // Issues by category
    report += `## Issues by Category\n\n`;
    const byCat = {};
    for (const i of this.issues) {
      if (!byCat[i.category]) byCat[i.category] = [];
      byCat[i.category].push(i);
    }
    for (const [cat, items] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
      const critCount = items.filter(i => i.severity === 'critical').length;
      report += `### ${cat}: ${items.length} issues (${critCount} critical)\n`;
      // Show unique examples
      const seen = new Set();
      for (const i of items) {
        const key = `${i.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          report += `- [${i.tab}] ${i.message} — ${i.details}\n`;
        }
      }
      report += `\n`;
    }

    // Screenshots
    report += `## Screenshots Taken: ${this.screenshots.length}\n\n`;
    for (const ss of this.screenshots) {
      report += `- **${ss.tab}**: \`${ss.path}\`\n`;
    }

    const reportPath = path.join(REPORT_DIR, 'admin-mobile-audit.md');
    fs.writeFileSync(reportPath, report);

    this.log(`\n========================================`);
    this.log(`AUDIT COMPLETE`);
    this.log(`Total Issues: ${this.issues.length} (${critical.length} critical, ${warnings.length} warnings)`);
    this.log(`Screenshots: ${this.screenshots.length}`);
    this.log(`Report: ${reportPath}`);
    this.log(`========================================`);

    // Print report to console too
    console.log('\n' + report);
  }
}

const audit = new AdminMobileAudit();
audit.run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
