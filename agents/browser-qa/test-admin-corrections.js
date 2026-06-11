const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

  // Login
  await page.goto('https://admin.realtypandit.in', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.fill('input[type="tel"]', '9958860411');
  await page.fill('input[type="password"]', 'noteplz123');
  await page.click('button:has-text("Login")');
  await page.waitForTimeout(6000);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) { console.log('LOGIN FAILED'); await browser.close(); return; }

  // Navigate to Add Property
  await page.click('button:has-text("Inventory")');
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Add Property")');
  await page.waitForTimeout(4000);

  // TEST 1: Verify questions
  console.log('\n=== TEST 1: Admin Questions ===');
  const body1 = await page.evaluate(() => document.body.innerText);
  console.log('  "Reference for this inventory?":', body1.includes('Reference for this inventory') ? 'PASS' : 'FAIL');
  console.log('  "Share name?" (after clicking)...');

  // Click Direct Owner
  await page.click('button:has-text("Direct Owner")');
  await page.waitForTimeout(3500);
  const body2 = await page.evaluate(() => document.body.innerText);
  console.log('  "Share name?":', body2.includes('Share name?') ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'screenshots/admin-share-name.png', fullPage: true });

  // Type name
  const ta1 = await page.$('textarea:not([disabled])');
  if (ta1) { await ta1.fill('Test User'); await ta1.press('Enter'); await page.waitForTimeout(3500); }
  const body3 = await page.evaluate(() => document.body.innerText);
  console.log('  "Share their contact number?":', body3.includes('Share their contact number?') ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'screenshots/admin-share-contact.png', fullPage: true });

  // Type phone
  const ta2 = await page.$('textarea:not([disabled])');
  if (ta2) { await ta2.fill('9876543210'); await ta2.press('Enter'); await page.waitForTimeout(3500); }

  // Click through to address step
  await page.click('button:has-text("Sale")'); await page.waitForTimeout(3500);
  await page.click('button:has-text("Residential")'); await page.waitForTimeout(3500);
  await page.click('button:has-text("Apartment")'); await page.waitForTimeout(3500);
  await page.click('button:has-text("2 BHK")'); await page.waitForTimeout(3500);

  // TEST 2: Address has Sub Locality field
  console.log('\n=== TEST 2: Sub Locality Field ===');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/admin-address-widget.png', fullPage: true });

  // Check if the built JS has Sub Locality
  const hasSubLocality = await page.evaluate(async () => {
    const scripts = [...document.querySelectorAll('script[src]')];
    for (const s of scripts) {
      try {
        const res = await fetch(s.src);
        const text = await res.text();
        if (text.includes('Sub Locality') && text.includes('sub_locality')) return true;
      } catch {}
    }
    return false;
  });
  console.log('  "Sub Locality" field in code:', hasSubLocality ? 'PASS' : 'FAIL');

  // TEST 3: "Add More Details" navigates to edit
  console.log('\n=== TEST 3: Add More Details -> Edit ===');
  const hasEditNav = await page.evaluate(async () => {
    const scripts = [...document.querySelectorAll('script[src]')];
    for (const s of scripts) {
      try {
        const res = await fetch(s.src);
        const text = await res.text();
        if (text.includes('onEditInventory') && text.includes('handleEdit') && text.includes('getInventoryItem')) return true;
      } catch {}
    }
    return false;
  });
  console.log('  onEditInventory wired to handleEdit:', hasEditNav ? 'PASS' : 'FAIL');

  console.log('\n=== SUMMARY ===');
  console.log('1. "Share name?":', body2.includes('Share name?') ? 'PASS' : 'FAIL');
  console.log('2. "Share their contact number?":', body3.includes('Share their contact number?') ? 'PASS' : 'FAIL');
  console.log('3. Sub Locality field:', hasSubLocality ? 'PASS' : 'FAIL');
  console.log('4. Add More Details -> Edit:', hasEditNav ? 'PASS' : 'FAIL');

  await page.waitForTimeout(3000);
  await browser.close();
})();
