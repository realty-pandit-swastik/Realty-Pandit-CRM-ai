const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    // 1. Login page
    console.log('=== LOGIN PAGE ===');
    await page.goto('https://www.realtypandit.in/agent/login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/partner-login.png' });
    const loginTitle = await page.textContent('h2').catch(() => 'NOT FOUND');
    console.log('Title:', loginTitle);
    const otpBtn = await page.$('button[type="submit"]');
    console.log('OTP submit button:', !!otpBtn);
    const otpToggle = await page.$('text=Login with OTP');
    const pwToggle = await page.$('text=Login with Password');
    console.log('OTP toggle:', !!otpToggle, '| Password toggle:', !!pwToggle);

    // 2. Set localStorage to simulate logged-in state
    await page.evaluate(() => {
        localStorage.setItem('agent_token', 'test_token_for_qa');
        localStorage.setItem('agent_info', JSON.stringify({
            id: 'test', name: 'QA Test Agent', package: 'FREE',
            partner_category: 'INDIVIDUAL', has_password: false,
            coordinator: { name: 'Sunny Kumar', phone: '+919876543210', email: 'sunny@test.com' }
        }));
    });

    // 3. Dashboard
    console.log('\n=== DASHBOARD ===');
    await page.goto('https://www.realtypandit.in/agent/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/partner-dashboard.png' });
    const dashH1 = await page.textContent('h1').catch(() => 'NOT FOUND');
    console.log('H1:', dashH1);
    const bodyText = await page.textContent('body');
    console.log('Has "Active Listings":', bodyText.includes('Active Listings'));
    console.log('Has "Total Listings":', bodyText.includes('Total Listings'));
    console.log('Has "Conversion Rate" (old):', bodyText.includes('Conversion Rate'));
    console.log('Has coordinator card:', bodyText.includes('Your Coordinator'));
    console.log('Has "Account Security":', bodyText.includes('Account Security'));

    // 4. Inventory
    console.log('\n=== INVENTORY ===');
    await page.goto('https://www.realtypandit.in/agent/inventory', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/partner-inventory.png' });
    const invH1 = await page.textContent('h1').catch(() => 'NOT FOUND');
    console.log('H1:', invH1);
    const pageContent = await page.textContent('body');
    console.log('Has "Add Property" button:', pageContent.includes('Add Property'));
    console.log('Has DUMMY "2 BHK Flat in Sector 75":', pageContent.includes('2 BHK Flat in Sector 75'));
    console.log('Has DUMMY "3 BHK Luxury Apartment":', pageContent.includes('3 BHK Luxury Apartment'));
    console.log('Has "No properties listed" (empty state):', pageContent.includes('No properties listed'));
    console.log('Has "Loading inventory":', pageContent.includes('Loading inventory'));
    // Check there's no link to /post-property
    const oldLink = await page.$('a[href="/post-property"]');
    console.log('Old /post-property link exists:', !!oldLink);

    // Click Add Property button and check form appears
    const addBtn = await page.$('button:has-text("Add Property")');
    if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'screenshots/partner-inventory-form.png' });
        const formContent = await page.textContent('body');
        console.log('Form has "Intent":', formContent.includes('Intent'));
        console.log('Form has "Property Type":', formContent.includes('Property Type'));
        console.log('Form has "Location Details":', formContent.includes('Location Details'));
        console.log('Form has "Property Specs":', formContent.includes('Property Specs'));
        console.log('Form has "Pricing":', formContent.includes('Pricing'));
        console.log('Form has "Submit Property":', formContent.includes('Submit Property'));
    } else {
        console.log('ERROR: Add Property button not found!');
    }

    // 5. Leads
    console.log('\n=== LEADS ===');
    await page.goto('https://www.realtypandit.in/agent/leads', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/partner-leads.png' });
    const leadsContent = await page.textContent('body');
    console.log('Has "Leads & Enquiries":', leadsContent.includes('Leads & Enquiries'));
    console.log('Has DUMMY "Rahul Verma":', leadsContent.includes('Rahul Verma'));
    console.log('Has DUMMY "Hidden User":', leadsContent.includes('Hidden User'));
    console.log('Has "No leads yet" (empty state):', leadsContent.includes('No leads yet'));
    console.log('Has search input:', leadsContent.includes('Search leads'));

    // 6. Appointments
    console.log('\n=== APPOINTMENTS ===');
    await page.goto('https://www.realtypandit.in/agent/appointments', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/partner-appointments.png' });
    const aptContent = await page.textContent('body');
    console.log('Has "Appointments":', aptContent.includes('Appointments'));
    console.log('Has DUMMY "Amit Kumar":', aptContent.includes('Amit Kumar'));
    console.log('Has DUMMY "Hidden (Upgrade":', aptContent.includes('Hidden (Upgrade'));
    console.log('Has "No appointments scheduled" (empty state):', aptContent.includes('No appointments scheduled'));

    // Summary
    console.log('\n=== CONSOLE ERRORS ===');
    errors.forEach(e => console.log('  ERROR:', e.substring(0, 200)));
    if (errors.length === 0) console.log('  (none)');

    console.log('\n=== QA AUDIT COMPLETE ===');
    await browser.close();
})();
