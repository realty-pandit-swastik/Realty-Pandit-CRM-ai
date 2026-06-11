// Realty Pandit Admin CRM — Google Analytics 4
// Measurement ID is set via VITE_GA_MEASUREMENT_ID environment variable.
// If the variable is not set, all tracking calls are silent no-ops.

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

// Module-level guard — prevents double-init during hot-reload
let _initialized = false;

// ─── PII scrubbing ────────────────────────────────────────────────────────────
// Strip phone numbers, emails, and contact names from strings before sending to GA.
function scrubPii(value: string): string {
  return value
    .replace(/\b\d{10}\b/g, '[phone]')
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, '[phone]')
    .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/Contact:\s*[^)|\n]+/gi, 'Contact: [name]')
    .replace(/Lead:\s*[^)|\n]+/gi, 'Lead: [name]');
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

function gtagCall(...args: unknown[]): void {
  if (typeof window === 'undefined' || !('gtag' in window)) return;
  (window as any).gtag(...args);
}

// Load gtag script dynamically (only if GA_ID is set)
export function initAnalytics(): void {
  if (_initialized || !GA_ID || typeof window === 'undefined') return;
  _initialized = true;

  if (document.getElementById('gtag-script')) return; // already loaded

  // dataLayer + gtag stub must exist before the async script arrives
  (window as any).dataLayer = (window as any).dataLayer ?? [];
  (window as any).gtag = function (...args: unknown[]) {
    (window as any).dataLayer.push(args);
  };

  // Default consent denied until user accepts (GDPR best practice)
  gtagCall('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    wait_for_update: 500,
  });

  gtagCall('js', new Date());
  gtagCall('config', GA_ID, {
    anonymize_ip: true,
    send_page_view: false, // We fire page views manually
  });

  const script = document.createElement('script');
  script.id = 'gtag-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (!GA_ID) return;
  gtagCall('event', eventName, params);

  if (import.meta.env.DEV) {
    console.log('[Analytics]', eventName, params);
  }
}

export function trackPageView(path: string, title?: string): void {
  if (!GA_ID) return;
  gtagCall('event', 'page_view', {
    page_path: path,
    page_title: title ? scrubPii(title) : undefined,
  });
}

type PwaEvent =
  | 'pwa_install_prompt_shown'
  | 'pwa_install_completed'
  | 'pwa_install_dismissed'
  | 'pwa_standalone_launch'
  | 'pwa_offline'
  | 'pwa_online'
  | 'pwa_update_available'
  | 'pwa_update_applied'
  | 'pwa_notification_received';

export function trackPwaEvent(event: PwaEvent, params?: Record<string, string | number | boolean>): void {
  trackEvent(event, { event_category: 'PWA', ...params });
}

export function trackError(error: Error | string, fatal = false): void {
  const description = typeof error === 'string' ? error : error.message;
  trackEvent('exception', { description: scrubPii(description), fatal });
}

/** Grant analytics consent — call after the user accepts the consent banner. */
export function grantAnalyticsConsent(): void {
  gtagCall('consent', 'update', { analytics_storage: 'granted' });
  trackEvent('consent_granted');
}

// ─── Admin-specific event helpers ─────────────────────────────────────────────

export const adminAnalytics = {
  loginSuccess: (role: string) => trackEvent('admin_login', { role }),
  logout: () => trackEvent('admin_logout'),
  sessionExpired: () => trackEvent('admin_session_expired'),

  viewInventory: (count: number) => trackEvent('view_inventory', { item_count: count }),
  createInventoryItem: (type: string) => trackEvent('inventory_item_created', { property_type: type }),
  updateInventoryItem: (type: string) => trackEvent('inventory_item_updated', { property_type: type }),
  deleteInventoryItem: () => trackEvent('inventory_item_deleted'),
  exportInventory: (format: 'csv' | 'xlsx' | 'pdf') => trackEvent('inventory_exported', { format }),

  viewLeads: (count: number) => trackEvent('view_leads', { lead_count: count }),
  updateLeadStatus: (status: string) => trackEvent('lead_status_updated', { new_status: status }),
  addFollowUp: () => trackEvent('followup_added'),

  viewDeals: () => trackEvent('view_deals'),
  updateDealStage: (stage: string) => trackEvent('deal_stage_updated', { stage }),

  createContact: () => trackEvent('contact_created'),

  viewReport: (reportType: string) => trackEvent('report_viewed', { report_type: reportType }),
  exportReport: (reportType: string, format: string) =>
    trackEvent('report_exported', { report_type: reportType, format }),

  createCampaign: (channel: string) => trackEvent('campaign_created', { channel }),
  deleteCampaign: () => trackEvent('campaign_deleted'),
};

// ─── PWA tracking ─────────────────────────────────────────────────────────────

export function initPwaTracking(): void {
  if (typeof window === 'undefined') return;

  if (window.matchMedia('(display-mode: standalone)').matches) {
    trackPwaEvent('pwa_standalone_launch');
  }

  window.addEventListener('offline', () => trackPwaEvent('pwa_offline'));
  window.addEventListener('online', () => trackPwaEvent('pwa_online'));

  window.addEventListener('beforeinstallprompt', () => {
    trackPwaEvent('pwa_install_prompt_shown');
  });

  window.addEventListener('appinstalled', () => {
    trackPwaEvent('pwa_install_completed');
  });

  // Listen for our custom SW update event (dispatched from main.tsx)
  window.addEventListener('sw-update-ready', () => {
    trackPwaEvent('pwa_update_available');
  });

  // Push notification received (sw-push.js posts a message to the client)
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      trackPwaEvent('pwa_notification_received');
    }
  });
}
