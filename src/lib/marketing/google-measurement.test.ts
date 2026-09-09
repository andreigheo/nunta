import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadGoogleTagManager,
  PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
  readAnalyticsConsent,
  setGoogleAnalyticsConsent,
} from "./google-measurement";

type ScriptDouble = {
  async: boolean;
  id: string;
  src: string;
  remove: ReturnType<typeof vi.fn>;
  listeners: Record<string, () => void>;
  addEventListener: (event: string, listener: () => void) => void;
};

function installBrowserDouble(options?: { storageThrows?: boolean }) {
  const scripts: ScriptDouble[] = [];
  const data = new Map<string, string>();
  const browserWindow = {
    dataLayer: [] as unknown[],
    localStorage: {
      getItem(key: string) {
        if (options?.storageThrows) throw new Error("storage unavailable");
        return data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (options?.storageThrows) throw new Error("storage unavailable");
        data.set(key, value);
      },
    },
    __sarbatoGoogleConsentInitialized: false,
    __sarbatoGoogleTagManagerLoaded: false,
    __sarbatoGoogleTagManagerLoading: false,
  };
  const browserDocument = {
    createElement() {
      const script: ScriptDouble = {
        async: false,
        id: "",
        src: "",
        remove: vi.fn(),
        listeners: {},
        addEventListener(event, listener) {
          script.listeners[event] = listener;
        },
      };
      scripts.push(script);
      return script;
    },
    head: { appendChild: vi.fn() },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browserWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: browserDocument,
  });
  return { browserWindow, data, scripts };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("Google measurement consent and loader", () => {
  it("fails closed when browser storage is unavailable", () => {
    const { browserWindow } = installBrowserDouble({ storageThrows: true });

    expect(readAnalyticsConsent()).toBe(false);
    expect(() => setGoogleAnalyticsConsent(true)).not.toThrow();
    expect(browserWindow.dataLayer).toEqual([
      [
        "consent",
        "default",
        expect.objectContaining({ analytics_storage: "denied" }),
      ],
      [
        "consent",
        "update",
        expect.objectContaining({ analytics_storage: "granted" }),
      ],
    ]);
  });

  it("reads only an explicit analytics grant", () => {
    const { data } = installBrowserDouble();
    data.set(
      PUBLIC_COOKIE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ analytics: true }),
    );

    expect(readAnalyticsConsent()).toBe(true);
  });

  it("retries after a transient script loading failure", () => {
    const { browserWindow, scripts } = installBrowserDouble();

    loadGoogleTagManager("GTM-TEST123");
    expect(scripts).toHaveLength(1);
    expect(browserWindow.__sarbatoGoogleTagManagerLoading).toBe(true);

    scripts[0]!.listeners.error!();
    expect(scripts[0]!.remove).toHaveBeenCalledOnce();
    expect(browserWindow.__sarbatoGoogleTagManagerLoading).toBe(false);
    expect(browserWindow.__sarbatoGoogleTagManagerLoaded).toBe(false);

    loadGoogleTagManager("GTM-TEST123");
    expect(scripts).toHaveLength(2);
    scripts[1]!.listeners.load!();
    expect(browserWindow.__sarbatoGoogleTagManagerLoaded).toBe(true);
  });
});
