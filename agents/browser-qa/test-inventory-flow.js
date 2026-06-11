const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 800 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  const apiCalls = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push({ text: msg.text(), url: page.url() }); });
  page.on('response', res => {
    if (res.url().includes('api.realtypandit') || res.url().includes('/api/')) {
      res.text().then(body => {
        apiCalls.push({ url: res.url(), status: res.status(), method: res.request().method(), body: body.slice(0, 500) });
      }).catch(() => {});
    }
  });

  console.log('=== Opening Post Property Page ===');
  await page.goto('https://www.realtypandit.in/post-property', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss cookie banner if present
  const acceptBtn = await page.$('button:has-text("Accept All")');
  if (acceptBtn) {
    await acceptBtn.click();
    await page.waitForTimeout(500);
  }

  // Step 1: Click "Owner"
  console.log('\n=== Step 1: Selecting "Owner" ===');
  const ownerBtn = await page.$('button:has-text("Owner")');
  if (ownerBtn) {
    await ownerBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/step1-owner-selected.png', fullPage: true });

    const stepText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('After selecting Owner:', stepText.slice(0, 1000));
  } else {
    console.log('ERROR: Owner button not found!');
  }

  // Step 2: Check what comes next - keep clicking through the workflow
  for (let step = 2; step <= 11; step++) {
    console.log(`\n=== Step ${step}: Checking current state ===`);

    // Get current state
    const state = await page.evaluate(() => {
      const chatMessages = document.querySelectorAll('[class*="message"], [class*="chat"], [class*="bubble"]');
      const lastMessages = [...chatMessages].slice(-5).map(m => m.textContent?.trim().slice(0, 200));

      const buttons = [...document.querySelectorAll('button')].filter(b => {
        const cls = b.className?.toString() || '';
        const text = b.textContent?.trim();
        return text && !['Accept All', 'Essential Only', 'Subscribe', 'Talk to Panditji', 'Show details'].includes(text);
      }).map(b => ({ text: b.textContent?.trim().slice(0, 50), disabled: b.disabled }));

      const inputs = [...document.querySelectorAll('input:not([type="email"]), textarea')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, value: i.value
      }));

      const selects = [...document.querySelectorAll('select')].map(s => ({
        name: s.name, options: [...s.options].map(o => o.text).slice(0, 15)
      }));

      const stepIndicator = document.querySelector('[class*="step"], [class*="progress"]');
      const stepText = stepIndicator?.textContent?.trim() || '';

      return { lastMessages, buttons, inputs, selects, stepText };
    });

    console.log('Step indicator:', state.stepText);
    console.log('Messages:', state.lastMessages);
    console.log('Buttons:', JSON.stringify(state.buttons));
    console.log('Inputs:', JSON.stringify(state.inputs));
    console.log('Selects:', JSON.stringify(state.selects));

    // Try to fill input if present
    const textInput = await page.$('textarea[placeholder*="message" i], textarea[placeholder*="type" i], input[placeholder*="type" i]');
    if (textInput && state.inputs.length === 0 && state.buttons.length <= 3) {
      // Need to type an answer
      const answers = {
        2: 'Test Property',
        3: 'Noida',
        4: '3 BHK',
        5: '1500',
        6: '75',
        7: '9876543210',
        8: 'Test Owner',
        9: 'Sector 150, Noida',
        10: 'sell'
      };
      if (answers[step]) {
        console.log(`Typing: "${answers[step]}"`);
        await textInput.fill(answers[step]);
        // Find send button
        const sendBtn = await page.$('button[type="submit"]:not(:disabled)');
        if (sendBtn) {
          await sendBtn.click();
          await page.waitForTimeout(3000);
        }
      }
    } else if (state.buttons.length > 0) {
      // Click first non-disabled option button
      const optionBtns = state.buttons.filter(b => !b.disabled && b.text);
      if (optionBtns.length > 0) {
        const targetText = optionBtns[0].text;
        console.log(`Clicking: "${targetText}"`);
        const btn = await page.$(`button:has-text("${targetText}")`);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(3000);
        }
      }
    } else if (state.selects.length > 0) {
      // Select first option in dropdown
      const select = await page.$('select');
      if (select) {
        const options = await select.evaluate(s => [...s.options].filter(o => o.value).map(o => o.value));
        if (options.length > 0) {
          console.log(`Selecting option: "${options[0]}"`);
          await select.selectOption(options[0]);
          await page.waitForTimeout(1000);
        }
      }
    }

    await page.screenshot({ path: `screenshots/step${step}-inventory.png`, fullPage: true });

    // Check for error messages
    const errorMsgs = await page.evaluate(() => {
      const errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], [class*="toast"], [class*="danger"], [class*="fail"]');
      return [...errEls].map(el => el.textContent?.trim().slice(0, 200));
    });
    if (errorMsgs.length > 0) {
      console.log('ERRORS FOUND:', errorMsgs);
    }

    // Check if we hit a dead end
    const isStuck = state.buttons.length === 0 && state.inputs.length === 0 && state.selects.length === 0;
    if (isStuck) {
      console.log('WORKFLOW STUCK - no interactive elements found!');
      const fullText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      console.log('Page text:', fullText.slice(0, 1000));
      break;
    }
  }

  // Final report
  console.log('\n=== FINAL REPORT ===');
  console.log('Console errors:', errors.length);
  errors.forEach(e => console.log('  ERR:', e.text.slice(0, 200)));
  console.log('\nAPI calls:', apiCalls.length);
  apiCalls.forEach(a => console.log(`  ${a.method} ${a.url.slice(0, 80)} -> ${a.status} | ${a.body.slice(0, 200)}`));

  fs.writeFileSync('reports/inventory-flow-test.json', JSON.stringify({ errors, apiCalls }, null, 2));
  console.log('\nReport saved. Closing browser in 5s...');

  await page.waitForTimeout(5000);
  await browser.close();
})();
