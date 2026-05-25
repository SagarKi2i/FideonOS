'use client';
// PodAnalyticsDashboard — read-only analytics surface used by every pod
// other than Loss Run Reporting. Same visual language as the Loss Run
// cockpit: plain card containment with headers inside each card,
// accent-rail KPI tiles, restrained color (status tones only), paired
// side-by-side sections, broker-native language.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2,
  Flame, Search, Sparkles, Target, Zap, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PodDataset, KpiTile, ActivityRow } from "./podDashboardData";

interface Props {
  dataset: PodDataset;
}

type Tone = "primary" | "success" | "warning" | "danger" | "neutral";

const valueToneCls: Record<Tone, string> = {
  primary: "text-foreground",
  success: "text-success",
  warning: "text-warning-foreground",
  danger:  "text-destructive",
  neutral: "text-foreground",
};

const accentBarCls: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger:  "bg-destructive",
  neutral: "bg-border",
};

const statusBadge = (status: ActivityRow["status"]) => {
  const map = {
    success: { cls: "text-success border-success/40 bg-success/5",                       icon: CheckCircle2 },
    warning: { cls: "text-warning-foreground border-warning/40 bg-warning/10",           icon: AlertTriangle },
    danger:  { cls: "text-destructive border-destructive/40 bg-destructive/5",           icon: Flame },
    info:    { cls: "text-primary border-primary/30 bg-primary/5",                       icon: Activity },
  } as const;
  return map[status];
};

