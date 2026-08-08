"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownContext = React.createContext<DropdownContextValue>({ open: false, setOpen: () => undefined });

export function Dropdown({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({
  children,
  className,
}: {
  children: React.ReactElement<{ className?: string }>;
  className?: string;
}) {
  const { open, setOpen } = React.useContext(DropdownContext);
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(!open);
    },
    "aria-expanded": open,
    "aria-haspopup": "menu",
    className: cn(children.props.className, className),
  } as Partial<React.HTMLAttributes<HTMLElement>>);
}

export function DropdownContent({
  children,
  align = "end",
  className,
  widthClass = "w-56",
}: {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  widthClass?: string;
}) {
  const { open } = React.useContext(DropdownContext);
  if (!open) return null;
  return (
    <div
      role="menu"
      className={cn(
        "absolute z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-elevated p-1.5 shadow-pop animate-scale-in",
        widthClass,
        align === "end" && "right-0",
        align === "start" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownItem({
  icon,
  children,
  onSelect,
  destructive,
  disabled,
  selected,
  trailing,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  selected?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const { setOpen } = React.useContext(DropdownContext);
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        setOpen(false);
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
        destructive
          ? "text-danger hover:bg-danger-soft"
          : "text-ink hover:bg-subtle",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {icon && <span className="shrink-0 text-faint [&>svg]:size-4" aria-hidden>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
      {trailing && <span className="shrink-0 text-xs text-faint">{trailing}</span>}
    </button>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</p>
  );
}

export function DropdownSeparator() {
  return <div className="mx-1 my-1 h-px bg-line" role="separator" />;
}

/* ------------------------------------------------------------------ */
/*  Tooltip (hover/focus, CSS-only positioning)                        */
/* ------------------------------------------------------------------ */

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-pop transition-opacity group-hover/tip:block group-hover/tip:opacity-100 group-focus-within/tip:block group-focus-within/tip:opacity-100 dark:bg-elevated dark:text-ink dark:border dark:border-line",
          positions[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
