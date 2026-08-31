import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Label + field wrapper                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const generatedId = React.useId();
  const explicitControlProps = findControlProps(children);
  const controlId =
    htmlFor ??
    (typeof explicitControlProps?.id === "string" ? explicitControlProps.id : undefined) ??
    `field-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const descriptionId = error ? errorId : hint ? hintId : undefined;
  const isRequired = Boolean(required || explicitControlProps?.required === true);
  const isInvalid = Boolean(
    error ||
      explicitControlProps?.invalid === true ||
      explicitControlProps?.["aria-invalid"] === true ||
      explicitControlProps?.["aria-invalid"] === "true",
  );
  const enhancedChildren = enhanceFieldChildren(children, {
    controlId,
    descriptionId,
    invalid: isInvalid,
    required: isRequired,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={controlId} className="text-[13px] font-medium text-ink">
          {label}
          {isRequired && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {enhancedChildren}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, icon, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === "true";
    if (icon) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
            {icon}
          </span>
          <input
            ref={ref}
            aria-invalid={isInvalid || undefined}
            className={cn(inputClasses(isInvalid), "pl-9", className)}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        aria-invalid={isInvalid || undefined}
        className={cn(inputClasses(isInvalid), className)}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

function inputClasses(invalid?: boolean) {
  return cn(
    "h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink shadow-none transition-colors placeholder:text-faint hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-subtle disabled:text-faint",
    invalid
      ? "border-danger/60 focus-visible:border-danger focus-visible:outline-danger/40"
      : "border-line",
  );
}

/* ------------------------------------------------------------------ */
/*  Textarea                                                           */
/* ------------------------------------------------------------------ */

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || props["aria-invalid"] || undefined}
    className={cn(
      "min-h-[96px] w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-subtle",
      invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true"
        ? "border-danger/60 focus-visible:border-danger focus-visible:outline-danger/40"
        : "border-line",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/* ------------------------------------------------------------------ */
/*  Select (native, styled)                                            */
/* ------------------------------------------------------------------ */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid || props["aria-invalid"] || undefined}
    className={cn(
      "h-11 w-full cursor-pointer appearance-none rounded-lg border bg-surface bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236d6670%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat px-3 pr-9 text-sm text-ink transition-colors hover:border-line-strong focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-subtle",
      invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true"
        ? "border-danger/60 focus-visible:border-danger focus-visible:outline-danger/40"
        : "border-line",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

/* ------------------------------------------------------------------ */
/*  Currency input                                                     */
/* ------------------------------------------------------------------ */

export const CurrencyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === "true";
    return (
      <div className="relative">
        <input
          ref={ref}
          inputMode="numeric"
          aria-invalid={isInvalid || undefined}
          className={cn(inputClasses(isInvalid), "pr-12 text-right tabular-nums", className)}
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-faint"
        >
          RON
        </span>
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

type FieldControlAttributes = {
  controlId: string;
  descriptionId?: string;
  invalid: boolean;
  required: boolean;
};

type FieldControlProps = {
  id?: unknown;
  children?: React.ReactNode;
  invalid?: unknown;
  required?: unknown;
  "aria-describedby"?: unknown;
  "aria-invalid"?: unknown;
  "aria-required"?: unknown;
};

type FieldElementType = React.ReactElement["type"];

function isSharedFieldControl(type: FieldElementType): boolean {
  return type === Input || type === Textarea || type === Select || type === CurrencyInput;
}

function isNativeFieldControl(type: FieldElementType): boolean {
  return type === "input" || type === "textarea" || type === "select";
}

function findControlProps(children: React.ReactNode): FieldControlProps | undefined {
  let result: FieldControlProps | undefined;

  React.Children.forEach(children, (child) => {
    if (result || !React.isValidElement(child)) return;
    const element = child as React.ReactElement<FieldControlProps>;
    if (isSharedFieldControl(element.type) || isNativeFieldControl(element.type)) {
      result = element.props;
      return;
    }
    if (element.props.children) result = findControlProps(element.props.children);
  });

  return result;
}

function mergeAriaIds(...values: unknown[]): string | undefined {
  const ids = values
    .flatMap((value) => (typeof value === "string" ? value.split(/\s+/) : []))
    .filter(Boolean);
  return ids.length > 0 ? Array.from(new Set(ids)).join(" ") : undefined;
}

function enhanceFieldChildren(
  children: React.ReactNode,
  attributes: FieldControlAttributes,
  state = { associated: false },
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;

    const element = child as React.ReactElement<FieldControlProps>;
    const sharedControl = isSharedFieldControl(element.type);
    const nativeControl = isNativeFieldControl(element.type);

    if (!state.associated && (sharedControl || nativeControl)) {
      state.associated = true;
      const required = attributes.required || element.props.required === true;
      const invalid = attributes.invalid || element.props.invalid === true;
      const nextProps: FieldControlProps = {
        id: attributes.controlId,
        required,
        "aria-required": required ? true : element.props["aria-required"],
        "aria-invalid": attributes.invalid ? true : element.props["aria-invalid"],
        "aria-describedby": mergeAriaIds(
          element.props["aria-describedby"],
          attributes.descriptionId,
        ),
      };
      if (sharedControl) nextProps.invalid = invalid;
      return React.cloneElement(element, nextProps);
    }

    if (element.props.children) {
      return React.cloneElement(element, {
        children: enhanceFieldChildren(element.props.children, attributes, state),
      });
    }

    return child;
  });
}
