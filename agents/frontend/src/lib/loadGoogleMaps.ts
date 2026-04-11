/**
 * Shared Google Maps script loader.
 * Ensures the Google Maps JS API (with Places library) is loaded exactly once,
 * regardless of which component requests it first.
 */

const GOOGLE_MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
    // Already fully loaded with Places
    if ((window as any).google?.maps?.places) {
        return Promise.resolve();
    }

    // Loading already in progress — return the same promise
    if (loadPromise) return loadPromise;

    loadPromise = new Promise<void>((resolve, reject) => {
        // Check for ANY existing Google Maps script tag (from any loader)
        const existing = document.querySelector(
            'script[src*="maps.googleapis.com/maps/api/js"]'
        );
        if (existing) {
            // Script tag exists — wait for it to finish loading
            if ((window as any).google?.maps?.places) {
                resolve();
                return;
            }
            const onLoad = () => {
                existing.removeEventListener('load', onLoad);
                resolve();
            };
            existing.addEventListener('load', onLoad);
            // Timeout fallback in case script already loaded but Places isn't available
            setTimeout(() => resolve(), 10000);
            return;
        }

        // No script exists — create one with Places library
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loadPromise = null;
            reject(new Error('Failed to load Google Maps'));
        };
        document.head.appendChild(script);
    });

    return loadPromise;
}

export { GOOGLE_MAPS_KEY };
