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
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => undefined,
});

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

const getServerTheme = (): ThemePreference => "light";
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
export function ThemeSegmentedControl({
  className,
  compactOnMobile = false,
}: {
  className?: string;
  compactOnMobile?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    if (buttons.length === 0) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (currentIndex + 1) % buttons.length
            : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    setTheme(options[nextIndex].value);
    buttons[nextIndex].focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Temă vizuală"
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-subtle p-1", className)}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-elevated text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className={cn(compactOnMobile && "sr-only sm:not-sr-only")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact light/dark toggle used in the sidebar footer. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const next: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
  const current = options.find((option) => option.value === resolvedTheme) ?? options[0];
  const Icon = current.icon;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Temă: ${current.label}. Comută la ${next === "dark" ? "Întunecată" : "Luminoasă"}.`}
      title={`Temă: ${current.label}`}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
