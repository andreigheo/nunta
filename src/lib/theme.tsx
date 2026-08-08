"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "weddingos-theme";
const THEME_CHANGE_EVENT = "weddingos-theme-change";

interface ThemeContextValue {
  /** Stored preference: light | dark | system */
  theme: ThemePreference;
  /** Effective theme after resolving `system` */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => undefined,
});

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

const getServerTheme = (): ThemePreference => "system";
const getServerSystemTheme = (): "light" | "dark" => "light";

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function applyTheme(resolved: "light" | "dark") {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(subscribeToTheme, getStoredTheme, getServerTheme);
  const systemTheme = React.useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, getServerSystemTheme);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next === "system" ? getSystemTheme() : next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

/* ------------------------------------------------------------------ */
/*  Theme controls                                                     */
/* ------------------------------------------------------------------ */

const options: Array<{ value: ThemePreference; label: string; icon: React.ElementType }> = [
  { value: "light", label: "Luminoasă", icon: Sun },
  { value: "dark", label: "Întunecată", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
];

/** Segmented theme selector used in Settings → Appearance and auth screens. */
export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Temă vizuală"
      className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-subtle p-1", className)}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-elevated text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact icon button that cycles themes — used in the sidebar footer. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const order: ThemePreference[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const current = options.find((o) => o.value === theme) ?? options[2];
  const Icon = current.icon;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Temă: ${current.label}. Comută la ${options.find((o) => o.value === next)?.label}.`}
      title={`Temă: ${current.label}`}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
