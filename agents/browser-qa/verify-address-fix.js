const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  console.log('=== Verifying Address Validation Fix ===\n');

  // Go to post-property
  await page.goto('https://www.realtypandit.in/post-property', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss cookies
  const cookieBtn = await page.$('button:has-text("Accept All")');
  if (cookieBtn) { await cookieBtn.click(); await page.waitForTimeout(500); }

  // Step through to address: Owner -> Name -> Phone -> Sale -> Residential -> Apartment -> 2BHK
  const steps = [
    { type: 'click', text: 'Owner' },
    { type: 'text', value: 'Test User' },
    { type: 'text', value: '9876543210' },
    { type: 'click', text: 'Sale' },
    { type: 'click', text: 'Residential' },
    { type: 'click', text: 'Apartment / Gated Society' },
    { type: 'click', text: '2 BHK' },
  ];

  for (const step of steps) {
    if (step.type === 'click') {
      const btn = await page.$(`button:has-text("${step.text}")`);
      if (btn) { await btn.click(); await page.waitForTimeout(2500); }
      else console.log(`Button "${step.text}" not found!`);
    } else {
      const textarea = await page.$('textarea');
      if (textarea) { await textarea.fill(step.value); await textarea.press('Enter'); await page.waitForTimeout(2500); }
    }
  }

  // Should now be at address step
  console.log('Arrived at address step');
  await page.screenshot({ path: 'screenshots/verify-address-step.png', fullPage: true });

  // Click "Or enter address manually"
  const manualBtn = await page.$('button:has-text("Or enter address manually")');
  if (manualBtn) {
    await manualBtn.click();
    await page.waitForTimeout(1000);
    console.log('Clicked manual entry');
  }

  // TEST 1: Click Confirm without filling required fields
  console.log('\n--- TEST 1: Click Confirm with empty fields ---');
  const confirmBtn = await page.$('button:has-text("Confirm Address")');
  if (confirmBtn) {
    const isDisabled = await confirmBtn.evaluate(b => b.disabled);
    console.log(`  Confirm button disabled: ${isDisabled}`);

    await confirmBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/verify-validation-error.png', fullPage: true });

    // Check for validation error messages
    const validationErrors = await page.evaluate(() => {
      const errEls = document.querySelectorAll('.text-red-500');
      return [...errEls].map(el => el.textContent?.trim()).filter(Boolean);
    });
    console.log(`  Validation errors shown: ${validationErrors.length}`);
    validationErrors.forEach(e => console.log(`    - ${e}`));

    // Check for red borders
    const redBorders = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input.border-red-400, input.border-2.border-red-400');
      return inputs.length;
    });
    console.log(`  Inputs with red border: ${redBorders}`);

    if (validationErrors.length > 0 && redBorders > 0) {
      console.log('  PASS: Validation messages and red borders shown!');
    } else if (validationErrors.length > 0) {
      console.log('  PARTIAL PASS: Validation messages shown but red borders need checking');
    } else {
      console.log('  FAIL: No validation feedback shown!');
    }
  }

  // TEST 2: Fill required fields and confirm
  console.log('\n--- TEST 2: Fill required fields and confirm ---');
  const subLocalityInput = await page.$('input[placeholder*="Sector 150"]');
  const stateInput = await page.$('input[placeholder*="Uttar Pradesh"]');

  if (subLocalityInput && stateInput) {
    await subLocalityInput.fill('Sector 150');
    await page.waitForTimeout(500);
    await stateInput.fill('Uttar Pradesh');
    await page.waitForTimeout(500);

    // Check validation errors cleared
    const errorsAfterFill = await page.evaluate(() => {
      return [...document.querySelectorAll('.text-red-500')].map(el => el.textContent?.trim()).filter(t => t && t.includes('Please'));
    });
    console.log(`  Validation errors after filling: ${errorsAfterFill.length}`);

    await page.screenshot({ path: 'screenshots/verify-fields-filled.png', fullPage: true });

    // Click Confirm
    const confirmBtn2 = await page.$('button:has-text("Confirm Address")');
    if (confirmBtn2) {
      await confirmBtn2.click();
      console.log('  Clicked Confirm Address');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'screenshots/verify-after-confirm.png', fullPage: true });

      // Check if workflow moved to next step
      const afterText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      const movedOn = afterText.includes('price') || afterText.includes('Price') || afterText.includes('kitna') || afterText.includes('₹') || afterText.includes('9/') || afterText.includes('10/');
      console.log(`  Workflow moved to next step: ${movedOn}`);

      if (movedOn) {
        console.log('  PASS: Address confirmed, moved to price/next step!');
      } else {
        console.log('  Checking what happened...');
        console.log('  Page text:', afterText.slice(0, 500));
      }
    }
  } else {
    console.log('  FAIL: Could not find Sub-Locality or State inputs');
  }

  // Final summary
  console.log('\n\n========== VERIFICATION SUMMARY ==========');
  console.log('Console errors:', errors.filter(e => !e.includes('google-analytics')).length);
  errors.filter(e => !e.includes('google-analytics')).forEach(e => console.log('  ' + e.slice(0, 200)));

  await page.waitForTimeout(3000);
  await browser.close();
})();
