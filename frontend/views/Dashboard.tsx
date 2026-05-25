'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain, FileSearch, Scale, ClipboardList, FileText, MessageSquare,
  Activity, Zap, TrendingUp, ArrowRight, Sparkles, AlertCircle,
  CheckCircle2, Compass, Play, Workflow, ShieldCheck, Rocket, Eye,
  ChevronRight, Plus, Filter, ArrowUpRight, Clock3, Gauge, MoreHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dashboardApi, type DashboardOverview } from "@/lib/api";
import fideonLogo from "@/assets/fideon-logo.png";
import { cn } from "@/lib/utils";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusPill } from "@/components/ui/status-pill";
import { SkeletonCard } from "@/components/ui/skeleton";

type Pod = DashboardOverview["agents"][number];
type RunRecord = DashboardOverview["recent_runs"][number];
type RunStatus = RunRecord["status"];

const getPodIcon = (keyword: string | null) => {
  const icons: Record<string, typeof Brain> = {
    "document-retrieval": FileSearch, "quote-generation": FileText,
    "policy-comparison": Scale, "claims-fnol": ClipboardList,
    "generic-prompt": MessageSquare,
  };
  return (keyword && icons[keyword]) || Brain;
};

const fmtSeconds = (s: number | null): string => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
};

const relativeTime = (iso: string | null): string => {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
};

const RUN_TONE: Record<RunStatus, "primary" | "success" | "warning" | "danger" | "live"> = {
  running:   "live",
  succeeded: "success",
  failed:    "danger",
};

const RUN_LABEL: Record<RunStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

const STEPS = [
  { step: "01", title: "Browse Agents",    desc: "Explore 39+ purpose-built AI agents for insurance — from document parsing to claims adjudication.", icon: Compass,   action: "/marketplace" },
  { step: "02", title: "Request Activation", desc: "Submit an activation request. Your admin will review and approve agents for your workspace.",      icon: Sparkles,  action: "/marketplace" },
  { step: "03", title: "Test in Playground", desc: "Run agents against real insurance data in a sandboxed environment before deploying.",                icon: Play,      action: "/playground" },
  { step: "04", title: "Build Workflows",    desc: "Chain multiple agents into automated pipelines — submissions → underwriting → quoting.",            icon: Workflow,  action: "/agent-workflows" },
];

