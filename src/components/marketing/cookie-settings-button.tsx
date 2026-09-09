"use client";

import { OPEN_COOKIE_PREFERENCES_EVENT } from "@/lib/marketing/google-measurement";

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))}
    >
      Setări cookie
    </button>
  );
}

