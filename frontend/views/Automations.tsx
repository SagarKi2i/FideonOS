'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Zap,
  Workflow as WorkflowIcon,
  Plus,
  ArrowRight,
  Activity,
  GitBranch,
  Loader2,
  Play,
  Sparkles,
  Mail,
  AlertCircle,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Pipeline { id: string; name: string; is_active: boolean; created_at: string; steps: any[] }

const TRIGGER_BLOCKS = [
  { icon: Mail,        label: "On email arrives",   desc: "Carrier email lands → triage → quote/fnol",   tone: "primary" as const },
  { icon: AlertCircle, label: "On condition",       desc: "Loss ratio > X · renewal in 30d · etc.",       tone: "success" as const },
  { icon: Sparkles,    label: "On AI client call",  desc: "Claude/Copilot triggers a workflow via MCP",   tone: "primary" as const },
];

export default function Automations() {
  const router = useRouter();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const pipeRes = await supabase
      .from("agent_pipelines")
      .select("id,name,is_active,created_at,steps")
      .order("created_at", { ascending: false })
      .limit(50);
    setPipelines(((pipeRes.data ?? []) as any).map((p: any) => ({ ...p, steps: Array.isArray(p.steps) ? p.steps : [] })));
    setLoading(false);
  };

  const totalActive = pipelines.filter((p) => p.is_active).length;
  const totalAutomations = pipelines.length;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Automations"
        title="Two ways to automate. One operating system."
        description="Use the workflow builder for self-serve automations — or hand off a workflow to Fideon engineering for a custom pod built end-to-end, governance included."
        icon={Zap}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push("/request-pod")}>
              <Wand2 className="h-4 w-4" />Request a custom pod
            </Button>
          </>
        }
      />

      {/* Hero — request-a-pod headline */}
      <Card className="mb-6 overflow-hidden bg-gradient-hero border-primary/20">
        <div className="p-6 md:p-7 flex items-start gap-5 flex-wrap">
          <div className="h-14 w-14 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
            <Wand2 className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-[280px]">
            <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-1">
              Custom pods · engineered for you
            </p>
            <h2 className="font-display text-[22px] md:text-[26px] font-bold text-foreground tracking-tight leading-tight">
              Hand us the workflow. We'll engineer the pod.
            </h2>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed max-w-2xl mt-2">
              Upload an SOP — Fideon engineering scopes, builds, tests against your real carriers, and ships back an install-ready pod. Typical turnaround 5–7 business days. Same governance, same review queue, same audit trail as every catalog pod.
            </p>
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <Button variant="primary" size="lg" onClick={() => router.push("/request-pod")}>
                <Sparkles className="h-4 w-4" />Request a custom pod
              </Button>
              <Button variant="ghost" size="lg" onClick={() => router.push("/marketplace")}>
                Browse the catalog instead <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Section divider */}
      <SectionHeader
        title="Self-serve automations"
        description="Wire up triggers and chain agents into workflows yourself."
        icon={Zap}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows")}>
            <Plus className="h-4 w-4" />New automation
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <KpiCard label="Total workflows" value={loading ? "—" : totalAutomations} icon={Zap}      tone="primary" />
        <KpiCard label="Active right now" value={loading ? "—" : totalActive}     icon={Activity} tone="success" hint={totalActive > 0 ? "running" : "none active"} />
      </div>

      {/* Trigger blocks — what an automation can react to */}
      <div className="mb-8">
        <SectionHeader
          title="Triggers"
          description="An automation reacts to one of these. Pick a builder below to wire one up."
          icon={Sparkles}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TRIGGER_BLOCKS.map((t) => (
            <Card key={t.label} className="p-4">
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center mb-3",
                ( t.tone as string) === "primary" && "bg-accent text-primary",
                (t.tone as string) === "warning" && "bg-warning/10 text-warning-foreground/80",
                (t.tone as string) === "success" && "bg-success/10 text-success",
              )}>
                <t.icon className="h-[18px] w-[18px]" />
              </div>
              <p className="text-[13.5px] font-semibold text-foreground">{t.label}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Workflow builder — drag-and-drop chains.
          The old SOP-based pipeline builder retired into Request-a-Pod.
          Cron schedules retired — agents run on event triggers + via Workflows. */}
      <BuilderColumn
        icon={WorkflowIcon}
        title="Workflows"
        tagline="Drag-and-drop agent chains"
        tone="primary"
        count={pipelines.length}
        activeCount={pipelines.filter((p) => p.is_active).length}
        loading={loading}
        openLabel="Open builder"
        newLabel="New workflow"
        onOpen={() => router.push("/agent-workflows")}
        onNew={() => router.push("/agent-workflows")}
        rows={pipelines.slice(0, 5).map((p) => ({
          id: p.id,
          primary: p.name,
          secondary: `${p.steps.length} step${p.steps.length !== 1 ? "s" : ""} · created ${formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}`,
          active: p.is_active,
          href: "/agent-workflows",
        }))}
      />
    </div>
  );
}

function BuilderColumn({
  icon: Icon,
  title,
  tagline,
  tone,
  count,
  activeCount,
  loading,
  openLabel,
  newLabel,
  onOpen,
  onNew,
  rows,
}: {
  icon: LucideIcon;
  title: string;
  tagline: string;
  tone: "primary" | "success" | "warning";
  count: number;
  activeCount?: number;
  loading: boolean;
  openLabel: string;
  newLabel: string;
  onOpen: () => void;
  onNew: () => void;
  rows: { id: string; primary: string; secondary: string; active?: boolean; href: string }[];
}) {
  const router = useRouter();
  return (
    <Card className="overflow-hidden flex flex-col">
      {/* Column header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              tone === "primary" && "bg-accent text-primary",
              tone === "warning" && "bg-warning/10 text-warning-foreground/80",
              tone === "success" && "bg-success/10 text-success",
            )}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-bold text-foreground tracking-tight">{title}</h3>
              <p className="text-[12px] text-muted-foreground">{tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{count}</span>
            {activeCount !== undefined && activeCount > 0 && (
              <StatusPill tone="success" dot pulse size="sm">{activeCount} live</StatusPill>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-[180px]">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin text-primary mx-auto" /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={Icon}
            title="None yet"
            description={`Create your first ${title.toLowerCase().slice(0, -1)} to see it here.`}
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => router.push(row.href)}
                className="w-full text-left px-5 py-3 hover:bg-accent/40 transition-colors group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {row.primary}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{row.secondary}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.active && <StatusPill tone="success" dot size="sm">on</StatusPill>}
                    {row.active === false && <span className="text-[10.5px] text-muted-foreground">paused</span>}
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border bg-muted/20 px-5 py-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="text-primary" onClick={onOpen}>
          <Play className="h-3 w-3" />{openLabel}
        </Button>
        <Button variant="primary" size="sm" onClick={onNew}>
          <Plus className="h-3 w-3" />{newLabel}
        </Button>
      </div>
    </Card>
  );
}
