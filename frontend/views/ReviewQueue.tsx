'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Decision Review Queue — workflow-scoped feedback loop.
//
// Structural premise: items only appear here when they came from an
// agent workflow the broker built. The queue is organised as:
//
//   Agent workflow  →  step (agent)  →  flagged items
//
// Per item, the reviewer has three actions:
//   • Approve   — AI was right; recorded as a positive training example.
//   • Override  — AI was wrong; reviewer supplies the correct answer.
//                 Recorded as a high-quality training example with the
//                 corrected output as ground truth.
//   • Reject    — output unusable; recorded but NOT fed into training.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Progress } from "@/components/ui/progress";

import {
  CheckCircle2, XCircle, ClipboardCheck, Loader2, Brain, AlertTriangle,
  ChevronDown, ChevronRight, Workflow, Bot, Shield, Activity, ArrowRight,
  Plus, Edit3, GitBranch,
} from "lucide-react";

import { applyHumanDecision } from "@/lib/governance";
import { seedReviewQueueDemo } from "@/lib/reviewQueueDemoSeed";
import { cn } from "@/lib/utils";

// ─────────────────────────── types ───────────────────────────

interface PipelineStep {
  id: string;
  agent_id: string;
  agent_name: string;
}

interface AgentPipeline {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

interface DecisionReview {
  id: string;
  user_id: string;
  pod_model_id: string;
  pod_model_name: string;
  domain: string;
  decision_type: string;
  title: string;
  summary: string | null;
  ai_recommendation: string | null;
  confidence_score: number | null;
  threshold_exceeded: boolean;
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  status: string;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  decision_record_id?: string | null;
  source_workflow_id?: string | null;
  source_workflow_name?: string | null;
  source_workflow_run_id?: string | null;
  source_step_index?: number | null;
}

interface WorkflowBucket {
  workflow: AgentPipeline;
  // Group reviews by step (uses step_index from the review, falling back to
  // matching pod_model_id to the workflow's step list).
  stepBuckets: Array<{
    stepIndex: number;
    agentName: string;
    pendingCount: number;
    totalCount: number;
    reviews: DecisionReview[];
  }>;
  pendingCount: number;
  totalCount: number;
  latestAt: string | null;
}

type FilterKey = "pending" | "approved" | "overridden" | "rejected" | "all";

// ─────────────────────────── page ───────────────────────────

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral" | "primary"> = {
  pending:    "warning",
  approved:   "success",
  overridden: "primary",
  rejected:   "danger",
};
const STATUS_LABEL: Record<string, string> = {
  pending:    "Pending",
  approved:   "Approved",
  overridden: "Overridden",
  rejected:   "Rejected",
};

const DECISION_TYPE_LABELS: Record<string, string> = {
  quote_approval:       "Quote approval",
  claim_decision:       "Claim decision",
  submission_triage:    "Submission triage",
  policy_review:        "Policy review",
  risk_assessment:      "Risk assessment",
  document_validation:  "Document validation",
};

