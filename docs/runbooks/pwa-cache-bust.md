# PWA Cache Bust — Force a Service Worker Refresh

## When to use

After deploying any frontend change where you need PWA users (installed admin app on Android/iOS) to pick up the new code immediately, not when their browser eventually decides to refetch.

If you skip this step and the JS bundle hash didn't change in a way that touches the precache manifest, the PWA shows the old UI indefinitely.

## How it works

Frontend is built with Vite Plugin PWA, configured `registerType: 'autoUpdate'` + `skipWaiting()` + `clientsClaim()`. The service worker checks for updates by comparing the precache manifest revision. New revision → new SW → automatic reload.

The revision is derived from the content hash of files included in the manifest. If `index.html` content changes, the manifest revision changes, the SW updates, browsers refresh.

## The trick

Bump a comment in `frontend/index.html`:

```html
<title>Realty Pandit - Dashboard</title>
<!-- v20260509 -->
```

Change the date stamp on each deploy that needs to force a PWA refresh. Then run the normal deploy.

## Verification

After deploy, hit `https://admin.realtypandit.in/sw.js` in a fresh tab. The `__WB_MANIFEST` revision string at the top should match a recent timestamp. Compare against the previous version to confirm it changed.

To check service worker registration on a client:
```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => console.log(r.active?.scriptURL)))
```

## When you DON'T need this

- Backend-only changes (no frontend assets touched)
- CSS-only Tailwind utility changes that already cause a fresh CSS hash (verify the bundle hash actually changed)
- Dev-mode work (PWA SW is disabled in dev)

## Related

- [`deploy.md`](deploy.md) — the deploy flow this fits into
