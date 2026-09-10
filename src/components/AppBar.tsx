"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";

/** Sticky top bar with an optional back arrow, matching the app's screen-stack feel. */
export function AppBar({
  title,
  subtitle,
  back,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "sticky top-0 z-20 bg-bg/85 backdrop-blur-md border-b border-border no-print",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-3 flex items-center gap-3">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="-ml-2 p-2 rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M12.5 16L6.5 10l6-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="font-semibold truncate leading-tight">{title}</h1>
          {subtitle ? <p className="text-[13px] text-muted truncate">{subtitle}</p> : null}
        </div>

        {action ? <div className="shrink-0 flex items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}
