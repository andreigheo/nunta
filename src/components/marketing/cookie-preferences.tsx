"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  OPEN_COOKIE_PREFERENCES_EVENT,
  PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
} from "@/lib/marketing/google-measurement";

export function PublicCookiePreferences() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(
      () => {
        try {
          setVisible(
            window.localStorage.getItem(
              PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
            ) === null,
          );
        } catch {
          setVisible(true);
        }
      },
      0,
    );
    const openPreferences = () => setVisible(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openPreferences);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, openPreferences);
    };
  }, []);

  const save = (analytics: boolean) => {
    try {
      window.localStorage.setItem(
        PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          essential: true,
          preferences: false,
          analytics,
          marketing: false,
          policyVersion: "2026-07-21",
          recordedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // The choice still applies for this document when persistent storage is unavailable.
    }
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_CONSENT_CHANGED_EVENT, {
        detail: { analytics },
      }),
    );
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside
      aria-label="Preferințe cookie"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 shadow-xl sm:flex sm:items-center sm:gap-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Preferințe cookie</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Cookie-uri esențiale pentru funcționare. Analytics se activează doar
          cu acordul tău.
        </p>
        <a
          href="/cookies"
          className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-brand hover:underline"
        >
          Detalii despre categorii
        </a>
      </div>
      <div className="mt-3 grid shrink-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-0 sm:flex">
        <Button size="sm" variant="outline" onClick={() => save(false)}>
          Doar esențiale
        </Button>
        <Button size="sm" onClick={() => save(true)}>
          Acceptă analytics
        </Button>
      </div>
    </aside>
  );
}
