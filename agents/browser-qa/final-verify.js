const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const dir = path.join(__dirname, 'screenshots', 'final-verify');
    fs.mkdirSync(dir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true
    });
    const page = await context.newPage();

    // Login
    await page.goto('https://admin.realtypandit.in/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder="e.g. 9876543210"]', '9217151405');
    await page.fill('input[placeholder="Enter your password"]', 'real3121');
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(dir, '01-dashboard.png') });

    // Go to Inventory via bottom nav bar (not sidebar)
    // The bottom nav has: Home, Chats, Inventory, Team, Menu
    const bottomInventory = page.locator('text=Inventory').last();
    await bottomInventory.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(dir, '02-inventory-list.png') });

    // Click on the first property card - use the property type text
    // From screenshot: "Residential - Apartment" is the first card
    const firstPropTitle = page.locator('text=Residential - Apartment').first();
    await firstPropTitle.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(dir, '03-edit-initial.png') });

    // Check current URL to see if we navigated
    console.log('Current URL after card click:', page.url());

    // Check if a drawer/sidebar opened - if so, close it and try differently
    const closeBtn = page.locator('button:has-text("×"), [aria-label="close"], svg[data-testid="CloseIcon"]');
    if (await closeBtn.count() > 0) {
        console.log('Found close button, sidebar may have opened');
    }

    // Debug: dump the page structure around the clicked area
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);

    // Scroll down and take screenshots of the edit form
    for (let i = 0; i < 8; i++) {
        // Try multiple scroll strategies
        await page.evaluate((scrollAmount) => {
            // Strategy 1: scroll the main window
            window.scrollBy(0, 600);
            // Strategy 2: scroll any overflow container
            const scrollables = document.querySelectorAll('[style*="overflow"]');
            scrollables.forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.overflow === 'auto' || style.overflow === 'scroll' ||
                    style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    el.scrollTop += 600;
                }
            });
            // Strategy 3: scroll main content area
            const main = document.querySelector('main, [role="main"], .MuiBox-root');
            if (main) main.scrollTop += 600;
        }, 600);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(dir, `04-scroll-${i+1}.png`) });
    }

    await browser.close();
    console.log('Done! Screenshots saved to:', dir);
})();
