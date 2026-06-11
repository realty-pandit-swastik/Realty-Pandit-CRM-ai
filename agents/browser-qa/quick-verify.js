const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'quick-verify');
const BASE_URL = 'https://admin.realtypandit.in';
const PHONE = '9217151405';
const PASSWORD = 'real3121';

(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    const cacheBust = Date.now();

    // 1. Login
    console.log('Navigating to login page...');
    await page.goto(`${BASE_URL}/login?v=${cacheBust}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Filling login credentials...');
    const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i]').first();
    await phoneInput.fill(PHONE);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(PASSWORD);

    const loginBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();
    await loginBtn.click();

    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');
    console.log('Logged in. URL:', page.url());

    // 2. Navigate to Inventory tab
    console.log('Clicking Inventory tab...');
    await page.locator('text=Inventory').first().click();
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle');
    console.log('On inventory page. URL:', page.url());

    // Debug: dump page structure to help find clickable cards
    const pageContent = await page.evaluate(() => {
      const items = document.querySelectorAll('h2, h3, h4, h5, h6, [class*="title"], [class*="name"], p');
      return Array.from(items).slice(0, 20).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 80),
        class: el.className?.toString().substring(0, 60),
        parent: el.parentElement?.tagName + '.' + el.parentElement?.className?.toString().substring(0, 40),
      }));
    });
    console.log('Page elements:', JSON.stringify(pageContent, null, 2));

    // 3. Click on the first property card - use the property type text
    console.log('Clicking on first property card...');

    // Try clicking the property title text "Residential - Apartment"
    const propertyTitle = page.locator('text=Residential - Apartment').first();
    try {
      if (await propertyTitle.isVisible({ timeout: 3000 })) {
        await propertyTitle.click();
        console.log('Clicked "Residential - Apartment"');
      }
    } catch (e) {
      console.log('Could not click property title, trying alternative...');
    }

    await page.waitForTimeout(3000);

    // Check if we navigated to edit page
    let currentUrl = page.url();
    console.log('After card click URL:', currentUrl);

    // If still on inventory page, try tapping on the card area
    if (currentUrl.includes('inventory') || !currentUrl.includes('edit')) {
      console.log('Still on inventory, trying tap on card area...');
      // Try tapping at coordinates where the first card is (roughly centered)
      await page.tap('text=Residential - Apartment', { force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      currentUrl = page.url();
      console.log('After tap URL:', currentUrl);
    }

    // If still not on edit, try clicking parent containers or links
    if (!currentUrl.includes('edit')) {
      console.log('Trying to find clickable parent of property card...');
      const clickResult = await page.evaluate(() => {
        // Find the text node and walk up to find a clickable parent
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.includes('Residential - Apartment') &&
              el.children.length < 5 &&
              el.textContent.length < 200) {
            // Walk up to find <a> or clickable parent
            let current = el;
            for (let i = 0; i < 10; i++) {
              if (!current) break;
              if (current.tagName === 'A') {
                return { found: true, href: current.href, tag: current.tagName };
              }
              if (current.onclick || current.getAttribute('role') === 'button') {
                current.click();
                return { found: true, clicked: true, tag: current.tagName };
              }
              current = current.parentElement;
            }
            // Just click the element itself
            el.click();
            return { found: true, clicked: true, tag: el.tagName, text: el.textContent?.substring(0, 50) };
          }
        }
        return { found: false };
      });
      console.log('Click result:', JSON.stringify(clickResult));
      await page.waitForTimeout(3000);
      currentUrl = page.url();
      console.log('After JS click URL:', currentUrl);
    }

    // If still not on edit page, dump all links for debugging
    if (!currentUrl.includes('edit')) {
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent?.trim().substring(0, 50),
          visible: a.offsetParent !== null,
        })).filter(l => l.visible);
      });
      console.log('Visible links:', JSON.stringify(links, null, 2));

      // Try clicking first link that looks like it goes to edit/detail
      const editLink = links.find(l => l.href.includes('edit') || l.href.includes('detail') || l.href.includes('property'));
      if (editLink) {
        console.log('Navigating to:', editLink.href);
        await page.goto(editLink.href + (editLink.href.includes('?') ? '&' : '?') + `v=${cacheBust}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
      }
    }

    console.log('Final URL before screenshots:', page.url());

    // 4. Take screenshots
    // Screenshot 1: Initial view
    console.log('Taking screenshot 1: initial-view.png');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'initial-view.png'),
      fullPage: false,
    });

    // Screenshot 2: Scroll to Assignment & Sharing section
    console.log('Taking screenshot 2: scroll-to-assignment.png');
    try {
      const assignEl = page.locator('text=/Assignment.*Sharing|Sharing|Assignment/i').first();
      await assignEl.scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('Assignment section not found by text, scrolling down 2000px...');
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(1000);
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'scroll-to-assignment.png'),
      fullPage: false,
    });

    // Screenshot 3: Scroll to Save button
    console.log('Taking screenshot 3: scroll-to-save.png');
    try {
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Submit")').first();
      await saveBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('Save button not found, scrolling to bottom...');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'scroll-to-save.png'),
      fullPage: false,
    });

    // Screenshot 4: Full page
    console.log('Taking screenshot 4: full-page.png');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'full-page.png'),
      fullPage: true,
    });

    console.log('All screenshots taken!');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'error.png'),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
})();
