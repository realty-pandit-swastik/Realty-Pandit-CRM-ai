"use client";

import { useEffect, useState } from "react";

export default function PWAUpdater() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed silently — non-critical
    });

    // Show update banner when a new service worker takes control (instead of force-reloading)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      setShowUpdateBanner(true);
    });

    // Periodically check for SW updates (every 60 seconds)
    const interval = setInterval(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
      }
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (!showUpdateBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3">
      <span className="text-sm font-medium">A new version is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap"
      >
        Refresh
      </button>
    </div>
  );
}
