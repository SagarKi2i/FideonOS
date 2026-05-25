'use client';
import { useRouter } from 'next/navigation';
// Agent Workflows — the list page.
//
// Lists every workflow the broker has built. The actual builder lives in
// WorkflowBuilder.tsx (a full-page two-pane experience). This page is the
// directory + new/edit entry points.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

import {
  Plus, Zap, GitBranch, Activity, Trash2, Loader2,
  ChevronRight, FileSearch, Scale, AlertTriangle, ArrowRight, Play,
} from "lucide-react";
import WorkflowRunDialog from "@/components/workflows/WorkflowRunDialog";
import { seedWorkflowRunReviews } from "@/components/workflows/runtime/runSeed";
import { runWorkflow } from "@/lib/pods";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { AGENT_REGISTRY } from "@/components/pipeline/AgentConfigForm";
import { cn } from "@/lib/utils";

// ─────────────────────────── types ───────────────────────────

interface PipelineStep {
  id: string;
  agent_id: string;
  agent_name: string;
  config: Record<string, any>;
  pass_output: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

// ─────────────────────────── templates ───────────────────────────

interface Template {
  title: string;
  description: string;
  icon: typeof Scale;
  agentIds: string[];
}

const TEMPLATES: Template[] = [
  {
    title: "Claims processing",
    description: "Analyze, validate, and categorize inbound claims end-to-end.",
    icon: Scale,
    agentIds: ["claims-fnol", "carrier-claims-adjudication", "carrier-fraud-detection"],
  },
  {
    title: "Fraud detection",
    description: "Pull supporting docs and surface high-risk patterns.",
    icon: AlertTriangle,
    agentIds: ["document-retrieval", "carrier-fraud-detection", "carrier-subrogation"],
  },
  {
    title: "Policy validation",
    description: "Parse ACORD forms and compare against the prior term.",
    icon: FileSearch,
    agentIds: ["acord-parser", "policy-comparison"],
  },
];

// ─────────────────────────── page ───────────────────────────

export default function AgentWorkflows() {
  const router = useRouter();
  const { toast } = useToast();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningWorkflow, setRunningWorkflow] = useState<Pipeline | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("agent_pipelines")
        .select("id, name, description, steps, is_active, last_run_at, created_at")
        .order("created_at", { ascending: false });
      const rows = (data ?? []).map((p: any) => ({
        ...p,
        steps: Array.isArray(p.steps) ? p.steps : [],
      })) as Pipeline[];
      setPipelines(rows);
    } catch (e) {
      console.error("[AgentWorkflows] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (p: Pipeline) => {
    setBusyId(p.id);
    const next = !p.is_active;
    setPipelines((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: next } : x)));
    const { error } = await supabase
      .from("agent_pipelines")
      .update({ is_active: next } as any)
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      setPipelines((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !next } : x)));
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("agent_pipelines").delete().eq("id", id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    setPipelines((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null);
    toast({ title: "Workflow deleted" });
  };

  const startFromTemplate = (t: Template) => {
    // Encode template payload as query param for Next.js navigation
    const steps = t.agentIds.map((agentId) => {
      const a = AGENT_REGISTRY.find((x) => x.id === agentId);
      return a ? { id: crypto.randomUUID(), agent_id: a.id, agent_name: a.name, config: {}, pass_output: true } : null;
    }).filter(Boolean);
    const params = new URLSearchParams({
      name: t.title,
      description: t.description,
      template: JSON.stringify(steps),
    });
    router.push(`/agent-workflows/new?${params.toString()}`);
  };

  // ─── derived ───
  const activeCount = pipelines.filter((p) => p.is_active).length;
  const totalSteps  = pipelines.reduce((sum, p) => sum + p.steps.length, 0);
  const automationRate = pipelines.length > 0 ? Math.round((activeCount / pipelines.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Automations · workflows"
        title="Agent workflows"
        description="Chain agents into pipelines that run on demand or on event. Each step's output flows to the next."
        icon={Zap}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows/new")}>
            <Plus className="h-3.5 w-3.5" />New workflow
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Total workflows"
          value={pipelines.length}
          icon={GitBranch}
          tone="primary"
        />
        <KpiCard
          label="Active now"
          value={activeCount}
          icon={Activity}
          tone={activeCount > 0 ? "success" : "default"}
          hint={activeCount > 0 ? "Running on event" : "None active"}
        />
        <KpiCard
          label="Automation rate"
          value={`${automationRate}%`}
          icon={Zap}
          tone="primary"
          hint={`${totalSteps} step${totalSteps !== 1 ? "s" : ""} chained`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pipelines.length === 0 ? (
        <>
          <EmptyState
            icon={Zap}
            title="No workflows yet"
            description="Chain agents together to automate multi-step tasks. Start from a template or build from scratch."
            action={
              <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows/new")}>
                <Plus className="h-3.5 w-3.5" />Build a workflow
              </Button>
            }
          />

          <div className="mt-6">
            <SectionHeader
              title="Start from a template"
              description="Three common shapes — tweak the chain however you need."
              icon={Zap}
              count={TEMPLATES.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TEMPLATES.map((t) => (
                <TemplateCard key={t.title} t={t} onUse={() => startFromTemplate(t)} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <SectionHeader
            title="Your workflows"
            description="Tap any row to open the builder."
            icon={GitBranch}
            count={pipelines.length}
          />
          <Card className="overflow-hidden mb-6">
            <div className="grid grid-cols-[1fr_100px_130px_110px_140px] gap-3 px-4 py-2.5 border-b border-border bg-muted/30 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">
              <span>Name</span>
              <span>Steps</span>
              <span>Last run</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {pipelines.map((p) => (
                <WorkflowRow
                  key={p.id}
                  p={p}
                  busy={busyId === p.id}
                  onOpen={() => router.push(`/agent-workflows/${p.id}`)}
                  onToggle={() => toggleActive(p)}
                  onRun={() => setRunningWorkflow(p)}
                  onDelete={() => setDeletingId(p.id)}
                />
              ))}
            </ul>
          </Card>

          <SectionHeader
            title="Templates"
            description="Add another chain from a starting point."
            icon={Zap}
            count={TEMPLATES.length}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.title} t={t} onUse={() => startFromTemplate(t)} compact />
            ))}
          </div>
        </>
      )}

      <WorkflowRunDialog
        open={runningWorkflow !== null}
        workflow={runningWorkflow}
        onOpenChange={(o) => { if (!o) setRunningWorkflow(null); }}
        onComplete={async (wf) => {
          // Prefer a REAL run: chain the workflow's installed pods through the
          // tenant runtime (persists pod_runs + flags low-confidence in Approvals).
          // Fall back to the demo seed if no step ran for real (pods not installed
          // / backend not deployed yet).
          try {
            const steps = wf.steps.map((s) => ({ agent_id: s.agent_id, agent_name: s.agent_name }));
            const real = await runWorkflow(steps, { instruction: `Run ${wf.name} on the next eligible account.` }, wf.id);
            const ran = real.steps?.filter((s) => s.status !== "skipped") ?? [];
            if (!real.error && ran.length > 0) {
              const flagged = ran.filter((s) => s.status === "needs_review").length;
              toast({
                title: `${wf.name} finished`,
                description: `${ran.length} step${ran.length === 1 ? "" : "s"} ran${flagged ? ` · ${flagged} flagged in Approvals` : ""}.`,
              });
              load();
              return;
            }
            const { rowsInserted } = await seedWorkflowRunReviews({
              workflowId: wf.id,
              workflowName: wf.name,
              steps,
              input: `Run ${wf.name} on the next eligible account.`,
            });
            toast({
              title: `${wf.name} finished`,
              description: rowsInserted > 0
                ? `${rowsInserted} item${rowsInserted === 1 ? "" : "s"} flagged in Approvals.`
                : "Run complete.",
            });
            load();
          } catch (e: any) {
            console.warn("[AgentWorkflows] seed failed:", e);
            toast({
              title: "Run finished — couldn't seed Approvals",
              description: e.message ?? "Unknown error",
              variant: "destructive",
            });
          }
        }}
      />

      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              The chain and its configuration will be removed. Past runs remain in your audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && remove(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────── workflow row ───────────────────────────

function WorkflowRow({
  p, busy, onOpen, onToggle, onRun, onDelete,
}: {
  p: Pipeline;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      onClick={onOpen}
      className={cn(
        "grid grid-cols-[1fr_100px_130px_110px_140px] gap-3 px-4 py-3 items-center cursor-pointer transition-colors",
        "hover:bg-muted/40",
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">{p.name}</p>
        {p.description && <p className="text-[11.5px] text-muted-foreground truncate">{p.description}</p>}
      </div>
      <span className="text-[12.5px] text-muted-foreground tabular-nums">
        {p.steps.length} agent{p.steps.length !== 1 ? "s" : ""}
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        {p.last_run_at ? formatDistanceToNow(new Date(p.last_run_at), { addSuffix: true }) : "—"}
      </span>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Switch checked={p.is_active} onCheckedChange={onToggle} disabled={busy} aria-label="Toggle workflow" />
        <span className="text-[11.5px] text-muted-foreground">{p.is_active ? "Active" : "Paused"}</span>
      </div>
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="primary"
          size="xs"
          onClick={onRun}
          disabled={!p.is_active || p.steps.length === 0}
          title={!p.is_active ? "Resume the workflow first" : p.steps.length === 0 ? "Add at least one step" : "Run now"}
        >
          <Play className="h-3 w-3" />Run
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </li>
  );
}

// ─────────────────────────── template card ───────────────────────────

function TemplateCard({
  t, onUse, compact = false,
}: {
  t: Template;
  onUse: () => void;
  compact?: boolean;
}) {
  const agents = t.agentIds.map((id) => AGENT_REGISTRY.find((a) => a.id === id)?.name ?? id);
  return (
    <Card
      onClick={onUse}
      className={cn(
        "p-4 cursor-pointer hover:border-border-strong transition-colors",
        compact ? "border-dashed hover:border-primary/30" : "",
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="h-9 w-9 rounded bg-accent text-primary flex items-center justify-center shrink-0">
          <t.icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground tracking-tight">{t.title}</p>
          <p className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mb-3">
        {agents.map((name, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] text-foreground/80">
            {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
            {name}
          </span>
        ))}
      </div>
      <Button variant="outline" size="xs" className="w-full">
        Use template
      </Button>
    </Card>
  );
}
