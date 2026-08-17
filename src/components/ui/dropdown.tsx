"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  openWithFocus: (intent: "first" | "last") => void;
  close: (restoreFocus?: boolean) => void;
  focusIntent: "first" | "last";
  contentId: string;
  triggerId: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const DropdownContext = React.createContext<DropdownContextValue>({
  open: false,
  openWithFocus: () => undefined,
  close: () => undefined,
  focusIntent: "first",
  contentId: "dropdown-menu",
  triggerId: "dropdown-trigger",
  rootRef: { current: null },
});

export function Dropdown({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [focusIntent, setFocusIntent] = React.useState<"first" | "last">("first");
  const ref = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const contentId = `dropdown-${generatedId}-menu`;
  const triggerId = `dropdown-${generatedId}-trigger`;

  const close = React.useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        ref.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
      });
    }
  }, []);

  const openWithFocus = React.useCallback((intent: "first" | "last") => {
    setFocusIntent(intent);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [close, open]);

  return (
    <DropdownContext.Provider
      value={{
        open,
        openWithFocus,
        close,
        focusIntent,
        contentId,
        triggerId,
        rootRef: ref,
      }}
    >
      <div
        ref={ref}
        className={cn("relative inline-block", className)}
        onBlur={(event) => {
          if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            close(false);
          }
        }}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({
  children,
  className,
}: {
  children: React.ReactElement;
  className?: string;
}) {
  const child = children as React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { disabled?: boolean; id?: string }
  >;
  const { open, openWithFocus, close, contentId, triggerId, rootRef } = React.useContext(DropdownContext);
  return React.cloneElement(child, {
    id: child.props.id ?? triggerId,
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e as React.MouseEvent<HTMLElement>);
      if (e.defaultPrevented || child.props.disabled) return;
      e.stopPropagation();
      if (open) close(false);
      else openWithFocus("first");
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      child.props.onKeyDown?.(e);
      if (e.defaultPrevented || child.props.disabled) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (open) {
          const items = getMenuItems(
            rootRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? null,
          );
          const item = e.key === "ArrowUp" ? items.at(-1) : items[0];
          item?.focus();
        } else {
          openWithFocus(e.key === "ArrowUp" ? "last" : "first");
        }
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close(true);
      }
    },
    "aria-expanded": open,
    "aria-haspopup": "menu",
    "aria-controls": contentId,
    "data-dropdown-trigger": "",
    className: cn("min-h-11 min-w-11", child.props.className, className),
  } as Partial<React.HTMLAttributes<HTMLElement>>);
}

export function DropdownContent({
  children,
  align = "end",
  className,
  widthClass = "w-56",
  onKeyDown,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
  widthClass?: string;
}) {
  const { open, close, focusIntent, contentId, triggerId, rootRef } = React.useContext(DropdownContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<{
    top: number;
    left: number;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const items = getMenuItems(ref.current);
      const item = focusIntent === "last" ? items.at(-1) : items[0];
      (item ?? ref.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusIntent, open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = rootRef.current?.querySelector<HTMLElement>(
        "[data-dropdown-trigger]",
      );
      const menu = ref.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      setPlacement(
        resolveMenuPlacement({
          align,
          triggerRect,
          menuWidth: menu.offsetWidth,
          menuHeight: menu.offsetHeight,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      setPlacement(null);
    };
  }, [open, align, rootRef]);

  if (!open) return null;

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const items = getMenuItems(event.currentTarget);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length > 0) {
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowDown"
              ? (currentIndex + 1) % items.length
              : (currentIndex - 1 + items.length) % items.length;
      event.preventDefault();
      items[nextIndex].focus();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      items.length > 0
    ) {
      const query = event.key.toLocaleLowerCase("ro-RO");
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const orderedItems = [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex + 1)];
      const match = orderedItems.find((item) =>
        item.textContent?.trim().toLocaleLowerCase("ro-RO").startsWith(query),
      );
      if (match) {
        event.preventDefault();
        match.focus();
      }
    }
  };

  return (
    <div
      {...props}
      ref={ref}
      id={contentId}
      role="menu"
      aria-labelledby={triggerId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={
        placement
          ? { position: "fixed", top: placement.top, left: placement.left }
          : { position: "fixed", top: 0, left: 0, visibility: "hidden" }
      }
      className={cn(
        "z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-elevated p-1.5 shadow-pop animate-scale-in",
        widthClass,
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
  const { close } = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        close(true);
      }}
      onPointerMove={(event) => event.currentTarget.focus({ preventScroll: true })}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
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

function getMenuItems(container: HTMLElement | null): HTMLButtonElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  );
}

export type MenuPlacementRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
};

export function resolveMenuPlacement({
  align,
  triggerRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = 6,
  margin = 8,
}: {
  align: "start" | "end" | "center";
  triggerRect: MenuPlacementRect;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}): { top: number; left: number } {
  let left =
    align === "start"
      ? triggerRect.left
      : align === "center"
        ? triggerRect.left + triggerRect.width / 2 - menuWidth / 2
        : triggerRect.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

  let top = triggerRect.bottom + gap;
  if (
    top + menuHeight > viewportHeight - margin &&
    triggerRect.top - gap - menuHeight >= margin
  ) {
    top = triggerRect.top - gap - menuHeight;
  }
  return { top, left };
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
