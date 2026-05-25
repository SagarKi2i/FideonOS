import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Secondary action / link rendered next to the primary one. */
  secondaryAction?: React.ReactNode;
  /** Visual size — "card" (default) is bordered & padded, "inline" is borderless. */
  variant?: "card" | "inline";
  className?: string;
}

/**
 * Standard empty / zero-data state.
 * Use whenever a list, table, or panel has nothing to show.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "card",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        variant === "card"
          ? "rounded-xl border border-dashed border-border bg-card/50 p-10 md:p-14"
          : "py-12 px-4",
        className,
      )}
    >
      {Icon && (
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary mb-4">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-foreground tracking-tight">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-2 max-w-md text-[14px] leading-relaxed">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
