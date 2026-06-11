/**
 * One-time script: Send test email templates to verify how they look.
 * Run: npx tsx send_test_emails.ts
 */
import { welcomeEmail, propertyEmail, appointmentEmail, reEngagementEmail } from './src/templates/email_templates';
import * as nodemailer from 'nodemailer';

const TO = 'realtypandit99@gmail.com, realtypandit2026@gmail.com';

const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
});

async function main() {
    // 1. Welcome Email
    const welcome = welcomeEmail('Sunny');
    await transporter.sendMail({
        from: 'Realty Pandit <noreply@realtypandit.in>',
        to: TO,
        subject: `[TEST v2] ${welcome.subject}`,
        html: welcome.html,
    });
    console.log('✅ Welcome email sent');

    // 2. Property Sharing Email
    const props = propertyEmail('Sunny', [
        {
            type: 'Flat',
            bhk: '2 BHK',
            location: 'Sector 150, Noida',
            price: '₹45 Lakh',
            area: '1050 sqft',
            image_url: 'https://realtypandit.in/logo.png',
            maps_link: 'https://maps.google.com/?q=28.5355,77.3910',
            property_url: 'https://realtypandit.in/properties',
        },
        {
            type: 'Flat',
            bhk: '3 BHK',
            location: 'Sector 75, Noida',
            price: '₹65 Lakh',
            area: '1400 sqft',
            maps_link: 'https://maps.google.com/?q=28.5800,77.3900',
            property_url: 'https://realtypandit.in/properties',
        },
    ]);
    await transporter.sendMail({
        from: 'Realty Pandit <noreply@realtypandit.in>',
        to: TO,
        subject: `[TEST v2] ${props.subject}`,
        html: props.html,
    });
    console.log('✅ Property sharing email sent');

    // 3. Appointment Confirmation Email
    const appt = appointmentEmail(
        'Sunny',
        'Saturday, 19 April 2026',
        '11:00 AM',
        '2 BHK Flat in Sector 150, Noida',
        'Rahul Sharma',
    );
    await transporter.sendMail({
        from: 'Realty Pandit <noreply@realtypandit.in>',
        to: TO,
        subject: `[TEST v2] ${appt.subject}`,
        html: appt.html,
    });
    console.log('✅ Appointment confirmation email sent');

    // 4. Re-engagement Email (dead/cold lead)
    const reengage = reEngagementEmail('Sunny', 'buy');
    await transporter.sendMail({
        from: 'Realty Pandit <noreply@realtypandit.in>',
        to: TO,
        subject: `[TEST v2] ${reengage.subject}`,
        html: reengage.html,
    });
    console.log('✅ Re-engagement email sent');

    console.log(`\n🎉 All 4 test emails (v2 - blue theme) sent to ${TO}`);
    process.exit(0);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
