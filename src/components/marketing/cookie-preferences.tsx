"use client";

import * as React from "react";
import { Button } from "@/components/ui";

const STORAGE_KEY = "weddingos.public-cookie-preferences.v1";

export function PublicCookiePreferences() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(window.localStorage.getItem(STORAGE_KEY) === null),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const save = (analytics: boolean) => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        essential: true,
        preferences: false,
        analytics,
        marketing: false,
        policyVersion: "2026-07-21",
        recordedAt: new Date().toISOString(),
      }),
    );
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside
      aria-label="Preferințe cookie"
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-3xl rounded-xl border border-line bg-surface p-3.5 shadow-xl sm:inset-x-3 sm:bottom-3 sm:flex sm:items-center sm:gap-5 sm:rounded-2xl sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Preferințe cookie</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Cookie-urile esențiale mențin site-ul funcțional. Analytics rămâne
          oprit până când îl accepți.
        </p>
        <a
          href="/cookies"
          className="mt-0.5 inline-flex min-h-10 items-center text-xs font-medium text-brand hover:underline sm:min-h-11"
        >
          Detalii despre categorii
        </a>
      </div>
      <div className="mt-2.5 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:flex">
        <Button className="min-h-11" size="sm" variant="outline" onClick={() => save(false)}>
          Doar esențiale
        </Button>
        <Button className="min-h-11" size="sm" onClick={() => save(true)}>
          Acceptă analytics
        </Button>
      </div>
    </aside>
  );
}
