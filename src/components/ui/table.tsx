import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Table({
  children,
  className,
  minWidth = "760px",
}: {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div
      role="region"
      aria-label="Tabel cu derulare orizontală"
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-line bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className={cn("w-full text-sm", className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead className={cn("border-b border-line bg-subtle/60", className)}>
      {children}
    </thead>
  );
}

export function TBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tbody className={cn("divide-y divide-line", className)}>{children}</tbody>
  );
}

export function TR({
  children,
  className,
  onClick,
  onKeyDown,
  selected,
  role,
  tabIndex,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  selected?: boolean;
}) {
  const handleKeyDown: React.KeyboardEventHandler<HTMLTableRowElement> = (
    event,
  ) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <tr
      {...props}
      role={role}
      tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : onKeyDown}
      className={cn(
        "transition-colors",
        onClick &&
          "cursor-pointer hover:bg-subtle/70 focus-visible:bg-brand-softer/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        selected && "bg-brand-softer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  sortable,
  sortDirection,
  onSort,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  align?: "left" | "right" | "center";
}) {
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th
      aria-sort={
        sortDirection === "asc"
          ? "ascending"
          : sortDirection === "desc"
            ? "descending"
            : undefined
      }
      className={cn(
        "whitespace-nowrap px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-faint",
        alignClass,
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1 uppercase transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            align === "right" && "flex-row-reverse",
          )}
        >
          {children}
          {sortDirection === "asc" ? (
            <ArrowUp className="size-3.5 text-brand" aria-hidden />
          ) : sortDirection === "desc" ? (
            <ArrowDown className="size-3.5 text-brand" aria-hidden />
          ) : (
            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TD({
  children,
  className,
  align = "left",
  colSpan,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "left" | "right" | "center";
}) {
  const handleKeyDown: React.KeyboardEventHandler<HTMLTableCellElement> = (
    event,
  ) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <td
      {...props}
      colSpan={colSpan}
      role={role}
      tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : onKeyDown}
      className={cn(
        "px-4 py-3 align-middle text-ink",
        onClick &&
          "h-11 min-w-11 cursor-pointer transition-colors hover:bg-subtle/70 focus-visible:bg-brand-softer/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/*  Page header                                                        */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-line pb-5 sm:pb-6 lg:flex-row lg:items-start lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-brand text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] text-brand text-balance sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-muted">
            {description}
          </p>
        )}
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 lg:shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