export default function Dashboard() {
  const router = useRouter();
  const [pods, setPods] = useState<Pod[]>([]);
  const [kpis, setKpis] = useState<DashboardOverview["kpis"] | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activity, setActivity] = useState<DashboardOverview["activity"]>([]);
  const [loading, setLoading] = useState(true);
  const [runFilter, setRunFilter] = useState<"all" | RunStatus>("all");

  useEffect(() => { loadOverview(); }, []);

  const loadOverview = async () => {
    try {
      const data = await dashboardApi.overview();
      setPods(data.agents);
      setKpis(data.kpis);
      setRuns(data.recent_runs);
      setActivity(data.activity);
    } catch (error) { console.error("Error loading dashboard:", error); }
    finally { setLoading(false); }
  };

  const totalQueries = kpis?.runs_week ?? 0;
  const avgSuccessRate = kpis?.success_rate ?? 0;

  const filteredRuns = useMemo(
    () => runFilter === "all" ? runs : runs.filter(r => r.status === runFilter),
    [runFilter, runs]
  );

  const runCounts = useMemo(() => ({
    all: runs.length,
    running: runs.filter(r => r.status === "running").length,
    succeeded: runs.filter(r => r.status === "succeeded").length,
    failed: runs.filter(r => r.status === "failed").length,
  }), [runs]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader eyebrow="Mission control" title="Loading…" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  // ===================== ONBOARDING =====================
  if (pods.length === 0) {
    return (
      <motion.div className="space-y-8 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_60%)]" />
          <div className="relative p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center p-1.5 shadow-glow">
                    <img src={typeof fideonLogo === "object" ? (fideonLogo as any).src : fideonLogo} alt="Fideon" className="h-full w-full object-contain" />
                  </div>
                  <StatusPill tone="primary" dot pulse>Enterprise AI Platform</StatusPill>
                </div>
                <div className="space-y-2">
                  <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-tight">
                    Welcome to Fideon OS
                  </h1>
                  <p className="text-muted-foreground text-[15px] leading-relaxed max-w-xl">
                    Your private AI workspace for insurance operations. Deploy cognitive agents that automate policy checking, claims processing, submissions and more — all within your infrastructure.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Button variant="primary" size="lg" onClick={() => router.push("/marketplace")}>
                    <Rocket className="h-4 w-4" /> Browse Agents <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => router.push("/playground")}>
                    <Eye className="h-4 w-4" /> Try Playground
                  </Button>
                </div>
              </div>
              <div className="hidden md:block w-[280px] shrink-0 space-y-2">
                {[
                  { icon: ShieldCheck, label: "Private Deployment", value: "Your data never leaves" },
                  { icon: Brain,       label: "39+ AI Agents",      value: "Insurance-native" },
                  { icon: Zap,         label: "Agentic Workflows",  value: "Chain & automate" },
                ].map((feat) => (
                  <div key={feat.label} className="flex items-center gap-3 p-3.5 rounded-xl bg-card/80 border border-border backdrop-blur-sm">
                    <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
                      <feat.icon className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground leading-tight">{feat.label}</p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">{feat.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <SectionHeader title="Get started" description="Four steps to your first automated workflow" />
          <div className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <Card
                key={s.step}
                className="group cursor-pointer hover:shadow-elevated hover:border-border-strong transition-all"
                onClick={() => router.push(s.action)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="h-11 w-11 rounded-xl bg-accent text-primary flex items-center justify-center">
                        <s.icon className="h-[18px] w-[18px]" />
                      </div>
                      <span className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center shadow-sm">
                        {i + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className="text-[14px] font-semibold text-foreground">{s.title}</h3>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ===================== MISSION CONTROL =====================
  return (
    <motion.div className="max-w-7xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="Mission control"
          title="Operations dashboard"
          description={`${pods.length} active agent${pods.length > 1 ? "s" : ""} · ${runCounts.running} run${runCounts.running !== 1 ? "s" : ""} in progress · live data`}
          actions={
            <>
              <div className="hidden md:block">
                <Input placeholder="Filter runs, agents…" className="h-9 w-56 text-[13px]" />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-3.5 w-3.5" /> Filters
              </Button>
              <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows")}>
                <Plus className="h-3.5 w-3.5" /> New Workflow
              </Button>
            </>
          }
        >
          <StatusPill tone="success" dot pulse>Live</StatusPill>
        </PageHeader>
      </motion.div>

      {/* KPI strip */}
      <motion.div variants={item} className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard
          label="Active agents"
          value={pods.length}
          hint="All operational"
          icon={Activity}
          tone="success"
          delta="100%"
          trend="up"
        />
        <KpiCard
          label="Runs today"
          value={(kpis?.runs_today ?? 0).toLocaleString()}
          hint="last 24 hours"
          icon={Zap}
          tone="primary"
        />
        <KpiCard
          label="Success rate"
          value={`${avgSuccessRate.toFixed(1)}%`}
          hint={`${totalQueries.toLocaleString()} runs this week`}
          icon={TrendingUp}
          tone="success"
        />
        <KpiCard
          label="Avg latency"
          value={kpis?.avg_latency_seconds != null ? kpis.avg_latency_seconds.toFixed(1) : "—"}
          suffix={kpis?.avg_latency_seconds != null ? "s" : ""}
          hint="per completed run"
          icon={Gauge}
          tone="primary"
        />
      </motion.div>

      {/* Run monitor */}
      <motion.div variants={item} className="mb-6">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">Run Monitor</h2>
              <StatusPill tone="live" dot pulse size="sm">Live</StatusPill>
            </div>
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/40">
              {([
                { k: "all",       label: "All" },
                { k: "running",   label: "Running" },
                { k: "succeeded", label: "Succeeded" },
                { k: "failed",    label: "Failed" },
              ] as const).map(f => (
                <button
                  key={f.k}
                  onClick={() => setRunFilter(f.k)}
                  className={cn(
                    "h-7 px-2.5 rounded text-[11.5px] font-semibold transition-colors flex items-center gap-1.5",
                    runFilter === f.k
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className="text-[10px] opacity-70 tabular-nums">
                    {runCounts[f.k as keyof typeof runCounts]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5">Run ID</th>
                  <th className="px-5 py-2.5">Agent</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Duration</th>
                  <th className="px-5 py-2.5">Confidence</th>
                  <th className="px-5 py-2.5">Started</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-accent/40 transition-colors group cursor-pointer"
                    onClick={() => run.agent_keyword && router.push(`/pod/${run.agent_keyword}`)}
                  >
                    <td className="px-5 py-3 font-mono text-[12px] text-foreground">{run.id.slice(0, 8)}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{run.agent_name ?? run.agent_keyword ?? "—"}</td>
                    <td className="px-5 py-3">
                      <StatusPill
                        tone={RUN_TONE[run.status]}
                        dot
                        pulse={run.status === "running"}
                        size="sm"
                      >
                        {RUN_LABEL[run.status]}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground tabular-nums">{fmtSeconds(run.duration_seconds)}</td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">
                      {run.confidence != null ? `${Math.round(run.confidence * 100)}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{relativeTime(run.started_at)}</td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                      No runs match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>Showing {filteredRuns.length} of {runs.length} runs</span>
            <Button variant="ghost" size="xs" className="text-primary" onClick={() => router.push("/agent-workflows")}>
              View all <ArrowUpRight className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Two column: agents grid + activity */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <motion.div variants={item}>
          <Card>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">Your Agents</h2>
              <Button variant="ghost" size="xs" className="text-primary" onClick={() => router.push("/marketplace")}>
                Add agent <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {pods.slice(0, 6).map((pod, idx) => {
                const Icon = getPodIcon(pod.keyword);
                const queries = pod.summary.total_runs;
                const success = pod.summary.total_runs > 0 ? pod.summary.success_rate : null;
                const latency = pod.summary.avg_latency_seconds;
                const rowIdx = Math.floor(idx / 2);
                const isLastRow = rowIdx === Math.floor((Math.min(pods.length, 6) - 1) / 2);
                return (
                  <button
                    key={pod.id}
                    onClick={() => pod.keyword && router.push(`/pod/${pod.keyword}`)}
                    className={cn(
                      "group text-left p-4 hover:bg-accent/40 transition-colors",
                      !isLastRow && "border-b border-border"
                    )}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-semibold text-foreground truncate">{pod.name ?? pod.keyword}</p>
                          <StatusPill tone="success" dot size="sm" className="px-1 h-4">live</StatusPill>
                        </div>
                        <p className="text-[11.5px] text-muted-foreground capitalize">{pod.domain ?? "—"}</p>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Runs" value={queries != null ? queries.toLocaleString() : "—"} />
                      <Stat label="Success" value={success != null ? `${success.toFixed(0)}%` : "—"} />
                      <Stat label="Latency" value={latency != null ? `${latency.toFixed(1)}s` : "—"} />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="h-full">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">Activity feed</h2>
              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="divide-y divide-border">
              {activity.length === 0 && (
                <div className="px-5 py-12 text-center text-[12.5px] text-muted-foreground">
                  No recent activity yet.
                </div>
              )}
              {activity.map((a) => {
                const Icon = getPodIcon(a.agent_keyword);
                return (
                  <div key={a.run_id} className="flex items-start gap-3 px-5 py-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-foreground leading-snug">{a.text}</p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">
                        {(a.agent_name ?? a.agent_keyword ?? "Agent")} · {relativeTime(a.at)}
                      </p>
                    </div>
                    {a.status === "error" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-1" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold">{label}</p>
      <p className="text-[13px] font-bold text-foreground tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
