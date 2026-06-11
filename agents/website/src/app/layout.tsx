import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import LeadCapture from "@/components/LeadCapture";
import PWAUpdater from "./pwa-updater";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.realtypandit.in'),
  alternates: {
    canonical: '/',
  },
  title: {
    default: "Realty Pandit - Find Your Dream Property",
    template: "%s | Realty Pandit",
  },
  description: "Buy, sell, or rent properties across India with Panditji, your AI-powered property assistant. Browse flats, houses, plots, and commercial spaces.",
  keywords: ["real estate", "property", "buy", "sell", "rent", "India", "Panditji", "Realty Pandit", "AI property assistant"],
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
  openGraph: {
    title: "Realty Pandit - Find Your Dream Property",
    description: "AI-powered real estate platform for buying, selling, and renting properties across India.",
    type: "website",
    siteName: "Realty Pandit",
    url: "https://www.realtypandit.in",
  },
  twitter: {
    card: "summary_large_image",
    title: "Realty Pandit - Find Your Dream Property",
    description: "AI-powered real estate platform for buying, selling, and renting properties across India.",
  },
  verification: {
    other: {
      'facebook-domain-verification': 'j0gel34v3mstljpgk43e77vnk74j3w',
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1a365d',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "RealEstateAgent",
              "name": "Realty Pandit",
              "description": "AI-powered real estate platform for buying, selling, and renting properties across India.",
              "url": "https://www.realtypandit.in",
              "logo": "https://www.realtypandit.in/logo.png",
              "sameAs": [
                "https://www.facebook.com/airealtypandit",
                "https://www.instagram.com/airealtypandit",
                "https://www.youtube.com/channel/UCQa1_h4333_Ke9RIKSx_Gow",
                "https://maps.app.goo.gl/PrKZPa8mNiNuWHJv9"
              ],
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "IN"
              },
              "areaServed": [
                { "@type": "City", "name": "Noida" },
                { "@type": "City", "name": "Gurgaon" },
                { "@type": "City", "name": "Delhi" },
                { "@type": "City", "name": "Mumbai" },
                { "@type": "City", "name": "Bangalore" },
                { "@type": "City", "name": "Pune" },
                { "@type": "City", "name": "Hyderabad" },
                { "@type": "City", "name": "Chennai" }
              ],
              "knowsAbout": ["Real Estate", "Property Buying", "Property Selling", "Property Rental", "Home Loans", "RERA"],
              "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "Property Listings",
                "itemListElement": [
                  { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Residential Properties" }},
                  { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Commercial Properties" }},
                  { "@type": "Offer", "itemOffered": { "@type": "Product", "name": "Plots & Land" }}
                ]
              }
            })
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 overflow-x-hidden`}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TBFWLRD7"
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}></iframe>
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        <ThemeProvider>
          <ToastProvider>
            <PWAUpdater />
            <Navbar />
            <main className="min-h-screen">{children}</main>
            <Footer />
            <WhatsAppButton />
            <LeadCapture />
          </ToastProvider>
        </ThemeProvider>

        {/* Google Tag Manager */}
        <Script
          id="gtm-script"
          strategy="afterInteractive"
        >{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TBFWLRD7');`}</Script>
        {/* End Google Tag Manager */}

        {/* Google Analytics */}
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-WJF3Y3SXM3"
        />
        <Script
          id="gtag-config"
          strategy="afterInteractive"
        >{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',wait_for_update:500});
gtag('js', new Date());
gtag('config', 'G-WJF3Y3SXM3');`}</Script>
        {/* End Google Analytics */}
      </body>
    </html>
  );
}
