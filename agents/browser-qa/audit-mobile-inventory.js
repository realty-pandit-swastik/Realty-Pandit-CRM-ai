const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'mobile-inventory-audit');
const BASE_URL = 'https://admin.realtypandit.in';
const PHONE = '9217151405';
const PASSWORD = 'real3121';

const VIEWPORT = { width: 375, height: 812 };
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

let screenshotIndex = 0;
async function ss(page, name, fullPage = false) {
  screenshotIndex++;
  const prefix = String(screenshotIndex).padStart(2, '0');
  const filePath = path.join(SCREENSHOTS_DIR, `${prefix}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage });
  console.log(`  [ss] ${prefix}-${name}.png`);
  return filePath;
}

async function run() {
  console.log('=== Mobile Inventory Edit UI Audit ===\n');

  if (fs.existsSync(SCREENSHOTS_DIR)) {
    for (const f of fs.readdirSync(SCREENSHOTS_DIR)) {
      fs.unlinkSync(path.join(SCREENSHOTS_DIR, f));
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // === 1. LOGIN ===
    console.log('1. Logging in...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="tel"]').fill(PHONE);
    await page.locator('input[type="password"]').fill(PASSWORD);
    const loginBtn = page.locator('button:has-text("Login")');
    await loginBtn.scrollIntoViewIfNeeded();
    await loginBtn.click();
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle');
    console.log(`  Logged in. URL: ${page.url()}`);
    await ss(page, 'dashboard');

    // === 2. INVENTORY LIST ===
    console.log('\n2. Opening Inventory...');
    await page.locator('text=Inventory').first().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');
    await ss(page, 'inventory-list-viewport');
    await ss(page, 'inventory-list-full', true);

    // Scroll inventory list to see all cards
    for (let y = 400; y <= 1200; y += 400) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(300);
    }
    await ss(page, 'inventory-list-bottom');

    // === 3. OPEN EDIT FORM ===
    console.log('\n3. Opening edit form...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.locator('text=Residential - Apartment').first().tap();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
    await ss(page, 'edit-form-initial');

    // Check the scrollable container -- might be a div with overflow, not body
    const scrollInfo = await page.evaluate(() => {
      const bodyH = document.body.scrollHeight;
      const bodyC = document.body.clientHeight;
      // Find the main scrollable container
      const divs = document.querySelectorAll('div');
      let mainScroller = null;
      let maxScroll = 0;
      for (const div of divs) {
        const sh = div.scrollHeight;
        const ch = div.clientHeight;
        if (sh > ch + 100 && sh > maxScroll) {
          maxScroll = sh;
          mainScroller = {
            scrollHeight: sh,
            clientHeight: ch,
            className: div.className?.toString().substring(0, 80),
            tagName: div.tagName,
          };
        }
      }
      return { bodyH, bodyC, mainScroller };
    });
    console.log(`  Body: scrollH=${scrollInfo.bodyH}, clientH=${scrollInfo.bodyC}`);
    if (scrollInfo.mainScroller) {
      console.log(`  Main scroller: scrollH=${scrollInfo.mainScroller.scrollHeight}, clientH=${scrollInfo.mainScroller.clientHeight}, class="${scrollInfo.mainScroller.className}"`);
    }

    // === 4. EXPAND ALL COLLAPSIBLE SECTIONS ===
    console.log('\n4. Expanding all sections...');

    // The form has collapsible sections: Classification, Property Details, Specifications, Amenities/Features, Address
    // They have triangle up/down indicators. Let's click each section header.
    const sectionNames = ['Classification', 'Property Details', 'Specifications', 'Amenities', 'Address', 'Pricing', 'Description', 'Media', 'Images'];

    for (const name of sectionNames) {
      try {
        const header = page.locator(`text=${name}`).first();
        if (await header.count() > 0 && await header.isVisible()) {
          // Scroll it into view first
          await header.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await header.click();
          await page.waitForTimeout(600);
          console.log(`  Clicked: ${name}`);
        }
      } catch (e) {
        // skip
      }
    }

    await page.waitForTimeout(1000);

    // Check new scroll height
    const afterExpandInfo = await page.evaluate(() => {
      const bodyH = document.body.scrollHeight;
      const divs = document.querySelectorAll('div');
      let maxScroll = 0;
      let scrollerClass = '';
      for (const div of divs) {
        if (div.scrollHeight > div.clientHeight + 100 && div.scrollHeight > maxScroll) {
          maxScroll = div.scrollHeight;
          scrollerClass = div.className?.toString().substring(0, 80);
        }
      }
      return { bodyH, maxScroll, scrollerClass };
    });
    console.log(`  After expand: body=${afterExpandInfo.bodyH}, maxScroller=${afterExpandInfo.maxScroll}`);

    // Full page screenshot after expansion
    await ss(page, 'all-sections-expanded-full', true);

    // === 5. SCROLL THROUGH FORM AND CAPTURE EACH SECTION ===
    console.log('\n5. Scrolling through form...');

    // Scroll to top first
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Also try scrolling the main scroller div
    const scrollerSelector = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      let best = null;
      let maxH = 0;
      for (const div of divs) {
        if (div.scrollHeight > div.clientHeight + 100 && div.scrollHeight > maxH) {
          maxH = div.scrollHeight;
          best = div;
        }
      }
      if (best) {
        // Tag it for later use
        best.setAttribute('data-audit-scroller', 'true');
        return { found: true, scrollHeight: maxH, clientHeight: best.clientHeight };
      }
      return { found: false };
    });

    if (scrollerSelector.found) {
      console.log(`  Found scrollable container: ${scrollerSelector.scrollHeight}px total, ${scrollerSelector.clientHeight}px visible`);

      const totalH = scrollerSelector.scrollHeight;
      const step = 600;
      let pos = 0;
      let section = 1;

      while (pos < totalH) {
        await page.evaluate((y) => {
          const el = document.querySelector('[data-audit-scroller]');
          if (el) el.scrollTop = y;
          window.scrollTo(0, y);
        }, pos);
        await page.waitForTimeout(400);
        await ss(page, `form-scroll-${String(section).padStart(2, '0')}`);
        pos += step;
        section++;
        if (section > 25) break;
      }
    } else {
      // Fallback: regular page scroll
      const totalH = await page.evaluate(() => document.body.scrollHeight);
      const step = 600;
      let pos = 0;
      let section = 1;
      while (pos < totalH) {
        await page.evaluate((y) => window.scrollTo(0, y), pos);
        await page.waitForTimeout(400);
        await ss(page, `form-scroll-${String(section).padStart(2, '0')}`);
        pos += step;
        section++;
        if (section > 25) break;
      }
    }

    // === 6. COMPREHENSIVE UI ANALYSIS ===
    console.log('\n6. Running UI analysis on edit form...');

    // Scroll to top for analysis
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const el = document.querySelector('[data-audit-scroller]');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(500);

    const uiReport = await page.evaluate(() => {
      const issues = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const interactive = Array.from(document.querySelectorAll('button, input, select, textarea, a, [role="button"]'))
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

      // Overflow
      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 2) {
          issues.push({
            type: 'OVERFLOW',
            detail: `${el.tagName} "${(el.textContent || el.placeholder || '').trim().substring(0, 30)}" overflows by ${Math.round(rect.right - vw)}px right`,
          });
        }
        if (rect.left < -2) {
          issues.push({
            type: 'OVERFLOW_LEFT',
            detail: `${el.tagName} "${(el.textContent || el.placeholder || '').trim().substring(0, 30)}" extends ${Math.round(-rect.left)}px left of viewport`,
          });
        }
      }

      // Tap targets < 44px height
      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        if (rect.height < 44 && ['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName)) {
          const label = (el.textContent || el.placeholder || el.name || el.id || '').trim().substring(0, 35);
          issues.push({
            type: 'SMALL_TAP_TARGET',
            detail: `${el.tagName} "${label}" = ${Math.round(rect.width)}x${Math.round(rect.height)}px (need 44px min height)`,
          });
        }
      }

      // Non-nested overlaps
      for (let i = 0; i < interactive.length; i++) {
        for (let j = i + 1; j < interactive.length; j++) {
          const a = interactive[i].getBoundingClientRect();
          const b = interactive[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 8 && oy > 8 && !interactive[i].contains(interactive[j]) && !interactive[j].contains(interactive[i])) {
            const t1 = (interactive[i].textContent || interactive[i].placeholder || '').trim().substring(0, 25);
            const t2 = (interactive[j].textContent || interactive[j].placeholder || '').trim().substring(0, 25);
            issues.push({
              type: 'OVERLAP',
              detail: `${interactive[i].tagName}"${t1}" overlaps ${interactive[j].tagName}"${t2}" by ${Math.round(ox)}x${Math.round(oy)}px`,
            });
          }
        }
      }

      // Bottom nav vs content
      const allNavs = document.querySelectorAll('nav, [class*="BottomNav" i], [class*="bottom-nav" i]');
      let navRect = null;
      for (const n of allNavs) {
        const r = n.getBoundingClientRect();
        if (r.top > vh * 0.7 && r.height > 40) { navRect = r; break; }
      }
      if (navRect) {
        issues.push({
          type: 'INFO',
          detail: `Bottom nav: y=${Math.round(navRect.top)} to ${Math.round(navRect.bottom)}, height=${Math.round(navRect.height)}px`,
        });
        for (const el of interactive) {
          const r = el.getBoundingClientRect();
          if (Array.from(allNavs).some(n => n.contains(el))) continue;
          if (r.bottom > navRect.top && r.top < navRect.bottom && r.width > 0) {
            issues.push({
              type: 'HIDDEN_BEHIND_NAV',
              detail: `${el.tagName} "${(el.textContent || el.placeholder || '').trim().substring(0, 30)}" overlaps bottom nav`,
            });
          }
        }
      }

      // "Save Changes" button position check
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save'));
      if (saveBtn) {
        const r = saveBtn.getBoundingClientRect();
        issues.push({
          type: 'INFO',
          detail: `Save button: y=${Math.round(r.top)}-${Math.round(r.bottom)}, width=${Math.round(r.width)}, height=${Math.round(r.height)}`,
        });
        if (navRect && r.bottom > navRect.top) {
          issues.push({
            type: 'CRITICAL_OVERLAP',
            detail: `Save Changes button (y=${Math.round(r.top)}-${Math.round(r.bottom)}) overlaps bottom nav (y=${Math.round(navRect.top)}) by ${Math.round(r.bottom - navRect.top)}px — button partially or fully hidden!`,
          });
        }
      }

      // Small text
      let smallTextCount = 0;
      const smallTextExamples = [];
      document.querySelectorAll('p, span, label, h1, h2, h3, h4, h5, h6, td, th, li').forEach(el => {
        if (!el.textContent?.trim()) return;
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        if (fs < 12) {
          smallTextCount++;
          if (smallTextExamples.length < 5) {
            smallTextExamples.push(`"${el.textContent.trim().substring(0, 25)}" (${fs}px)`);
          }
        }
      });
      if (smallTextCount > 0) {
        issues.push({ type: 'SMALL_TEXT', detail: `${smallTextCount} elements < 12px: ${smallTextExamples.join('; ')}` });
      }

      // Horizontal scroll
      if (document.body.scrollWidth > vw + 5) {
        issues.push({ type: 'HORIZONTAL_SCROLL', detail: `Body ${document.body.scrollWidth}px > viewport ${vw}px` });
      }

      // Form inputs detail
      const inputs = [];
      document.querySelectorAll('input, select, textarea').forEach(inp => {
        const r = inp.getBoundingClientRect();
        if (r.width === 0) return;
        const label = inp.closest('label')?.textContent?.trim().substring(0, 30) ||
                      inp.previousElementSibling?.textContent?.trim().substring(0, 30) || '';
        inputs.push({
          type: inp.type || inp.tagName.toLowerCase(),
          name: inp.name || inp.id || inp.placeholder || '(unnamed)',
          label,
          width: Math.round(r.width),
          height: Math.round(r.height),
          fontSize: window.getComputedStyle(inp).fontSize,
        });
      });

      // Truncated text
      const truncated = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollWidth > el.clientWidth + 5 && el.textContent?.trim()) {
          const r = el.getBoundingClientRect();
          if (r.width > 50 && r.height > 0 && r.height < 60) {
            truncated.push({
              text: el.textContent.trim().substring(0, 50),
              overflow: el.scrollWidth - el.clientWidth,
            });
          }
        }
      });

      // Check label-input alignment
      const labels = document.querySelectorAll('label');
      const labelIssues = [];
      for (const label of labels) {
        const r = label.getBoundingClientRect();
        if (r.width > vw * 0.9) {
          labelIssues.push(`Label "${label.textContent?.trim().substring(0, 20)}" too wide: ${Math.round(r.width)}px`);
        }
      }

      // Section visibility -- how many sections are shown
      const visibleSections = [];
      for (const text of ['Classification', 'Property Details', 'Specifications', 'Amenities', 'Address', 'Pricing', 'Description', 'Media']) {
        const el = Array.from(document.querySelectorAll('*')).find(e =>
          e.textContent?.trim().startsWith(text) && e.offsetHeight > 0 && e.getBoundingClientRect().height < 60
        );
        if (el) {
          const r = el.getBoundingClientRect();
          visibleSections.push({ name: text, y: Math.round(r.top) });
        }
      }

      return { issues, inputs, truncated: truncated.slice(0, 10), labelIssues, visibleSections };
    });

    // === PRINT REPORT ===
    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║     MOBILE INVENTORY EDIT AUDIT      ║');
    console.log('  ╚══════════════════════════════════════╝');

    console.log(`\n  Visible Sections:`);
    for (const s of uiReport.visibleSections) {
      console.log(`    - ${s.name} @ y=${s.y}`);
    }

    console.log(`\n  ISSUES (${uiReport.issues.length}):`);
    const grouped = {};
    for (const issue of uiReport.issues) {
      if (!grouped[issue.type]) grouped[issue.type] = [];
      grouped[issue.type].push(issue.detail);
    }
    for (const [type, details] of Object.entries(grouped)) {
      console.log(`\n    [${type}] (${details.length}):`);
      for (const d of details) {
        console.log(`      - ${d}`);
      }
    }

    console.log(`\n  FORM INPUTS (${uiReport.inputs.length}):`);
    for (const inp of uiReport.inputs) {
      const flags = [];
      if (inp.height < 44) flags.push('TAP<44');
      if (inp.width < 150) flags.push('NARROW');
      if (parseInt(inp.fontSize) < 14) flags.push('FONT<14');
      console.log(`    ${inp.type.padEnd(12)} ${inp.width.toString().padStart(3)}x${inp.height.toString().padStart(2)} font=${inp.fontSize.padEnd(4)} "${inp.name}"${inp.label ? ` [${inp.label}]` : ''}${flags.length ? '  !! ' + flags.join(', ') : ''}`);
    }

    if (uiReport.truncated.length > 0) {
      console.log(`\n  TRUNCATED TEXT (${uiReport.truncated.length}):`);
      for (const t of uiReport.truncated) {
        console.log(`    "${t.text}" (${t.overflow}px clipped)`);
      }
    }

    if (uiReport.labelIssues.length > 0) {
      console.log(`\n  LABEL ISSUES: ${uiReport.labelIssues.join('; ')}`);
    }

    if (consoleErrors.length > 0) {
      console.log(`\n  CONSOLE ERRORS (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 5)) {
        console.log(`    ${e.substring(0, 120)}`);
      }
    }

    await ss(page, 'final', true);
    console.log(`\n=== Audit Complete ===`);
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);

  } catch (error) {
    console.error(`\nERROR: ${error.message}`);
    await ss(page, 'error-state').catch(() => {});
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
