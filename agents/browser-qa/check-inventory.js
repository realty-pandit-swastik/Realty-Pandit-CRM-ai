const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  const networkFails = [];
  const apiCalls = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push({ url: page.url(), text: msg.text() }); });
  page.on('requestfailed', req => { networkFails.push({ url: req.url(), error: req.failure()?.errorText, type: req.resourceType() }); });
  page.on('response', res => {
    if (res.url().includes('api.realtypandit') || res.url().includes('/api/')) {
      apiCalls.push({ url: res.url(), status: res.status(), method: res.request().method() });
    }
  });

  // Step 1: Go to Post Property page
  console.log('=== Step 1: Opening Post Property Page ===');
  await page.goto('https://www.realtypandit.in/post-property', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/post-property-page.png', fullPage: true });

  const pageContent = await page.evaluate(() => ({
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent?.trim()),
    forms: [...document.querySelectorAll('form')].length,
    buttons: [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim().slice(0, 50), type: b.type, disabled: b.disabled,
      classes: b.className?.toString().slice(0, 80)
    })),
    selects: [...document.querySelectorAll('select')].map(s => ({
      name: s.name, id: s.id,
      options: [...s.options].map(o => o.text).slice(0, 10)
    })),
    inputs: [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, required: i.required, value: i.value
    })),
    textareas: [...document.querySelectorAll('textarea')].map(t => ({
      name: t.name, placeholder: t.placeholder
    })),
    allText: document.body.innerText?.slice(0, 3000)
  }));
  console.log('Page Title:', pageContent.title);
  console.log('H1 tags:', JSON.stringify(pageContent.h1));
  console.log('Form count:', pageContent.forms);
  console.log('Buttons:', JSON.stringify(pageContent.buttons, null, 2));
  console.log('Selects:', JSON.stringify(pageContent.selects, null, 2));
  console.log('Inputs:', JSON.stringify(pageContent.inputs, null, 2));
  console.log('Textareas:', JSON.stringify(pageContent.textareas, null, 2));
  console.log('\n--- Page Text (first 3000 chars) ---');
  console.log(pageContent.allText);

  // Step 2: Try to fill the phone/name input
  console.log('\n=== Step 2: Trying form interaction ===');
  const phoneInput = await page.$('input[type="tel"], input[name*="phone"], input[placeholder*="phone" i], input[placeholder*="mobile" i]');
  if (phoneInput) {
    console.log('Found phone input, filling...');
    await phoneInput.fill('9876543210');
    await page.waitForTimeout(1000);
  } else {
    console.log('No phone input found');
  }

  const nameInput = await page.$('input[name*="name"], input[placeholder*="name" i]');
  if (nameInput) {
    console.log('Found name input, filling...');
    await nameInput.fill('Test User');
    await page.waitForTimeout(500);
  }

  // Try clicking any action button
  const actionButtons = ['Next', 'Continue', 'Start', 'Submit', 'Post', 'Begin', 'Get Started', 'Proceed', 'List Property'];
  for (const btnText of actionButtons) {
    const btn = await page.$(`button:has-text("${btnText}")`);
    if (btn) {
      const isDisabled = await btn.evaluate(b => b.disabled);
      console.log(`Found button "${btnText}" (disabled: ${isDisabled})`);
      if (!isDisabled) {
        console.log(`Clicking "${btnText}"...`);
        await btn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'screenshots/post-property-after-click.png', fullPage: true });

        // Check for errors after click
        const errorMsgs = await page.evaluate(() => {
          const errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], .toast, [class*="toast"], [class*="warning"], [class*="danger"]');
          return [...errEls].map(el => el.textContent?.trim().slice(0, 200));
        });
        if (errorMsgs.length) console.log('Error messages found:', errorMsgs);

        // Check new page state
        const newState = await page.evaluate(() => ({
          url: window.location.href,
          text: document.body.innerText?.slice(0, 1500),
          inputs: [...document.querySelectorAll('input,select,textarea')].map(i => ({
            tag: i.tagName, type: i.type, name: i.name, placeholder: i.placeholder
          }))
        }));
        console.log('After click URL:', newState.url);
        console.log('New inputs:', JSON.stringify(newState.inputs, null, 2));
        console.log('Page text after click:', newState.text?.slice(0, 1000));
        break;
      }
    }
  }

  // Step 3: Check /properties/add
  console.log('\n=== Step 3: Checking /properties/add ===');
  await page.goto('https://www.realtypandit.in/properties/add', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/properties-add-page.png', fullPage: true });
  const addText = await page.evaluate(() => document.body.innerText?.slice(0, 2000));
  console.log('Properties/add page text:', addText);

  // Step 4: Check the API workflow endpoint directly
  console.log('\n=== Step 4: Testing Workflow API ===');
  try {
    const defResp = await page.request.get('https://api.realtypandit.in/api/workflow/definition', { timeout: 10000 });
    console.log('Workflow definition:', defResp.status());
    if (defResp.status() === 200) {
      const def = await defResp.json();
      console.log('Workflow steps:', JSON.stringify(def).slice(0, 500));
    } else {
      const body = await defResp.text();
      console.log('Workflow definition body:', body.slice(0, 300));
    }
  } catch (e) {
    console.log('Workflow API error:', e.message);
  }

  // Try next-step API
  try {
    const nextResp = await page.request.post('https://api.realtypandit.in/api/workflow/next-step', {
      data: { answers: {}, current_step: null },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('Next step API:', nextResp.status());
    const nextBody = await nextResp.text();
    console.log('Next step response:', nextBody.slice(0, 500));
  } catch (e) {
    console.log('Next step API error:', e.message);
  }

  // Final summary
  console.log('\n=== FINAL SUMMARY ===');
  console.log('Console errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('  ERR:', e.text.slice(0, 200)));
  console.log('Network failures:', networkFails.filter(f => !f.url.includes('google-analytics')).length);
  networkFails.filter(f => !f.url.includes('google-analytics')).forEach(f => console.log('  NET:', f.url.slice(0, 100), '-', f.error));
  console.log('API calls made:', apiCalls.length);
  apiCalls.forEach(a => console.log('  API:', a.method, a.url.slice(0, 100), '->', a.status));

  // Save report
  const report = { errors, networkFails: networkFails.filter(f => !f.url.includes('google-analytics')), apiCalls, pageContent };
  fs.writeFileSync('reports/inventory-check.json', JSON.stringify(report, null, 2));
  console.log('\nReport saved to reports/inventory-check.json');

  await page.waitForTimeout(3000);
  await browser.close();
})();
