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
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 shadow-xl sm:flex sm:items-center sm:gap-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Preferințe cookie</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Folosim cookie-uri esențiale pentru funcționare. Analytics este
          opțional, dezactivat implicit și nu se încarcă fără acord.
        </p>
        <a
          href="/cookies"
          className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-brand hover:underline"
        >
          Detalii despre categorii
        </a>
      </div>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
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
