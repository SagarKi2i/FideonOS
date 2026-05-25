'use client';
// CustomerBookPanel — the broker's book-of-business landing surface.
// Renders as a visually rich tile grid above the per-customer dashboard.

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, AlertTriangle, CheckCircle2, CalendarClock, ArrowRight,
  TrendingUp, Building2, Flame, Wallet, BarChart3, ShieldCheck,
  Activity, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCustomerBook, type CustomerBookRow } from "./lossRunClients";

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
  :                `$${n}`;

const renewalShort = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
};

const renewalCountdown = (days: number) => {
  if (days < 0)    return `${Math.abs(days)}d overdue`;
  if (days === 0)  return `Today`;
  if (days <= 30)  return `${days} days`;
  if (days <= 90)  return `${days} days`;
  return `${Math.round(days / 30)} months`;
};

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function CustomerBookPanel({ selectedId, onSelect }: Props) {
  const book = useMemo(() => {
    return buildCustomerBook().sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  }, []);

  const totals = useMemo(() => {
    const totalPremium = book.reduce((s, c) => s + c.totalPremium5yr, 0);
    const totalIncurred = book.reduce((s, c) => s + c.totalIncurred, 0);
    const openClaims = book.reduce((s, c) => s + c.openClaims, 0);
    const largeOpen = book.reduce((s, c) => s + c.largeOpen, 0);
    const renewalDue = book.filter((c) => c.daysToRenewal <= 90 && c.daysToRenewal >= 0).length;
    const attention = book.filter((c) => c.status === "attention").length;
    const clean = book.filter((c) => c.status === "clean" && c.openClaims === 0).length;
    const lossRatio = totalPremium ? (totalIncurred / totalPremium) * 100 : 0;
    return {
      customers: book.length,
      totalPremium,
      totalIncurred,
      openClaims,
      largeOpen,
      renewalDue,
      attention,
      clean,
      lossRatio: +lossRatio.toFixed(1),
    };
  }, [book]);

  return (
    <div className="space-y-4">
      {/* Portfolio header — premium gradient strip */}
      <Card className="relative overflow-hidden border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <CardContent className="relative px-5 py-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h2 className="text-[16px] font-bold tracking-tight text-foreground">Your book of business</h2>
                  <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/30 text-primary font-medium">
                    <Activity className="h-2.5 w-2.5 mr-1" /> Live
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {totals.customers} commercial accounts · sorted by next renewal · click any account to drill in
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              {totals.attention > 0 && (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground text-[10.5px] font-medium px-2.5 py-1">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                  {totals.attention} need attention
                </Badge>
              )}
              {totals.renewalDue > 0 && (
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10.5px] font-medium px-2.5 py-1">
                  <CalendarClock className="h-2.5 w-2.5 mr-1" />
                  {totals.renewalDue} renewal{totals.renewalDue !== 1 ? "s" : ""} ≤ 90d
                </Badge>
              )}
            </div>
          </div>

          {/* Portfolio KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <PortfolioTile icon={Users}       label="Customers"        value={String(totals.customers)} sub={`${totals.clean} clean book${totals.clean !== 1 ? "s" : ""}`} />
            <PortfolioTile icon={Wallet}      label="5-yr premium"     value={fmtK(totals.totalPremium)} sub={`${fmtK(totals.totalIncurred)} incurred`} />
            <PortfolioTile icon={BarChart3}   label="Portfolio LR"     value={`${totals.lossRatio}%`}    sub="across full book" tone={totals.lossRatio < 50 ? "success" : totals.lossRatio < 70 ? "default" : "danger"} />
            <PortfolioTile icon={ShieldCheck} label="Open claims"      value={String(totals.openClaims)} sub={totals.largeOpen > 0 ? `${totals.largeOpen} large` : "no large losses"} tone={totals.largeOpen > 0 ? "warning" : "success"} />
          </div>
        </CardContent>
      </Card>

      {/* Customer tile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {book.map((c) => (
          <CustomerTile
            key={c.id}
            row={c}
            selected={c.id === selectedId}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── building blocks ───────────────────────────── */

function PortfolioTile({
  icon: Icon, label, value, sub, tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn(
          "h-3.5 w-3.5",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning-foreground",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-muted-foreground",
        )} />
        <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn(
        "text-[22px] font-bold tracking-tight tabular-nums leading-none",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning-foreground",
        tone === "danger" && "text-destructive",
        tone === "default" && "text-foreground",
      )}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

function CustomerTile({
  row, selected, onClick,
}: {
  row: CustomerBookRow;
  selected: boolean;
  onClick: () => void;
}) {
  const renewalSoon = row.daysToRenewal >= 0 && row.daysToRenewal <= 90;
  const renewalImminent = row.daysToRenewal >= 0 && row.daysToRenewal <= 30;
  const lrOverThreshold = row.lossRatioPct >= 60;
  const lrClean = row.lossRatioPct < 30;

  // Loss-ratio progress bar fill (capped at 100 visually)
  const lrFill = Math.min(100, Math.max(2, row.lossRatioPct));
  const lrBarColor =
    row.lossRatioPct < 30  ? "bg-success" :
    row.lossRatioPct < 60  ? "bg-primary" :
    row.lossRatioPct < 80  ? "bg-warning" :
                              "bg-destructive";

  const accentRing =
    row.status === "attention"   ? "border-warning/30 hover:border-warning/60" :
    row.status === "renewal_due" ? "border-primary/30 hover:border-primary/60" :
                                    "border-border hover:border-foreground/20";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-xl border bg-card p-4 transition-all duration-200 overflow-hidden",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md shadow-primary/10"
          : accentRing,
        "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      {/* Selected accent corner */}
      {selected && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-primary/15 to-transparent pointer-events-none" />
      )}

      {/* Header: icon + name + selected indicator */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          row.status === "attention"
            ? "bg-warning/10 text-warning-foreground ring-1 ring-warning/20"
            : row.status === "renewal_due"
              ? "bg-primary/10 text-primary ring-1 ring-primary/20"
              : "bg-muted text-foreground/70 ring-1 ring-border",
        )}>
          {row.status === "attention" ? <Flame className="h-5 w-5" />
            : row.status === "renewal_due" ? <CalendarClock className="h-5 w-5" />
            : <Building2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-foreground leading-tight truncate">
            {row.name}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {row.industry.split("(")[0].trim()} · {row.hq}
          </p>
        </div>
        {selected && (
          <Badge className="text-[9px] h-5 bg-primary text-primary-foreground border-transparent shrink-0">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Open
          </Badge>
        )}
      </div>

      {/* Metric grid — premium, large numbers */}
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-0.5">
            5-yr premium
          </p>
          <p className="text-[16px] font-bold text-foreground tracking-tight tabular-nums leading-none">
            {fmtK(row.totalPremium5yr)}
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-1">
            {row.carriers} carrier{row.carriers !== 1 ? "s" : ""} · {row.policies} policies
          </p>
        </div>
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-0.5">
            Loss ratio
          </p>
          <p className={cn(
            "text-[16px] font-bold tracking-tight tabular-nums leading-none",
            lrOverThreshold ? "text-destructive" : lrClean ? "text-success" : "text-foreground",
          )}>
            {row.lossRatioPct}%
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-1">
            {fmtK(row.totalIncurred)} incurred
          </p>
        </div>
      </div>

      {/* Loss-ratio bar */}
      <div className="mb-3.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", lrBarColor)}
            style={{ width: `${lrFill}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1 text-[9.5px] text-muted-foreground">
          <span>0%</span>
          <span className="font-semibold">60% threshold</span>
          <span>100%</span>
        </div>
      </div>

      {/* Footer: renewal + claim status */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1.5">
          <CalendarClock className={cn(
            "h-3 w-3",
            renewalImminent ? "text-destructive" :
            renewalSoon     ? "text-primary" :
                              "text-muted-foreground",
          )} />
          <span className={cn(
            "text-[11px] font-semibold tabular-nums",
            renewalImminent ? "text-destructive" :
            renewalSoon     ? "text-primary" :
                              "text-foreground",
          )}>
            Renews {renewalCountdown(row.daysToRenewal)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            · {renewalShort(row.nextRenewalISO)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {row.largeOpen > 0 && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/5 text-destructive text-[9.5px] font-semibold px-1.5 py-0">
              {row.largeOpen} large open
            </Badge>
          )}
          {row.openClaims > 0 && row.largeOpen === 0 && (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground text-[9.5px] font-semibold px-1.5 py-0">
              {row.openClaims} open
            </Badge>
          )}
          {row.openClaims === 0 && (
            <Badge variant="outline" className="border-success/40 bg-success/5 text-success text-[9.5px] font-semibold px-1.5 py-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Clean
            </Badge>
          )}
        </div>
      </div>

      {/* Hover arrow indicator */}
      <ArrowRight className={cn(
        "absolute bottom-3 right-3 h-3.5 w-3.5 transition-all duration-200",
        "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0",
        "text-primary",
      )} />
    </button>
  );
}

// Keep a single export to avoid breaking the prior import path. Both the
// default export and the named export refer to the same component.
export default CustomerBookPanel;
