"use client";

import * as React from "react";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  loadGoogleTagManager,
  readAnalyticsConsent,
  setGoogleAnalyticsConsent,
  trackMarketingEvent,
} from "@/lib/marketing/google-measurement";

const containerId =
  process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID ?? "GTM-59ST3B86";

export function GoogleMeasurement() {
  React.useEffect(() => {
    const applyConsent = (enabled: boolean) => {
      setGoogleAnalyticsConsent(enabled);
      if (enabled && containerId) loadGoogleTagManager(containerId);
    };

    applyConsent(readAnalyticsConsent());

    const handleConsent = (event: Event) => {
      const customEvent = event as CustomEvent<{ analytics?: boolean }>;
      applyConsent(customEvent.detail?.analytics === true);
    };

    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>("[data-analytics-event]");
      if (!target) return;

      const eventName = target.dataset.analyticsEvent;
      if (!eventName) return;

      trackMarketingEvent(eventName, {
        link_destination: target.dataset.analyticsDestination,
        plan_name: target.dataset.analyticsPlan,
        plan_price: target.dataset.analyticsPrice,
      });
    };

    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, handleConsent);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, handleConsent);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
