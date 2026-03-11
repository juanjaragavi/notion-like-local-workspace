"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Invisible client component that:
 *
 * 1. On mount — unregisters any stale Service Workers.
 * 2. On `pagehide` (tab/window close only) — purges localStorage,
 *    sessionStorage, and all IndexedDB databases so the next launch
 *    always starts clean.
 *
 * We use `pagehide` with `event.persisted === false` instead of
 * `beforeunload` so the purge does NOT fire during OAuth redirects
 * or same-tab navigations (which would break auth flows).
 */
export function CacheBuster() {
  // Track whether an OAuth redirect has been initiated so we can
  // skip purging during the navigation that leaves the page.
  const oauthInFlight = useRef(false);

  // Mark OAuth in-flight when the user clicks a sign-in button.
  // The sign-in triggers a redirect to Google; `pagehide` fires
  // during that redirect and we must NOT clear storage.
  useEffect(() => {
    function markOAuth(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest?.("a, button");
      if (!target) return;
      const text = target.textContent || "";
      if (/sign.?in|google|log.?in/i.test(text)) {
        oauthInFlight.current = true;
      }
    }
    document.addEventListener("click", markOAuth, true);
    return () => document.removeEventListener("click", markOAuth, true);
  }, []);

  // ── Service Worker teardown ──────────────────────────────────────
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  // ── pagehide: purge all client-side persistence ──────────────────
  const purgeClientCaches = useCallback((e: PageTransitionEvent) => {
    // `persisted === true` means the page is entering bfcache (the user
    // might come back), and we should not wipe data.  Also skip if an
    // OAuth redirect is in progress.
    if (e.persisted || oauthInFlight.current) return;

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
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", purgeClientCaches);
    return () => window.removeEventListener("pagehide", purgeClientCaches);
  }, [purgeClientCaches]);

  return null;
}
