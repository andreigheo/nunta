export const PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY =
  "weddingos.public-cookie-preferences.v1";

export const ANALYTICS_CONSENT_CHANGED_EVENT =
  "sarbato:analytics-consent-changed";
export const OPEN_COOKIE_PREFERENCES_EVENT =
  "sarbato:open-cookie-preferences";

type PublicCookiePreferences = {
  analytics?: boolean;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    __sarbatoGoogleConsentInitialized?: boolean;
    __sarbatoGoogleTagManagerLoaded?: boolean;
    __sarbatoGoogleTagManagerLoading?: boolean;
  }
}

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

function googleCommand(...args: unknown[]) {
  ensureDataLayer().push(args);
}

export function readAnalyticsConsent() {
  try {
    const raw = window.localStorage.getItem(
      PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
    );
    if (!raw) return false;
    const preferences = JSON.parse(raw) as PublicCookiePreferences;
    return preferences.analytics === true;
  } catch {
    return false;
  }
}

export function setGoogleAnalyticsConsent(enabled: boolean) {
  if (!window.__sarbatoGoogleConsentInitialized) {
    googleCommand("consent", "default", {
      ad_personalization: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    window.__sarbatoGoogleConsentInitialized = true;
  }

  googleCommand("consent", "update", {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: enabled ? "granted" : "denied",
  });
}

export function loadGoogleTagManager(containerId: string) {
  if (
    window.__sarbatoGoogleTagManagerLoaded ||
    window.__sarbatoGoogleTagManagerLoading ||
    !/^GTM-[A-Z0-9]+$/i.test(containerId)
  ) {
    return;
  }

  window.__sarbatoGoogleTagManagerLoading = true;
  ensureDataLayer().push({ event: "gtm.js", "gtm.start": Date.now() });

  const script = document.createElement("script");
  script.async = true;
  script.id = "sarbato-google-tag-manager";
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  script.addEventListener("load", () => {
    window.__sarbatoGoogleTagManagerLoading = false;
    window.__sarbatoGoogleTagManagerLoaded = true;
  });
  script.addEventListener("error", () => {
    window.__sarbatoGoogleTagManagerLoading = false;
    window.__sarbatoGoogleTagManagerLoaded = false;
    script.remove();
  });
  document.head.appendChild(script);
}

export function trackMarketingEvent(
  event: string,
  parameters: Record<string, string | number | boolean | undefined> = {},
) {
  if (!readAnalyticsConsent() || !/^[a-z][a-z0-9_]{1,39}$/.test(event)) {
    return;
  }

  const safeParameters = Object.fromEntries(
    Object.entries(parameters).filter((entry) => entry[1] !== undefined),
  );
  ensureDataLayer().push({ event, ...safeParameters });
}
