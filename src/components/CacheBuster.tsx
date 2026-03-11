"use client";

import { useEffect } from "react";

/**
 * Invisible client component that:
 *
 * 1. On mount — unregisters any stale Service Workers.
 * 2. On `beforeunload` — purges localStorage, sessionStorage, and all
 *    IndexedDB databases so the next page load always starts clean.
 *
 * Drop this into the root layout `<body>` to guarantee no cached state
 * persists across sessions.
 */
export function CacheBuster() {
  useEffect(() => {
    // ── Service Worker teardown ──────────────────────────────────────
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }

    // ── beforeunload: purge all client-side persistence ─────────────
    function purgeClientCaches() {
      try {
        localStorage.clear();
      } catch {
        /* storage may be unavailable */
      }
      try {
        sessionStorage.clear();
      } catch {
        /* storage may be unavailable */
      }

      // Delete every IndexedDB database the browser exposes
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        indexedDB
          .databases()
          .then((dbs) => {
            for (const db of dbs) {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            }
          })
          .catch(() => {
            /* ignore — not all browsers support .databases() */
          });
      }
    }

    window.addEventListener("beforeunload", purgeClientCaches);

    return () => {
      window.removeEventListener("beforeunload", purgeClientCaches);
    };
  }, []);

  return null;
}
