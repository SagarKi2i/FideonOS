import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Atlassian Lozenge: tight, flat, uppercase, no border. Single tone fill.
// Dots are quiet (no animated ping by default). Use `pulse` only for truly
// live/streaming surfaces; everywhere else the colored fill is signal enough.
const pillVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:  "bg-muted text-muted-foreground",
        primary:  "bg-accent text-primary",
        success:  "bg-success/15 text-success",
        warning:  "bg-warning/15 text-warning-foreground",
        danger:   "bg-destructive/15 text-destructive",
        info:     "bg-info/15 text-info",
        live:     "bg-accent text-primary",
      },
      size: {
        sm: "h-[18px] px-1 text-[10px]",
        md: "h-5 px-1.5 text-[10.5px]",
        lg: "h-6 px-2 text-[11.5px]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  /** Show a dot before the label. */
  dot?: boolean;
  /** Pulse the dot (great for "running" / "live"). */
  pulse?: boolean;
}

const DOT_BG: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger:  "bg-destructive",
  info:    "bg-info",
  live:    "bg-primary",
};

/**
 * Tiny status indicator. Drop-in replacement for ad-hoc colored badges.
 *   <StatusPill tone="success" dot>Approved</StatusPill>
 *   <StatusPill tone="live" dot pulse>Running</StatusPill>
 */
export function StatusPill({
  tone = "neutral",
  size,
  dot,
  pulse,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span className={cn(pillVariants({ tone, size }), className)} {...props}>
      {dot && (
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping",
                DOT_BG[tone ?? "neutral"],
              )}
              aria-hidden
            />
          )}
          <span
            className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOT_BG[tone ?? "neutral"])}
            aria-hidden
          />
        </span>
      )}
      {children}
    </span>
  );
}
