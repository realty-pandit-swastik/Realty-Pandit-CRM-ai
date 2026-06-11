const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'mobile-full-audit');
const BASE_URL = 'https://admin.realtypandit.in';
const LOGIN_PHONE = '9217151405';
const LOGIN_PASSWORD = 'real3121';

const VIEWPORT = { width: 375, height: 812 };
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const consoleErrors = [];
const auditResults = [];
let screenshotIndex = 0;

function log(msg) { console.log(`[AUDIT] ${msg}`); }

function addResult(section, data) { auditResults.push({ section, ...data }); }

async function ss(page, name, fullPage = true) {
  screenshotIndex++;
  const prefix = String(screenshotIndex).padStart(2, '0');
  const filePath = path.join(SCREENSHOT_DIR, `${prefix}-${name}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage });
    log(`  SS: ${prefix}-${name}.png`);
    return filePath;
  } catch (e) { return null; }
}

async function waitStable(page, ms = 2000) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
  await page.waitForTimeout(ms);
}

async function dismissOverlays(page) {
  // Close any modals, drawers, tooltips, or overlays blocking interaction
  try {
    // Press Escape to dismiss overlays
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Click any close buttons
    const closeBtns = page.locator('button:has-text("Close"), button:has-text("x"), [aria-label="close"]');
    const count = await closeBtns.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      try {
        if (await closeBtns.nth(i).isVisible()) {
          await closeBtns.nth(i).click({ force: true });
          await page.waitForTimeout(200);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

async function closeDrawer(page) {
  try {
    // Try X button in drawer
    const closeX = page.locator('button:has-text("×"), button:has-text("✕"), svg[class*="close" i]').first();
    if (await closeX.isVisible().catch(() => false)) {
      await closeX.click({ force: true });
      await page.waitForTimeout(500);
      return;
    }
  } catch (e) {}
  // Try clicking the dimmed area (right side when drawer is open)
  try {
    await page.mouse.click(350, 400);
    await page.waitForTimeout(500);
  } catch (e) {}
  // Escape
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {}
}

async function getPageInfo(page) {
  return await page.evaluate(() => {
    const text = (document.body ? document.body.innerText : '').substring(0, 5000);
    const headings = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      if (h.offsetParent !== null) headings.push(h.textContent.trim().substring(0, 80));
    });
    const buttons = [];
    document.querySelectorAll('button,[role="button"]').forEach(b => {
      if (b.offsetParent !== null) buttons.push(b.textContent.trim().substring(0, 60));
    });
    const hasCanvas = document.querySelectorAll('canvas').length;
    const hasSvgChart = document.querySelectorAll('[class*="recharts"],[class*="chart" i],[class*="apexcharts"]').length;
    const hasTable = document.querySelectorAll('table,[role="grid"]').length;
    const cards = [];
    document.querySelectorAll('[class*="card" i],[class*="Card"]').forEach(c => {
      if (c.offsetParent !== null && c.textContent.trim().length > 5)
        cards.push(c.textContent.trim().substring(0, 120));
    });
    const overflows = [];
    const vw = window.innerWidth;
    document.querySelectorAll('table, [class*="table" i], [class*="grid" i], [class*="container" i]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 5 && rect.width > 50)
        overflows.push(`${el.tagName}(${Math.round(rect.width)}px) overflow ${Math.round(rect.right - vw)}px`);
    });
    return { text, headings, buttons: buttons.slice(0, 30), hasCanvas, hasSvgChart, hasTable, cards: cards.slice(0, 20), overflows: overflows.slice(0, 10) };
  });
}

async function auditSection(page, name) {
  const info = await getPageInfo(page);
  await ss(page, `${name}-viewport`, false);
  await ss(page, `${name}-full`, true);

  // Scroll captures for longer pages
  const scrollH = await page.evaluate(() => document.body.scrollHeight);
  if (scrollH > 1200) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    await ss(page, `${name}-scroll1`, false);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(400);
    await ss(page, `${name}-scroll2`, false);
    if (scrollH > 2000) {
      await page.evaluate(() => window.scrollTo(0, 1800));
      await page.waitForTimeout(400);
      await ss(page, `${name}-scroll3`, false);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  }

  addResult(name, {
    url: page.url(),
    headings: info.headings,
    buttonsCount: info.buttons.length,
    buttonsSample: info.buttons.slice(0, 15),
    hasCanvas: info.hasCanvas,
    hasSvgChart: info.hasSvgChart,
    hasTable: info.hasTable,
    cardCount: info.cards.length,
    overflows: info.overflows,
    textSample: info.text.substring(0, 800)
  });

  log(`  URL: ${page.url()}`);
  log(`  Headings: ${info.headings.join(' | ') || '(none)'}`);
  log(`  Charts: canvas=${info.hasCanvas}, svg=${info.hasSvgChart}, Tables: ${info.hasTable}, Cards: ${info.cards.length}`);
  if (info.overflows.length > 0) log(`  OVERFLOW: ${info.overflows.join('; ')}`);
  return info;
}

async function run() {
  log('=== Comprehensive Mobile Admin Audit ===');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  page.on('console', msg => {
    if (msg.type() === 'error')
      consoleErrors.push({ url: page.url(), text: msg.text().substring(0, 300) });
  });
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: err.message.substring(0, 300) });
  });

  // ===== LOGIN =====
  log('\n========== LOGIN ==========');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await ss(page, 'login-page');

  const phoneInput = page.locator('input[type="tel"], input[placeholder*="9876" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await phoneInput.click();
  await page.waitForTimeout(200);
  await phoneInput.fill(LOGIN_PHONE);
  await page.waitForTimeout(200);
  await passwordInput.click();
  await page.waitForTimeout(200);
  await passwordInput.fill(LOGIN_PASSWORD);
  await page.waitForTimeout(300);

  await page.locator('button:has-text("Login")').first().click();
  await page.waitForTimeout(5000);
  await waitStable(page, 2000);
  await ss(page, 'after-login');

  const loginUrl = page.url();
  log(`  After login: ${loginUrl}`);

  if (loginUrl.includes('login')) {
    log('  WARNING: Still on login page, login may have failed.');
  }

  // ===== BOTTOM NAV: HOME =====
  log('\n========== HOME TAB ==========');
  const homeBtn = page.locator('button:has-text("Home")').last();
  if (await homeBtn.isVisible().catch(() => false)) {
    await homeBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await waitStable(page, 1500);
  }
  await auditSection(page, 'home');

  // Check dashboard sub-tabs (Main Dashboard, Market Trends, User Performance)
  log('  Checking dashboard sub-tabs...');
  const subTabs = ['Market Trends', 'User Performa'];
  for (const st of subTabs) {
    try {
      const tab = page.locator(`button:has-text("${st}"), [role="tab"]:has-text("${st}"), div:has-text("${st}")`).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ force: true });
        await page.waitForTimeout(2000);
        await waitStable(page, 1500);
        const slug = st.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await auditSection(page, `home-${slug}`);
      } else {
        log(`  Sub-tab "${st}" not visible`);
      }
    } catch (e) { log(`  Sub-tab "${st}" error: ${e.message.substring(0, 80)}`); }
  }
  // Back to main dashboard
  try {
    const mainDash = page.locator('button:has-text("Main Dashboard"), [role="tab"]:has-text("Main Dashboard"), div:has-text("Main Dashboard")').first();
    if (await mainDash.isVisible().catch(() => false)) {
      await mainDash.click({ force: true });
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  // ===== BOTTOM NAV: CHATS =====
  log('\n========== CHATS TAB ==========');
  await dismissOverlays(page);
  try {
    await page.locator('button:has-text("Chats")').last().click({ force: true });
    await page.waitForTimeout(2000);
    await waitStable(page, 1500);
    await auditSection(page, 'chats');
  } catch (e) { log(`  Chats error: ${e.message.substring(0, 100)}`); }

  // ===== BOTTOM NAV: INVENTORY =====
  log('\n========== INVENTORY TAB ==========');
  await dismissOverlays(page);
  try {
    await page.locator('button:has-text("Inventory")').last().click({ force: true });
    await page.waitForTimeout(2000);
    await waitStable(page, 1500);
    await auditSection(page, 'inventory');
  } catch (e) { log(`  Inventory error: ${e.message.substring(0, 100)}`); }

  // ===== BOTTOM NAV: TEAM =====
  log('\n========== TEAM TAB ==========');
  await dismissOverlays(page);
  try {
    await page.locator('button:has-text("Team")').last().click({ force: true });
    await page.waitForTimeout(2000);
    await waitStable(page, 1500);
    await auditSection(page, 'team');
  } catch (e) { log(`  Team error: ${e.message.substring(0, 100)}`); }

  // ===== MENU DRAWER =====
  log('\n========== MENU DRAWER ==========');
  await dismissOverlays(page);
  try {
    await page.locator('button:has-text("Menu")').last().click({ force: true });
    await page.waitForTimeout(1500);
    await ss(page, 'menu-drawer-top', false);

    // Scroll drawer to see all items
    const drawerNav = page.locator('nav').first();
    await drawerNav.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
    await page.waitForTimeout(500);
    await ss(page, 'menu-drawer-bottom', false);
    await drawerNav.evaluate(el => el.scrollTop = 0).catch(() => {});

    await closeDrawer(page);
    await page.waitForTimeout(500);
  } catch (e) { log(`  Menu drawer error: ${e.message.substring(0, 100)}`); }

  // ===== NAVIGATE EACH DRAWER ITEM =====
  // These are the items visible in the Menu drawer from the screenshot
  const drawerItems = [
    'Dashboard', 'Chats', 'Calendar', 'Emails', 'Call Log',
    'Inventory', 'Partner Agents', 'Team', 'Tasks'
  ];

  for (const itemName of drawerItems) {
    // Skip items already audited via bottom nav
    if (['Dashboard', 'Chats', 'Inventory', 'Team'].includes(itemName)) {
      log(`\n--- DRAWER: ${itemName} (already audited via bottom nav, skipping) ---`);
      continue;
    }

    log(`\n========== DRAWER: ${itemName.toUpperCase()} ==========`);
    try {
      await dismissOverlays(page);
      await page.waitForTimeout(300);

      // Open Menu drawer - use force:true to bypass intercepting divs
      await page.locator('button:has-text("Menu")').last().click({ force: true });
      await page.waitForTimeout(1200);

      // Find and click the item in the drawer nav
      // Use nav button first, then broader selectors
      let navItem = page.locator(`nav button:has-text("${itemName}")`).first();
      let found = await navItem.isVisible().catch(() => false);

      if (!found) {
        // Scroll down in the nav
        await page.locator('nav').first().evaluate(el => el.scrollTop = el.scrollHeight).catch(() => {});
        await page.waitForTimeout(400);
        found = await navItem.isVisible().catch(() => false);
      }

      if (!found) {
        // Try broader selector
        navItem = page.locator(`button:has-text("${itemName}")`).first();
        found = await navItem.isVisible().catch(() => false);
      }

      if (found) {
        await navItem.click({ force: true });
        await page.waitForTimeout(2500);
        await waitStable(page, 1500);
        const slug = itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await auditSection(page, `drawer-${slug}`);
      } else {
        log(`  "${itemName}" NOT FOUND in drawer`);
        addResult(`Drawer-${itemName}`, { status: 'NOT_FOUND' });
        await closeDrawer(page);
      }
    } catch (e) {
      log(`  Error: ${e.message.substring(0, 150)}`);
      addResult(`Drawer-${itemName}`, { status: 'ERROR', note: e.message.substring(0, 200) });
      await closeDrawer(page);
    }
  }

  // ===== ALSO TRY HAMBURGER MENU (top-left) =====
  // The screenshots show a hamburger icon (three lines) at top left
  log('\n========== HAMBURGER MENU (top-left) ==========');
  try {
    await dismissOverlays(page);
    // First go home
    await page.locator('button:has-text("Home")').last().click({ force: true });
    await page.waitForTimeout(1500);

    // Click hamburger (top-left button)
    const hamburger = page.locator('button').first();
    await hamburger.click({ force: true });
    await page.waitForTimeout(1500);
    await ss(page, 'hamburger-menu', false);

    // This likely opens the same drawer as Menu
    await closeDrawer(page);
  } catch (e) { log(`  Hamburger error: ${e.message.substring(0, 100)}`); }

  // ===== SPECIFIC FEATURE DEEP CHECKS =====
  log('\n========== FEATURE DEEP CHECKS ==========');

  // Go back to Home/Dashboard
  try {
    await page.locator('button:has-text("Home")').last().click({ force: true });
    await page.waitForTimeout(2000);
    await waitStable(page);
  } catch (e) {}

  const featureCheck = await page.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    return {
      leadPipeline: {
        hasPipelineWord: text.includes('pipeline'),
        hasKanban: text.includes('kanban'),
        hasStageNew: text.includes('new lead') || text.includes('new'),
        hasStageContacted: text.includes('contacted'),
        hasStageQualified: text.includes('qualified'),
        hasStageNegotiation: text.includes('negotiation'),
        hasStageClosedWon: text.includes('closed won') || text.includes('closed'),
      },
      statsCards: {
        hasTotalContacts: text.includes('total contacts'),
        hasHotLeads: text.includes('hot leads') || text.includes('hot lead'),
        hasWarmLeads: text.includes('warm leads') || text.includes('warm lead'),
        hasColdLeads: text.includes('cold leads') || text.includes('cold lead'),
        hasQuickOverview: text.includes('quick overview'),
      },
      analytics: {
        hasCanvas: document.querySelectorAll('canvas').length,
        hasChartSvg: document.querySelectorAll('[class*="recharts"],[class*="chart" i]').length,
        hasAnalyticsWord: text.includes('analytics'),
      },
      transactions: {
        hasTransactionWord: text.includes('transaction'),
        hasDealWord: text.includes('deal'),
        hasRevenueWord: text.includes('revenue'),
      },
      other: {
        hasRecentActivity: text.includes('recent') && text.includes('activity'),
        hasMarketTrends: text.includes('market trends'),
        hasUserPerformance: text.includes('user perform'),
      }
    };
  });
  console.log('\nFeature check:', JSON.stringify(featureCheck, null, 2));
  addResult('FeatureCheck-Dashboard', featureCheck);

  // ===== SUMMARY =====
  log('\n\n========== CONSOLE ERRORS ==========');
  log(`Total: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 15)) {
    log(`  [${e.url}] ${e.text.substring(0, 150)}`);
  }

  log('\n========== AUDIT RESULTS ==========');
  for (const r of auditResults) {
    const overflow = r.overflows && r.overflows.length > 0 ? ` OVERFLOW:${r.overflows.length}` : '';
    log(`  ${r.section}: URL=${r.url || 'n/a'} Cards=${r.cardCount || 0} Charts=${r.hasCanvas || 0}/${r.hasSvgChart || 0}${overflow}`);
  }

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'audit-results.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), viewport: VIEWPORT, results: auditResults, consoleErrors }, null, 2)
  );

  await browser.close();
  log('\nAudit complete!');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
