const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  pg.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
  pg.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 120)));
  await pg.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 30000 });
  await pg.waitForTimeout(1500);

  // Diagnostic: what actually rendered?
  console.log('BODY_HEAD:', JSON.stringify((await pg.evaluate(() => document.body.innerText)).slice(0, 200)));
  console.log('TEL_INPUTS:', await pg.locator('input[type="tel"]').count(),
    'PWD_INPUTS:', await pg.locator('input[type="password"]').count());

  const phone = pg.getByPlaceholder('e.g. 9876543210');
  await phone.waitFor({ timeout: 10000 });
  await phone.fill('<staff-phone>');
  await pg.getByPlaceholder('Enter your password').first().fill('<password>');
  await pg.locator('form button[type="submit"]').first().click();
  await pg.waitForTimeout(2500);
  console.log('AFTER_LOGIN:', JSON.stringify((await pg.evaluate(() => document.body.innerText)).slice(0, 200)));
  await pg.context().storageState({ path: 'auth.json' });
  // ... screenshots per view as before ...
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });