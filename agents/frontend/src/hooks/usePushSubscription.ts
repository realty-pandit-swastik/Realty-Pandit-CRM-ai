/**
 * Hook to manage browser push notification subscription.
 * Handles: permission request, subscribe, unsubscribe, state persistence.
 */

import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushSubscription() {
    const [permission, setPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );
    const [subscribed, setSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Check current subscription state on mount
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        navigator.serviceWorker.ready.then(reg => {
            reg.pushManager.getSubscription().then(sub => {
                setSubscribed(!!sub);
            });
        });
    }, []);

    const subscribe = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Request permission
            const perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== 'granted') {
                setError('Notification permission denied');
                setLoading(false);
                return false;
            }

            // Get VAPID public key from backend
            const { data: { publicKey } } = await client.get('/api/notifications/push/vapid-key');
            if (!publicKey) {
                setError('Push not configured on server');
                setLoading(false);
                return false;
            }

            // Subscribe via service worker
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
            });

            // Send subscription to backend
            const subJson = subscription.toJSON();
            await client.post('/api/notifications/push/subscribe', {
                endpoint: subJson.endpoint,
                keys: subJson.keys,
            });

            setSubscribed(true);
            setLoading(false);
            return true;
        } catch (err: any) {
            setError(err?.message || 'Failed to subscribe');
            setLoading(false);
            return false;
        }
    }, []);

    const unsubscribe = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) {
                // Remove from backend
                await client.delete('/api/notifications/push/subscribe', {
                    data: { endpoint: subscription.endpoint },
                });
                // Unsubscribe locally
                await subscription.unsubscribe();
            }
            setSubscribed(false);
            setLoading(false);
            return true;
        } catch (err: any) {
            setError(err?.message || 'Failed to unsubscribe');
            setLoading(false);
            return false;
        }
    }, []);

    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

    return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
