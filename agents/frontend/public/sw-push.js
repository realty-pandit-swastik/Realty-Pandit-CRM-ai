/**
 * Push Notification Handler for Realty Pandit PWA
 * Handles incoming push events and notification clicks.
 */

self.addEventListener('push', function (event) {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch {
        data = { title: 'Realty Pandit', body: event.data.text() };
    }

    const options = {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192x192.png',
        badge: data.badge || '/icons/icon-192x192.png',
        tag: data.tag || 'rp-notification',
        renotify: true,
        data: {
            url: data.action_url || '/',
            notification_id: data.notification_id,
        },
        actions: [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Realty Pandit', options)
    );
});

const ALLOWED_ORIGINS = ['https://admin.realtypandit.in', 'https://agents.realtypandit.in', 'http://localhost:5173', 'http://localhost:4173'];

function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return ALLOWED_ORIGINS.some(origin => parsed.origin === origin) || urlString.startsWith('/');
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const rawUrl = event.notification.data?.url || '/';
    const url = isSafeUrl(rawUrl) ? rawUrl : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Focus existing window if open
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes('admin.realtypandit.in') && 'focus' in client) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
