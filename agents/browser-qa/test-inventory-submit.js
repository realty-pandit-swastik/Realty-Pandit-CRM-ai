const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  const apiCalls = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ text: msg.text(), url: page.url() });
  });
  page.on('response', res => {
    if (res.url().includes('api.realtypandit')) {
      res.text().then(body => {
        apiCalls.push({ url: res.url(), status: res.status(), method: res.request().method(), body: body.slice(0, 1000) });
        console.log(`  API: ${res.request().method()} ${res.url().split('.in')[1]?.slice(0,60)} -> ${res.status()}`);
      }).catch(() => {});
    }
  });

  console.log('=== Opening Post Property Page ===');
  await page.goto('https://www.realtypandit.in/post-property', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss cookie banner
  const acceptBtn = await page.$('button:has-text("Accept All")');
  if (acceptBtn) { await acceptBtn.click(); await page.waitForTimeout(500); }

  async function sendTextMessage(text) {
    const textarea = await page.$('textarea');
    if (!textarea) { console.log('  NO TEXTAREA FOUND'); return false; }
    await textarea.click();
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await textarea.press('Enter');
    await page.waitForTimeout(3000);
    return true;
  }

  async function clickOption(text) {
    const btn = await page.$(`button:has-text("${text}")`);
    if (btn) {
      const disabled = await btn.evaluate(b => b.disabled);
      if (!disabled) {
        await btn.click();
        await page.waitForTimeout(3000);
        return true;
      }
    }
    return false;
  }

  async function getState() {
    return await page.evaluate(() => {
      const body = document.body.innerText;
      // Find the latest question from Panditji
      const messages = body.split('\n').filter(l => l.trim());
      const stepMatch = body.match(/(\d+)\/11 steps/);
      const percentMatch = body.match(/(\d+)%/);

      const buttons = [...document.querySelectorAll('button')].filter(b => {
        const t = b.textContent?.trim();
        return t && !['Accept All', 'Essential Only', 'Subscribe', 'Talk to Panditji', 'Show details', ''].includes(t) && t.length < 40;
      }).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));

      const textarea = document.querySelector('textarea');
      const hasTextInput = !!textarea && !textarea.disabled;

      const errorEls = document.querySelectorAll('[class*="error"], [role="alert"], [class*="toast"]');
      const errorTexts = [...errorEls].map(e => e.textContent?.trim()).filter(Boolean);

      return {
        step: stepMatch ? parseInt(stepMatch[1]) : null,
        percent: percentMatch ? parseInt(percentMatch[1]) : null,
        buttons: buttons.filter(b => !b.disabled),
        hasTextInput,
        errors: errorTexts
      };
    });
  }

  // WORKFLOW: Walk through all 11 steps
  const steps = [
    { action: 'click', value: 'Owner', desc: 'Select Owner' },
    { action: 'type', value: 'Rahul Sharma', desc: 'Enter name' },
    { action: 'type', value: '9876543210', desc: 'Enter phone' },
    // After phone, it should ask intent (sell/rent)
    { action: 'auto', desc: 'Intent - Sell or Rent' },
    // Then property category
    { action: 'auto', desc: 'Property Category' },
    // Then property type
    { action: 'auto', desc: 'Property Type' },
    // Then configuration (BHK etc)
    { action: 'auto', desc: 'Configuration' },
    // Then location
    { action: 'auto', desc: 'Location' },
    // Then price
    { action: 'auto', desc: 'Price' },
    // Then area
    { action: 'auto', desc: 'Area' },
    // Then confirmation
    { action: 'auto', desc: 'Confirmation' },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n=== Step ${i + 1}: ${step.desc} ===`);

    const state = await getState();
    console.log(`  Progress: ${state.step}/11 (${state.percent}%)`);
    console.log(`  Buttons: ${state.buttons.map(b => b.text).join(', ') || 'none'}`);
    console.log(`  Has text input: ${state.hasTextInput}`);
    if (state.errors.length) console.log(`  ERRORS: ${state.errors.join('; ')}`);

    let success = false;

    if (step.action === 'click') {
      success = await clickOption(step.value);
      console.log(`  Clicked "${step.value}": ${success}`);
    } else if (step.action === 'type') {
      success = await sendTextMessage(step.value);
      console.log(`  Typed "${step.value}": ${success}`);
    } else if (step.action === 'auto') {
      // Try buttons first, then type
      if (state.buttons.length > 0) {
        const firstBtn = state.buttons[0].text;
        success = await clickOption(firstBtn);
        console.log(`  Auto-clicked "${firstBtn}": ${success}`);
      } else if (state.hasTextInput) {
        const autoAnswers = ['sell', 'Residential', 'Flat', '2 BHK', 'Sector 150, Noida', '75 lakh', '1200 sqft'];
        const answer = autoAnswers[i - 3] || 'test';
        success = await sendTextMessage(answer);
        console.log(`  Auto-typed "${answer}": ${success}`);
      } else {
        console.log('  STUCK: No buttons and no text input!');
      }
    }

    await page.screenshot({ path: `screenshots/inventory-step-${i + 1}.png`, fullPage: true });

    // Check if workflow completed or errored
    const afterState = await getState();
    if (afterState.errors.length) {
      console.log(`  POST-STEP ERRORS: ${afterState.errors.join('; ')}`);
    }
    if (afterState.percent === 100) {
      console.log('\n  WORKFLOW COMPLETED!');
      break;
    }
  }

  // Final state
  console.log('\n\n========== FINAL REPORT ==========');
  const finalState = await getState();
  console.log('Final progress:', finalState.step, '/', 11, `(${finalState.percent}%)`);
  console.log('Final buttons:', finalState.buttons.map(b => b.text));
  console.log('Final errors:', finalState.errors);
  console.log('\nConsole errors:', errors.length);
  errors.forEach(e => console.log('  ' + e.text.slice(0, 200)));
  console.log('\nAPI calls:');
  apiCalls.forEach(a => console.log(`  ${a.method} ${a.url.split('.in')[1]?.slice(0,80)} -> ${a.status}`));
  console.log('\nAPI response bodies:');
  apiCalls.forEach(a => console.log(`  ${a.url.split('.in')[1]?.slice(0,40)}: ${a.body.slice(0, 300)}`));

  await page.screenshot({ path: 'screenshots/inventory-final.png', fullPage: true });
  fs.writeFileSync('reports/inventory-submit-test.json', JSON.stringify({ errors, apiCalls, finalState }, null, 2));

  console.log('\nBrowser closing in 5s...');
  await page.waitForTimeout(5000);
  await browser.close();
})();
