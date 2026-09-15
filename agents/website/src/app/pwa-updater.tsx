"use client";

import { useEffect, useState } from "react";
import { initPwaTracking, trackPwaEvent } from "@/lib/analytics";

export default function PWAUpdater() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Global unhandled promise rejection logging
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("[UnhandledRejection]", event.reason);
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    initPwaTracking();

    // Capture whether there was already a SW controlling the page before registration.
    // If not, the first controllerchange is a first-install — no update banner needed.
    const hadPreviousController = Boolean(navigator.serviceWorker.controller);

    // Register service worker
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed silently — non-critical
    });

    // Show update banner when a new service worker takes control (instead of force-reloading).
    // Skip on first install (hadPreviousController === false) to avoid confusing new visitors.
    let reloadPending = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadPreviousController) return;  // first install — not an update
      if (reloadPending) return;
      reloadPending = true;
      trackPwaEvent("pwa_update_available");
      setShowUpdateBanner(true);
    });

    // Periodically check for SW updates (every 60 seconds)
    const interval = setInterval(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
      }
    }, 60 * 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  if (!showUpdateBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3">
      <span className="text-sm font-medium">A new version is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="px-4 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap"
      >
        Refresh
      </button>
    </div>
  );
}
