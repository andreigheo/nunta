"use client";

import * as React from "react";

export type QuickCreateKind =
  | "task"
  | "guest"
  | "household"
  | "expense"
  | "payment"
  | "vendor"
  | "rfq"
  | "contract"
  | "event"
  | "risk"
  | "risk_detection"
  | "plan_b"
  | "automation"
  | "campaign"
  | "rsvp"
  | "seating_table"
  | "transport_route"
  | "accommodation_property"
  | "run_of_show"
  | "checklist_item"
  | "incident"
  | "announcement"
  | "manual_check_in"
  | "gallery";

interface ShellContextValue {
  aiOpen: boolean;
  openAI: () => void;
  closeAI: () => void;
  aiFullscreen: boolean;
  setAiFullscreen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (v: boolean) => void;
  quickCreate: QuickCreateKind | null;
  setQuickCreate: (v: QuickCreateKind | null) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
}

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiFullscreen, setAiFullscreen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [quickCreate, setQuickCreate] = React.useState<QuickCreateKind | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setAiOpen(window.sessionStorage.getItem("sarbato:copilot:open") === "true");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    window.sessionStorage.setItem("sarbato:copilot:open", String(aiOpen));
  }, [aiOpen]);

  // Global ⌘K / Ctrl+K shortcut for the command palette
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo<ShellContextValue>(
    () => ({
      aiOpen,
      openAI: () => setAiOpen(true),
      closeAI: () => {
        setAiOpen(false);
        setAiFullscreen(false);
      },
      aiFullscreen,
      setAiFullscreen,
      paletteOpen,
      setPaletteOpen,
      notificationsOpen,
      setNotificationsOpen,
      quickCreate,
      setQuickCreate,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [aiOpen, aiFullscreen, paletteOpen, notificationsOpen, quickCreate, mobileNavOpen],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
