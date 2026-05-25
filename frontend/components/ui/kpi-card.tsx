import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTrend = "up" | "down" | "flat";

interface KpiCardProps {
  label: string;
  /** The big number / value. */
  value: React.ReactNode;
  /** Optional suffix appended to value (e.g. "min", "/run"). */
  suffix?: React.ReactNode;
  /** Optional small delta string e.g. "+12%", "−3.1s". */
  delta?: React.ReactNode;
  /** Direction of the delta — controls color + chevron. */
  trend?: KpiTrend;
  /** Smaller secondary line under the value. */
  hint?: React.ReactNode;
  /** Optional icon rendered top-right. */
  icon?: LucideIcon;
  /** Optional sparkline data (0..1 values). */
  sparkline?: number[];
  /** Visual treatment. */
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}

const TREND_STYLES: Record<KpiTrend, { color: string; Icon: typeof ArrowUpRight }> = {
  up:   { color: "text-success",      Icon: ArrowUpRight },
  down: { color: "text-destructive",  Icon: ArrowDownRight },
  flat: { color: "text-muted-foreground", Icon: Minus },
};

const TONE_STYLES: Record<NonNullable<KpiCardProps["tone"]>, { iconBg: string; iconColor: string }> = {
  default: { iconBg: "bg-muted",         iconColor: "text-foreground/70" },
  primary: { iconBg: "bg-accent",        iconColor: "text-primary" },
  success: { iconBg: "bg-success/10",    iconColor: "text-success" },
  warning: { iconBg: "bg-warning/10",    iconColor: "text-warning-foreground/80" },
  danger:  { iconBg: "bg-destructive/10",iconColor: "text-destructive" },
};

/**
 * Dashboard KPI tile. Use inside a responsive grid.
 *   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
 *     <KpiCard label="Quotes" value="1,284" delta="+22.4%" trend="up" />
 *   </div>
 */
export function KpiCard({
  label,
  value,
  suffix,
  delta,
  trend,
  hint,
  icon: Icon,
  sparkline,
  tone = "default",
  className,
}: KpiCardProps) {
  const t = trend ? (TREND_STYLES[trend] ?? TREND_STYLES.flat) : null;
  // Defensive: if a caller passes an unknown tone string (e.g. "neutral"),
  // fall back to the default styling instead of crashing on undefined.
  const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.default;

  // Atlassian KPI: small uppercase label, big tabular value, single delta line.
  // No icon block in the card body; icon (when supplied) is a quiet glyph
  // next to the label so the number stays the visual hero.
  return (
    <div
      className={cn(
        "group relative rounded-[6px] border border-border bg-card px-4 py-3.5 transition-colors",
        "hover:border-border-strong",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", toneStyle.iconColor)} />}
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em]">{label}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[24px] font-semibold tracking-tight text-foreground tabular-nums leading-none">
          {value}
        </span>
        {suffix && <span className="text-[13px] text-muted-foreground font-medium">{suffix}</span>}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 min-h-[16px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {t && delta && (
            <span className={cn("inline-flex items-center gap-0.5 text-[11.5px] font-semibold", t.color)}>
              <t.Icon className="h-3 w-3" />
              {delta}
            </span>
          )}
          {hint && <span className="text-[11.5px] text-muted-foreground truncate">{hint}</span>}
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline values={sparkline} className={cn("opacity-90", t?.color ?? "text-primary")} />
        )}
      </div>
    </div>
  );
}

/** Tiny inline SVG sparkline. Values are 0..1 (or any range — we normalize). */
export function Sparkline({
  values,
  width = 64,
  height = 22,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
