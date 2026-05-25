'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, Search, Shield, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, ArrowUpRight, FileText, MoreHorizontal,
} from "lucide-react";
import { DecisionRecord } from "@/lib/governance";
import { cn } from "@/lib/utils";

type RiskKey = "low" | "medium" | "high";
type StatusKey = "pending" | "approved" | "rejected" | "overridden" | "escalated";

const RISK_PILL: Record<RiskKey, { label: string; pill: string; dot: string }> = {
  low:    { label: "Low",    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400", dot: "bg-emerald-500" },
  medium: { label: "Medium", pill: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",       dot: "bg-amber-500" },
  high:   { label: "High",   pill: "bg-destructive/10 text-destructive border-destructive/20",                      dot: "bg-destructive" },
};

const STATUS_PILL: Record<StatusKey, { label: string; pill: string; dot: string; icon?: typeof CheckCircle2 }> = {
  pending:    { label: "Pending Review", pill: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400", dot: "bg-amber-500", icon: Clock },
  approved:   { label: "Approved",       pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400", dot: "bg-emerald-500", icon: CheckCircle2 },
  rejected:   { label: "Rejected",       pill: "bg-destructive/10 text-destructive border-destructive/20", dot: "bg-destructive", icon: XCircle },
  overridden: { label: "Overridden",     pill: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-400", dot: "bg-violet-500" },
  escalated:  { label: "Escalated",      pill: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" },
};

export default function Decisions() {
  const router = useRouter();
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("decision_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    // Governance is a BLOCKED domain — no `decision_records` table / API yet
    // (see ALIGNMENT_AND_REMAINING_WORK.md §4.1). Until it's migrated to the
    // FastAPI API, the legacy Supabase client is a no-op stub and returns an
    // error; degrade to an empty list quietly instead of logging an opaque object.
    if (error) console.warn("[Decisions] governance not available yet:", error?.message ?? error);
    setRecords((data as unknown as DecisionRecord[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (riskFilter !== "all" && r.risk_level !== riskFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [records, search, riskFilter, statusFilter, domainFilter]);

  const stats = useMemo(() => {
    const total = records.length;
    const pending = records.filter((r) => r.status === "pending").length;
    const decided = records.filter((r) => r.status === "approved" || r.status === "rejected");
    const overrides = decided.filter((r) => r.ai_human_agreement === false).length;
    const overrideRate = decided.length ? Math.round((overrides / decided.length) * 100) : 0;
    const highRisk = records.filter((r) => r.risk_level === "high").length;
    return { total, pending, overrideRate, highRisk };
  }, [records]);

  const statusCounts = useMemo(() => {
    const base = { all: records.length, pending: 0, approved: 0, rejected: 0 };
    records.forEach((r) => {
      if (r.status === "pending") base.pending++;
      else if (r.status === "approved") base.approved++;
      else if (r.status === "rejected") base.rejected++;
    });
    return base;
  }, [records]);

  const domains = [...new Set(records.map((r) => r.domain))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Decision Records</h1>
            <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">
              Audit-ready
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Immutable, traceable records of every AI decision. Single source of truth for compliance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/governance/audit-log")}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Audit Log
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Brain} label="Total Decisions" value={stats.total} hint="all-time" />
        <KPI icon={Clock} label="Pending Review" value={stats.pending} hint="awaiting human" tone="amber" />
        <KPI
          icon={TrendingUp}
          label="Override Rate"
          value={`${stats.overrideRate}%`}
          hint="AI vs human disagreement"
          tone={stats.overrideRate > 25 ? "rose" : "default"}
        />
        <KPI icon={AlertTriangle} label="High Risk" value={stats.highRisk} hint="elevated controls" tone="rose" />
      </div>

      {/* Mission-control style table */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-foreground">Decisions</h2>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium">
              {filtered.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search decisions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-7 text-[12px] w-[220px]"
              />
            </div>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[110px] h-7 text-[11.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[140px] h-7 text-[11.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/20">
          {([
            { k: "all" as const, label: "All" },
            { k: "pending" as const, label: "Pending" },
            { k: "approved" as const, label: "Approved" },
            { k: "rejected" as const, label: "Rejected" },
          ]).map((f) => (
            <button
              key={f.k}
              onClick={() => setStatusFilter(f.k)}
              className={cn(
                "h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1.5",
                statusFilter === f.k
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
              <span className="text-[10px] opacity-70 tabular-nums">
                {statusCounts[f.k as keyof typeof statusCounts]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                <th className="px-4 py-2.5 font-semibold">ID</th>
                <th className="px-4 py-2.5 font-semibold">Decision</th>
                <th className="px-4 py-2.5 font-semibold">Risk</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">AI vs Human</th>
                <th className="px-4 py-2.5 font-semibold">Confidence</th>
                <th className="px-4 py-2.5 font-semibold">Model</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                    Loading decisions…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                    No decisions match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const risk = RISK_PILL[r.risk_level as RiskKey] ?? RISK_PILL.medium;
                  const status = STATUS_PILL[r.status as StatusKey] ?? STATUS_PILL.pending;
                  const StatusIcon = status.icon;
                  const confPct = r.ai_confidence != null ? Math.round(r.ai_confidence * 100) : null;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-accent/40 transition-colors group cursor-pointer"
                      onClick={() => router.push(`/governance/decisions/${r.id}`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-[12px] text-foreground tabular-nums">
                        DR-{r.id.slice(0, 6).toUpperCase()}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground truncate max-w-[420px]">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground capitalize mt-0.5">
                          {r.domain} · {r.decision_type.replace(/_/g, " ")}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex items-center gap-1.5 h-5 px-2 rounded-md border text-[11px] font-medium", risk.pill)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", risk.dot)} />
                          {risk.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex items-center gap-1.5 h-5 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap w-fit", status.pill)}>
                          {StatusIcon ? <StatusIcon className="h-3 w-3" /> : <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.ai_human_agreement === null ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : r.ai_human_agreement ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Agreed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Override
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {confPct === null ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  confPct >= 85 ? "bg-emerald-500" : confPct >= 60 ? "bg-amber-500" : "bg-destructive",
                                )}
                                style={{ width: `${confPct}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-8">{confPct}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-[12px] text-foreground truncate max-w-[160px]">{r.pod_model_name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{r.model_version || "v—"}</div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px] tabular-nums">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-2 py-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition"
                          onClick={(e) => { e.stopPropagation(); router.push(`/governance/decisions/${r.id}`); }}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Showing {filtered.length} of {records.length} decisions</span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => router.push("/governance/audit-log")}>
            View audit log <ArrowUpRight className="h-3 w-3" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KPI({
  icon: Icon, label, value, hint, tone = "default",
}: {
  icon: typeof Brain; label: string; value: string | number; hint?: string;
  tone?: "default" | "amber" | "rose";
}) {
  const toneCls = tone === "amber"
    ? "text-amber-700 bg-amber-500/10 dark:text-amber-400"
    : tone === "rose"
    ? "text-destructive bg-destructive/10"
    : "text-primary bg-primary/10";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("p-1.5 rounded-md", toneCls)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
