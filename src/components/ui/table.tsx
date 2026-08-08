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
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
      <table className={cn("w-full text-sm", className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <thead className={cn("border-b border-line bg-subtle/60", className)}>
      {children}
    </thead>
  );
}

export function TBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn("divide-y divide-line", className)}>{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-subtle/70",
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
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      aria-sort={sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : undefined}
      className={cn(
        "whitespace-nowrap px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-faint",
        alignClass,
        className,
      )}
    >
      {sortable ? (
        <button
          onClick={onSort}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-ink",
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
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={cn(
        "px-4 py-3 align-middle text-ink",
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
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-brand text-[26px] font-semibold leading-tight tracking-tight text-ink text-balance">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