export default function PodAnalyticsDashboard({ dataset }: Props) {
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    if (!search.trim()) return dataset.activity.rows;
    const q = search.toLowerCase();
    return dataset.activity.rows.filter(r =>
      [r.id, r.primary, r.secondary, r.amount, r.meta].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [dataset.activity.rows, search]);

  return (
    <div className="space-y-5">
      {/* ── Header card ── */}
      <Card>
        <CardContent className="px-5 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-none">
                {dataset.title}
              </h1>
              <p className="text-[12.5px] text-muted-foreground mt-2.5">{dataset.subtitle}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Read-only · last 30 days</p>
            </div>
            <Badge variant="outline" className="border-success/40 bg-success/5 text-success text-[10.5px] font-medium">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Healthy
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI strip — accent-rail tiles ── */}
      <div className={cn(
        "grid gap-4",
        dataset.kpis.length >= 5 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5" :
        dataset.kpis.length === 4 ? "grid-cols-2 md:grid-cols-4" :
        dataset.kpis.length === 3 ? "grid-cols-1 md:grid-cols-3" :
                                     "grid-cols-1 md:grid-cols-2",
      )}>
        {dataset.kpis.map((kpi) => (
          <KpiTileBlock key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* ── AI narrative + recommended actions ── */}
      <Card>
        <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              {dataset.narrative.headline}
            </h3>
            <p className="text-[11.5px] text-muted-foreground mt-1">Auto-generated from this pod's activity</p>
          </div>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Fideon-drafted
          </span>
        </div>
        <CardContent className="px-5 py-5 space-y-5">
          <p className="text-[13px] leading-relaxed text-foreground/90">{dataset.narrative.summary}</p>

          {/* Highlights — labeled facts row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            {dataset.narrative.highlights.map((h) => (
              <NarrativeHighlight key={h.label} label={h.label} value={h.value} tone={(h.tone ?? "neutral") as Tone} />
            ))}
          </div>

          {/* Recommended actions */}
          {dataset.narrative.recommendations.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground inline-flex items-center gap-1.5 mb-3">
                <Target className="h-3 w-3 text-primary" />
                Recommended actions
              </h4>
              <ol className="space-y-2.5">
                {dataset.narrative.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-4 text-right shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <p className="text-[13px] text-foreground/90 leading-relaxed">{r}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Trend + Breakdown side by side ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
        <Card>
          <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{dataset.trend.title}</h3>
              <p className="text-[11.5px] text-muted-foreground mt-1">12-week rolling window</p>
            </div>
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-[10.5px] font-medium">
              <ArrowUpRight className="h-3 w-3 mr-1" /> Trending up
            </Badge>
          </div>
          <CardContent className="px-5 py-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dataset.trend.data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="podPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="podSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Area type="monotone" dataKey="primary"   name={dataset.trend.primaryName}   stroke="hsl(var(--primary))"          strokeWidth={2}   fill="url(#podPrimary)" />
                {dataset.trend.data[0]?.secondary !== undefined && (
                  <Area type="monotone" dataKey="secondary" name={dataset.trend.secondaryName} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} fill="url(#podSecondary)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{dataset.breakdown.title}</h3>
            <p className="text-[11.5px] text-muted-foreground mt-1">Distribution by share</p>
          </div>
          <CardContent className="px-5 py-4">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={dataset.breakdown.data} dataKey="value" innerRadius={42} outerRadius={72} paddingAngle={1} stroke="hsl(var(--background))" strokeWidth={2}>
                  {dataset.breakdown.data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-1.5 mt-3 pt-3 border-t border-border">
              {dataset.breakdown.data.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-[11.5px]">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-foreground/80 truncate">{d.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground shrink-0">{d.value}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Funnel + Top items side by side ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {dataset.funnel && (
          <Card>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                {dataset.funnel.title}
              </h3>
            </div>
            <CardContent className="px-5 py-4 space-y-2.5">
              {dataset.funnel.stages.map((stage, i) => {
                const max = dataset.funnel!.stages[0].value;
                const pct = (stage.value / max) * 100;
                const drop = i > 0 ? ((dataset.funnel!.stages[i - 1].value - stage.value) / dataset.funnel!.stages[i - 1].value) * 100 : 0;
                return (
                  <div key={stage.name}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-semibold text-foreground">{stage.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-foreground tabular-nums">{stage.value.toLocaleString()}</span>
                        {i > 0 && <span className="text-[10.5px] text-muted-foreground">−{drop.toFixed(1)}%</span>}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
              {dataset.topItems.title}
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {dataset.topItems.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">{it.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{it.sub}</p>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[10.5px] font-medium shrink-0",
                  it.tone === "danger"  && "text-destructive border-destructive/40 bg-destructive/5",
                  it.tone === "warning" && "text-warning-foreground border-warning/40 bg-warning/10",
                  it.tone === "success" && "text-success border-success/40 bg-success/5",
                  (!it.tone || (it.tone as string) === "neutral") && "text-foreground border-border",
                )}>
                  {it.value}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Activity feed (full width) ── */}
      <Card>
        <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              {dataset.activity.title}
            </h3>
            <p className="text-[11.5px] text-muted-foreground mt-1">Live feed of agent operations</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search activity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-[12px]"
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {dataset.activity.columns.map((c) => (
                  <TableHead key={String(c.key)} className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const sb = statusBadge(row.status);
                const SIcon = sb.icon;
                return (
                  <TableRow key={row.id} className="hover:bg-muted/15">
                    <TableCell className="text-[11.5px] font-mono text-muted-foreground">{row.date}</TableCell>
                    <TableCell className="text-[12.5px] font-semibold text-foreground">{row.primary}</TableCell>
                    <TableCell className="text-[11.5px] text-muted-foreground">{row.secondary}</TableCell>
                    <TableCell className="text-[12.5px] font-semibold text-foreground tabular-nums">{row.amount ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <Badge variant="outline" className={cn("text-[10.5px] font-medium", sb.cls)}>
                          <SIcon className="h-3 w-3 mr-1" />
                          {row.status}
                        </Badge>
                        {row.meta && <span className="text-[10px] text-muted-foreground mt-0.5">{row.meta}</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────── kpi tile ─────────────────────────── */

function KpiTileBlock({ kpi }: { kpi: KpiTile }) {
  const TrendIcon = kpi.trend === "down" ? ArrowDownRight : ArrowUpRight;
  const tone = (kpi.tone ?? "neutral") as Tone;
  const trendColor =
    kpi.tone === "warning" || kpi.tone === "danger" ? "text-warning-foreground" :
    kpi.trend === "down" ? "text-success" :
                          "text-success";
  return (
    <Card>
      <CardContent className="px-4 py-4 relative">
        <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full", accentBarCls[tone])} />
        <div className="pl-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{kpi.label}</p>
            {kpi.delta && (
              <span className={cn("inline-flex items-center gap-0.5 text-[10.5px] font-semibold", trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {kpi.delta}
              </span>
            )}
          </div>
          <p className={cn("text-[24px] font-semibold tabular-nums mt-1.5 leading-none tracking-tight", valueToneCls[tone])}>
            {kpi.value}
          </p>
          {kpi.hint && <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{kpi.hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── narrative highlight ─────────────────────────── */

function NarrativeHighlight({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="relative pl-3">
      <span className={cn("absolute left-0 top-0.5 bottom-1 w-[3px] rounded-full", accentBarCls[tone])} />
      <p className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-[16px] font-semibold mt-1 tabular-nums leading-tight", valueToneCls[tone])}>{value}</p>
    </div>
  );
}
