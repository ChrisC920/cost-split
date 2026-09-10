"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { initials, memberColor } from "@/lib/colors";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- buttons */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors " +
  "disabled:opacity-45 disabled:pointer-events-none select-none";

const BUTTON_SIZES = {
  sm: "text-sm px-3 py-1.5 min-h-8",
  md: "text-[15px] px-4 py-2.5 min-h-11",
  lg: "text-base px-5 py-3 min-h-12",
} as const;

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90 active:opacity-80",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-negative-soft text-negative hover:opacity-85 border border-transparent",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className)}
    />
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      {...props}
      className={cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className)}
    />
  );
}

/* ----------------------------------------------------------------- layout */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx(
        "bg-surface border border-border rounded-2xl shadow-[var(--shadow)] print-plain",
        className,
      )}
    />
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-4 pb-16">{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2 mt-6 first:mt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-muted mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="block text-[13px] text-negative mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-[13px] text-faint mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 min-h-11 " +
  "placeholder:text-faint focus:border-accent focus:outline-none transition-colors";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(CONTROL, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(CONTROL, "resize-y", className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={cx(CONTROL, "appearance-none pr-9 bg-no-repeat", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' fill='none' stroke='%236f6a63' stroke-width='1.8' stroke-linecap='round'><path d='M6 8l4 4 4-4'/></svg>\")",
        backgroundPosition: "right 0.6rem center",
      }}
    >
      {children}
    </select>
  );
}

/** Segmented control, used for split modes and entry types. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full bg-surface-2 rounded-xl p-1 gap-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex-1 text-sm font-medium rounded-lg px-2 py-2 min-h-9 transition-colors",
              selected ? "bg-surface text-text shadow-[var(--shadow)]" : "text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- display */

export function Avatar({
  name,
  colorIndex,
  size = 36,
  dimmed = false,
}: {
  name: string;
  colorIndex: number;
  size?: number;
  dimmed?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: memberColor(colorIndex),
        fontSize: Math.round(size * 0.38),
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6">
      <p className="font-medium text-text">{title}</p>
      <p className="text-sm text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Banner({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "negative" | "accent";
  children: ReactNode;
}) {
  const tones = {
    warn: "bg-warn-soft text-warn",
    negative: "bg-negative-soft text-negative",
    accent: "bg-accent-soft text-accent",
  } as const;
  return (
    <div className={cx("rounded-xl px-3.5 py-3 text-sm leading-relaxed", tones[tone])}>
      {children}
    </div>
  );
}
