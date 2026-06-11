const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  const apiCalls = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', res => {
    if (res.url().includes('api.realtypandit')) {
      res.text().then(body => {
        apiCalls.push({ url: res.url(), status: res.status(), method: res.request().method(), body: body.slice(0, 500) });
      }).catch(() => {});
    }
  });

  let testsPassed = 0;
  let testsFailed = 0;
  function pass(msg) { testsPassed++; console.log(`  PASS: ${msg}`); }
  function fail(msg) { testsFailed++; console.log(`  FAIL: ${msg}`); }

  console.log('=== Full Inventory Flow Verification ===\n');

  await page.goto('https://www.realtypandit.in/post-property', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss cookies
  const cookieBtn = await page.$('button:has-text("Accept All")');
  if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(500); }

  // Walk through steps 1-7
  const preSteps = [
    { type: 'click', text: 'Owner' },
    { type: 'text', value: 'Rahul Sharma' },
    { type: 'text', value: '9876543210' },
    { type: 'click', text: 'Sale' },
    { type: 'click', text: 'Residential' },
    { type: 'click', text: 'Apartment / Gated Society' },
    { type: 'click', text: '2 BHK' },
  ];

  for (const step of preSteps) {
    if (step.type === 'click') {
      const btn = await page.$(`button:has-text("${step.text}")`);
      if (btn) { await btn.click(); await page.waitForTimeout(2500); }
    } else {
      const textarea = await page.$('textarea');
      if (textarea) { await textarea.fill(step.value); await textarea.press('Enter'); await page.waitForTimeout(2500); }
    }
  }

  console.log('--- Reached Address Step ---');
  await page.screenshot({ path: 'screenshots/full-flow-address.png', fullPage: true });

  // Click manual entry
  const manualBtn = await page.$('button:has-text("Or enter address manually")');
  if (manualBtn) { await manualBtn.click(); await page.waitForTimeout(1000); }

  // TEST 1: Verify required field markers for apartment type (floor_required = true)
  console.log('\n--- TEST 1: Required field markers for Apartment ---');
  const flatLabel = await page.$eval('label:has-text("Flat / Unit No")', el => el.textContent);
  const floorLabel = await page.$eval('label:has-text("Floor No")', el => el.textContent);
  const societyLabel = await page.$eval('label:has-text("Society / Building")', el => el.textContent);

  if (flatLabel.includes('*')) pass('Flat/Unit shows required *');
  else fail(`Flat/Unit label: "${flatLabel}" - missing required marker`);
  if (floorLabel.includes('*')) pass('Floor No shows required *');
  else fail(`Floor No label: "${floorLabel}" - missing required marker`);
  if (societyLabel.includes('*')) pass('Society shows required *');
  else fail(`Society label: "${societyLabel}" - missing required marker`);

  // TEST 2: Click Confirm with empty fields - should show errors
  console.log('\n--- TEST 2: Validation errors on empty submit ---');
  const confirmBtn = await page.$('button:has-text("Confirm Address")');
  await confirmBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/full-flow-validation.png', fullPage: true });

  const validationErrors = await page.evaluate(() => {
    return [...document.querySelectorAll('.text-red-500')].map(el => el.textContent?.trim()).filter(t => t && t.length > 2);
  });
  console.log('  Validation errors:', validationErrors);
  if (validationErrors.length >= 3) pass(`${validationErrors.length} validation errors shown`);
  else fail(`Expected 3+ validation errors, got ${validationErrors.length}`);

  // TEST 3: Fill ALL required fields and confirm
  console.log('\n--- TEST 3: Fill all required fields and submit ---');
  const flatInput = await page.$('input[placeholder*="A-101"]');
  const floorInput = await page.$('input[placeholder*="e.g., 2"]');
  const societyInput = await page.$('input[placeholder*="Seemant Vihar"]');
  const subLocalityInput = await page.$('input[placeholder*="Sector 150"]');
  const stateInput = await page.$('input[placeholder*="Uttar Pradesh"]');
  const localityInput = await page.$('input[placeholder*="Noida, Jaipur"]');

  if (flatInput) await flatInput.fill('B-202');
  if (floorInput) await floorInput.fill('5');
  if (societyInput) await societyInput.fill('ATS Pristine');
  if (subLocalityInput) await subLocalityInput.fill('Sector 150');
  if (localityInput) await localityInput.fill('Noida');
  if (stateInput) await stateInput.fill('Uttar Pradesh');
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'screenshots/full-flow-filled.png', fullPage: true });

  // Click Confirm
  const confirmBtn2 = await page.$('button:has-text("Confirm Address")');
  await confirmBtn2.click();
  console.log('  Clicked Confirm Address');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'screenshots/full-flow-after-confirm.png', fullPage: true });

  // Check if workflow moved to next step (price/area)
  const bodyText = await page.evaluate(() => document.body.innerText);
  const movedToPrice = bodyText.includes('price') || bodyText.includes('Price') || bodyText.includes('kitna') || bodyText.includes('keemat');
  const movedToArea = bodyText.includes('area') || bodyText.includes('Area') || bodyText.includes('sqft') || bodyText.includes('square');
  const progressMatch = bodyText.match(/(\d+)\/(\d+) steps/);
  const progressPct = bodyText.match(/(\d+)%/);

  console.log(`  Progress: ${progressMatch ? progressMatch[0] : 'unknown'} (${progressPct ? progressPct[0] : 'unknown'})`);

  if (movedToPrice || movedToArea || (progressPct && parseInt(progressPct[1]) > 67)) {
    pass('Workflow advanced past address step!');
  } else {
    // Check if there's still an error
    const errorBubbles = await page.evaluate(() => {
      return [...document.querySelectorAll('[class*="red"], [class*="error"]')].map(el => el.textContent?.trim()).filter(t => t && t.length > 3 && t.length < 200);
    });
    if (errorBubbles.length > 0) {
      fail(`Still at address step. Errors: ${errorBubbles.join('; ')}`);
    } else {
      fail('Workflow did not advance. Check page text.');
      console.log('  Page text (last 500):', bodyText.slice(-500));
    }
  }

  // Continue flow if we moved past address
  if (movedToPrice || movedToArea || (progressPct && parseInt(progressPct[1]) > 67)) {
    console.log('\n--- Continuing through remaining steps ---');

    // Try to complete remaining steps
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')].filter(b => {
          const t = b.textContent?.trim();
          return t && t.length < 40 && !['Accept All', 'Essential Only', 'Subscribe', 'Talk to Panditji', 'Show details'].includes(t);
        }).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
        const hasTextarea = !!document.querySelector('textarea:not([disabled])');
        const text = document.body.innerText;
        return { buttons: buttons.filter(b => !b.disabled), hasTextarea, hasConfirm: text.includes('Confirm') && text.includes('Summary') };
      });

      if (state.hasConfirm) {
        console.log('  Reached confirmation/summary step!');
        pass('Full workflow reached confirmation step');
        await page.screenshot({ path: 'screenshots/full-flow-summary.png', fullPage: true });
        break;
      }

      if (state.buttons.length > 0) {
        const btn = state.buttons[0];
        console.log(`  Clicking: ${btn.text}`);
        const el = await page.$(`button:has-text("${btn.text}")`);
        if (el) { await el.click(); await page.waitForTimeout(3000); }
      } else if (state.hasTextarea) {
        const answers = ['75 lakh', '1200 sqft', 'Yes', '5 years old'];
        const textarea = await page.$('textarea');
        if (textarea) {
          console.log(`  Typing: ${answers[i] || 'test'}`);
          await textarea.fill(answers[i] || 'test');
          await textarea.press('Enter');
          await page.waitForTimeout(3000);
        }
      }
    }
  }

  // Final summary
  console.log('\n\n========== VERIFICATION RESULTS ==========');
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log(`Console Errors: ${errors.filter(e => !e.includes('google-analytics')).length}`);
  console.log(`API Calls: ${apiCalls.length}`);

  await page.screenshot({ path: 'screenshots/full-flow-final.png', fullPage: true });

  const report = { testsPassed, testsFailed, errors, apiCalls };
  fs.writeFileSync('reports/full-flow-verify.json', JSON.stringify(report, null, 2));

  await page.waitForTimeout(3000);
  await browser.close();

  process.exit(testsFailed > 0 ? 1 : 0);
})();