export default function ReviewQueue() {
  const { toast }    = useToast();
  const router = useRouter();

  const [workflows, setWorkflows]   = useState<AgentPipeline[]>([]);
  const [reviews, setReviews]       = useState<DecisionReview[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterKey>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedWorkflows, setCollapsedWorkflows] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Per-item draft state for overrides + notes.
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen]   = useState<Set<string>>(new Set());
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});

  // Demo seeding
  const [seeding, setSeeding] = useState(false);
  const handleSeed = async () => {
    setSeeding(true);
    try {
      const { workflowsCreated, reviewsCreated, migrationApplied } = await seedReviewQueueDemo();
      toast({
        title: "Demo data loaded",
        description: migrationApplied
          ? `${workflowsCreated} workflows · ${reviewsCreated} review items.`
          : `${workflowsCreated} workflows · ${reviewsCreated} review items. Workflow-source columns not yet migrated — items will group by agent until the latest migration runs.`,
      });
      void load();
    } catch (e: any) {
      toast({ title: "Couldn't seed demo data", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }

      const [wfRes, revRes] = await Promise.all([
        supabase
          .from("agent_pipelines")
          .select("id, name, description, steps, is_active, last_run_at, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("decision_reviews")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      const wfs = ((wfRes.data ?? []) as any[]).map((p) => ({
        ...p,
        steps: Array.isArray(p.steps) ? p.steps : [],
      })) as AgentPipeline[];

      setWorkflows(wfs);
      setReviews((revRes.data ?? []) as unknown as DecisionReview[]);
    } catch (e) {
      console.error("[ReviewQueue] load failed:", e);
      toast({ title: "Couldn't load review queue", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ─── core action: approve / override / reject ───
  // Approve + Override → write a training_examples row.
  // Reject → status update only; no training signal.
  const handleAction = async (
    review: DecisionReview,
    action: "approved" | "overridden" | "rejected",
  ) => {
    setProcessingId(review.id);
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const notes = reviewerNotes[review.id] || null;

      // Override requires a corrected output (free-text JSON or plain text).
      let correctedOutput: Record<string, any> | null = null;
      if (action === "overridden") {
        const raw = (overrideDraft[review.id] || "").trim();
        if (!raw) {
          toast({ title: "Provide the corrected answer", description: "Override needs a replacement output before we can record it.", variant: "destructive" });
          setProcessingId(null);
          return;
        }
        // Attempt JSON parse — fall back to plain text wrapper so the user
        // doesn't have to write valid JSON to override.
        try {
          correctedOutput = JSON.parse(raw);
          if (typeof correctedOutput !== "object" || correctedOutput === null) {
            correctedOutput = { value: correctedOutput };
          }
        } catch {
          correctedOutput = { text: raw };
        }
      }

      // 1. Status update on the review.
      const { error: updErr } = await supabase
        .from("decision_reviews")
        .update({
          status: action,
          reviewer_id: user.id,
          reviewer_notes: notes,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", review.id);
      if (updErr) throw updErr;

      // 2. Cascade into immutable decision-record (governance) — collapse
      //    "overridden" to "approved" for the legacy two-value path; the
      //    corrected output is captured separately in training_examples.
      if (review.decision_record_id) {
        const governanceAction = action === "overridden" ? "approved" : action;
        await applyHumanDecision(
          review.decision_record_id,
          governanceAction as "approved" | "rejected",
          undefined,
          notes ?? undefined,
        );
      }

      // 3. Training feedback — Approve + Override only. Reject leaves no
      //    training signal so the model doesn't get trained on garbage.
      if (action === "approved" || action === "overridden") {
        try {
          await supabase
            .from("training_examples" as any)
            .upsert(
              {
                user_id: user.id,
                source_review_id: review.id,
                agent_id: review.pod_model_id,
                agent_name: review.pod_model_name,
                source_workflow_id: review.source_workflow_id ?? null,
                source_workflow_name: review.source_workflow_name ?? null,
                source_step_index: review.source_step_index ?? null,
                input_data: review.input_data ?? {},
                output_data: review.output_data ?? {},
                corrected_output_data: correctedOutput,
                label: action,
                reviewer_notes: notes,
                agent_confidence: review.confidence_score ?? null,
              } as any,
              { onConflict: "source_review_id" },
            );
        } catch (e) {
          console.warn("[ReviewQueue] training_example write failed:", e);
        }
      }

      toast({
        title:
          action === "approved"   ? "Approved" :
          action === "overridden" ? "Overridden — correction captured" :
                                    "Rejected",
        description:
          action === "rejected"
            ? `"${review.title}" recorded in the audit trail.`
            : `"${review.title}" recorded in the audit trail and added to training data.`,
      });

      // Cleanup local UI draft state.
      setExpandedId(null);
      setOverrideOpen((p) => { const n = new Set(p); n.delete(review.id); return n; });
      setOverrideDraft((p) => { const { [review.id]: _, ...rest } = p; return rest; });
      void load();
    } catch (e) {
      console.error("[ReviewQueue] action failed:", e);
      toast({ title: "Couldn't process review", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  // ─── derived: workflow buckets ───
  //
  // Attribute each review to a workflow using two signals (in order):
  //   1. Explicit source_workflow_id stamped at run-time (preferred).
  //   2. Fallback by agent identity — if the review's pod_model_id matches
  //      a step in a workflow, we assume it came from that workflow. This
  //      keeps demo data and pre-migration reviews visible.
  //
  // Once a review is attributed to a workflow, it doesn't appear in any
  // other workflow's bucket (so dedup is safe when an agent appears in
  // multiple workflows).
  const workflowBuckets = useMemo<WorkflowBucket[]>(() => {
    const filtered = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);

    // Build a fallback lookup: agent_id → first workflow that contains it.
    const agentToWorkflow = new Map<string, AgentPipeline>();
    for (const wf of workflows) {
      for (const step of wf.steps) {
        if (!agentToWorkflow.has(step.agent_id)) {
          agentToWorkflow.set(step.agent_id, wf);
        }
      }
    }

    // Bucket each review under exactly one workflow.
    const reviewsByWorkflow = new Map<string, Array<DecisionReview & { _stepIdx: number | null }>>();
    for (const r of filtered) {
      let wfId: string | null = null;
      let stepIdx: number | null = null;

      if (r.source_workflow_id) {
        wfId = r.source_workflow_id;
        stepIdx = typeof r.source_step_index === "number" ? r.source_step_index : null;
      } else {
        // Fallback path: match agent to first workflow containing it.
        const matched = agentToWorkflow.get(r.pod_model_id);
        if (matched) {
          wfId = matched.id;
          const idx = matched.steps.findIndex((s) => s.agent_id === r.pod_model_id);
          stepIdx = idx >= 0 ? idx : null;
        }
      }

      if (!wfId) continue; // review with no workflow attribution drops out
      const list = reviewsByWorkflow.get(wfId) ?? [];
      list.push({ ...r, _stepIdx: stepIdx });
      reviewsByWorkflow.set(wfId, list);
    }

    return workflows.map<WorkflowBucket>((wf) => {
      const reviewsForWf = reviewsByWorkflow.get(wf.id) ?? [];

      // Every step gets a bucket, even when empty, so the full pipeline
      // shape is always visible to the reviewer.
      const stepBuckets = wf.steps.map((step, idx) => {
        const stepReviews = reviewsForWf.filter((r) => {
          if (r._stepIdx !== null) return r._stepIdx === idx;
          return r.pod_model_id === step.agent_id;
        });
        const pending = stepReviews.filter((r) => r.status === "pending").length;
        return {
          stepIndex: idx,
          agentName: step.agent_name,
          pendingCount: pending,
          totalCount: stepReviews.length,
          reviews: stepReviews,
        };
      });

      // Catch any reviews attributed to the workflow but with a step index
      // that doesn't match (e.g. step deleted after run) — surface them
      // under an "Other steps" bucket so they're not invisible.
      const matched = new Set(stepBuckets.flatMap((b) => b.reviews.map((r) => r.id)));
      const orphans = reviewsForWf.filter((r) => !matched.has(r.id));
      if (orphans.length > 0) {
        stepBuckets.push({
          stepIndex: -1,
          agentName: "Other steps",
          pendingCount: orphans.filter((r) => r.status === "pending").length,
          totalCount: orphans.length,
          reviews: orphans,
        });
      }

      const pendingCount = reviewsForWf.filter((r) => r.status === "pending").length;
      const latestAt = reviewsForWf.length === 0
        ? null
        : reviewsForWf.reduce((acc, r) => (+new Date(r.created_at) > +new Date(acc) ? r.created_at : acc), reviewsForWf[0].created_at);

      return {
        workflow: wf,
        stepBuckets,
        pendingCount,
        totalCount: reviewsForWf.length,
        latestAt,
      };
    })
    .filter((b) => b.totalCount > 0)
    .sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      const at = a.latestAt ? +new Date(a.latestAt) : 0;
      const bt = b.latestAt ? +new Date(b.latestAt) : 0;
      return bt - at;
    });
  }, [workflows, reviews, filter]);

  // ─── KPIs (across reviews attributable to any workflow) ───
  // Same attribution rule as the bucket logic: explicit source_workflow_id
  // OR agent_id matching a step in any workflow.
  const kpis = useMemo(() => {
    const validAgents = new Set<string>();
    for (const wf of workflows) for (const step of wf.steps) validAgents.add(step.agent_id);

    const linked = reviews.filter((r) => !!r.source_workflow_id || validAgents.has(r.pod_model_id));
    const pending    = linked.filter((r) => r.status === "pending").length;
    const approved   = linked.filter((r) => r.status === "approved").length;
    const overridden = linked.filter((r) => r.status === "overridden").length;
    const rejected   = linked.filter((r) => r.status === "rejected").length;
    const trainingExamples = approved + overridden;
    return { pending, approved, overridden, rejected, trainingExamples };
  }, [reviews, workflows]);

  const toggleWorkflow = (key: string) => {
    setCollapsedWorkflows((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const toggleOverride = (rid: string, prefill?: string) => {
    setOverrideOpen((p) => {
      const n = new Set(p);
      if (n.has(rid)) {
        n.delete(rid);
      } else {
        n.add(rid);
        if (prefill !== undefined && !overrideDraft[rid]) {
          setOverrideDraft((d) => ({ ...d, [rid]: prefill }));
        }
      }
      return n;
    });
  };

  // ─────────── render ───────────

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Trust · Model Risk Management"
        title="Decision review queue"
        description="Items flagged by the agents inside your workflows. Approve, override, or reject — your decisions train the model and land in the audit trail."
        icon={ClipboardCheck}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Pending"            value={kpis.pending}           icon={ClipboardCheck} tone={kpis.pending > 0 ? "warning" : "success"} hint={kpis.pending > 0 ? "awaiting you" : "all clear"} />
        <KpiCard label="Approved"           value={kpis.approved}          icon={CheckCircle2}   tone="success"  hint="AI was right" />
        <KpiCard label="Overridden"         value={kpis.overridden}        icon={Edit3}          tone="primary"  hint="you supplied the answer" />
        <KpiCard label="Training examples"  value={kpis.trainingExamples}  icon={Brain}          tone="primary"  hint="approved + overridden" />
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="overridden">Overridden</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No workflows yet"
          description="The review queue only shows items produced by agent workflows you've built. Create a workflow, or load demo data to see how it looks populated."
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Load demo data
              </Button>
              <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows/new")}>
                <Plus className="h-3.5 w-3.5" />Build a workflow
              </Button>
            </div>
          }
        />
      ) : workflowBuckets.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={filter === "pending" ? "Nothing pending" : "Nothing to show"}
          description={
            filter === "pending"
              ? "Your workflows haven't flagged anything for review. Load demo data to populate realistic items, or switch filters to see other statuses."
              : "Switch filters to see other statuses."
          }
          action={
            filter === "pending" ? (
              <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Load demo data
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {workflowBuckets.map((b) => (
            <WorkflowBlock
              key={b.workflow.id}
              bucket={b}
              collapsed={collapsedWorkflows.has(b.workflow.id)}
              onToggle={() => toggleWorkflow(b.workflow.id)}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              processingId={processingId}
              reviewerNotes={reviewerNotes}
              setReviewerNotes={setReviewerNotes}
              overrideOpen={overrideOpen}
              overrideDraft={overrideDraft}
              setOverrideDraft={setOverrideDraft}
              toggleOverride={toggleOverride}
              onAction={handleAction}
              navigate={router}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── workflow block ───────────────────────────

function WorkflowBlock({
  bucket, collapsed, onToggle,
  expandedId, setExpandedId,
  processingId, reviewerNotes, setReviewerNotes,
  overrideOpen, overrideDraft, setOverrideDraft, toggleOverride,
  onAction, navigate,
}: {
  bucket: WorkflowBucket;
  collapsed: boolean;
  onToggle: () => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  processingId: string | null;
  reviewerNotes: Record<string, string>;
  setReviewerNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  overrideOpen: Set<string>;
  overrideDraft: Record<string, string>;
  setOverrideDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toggleOverride: (rid: string, prefill?: string) => void;
  onAction: (r: DecisionReview, a: "approved" | "overridden" | "rejected") => void;
  navigate: ReturnType<typeof useRouter>;
}) {
  const wf = bucket.workflow;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <Chevron className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="h-8 w-8 rounded bg-accent text-primary flex items-center justify-center shrink-0">
          <Workflow className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground truncate">{wf.name}</p>
          <p className="text-[11.5px] text-muted-foreground truncate">
            {wf.steps.length} agent{wf.steps.length !== 1 ? "s" : ""} chained ·
            {bucket.latestAt ? <> latest {formatDistanceToNow(new Date(bucket.latestAt), { addSuffix: true })}</> : <> no runs yet</>}
          </p>
        </div>
        {bucket.pendingCount > 0 && (
          <StatusPill tone="warning" size="md">
            {bucket.pendingCount} pending
          </StatusPill>
        )}
        {bucket.pendingCount === 0 && bucket.totalCount > 0 && (
          <StatusPill tone="success" size="md">All resolved</StatusPill>
        )}
        <span className="text-[11.5px] text-muted-foreground tabular-nums shrink-0">
          {bucket.totalCount} item{bucket.totalCount !== 1 ? "s" : ""}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-border bg-muted/15">
          {bucket.stepBuckets.map((step) => (
            <StepBucket
              key={`${wf.id}-step-${step.stepIndex}`}
              step={step}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              processingId={processingId}
              reviewerNotes={reviewerNotes}
              setReviewerNotes={setReviewerNotes}
              overrideOpen={overrideOpen}
              overrideDraft={overrideDraft}
              setOverrideDraft={setOverrideDraft}
              toggleOverride={toggleOverride}
              onAction={onAction}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── step bucket ───────────────────────────

function StepBucket({
  step,
  expandedId, setExpandedId,
  processingId, reviewerNotes, setReviewerNotes,
  overrideOpen, overrideDraft, setOverrideDraft, toggleOverride,
  onAction, navigate,
}: {
  step: WorkflowBucket["stepBuckets"][number];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  processingId: string | null;
  reviewerNotes: Record<string, string>;
  setReviewerNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  overrideOpen: Set<string>;
  overrideDraft: Record<string, string>;
  setOverrideDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toggleOverride: (rid: string, prefill?: string) => void;
  onAction: (r: DecisionReview, a: "approved" | "overridden" | "rejected") => void;
  navigate: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-4 py-2 bg-muted/20 flex items-center gap-2.5">
        {step.stepIndex >= 0 && (
          <div className="h-5 w-5 rounded bg-foreground/10 text-foreground/80 flex items-center justify-center text-[10.5px] font-bold tabular-nums shrink-0">
            {step.stepIndex + 1}
          </div>
        )}
        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-[12.5px] font-semibold text-foreground truncate flex-1">{step.agentName}</p>
        {step.reviews.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">no items yet</span>
        ) : step.pendingCount > 0 ? (
          <StatusPill tone="warning" size="sm">{step.pendingCount} pending</StatusPill>
        ) : (
          <StatusPill tone="success" size="sm">Resolved</StatusPill>
        )}
        {step.reviews.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{step.totalCount}</span>
        )}
      </div>
      {step.reviews.length > 0 && (
        <ul className="divide-y divide-border bg-card">
          {step.reviews.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              expanded={expandedId === r.id}
              onExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
              processing={processingId === r.id}
              notes={reviewerNotes[r.id] ?? ""}
              onNotesChange={(v) => setReviewerNotes((p) => ({ ...p, [r.id]: v }))}
              overrideOpen={overrideOpen.has(r.id)}
              overrideValue={overrideDraft[r.id] ?? ""}
              onOverrideChange={(v) => setOverrideDraft((p) => ({ ...p, [r.id]: v }))}
              onToggleOverride={() => toggleOverride(r.id, JSON.stringify(r.output_data ?? {}, null, 2))}
              onAction={onAction}
              navigate={navigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── review row ───────────────────────────

function ReviewRow({
  review, expanded, onExpand,
  processing,
  notes, onNotesChange,
  overrideOpen, overrideValue, onOverrideChange, onToggleOverride,
  onAction, navigate,
}: {
  review: DecisionReview;
  expanded: boolean;
  onExpand: () => void;
  processing: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  overrideOpen: boolean;
  overrideValue: string;
  onOverrideChange: (v: string) => void;
  onToggleOverride: () => void;
  onAction: (r: DecisionReview, a: "approved" | "overridden" | "rejected") => void;
  navigate: ReturnType<typeof useRouter>;
}) {
  const score = review.confidence_score;
  const scorePct = score === null || score === undefined ? null : Math.round(score * 100);
  const scoreTone = scorePct === null ? "neutral"
    : scorePct >= 80 ? "success"
    : scorePct >= 50 ? "warning"
    : "danger";
  const statusTone = STATUS_TONE[review.status] ?? "neutral";

  return (
    <li>
      <button
        type="button"
        onClick={onExpand}
        className={cn(
          "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors",
          expanded && "bg-accent/30",
        )}
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-foreground truncate">{review.title}</p>
            {review.threshold_exceeded && (
              <StatusPill tone="warning" size="sm">
                <AlertTriangle className="h-2.5 w-2.5" />
                Threshold
              </StatusPill>
            )}
            <StatusPill tone="neutral" size="sm">
              {DECISION_TYPE_LABELS[review.decision_type] ?? review.decision_type}
            </StatusPill>
          </div>
          {review.summary && (
            <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{review.summary}</p>
          )}
          {scorePct !== null && (
            <div className="flex items-center gap-2 mt-1.5">
              <Progress value={scorePct} className="h-1 w-24" />
              <span className={cn(
                "text-[11px] font-bold tabular-nums",
                scoreTone === "success" && "text-success",
                scoreTone === "warning" && "text-warning-foreground/85",
                scoreTone === "danger"  && "text-destructive",
                scoreTone === "neutral" && "text-muted-foreground",
              )}>
                {scorePct}%
              </span>
              <span className="text-[11px] text-muted-foreground">confidence</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill tone={statusTone} size="sm">
            {STATUS_LABEL[review.status] ?? review.status}
          </StatusPill>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/15 px-4 py-3.5 space-y-3">
          {review.summary && (
            <div>
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Summary</p>
              <p className="text-[13px] text-foreground/90 leading-relaxed">{review.summary}</p>
            </div>
          )}

          {review.ai_recommendation && (
            <div className="rounded border border-primary/15 bg-accent/40 px-3 py-2.5">
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-primary mb-1 inline-flex items-center gap-1.5">
                <Brain className="h-3 w-3" />Fideon recommends
              </p>
              <p className="text-[13px] text-foreground/90 leading-relaxed">{review.ai_recommendation}</p>
            </div>
          )}

          {(review.input_data && Object.keys(review.input_data).length > 0) && (
            <details>
              <summary className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none">
                Input data
              </summary>
              <pre className="mt-2 text-[11px] font-mono bg-muted/40 border border-border rounded p-2.5 max-h-[160px] overflow-auto">
                {JSON.stringify(review.input_data, null, 2)}
              </pre>
            </details>
          )}

          {(review.output_data && Object.keys(review.output_data).length > 0) && (
            <details open={overrideOpen}>
              <summary className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none">
                AI output
              </summary>
              <pre className="mt-2 text-[11px] font-mono bg-muted/40 border border-border rounded p-2.5 max-h-[160px] overflow-auto">
                {JSON.stringify(review.output_data, null, 2)}
              </pre>
            </details>
          )}

          {review.reviewer_notes && review.status !== "pending" && (
            <div>
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Reviewer notes</p>
              <p className="text-[13px] text-foreground/90 leading-relaxed">{review.reviewer_notes}</p>
            </div>
          )}

          {/* Override panel — appears inline when toggled open */}
          {overrideOpen && review.status === "pending" && (
            <div className="rounded border border-primary/30 bg-accent/30 p-3 space-y-2">
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-primary inline-flex items-center gap-1.5">
                <Edit3 className="h-3 w-3" />Corrected output
              </p>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                Replace the AI's answer with the right one. JSON or plain text — Fideon captures the correction as a high-quality training example.
              </p>
              <Textarea
                value={overrideValue}
                onChange={(e) => onOverrideChange(e.target.value)}
                rows={5}
                className="font-mono text-[12px] bg-card"
                placeholder='{"corrected": "value"}'
              />
            </div>
          )}

          {review.status === "pending" && (
            <div className="pt-1 space-y-2">
              <Textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Reviewer notes (optional — recorded with the decision)"
                rows={2}
                className="text-[13px]"
              />
              <div className="flex items-center justify-end gap-2 flex-wrap">
                {review.decision_record_id && (
                  <Button variant="ghost" size="sm" onClick={() => navigate.push(`/governance/decisions/${review.decision_record_id}`)}>
                    <Shield className="h-3.5 w-3.5" />Decision record <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAction(review, "rejected")}
                  disabled={processing}
                  className="text-destructive hover:text-destructive"
                >
                  {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Reject
                </Button>
                {!overrideOpen ? (
                  <Button variant="outline" size="sm" onClick={onToggleOverride} disabled={processing}>
                    <Edit3 className="h-3.5 w-3.5" />Override
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => onAction(review, "overridden")} disabled={processing}>
                    {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit3 className="h-3.5 w-3.5" />}
                    Save override
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={() => onAction(review, "approved")} disabled={processing}>
                  {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
