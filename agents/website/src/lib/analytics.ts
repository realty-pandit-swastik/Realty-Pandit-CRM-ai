// Realty Pandit Marketing Portal — Analytics
// GA4 Measurement ID: G-WJF3Y3SXM3

declare function gtag(...args: any[]): void;

export function trackPageView(path: string, title?: string): void {
  if (typeof window === 'undefined' || !('gtag' in window)) return;
  gtag('event', 'page_view', {
    page_path: path,
    page_title: title,
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
  | 'pwa_update_applied';

export function trackPwaEvent(event: PwaEvent, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined' || !('gtag' in window)) return;
  (window as any).gtag('event', event, {
    event_category: 'PWA',
    ...params,
  });
}

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
}
