// Isolated presentation tests. All API traffic is fulfilled in Playwright with
// synthetic test-only fixtures. This does NOT test authentication or a live DB.
// Run with the CRM dev server on localhost:5173:
//   node tests/ui-redesign.browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseline = process.env.RP_UI_BASELINE === '1';
const uiUrl = process.env.RP_UI_URL || 'http://localhost:5173';
const output = path.join(process.env.TEMP, 'opencode', 'rp-ui-verification', baseline ? 'before' : 'after');
fs.mkdirSync(output, { recursive: true });
const apiCalls = [];
const errors = [];
let debugPage;
let leadMode = 'ready';
const lead = {
  phone_number: '+919000000001', name: 'Fixture Buyer', source: 'manual',
  contact_type: 'BUYER', lead_status: 'warm', lifecycle_stage: 'NEW',
  intent: 'buy', client_role: 'buyer', budget_min: '5000000', budget_max: '7500000',
  preferred_location: 'Fixture locality', created_at: '2026-10-01T09:00:00Z',
  shared_with_ids: [], demand_transactions: [], lead_score: { total_score: 65 },
};
const property = {
  id: '00000000-0000-4000-8000-000000000001', display_id: 'TEST-ONLY-001',
  type: 'apartment', category: 'residential', city: 'Fixture City', locality: 'Fixture locality',
  intent: 'sell', status: 'active', price: 6500000, customer_price: 6000000,
  display_price: 6500000, media_urls: [], video_urls: [], specs: { bhk: 3, area: 1500, area_unit: 'sqft' },
  can_edit: true, shared_with_ids: [], completion_pct: 70, created_at: '2026-10-01T09:00:00Z',
};
const agent = {
  id: 'fixture-admin', name: 'Fixture Reviewer', role: 'super_boss', tenant_id: 'test',
  permissions: ['view_inventory', 'edit_inventory', 'delete_inventory', 'view_reports',
    'manage_agents', 'manage_deals', 'edit_contact', 'bulk_upload', 'transfer_inventory', 'act_on_deals'],
};

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/public/')) return route.continue();
    apiCalls.push({ path: url.pathname, method: request.method(), query: Object.fromEntries(url.searchParams) });
    let data = {};
    if (url.pathname === '/auth/me') data = agent;
    else if (url.pathname === '/api/contacts') data = [];
    else if (url.pathname === '/api/leads/recent-external') {
      if (leadMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture service unavailable' }) });
      data = { leads: leadMode === 'empty' ? [] : [lead], total: leadMode === 'empty' ? 0 : 1 };
    }
    else if (url.pathname === '/api/leads/pending-partner-claims') data = { claims: [] };
    else if (url.pathname === '/api/inventory') data = { data: [property], total: 1, totalPages: 1 };
    else if (url.pathname === `/api/inventory/${property.id}`) data = { data: property };
    else if (url.pathname.endsWith('/contacts')) data = { data: { owner: null, key_holder: null, assigned_agent: null } };
    else if (/\/team\/members/.test(url.pathname)) data = [];
    else if (url.pathname === '/api/deals/pipeline') data = { data: {} };
    else if (url.pathname === '/api/deals') data = { data: [], deals: [] };
    else if (url.pathname.includes('/tasks') || url.pathname.includes('workflow-tasks')) data = { tasks: [] };
    else if (url.pathname === '/api/analytics/market-trends') data = { leads: [], visits: [], sales: [] };
    else if (url.pathname === '/api/analytics/alerts') data = { alerts: [] };
    else if (url.pathname.startsWith('/public/')) data = [];
    else if (url.pathname.includes('notifications')) data = { notifications: [], unread_count: 0 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  debugPage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(uiUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Good .*Fixture/ }).waitFor();
  await page.screenshot({ path: path.join(output, 'dashboard-1280.png'), fullPage: true });
  if (!baseline) {
    await page.evaluate(() => {
      const url = new URL(location.href); url.searchParams.set('rpAudit', 'keep');
      history.replaceState(history.state, '', url);
    });
    await page.getByRole('tab', { name: 'Lead Intelligence', exact: true }).click();
    await page.waitForURL(/rpDashboard=lead-intel/);
    assert.equal(new URL(page.url()).searchParams.get('rpAudit'), 'keep');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Lead Intelligence', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Lead Intelligence', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Main Dashboard', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('rpDashboard'), null);
  }
  const palette = page.getByRole('dialog', { name: 'Find a workspace' });
  if (baseline) {
    await page.getByRole('button', { name: 'Ext. Leads', exact: false }).click();
  } else {
    await page.getByRole('button', { name: 'Search navigation (Control or Command K)' }).waitFor();
    await page.keyboard.press('Control+k');
    await palette.waitFor();
    await palette.getByRole('searchbox').fill('Ext. Leads');
    await palette.locator('[data-command-result]').click();
  }
  await page.getByRole('table').getByText('Fixture Buyer', { exact: true }).waitFor();
  const query = apiCalls.find(call => call.path === '/api/leads/recent-external').query;
  assert.equal(query.limit, '500'); assert.equal(query.sort, 'date'); assert.equal(query.direction, 'desc');
  assert.equal(query.active, 'active');
  const headings = await page.locator('thead th').allTextContents();
  assert.equal(headings.length, 13);
  await page.getByRole('button', { name: 'Inventory', exact: !baseline }).click();
  await page.getByText('TEST-ONLY-001', { exact: false }).waitFor();
  const invQuery = apiCalls.find(call => call.path === '/api/inventory').query;
  // Dashboard also requests inventory with limit=1; the list still requests 20.
  assert.ok(apiCalls.some(call => call.path === '/api/inventory' && call.query.limit === '20'));
  for (const width of [360, 768, 1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByText('TEST-ONLY-001', { exact: false }).waitFor();
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.scroll <= overflow.width + 1, `page overflow at ${width}: ${JSON.stringify(overflow)}`);
    await page.screenshot({ path: path.join(output, `inventory-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: '+ Add Property', exact: true }).click();
  await page.getByRole('heading', { name: 'Add Inventory', exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'add-inventory-1280.png'), fullPage: true });
  if (baseline) await page.getByRole('button', { name: '×', exact: true }).click();
  else await page.getByRole('button', { name: 'Close add inventory', exact: true }).click();
  await page.getByText('apartment', { exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Property Details' });
  await page.getByRole('heading', { name: 'Property Details', exact: true }).waitFor();
  if (!baseline) {
    await detail.getByText('Demand price', { exact: true }).waitFor();
    assert.ok(await detail.getByRole('button', { name: 'Edit', exact: true }).isVisible());
  }
  await page.screenshot({ path: path.join(output, 'property-detail-1280.png'), fullPage: true });
  if (baseline) await page.getByRole('button', { name: '✕', exact: true }).click();
  else {
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'apartment', exact: true }).evaluate(el => el === document.activeElement), true);
  }
  await page.getByRole('button', { name: 'Ext. Leads', exact: !baseline }).click();
  await page.getByRole('table').getByText('Fixture Buyer', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.getByRole('table').getByText('Fixture Buyer', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'leads-1280.png'), fullPage: true });
  // Existing sort remains keyboard-operable; click logic is not replaced.
  if (!baseline) {
  await page.getByRole('columnheader', { name: /Budget/ }).focus();
  const sorted = page.waitForResponse(response => response.url().includes('recent-external') && response.url().includes('sort=budget'));
  await page.keyboard.press('Enter');
  await sorted;
  await page.keyboard.press('Control+k');
  await palette.waitFor();
  await page.keyboard.press('Escape');
  await palette.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('columnheader', { name: /Budget/ }).evaluate(el => el === document.activeElement), true);
  }
  await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'leads-dark-1280.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();

  let accessibility;
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`axe fetch ${response.status}`);
    await page.addScriptTag({ content: await response.text() });
    const results = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
      return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact,
        nodes: v.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })), passes: result.passes.length };
    });
    accessibility = { mode: 'axe-core on fixture lead view', ...results };
    if (!baseline) {
      await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();
      await page.waitForFunction(() => document.documentElement.classList.contains('dark') &&
        getComputedStyle(document.querySelector('button[aria-label="Tasks"]')).color === 'rgb(203, 213, 225)');
      await page.screenshot({ path: path.join(output, 'leads-dark-1280.png'), fullPage: true });
      const dark = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
        return result.violations.map(v => ({ id: v.id, impact: v.impact,
          nodes: v.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
      });
      accessibility.darkViolations = dark;
      await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();
    }
    fs.writeFileSync(path.join(output, 'axe-leads.json'), JSON.stringify(accessibility, null, 2));
  } catch (error) { accessibility = { notRun: error.message }; }

  if (!baseline) {
    leadMode = 'empty';
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Ext. Leads', exact: true }).click();
    await page.getByText('No leads in this view', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'leads-empty-1280.png'), fullPage: true });
    leadMode = 'error';
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByText("Couldn't load leads", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'leads-error-1280.png'), fullPage: true });
    leadMode = 'ready';
    await page.getByRole('button', { name: 'Retry', exact: true }).last().click();
    await page.getByRole('button', { name: 'Fixture Buyer', exact: true }).waitFor();
  }

  // No real account or auth path involved: exercise the existing client-side
  // role presentation predicates with test-only identities.
  for (const role of baseline ? [] : ['employee', 'partner']) {
    agent.role = role;
    agent.permissions = role === 'employee' ? ['view_inventory', 'act_on_deals'] : ['view_inventory'];
    await page.reload({ waitUntil: 'networkidle' });
    await page.keyboard.press('Control+k');
    await palette.waitFor();
    const labels = await palette.locator('[data-command-result] strong').allTextContents();
    assert.ok(!labels.includes('Property Taxonomy'), `${role} taxonomy exposed`);
    assert.ok(!labels.includes('Team'), `${role} team exposed`);
    assert.ok(!labels.includes('Reports'), `${role} reports exposed`);
    if (role === 'partner') assert.deepEqual(labels.sort(), ['Inventory', 'Ext. Leads', 'Deal Pipeline', 'My Profile'].sort());
    await page.keyboard.press('Escape');
  }
  assert.equal(errors.length, 0, `Runtime errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ result: 'PASS', mode: 'synthetic browser fixtures only', breakpoints: [360, 768, 1024, 1280, 1536],
    leadDefaultQuery: query, inventoryListPageSize: 20, runtimeErrors: errors,
    accessibility, screenshots: output }, null, 2));
  await browser.close();
}
main().catch(async error => {
  console.error(error);
  console.error('Runtime errors:', errors);
  if (debugPage) {
    console.error((await debugPage.locator('body').innerText()).slice(0, 5000));
    await debugPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  }
  process.exit(1);
});
