const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'verify-inventory-fix');
const BASE_URL = 'https://admin.realtypandit.in';
const PHONE = '9217151405';
const PASSWORD = 'real3121';

(async () => {
  // Ensure screenshots dir exists
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Step 1: Login
    console.log('1. Navigating to admin login...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00-login-page.png'), fullPage: false });

    // Fill phone number
    const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i]').first();
    await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
    await phoneInput.fill(PHONE);
    console.log('   Phone entered.');

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill(PASSWORD);
    console.log('   Password entered.');

    // Click login button
    const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In"), button:has-text("Log in")').first();
    await loginBtn.click();
    console.log('   Login button clicked. Waiting for navigation...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-after-login.png'), fullPage: false });
    console.log('   Login complete. URL:', page.url());

    // Step 2: Navigate to Inventory tab via bottom nav
    console.log('2. Looking for Inventory tab in bottom nav...');
    // Try various selectors for inventory/properties bottom nav item
    const inventorySelectors = [
      'nav a:has-text("Inventory")',
      'a:has-text("Inventory")',
      'button:has-text("Inventory")',
      'nav a:has-text("Properties")',
      'a:has-text("Properties")',
      '[href*="inventory"]',
      '[href*="properties"]',
      'nav >> text=Inventory',
    ];

    let inventoryClicked = false;
    for (const sel of inventorySelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          inventoryClicked = true;
          console.log('   Clicked inventory with selector:', sel);
          break;
        }
      } catch (e) { /* try next */ }
    }

    if (!inventoryClicked) {
      console.log('   Could not find Inventory tab directly. Taking screenshot of current state...');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-looking-for-inventory.png'), fullPage: true });
      // Try tapping bottom nav items
      const bottomNavLinks = page.locator('nav a, nav button, [role="tablist"] button, [role="tablist"] a');
      const count = await bottomNavLinks.count();
      console.log(`   Found ${count} nav items. Listing them:`);
      for (let i = 0; i < count; i++) {
        const text = await bottomNavLinks.nth(i).textContent();
        console.log(`     [${i}]: "${text?.trim()}"`);
      }
      // Try clicking one that might be inventory
      for (let i = 0; i < count; i++) {
        const text = (await bottomNavLinks.nth(i).textContent()) || '';
        if (/inventor|propert|listing/i.test(text)) {
          await bottomNavLinks.nth(i).click();
          inventoryClicked = true;
          console.log(`   Clicked nav item [${i}]: "${text.trim()}"`);
          break;
        }
      }
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-inventory-list.png'), fullPage: false });
    console.log('   On inventory page. URL:', page.url());

    // Step 3: Click on a property card to open edit
    console.log('3. Looking for a property card to open edit...');

    // Click on the first property card - try clicking on the property title text
    let cardClicked = false;
    const titleSelectors = [
      'text=Residential - Apartment',
      'text=Commercial',
      'text=Residential - Individual Housing',
    ];

    for (const sel of titleSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          cardClicked = true;
          console.log('   Clicked property card with selector:', sel);
          break;
        }
      } catch (e) { /* try next */ }
    }

    if (!cardClicked) {
      // Fallback: try clicking on the price or any tappable area in the first card region
      console.log('   Trying fallback: tap on first card area...');
      // Tap in the area of the first card (roughly y=230 from the screenshot)
      await page.tap('body', { position: { x: 187, y: 230 } });
      cardClicked = true;
      console.log('   Tapped on first card area');
    }

    if (!cardClicked) {
      console.log('   Could not find property card. Taking full page screenshot...');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-no-cards-found.png'), fullPage: true });
    }

    await page.waitForTimeout(3000);
    console.log('   On edit page. URL:', page.url());

    // Screenshot 1: Edit form initial view (Media section at top)
    console.log('4. Taking screenshot of edit form initial view (Media section)...');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-edit-form-media-section.png'),
      fullPage: false
    });

    // Also take a full page screenshot for reference
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-edit-form-full.png'),
      fullPage: true
    });

    // Screenshot 2: Scroll to Assignment & Sharing section
    console.log('5. Scrolling to Assignment & Sharing section...');
    // Try to find the section by various text patterns
    const assignmentSelectors = [
      'text=Assignment & Sharing',
      'text=Assignment',
      'text=Sharing',
      'text=Transfer',
      'text=transfer',
    ];
    let foundAssignment = false;
    for (const sel of assignmentSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.scrollIntoViewIfNeeded();
          foundAssignment = true;
          console.log('   Found and scrolled to:', sel);
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!foundAssignment) {
      console.log('   Could not find Assignment section text, scrolling down manually...');
      await page.evaluate(() => window.scrollBy(0, 1200));
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-assignment-sharing-section.png'),
      fullPage: false
    });

    // Screenshot 3: Scroll to bottom to show Save button
    console.log('6. Scrolling to bottom for Save Changes button...');
    // Try to find the save button
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').last();
    try {
      await saveBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
    } catch (e) {
      console.log('   Could not find Save button, scrolling to bottom...');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-save-button-bottom.png'),
      fullPage: false
    });

    // Check if save button is visible and not obscured
    try {
      const saveBtnVisible = await saveBtn.isVisible({ timeout: 3000 });
      const saveBtnBox = await saveBtn.boundingBox();
      if (saveBtnBox) {
        const viewportHeight = 812;
        const bottomNavHeight = 64; // typical bottom nav height
        const maxVisibleY = viewportHeight - bottomNavHeight;
        const btnBottomY = saveBtnBox.y + saveBtnBox.height;
        console.log(`   Save button position: y=${saveBtnBox.y}, bottom=${btnBottomY}, viewport=${viewportHeight}`);
        if (btnBottomY > maxVisibleY) {
          console.log('   WARNING: Save button may be partially hidden behind bottom nav!');
        } else {
          console.log('   OK: Save button is fully visible above bottom nav.');
        }
      }
      console.log('   Save button visible:', saveBtnVisible);
    } catch (e) {
      console.log('   Could not check save button visibility:', e.message);
    }

    console.log('\nAll screenshots saved to:', SCREENSHOTS_DIR);
    console.log('Verification complete!');

  } catch (err) {
    console.error('Error during verification:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-state.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
