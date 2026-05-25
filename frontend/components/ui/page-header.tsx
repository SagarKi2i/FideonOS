import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small uppercased label above the title (e.g. "Inbox", "Marketplace"). */
  eyebrow?: React.ReactNode;
  /** Page title — large, display font. */
  title: React.ReactNode;
  /** Subtitle / description, single sentence. */
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, filters, etc.). */
  actions?: React.ReactNode;
  /** Optional icon to render to the left of the title. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Compact = smaller title for nested pages. */
  compact?: boolean;
  className?: string;
  /** Optional supplementary content rendered below title (e.g. tabs, breadcrumb). */
  children?: React.ReactNode;
}

/**
 * Consistent page header used across the app.
 * - Eyebrow + display title + 1-line description on the left
 * - Action slot on the right
 * - Optional icon
 */
// Atlassian-style page header: small uppercase eyebrow, semibold title at a
// quiet size, single-line description. No big gradient icon tile — the icon
// (when present) is a small inline glyph next to the title.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
  compact = false,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
              {eyebrow}
            </p>
          )}
          <h1
            className={cn(
              "text-foreground tracking-tight inline-flex items-center gap-2",
              compact ? "text-[18px] font-semibold" : "text-[22px] md:text-[24px] font-semibold leading-[1.2]",
            )}
          >
            {Icon && <Icon className="h-5 w-5 text-muted-foreground shrink-0" />}
            <span className="truncate">{title}</span>
          </h1>
          {description && (
            <p className="text-muted-foreground mt-1.5 text-[14px] max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Smaller, inline section header used inside pages (above tables, lists). */
export function SectionHeader({
  title,
  description,
  count,
  actions,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  // Atlassian section header: small inline icon, semibold title, optional
  // grey count chip, optional description on a separate quiet line.
  return (
    <div className={cn("flex items-end justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <h2 className="text-[14px] font-semibold text-foreground tracking-tight truncate">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted">
              {count}
            </span>
          )}
        </div>
        {description && <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
