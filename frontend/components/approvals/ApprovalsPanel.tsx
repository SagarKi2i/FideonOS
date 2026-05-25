'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Approvals panel — broker-friendly review surface.
//
// Visual design:
//   • Pending items grouped by workflow with collapsible sections
//   • Each item: compact context chips · prominent title · AI rec banner
//     · visual confidence bar · 3 clear actions
//   • Filter chips at the top: All / by workflow / Threshold-only
//   • Action logic unchanged — Approve + Override write training_examples,
//     Reject leaves audit-only trail, side sheet for full JSON.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  CheckCircle2, XCircle, Edit3, Loader2, ClipboardCheck, Brain, Workflow,
  ChevronDown, ChevronRight, ArrowRight, Shield, AlertTriangle,
  Bot, Building2, Clock, Filter, type LucideIcon,
} from "lucide-react";
import { applyHumanDecision } from "@/lib/governance";
import { cn } from "@/lib/utils";

// ─────────────────────────── types ───────────────────────────

interface PipelineStep {
  agent_id: string;
  agent_name: string;
}

interface AgentPipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
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
  decision_record_id?: string | null;
  source_workflow_id?: string | null;
  source_workflow_name?: string | null;
  source_step_index?: number | null;
}

interface PendingItem {
  review: DecisionReview;
  workflowId: string;
  workflowName: string;
  stepIndex: number;
  stepCount: number;
  agentName: string;
}

interface WorkflowGroup {
  id: string;
  name: string;
  items: PendingItem[];
  thresholdCount: number;
}

const DECISION_TYPE_LABELS: Record<string, string> = {
  quote_approval:       "Quote approval",
  claim_decision:       "Claim decision",
  submission_triage:    "Submission triage",
  policy_review:        "Policy review",
  risk_assessment:      "Risk assessment",
  document_validation:  "Document validation",
};

function extractContextLabel(input: Record<string, any> | null | undefined): string | null {
  if (!input) return null;
  const candidates = ["account", "client", "insured", "named_insured", "account_name", "submission_account"];
  for (const k of candidates) {
    const v = (input as any)[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function extractCarrier(input: Record<string, any> | null | undefined): string | null {
  if (!input) return null;
  const c = (input as any).carrier ?? (input as any).carrier_name;
  return typeof c === "string" && c.length > 0 ? c : null;
}

// ─────────────────────────── props ───────────────────────────

interface ApprovalsPanelProps {
  /** When "card", render the wrapping Card. When "embedded", render bare. */
  variant?: "card" | "embedded";
  /** Cap the number of items shown — empty means show all. */
  limit?: number;
  /** Hide the section header (caller is rendering its own). */
  hideHeader?: boolean;
}

// ─────────────────────────── component ───────────────────────────

export default function ApprovalsPanel({
  variant = "card",
  limit,
  hideHeader,
}: ApprovalsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [reviews, setReviews]     = useState<DecisionReview[]>([]);
  const [workflows, setWorkflows] = useState<AgentPipeline[]>([]);
  const [loading, setLoading]     = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<"all" | "threshold">("all");
  const [activeWorkflow, setActiveWorkflow] = useState<string | "all">("all");

  // Per-item drafts
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen]   = useState<Set<string>>(new Set());
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});

  // Group collapse state — workflows expanded by default
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Details side-sheet
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsReview = useMemo(() => reviews.find((r) => r.id === detailsId), [reviews, detailsId]);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      const [wfRes, revRes] = await Promise.all([
        supabase
          .from("agent_pipelines")
          .select("id, name, steps")
          .eq("user_id", user.id),
        supabase
          .from("decision_reviews")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);
      setWorkflows(((wfRes.data ?? []) as any[]).map((p) => ({
        ...p,
        steps: Array.isArray(p.steps) ? p.steps : [],
      })) as AgentPipeline[]);
      setReviews((revRes.data ?? []) as DecisionReview[]);
    } catch (e) {
      console.warn("[ApprovalsPanel] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // ─── attribute each pending review to a workflow/step ───
  const pending = useMemo<PendingItem[]>(() => {
    const agentToWorkflow = new Map<string, AgentPipeline>();
    for (const wf of workflows) {
      for (const step of wf.steps) {
        if (!agentToWorkflow.has(step.agent_id)) agentToWorkflow.set(step.agent_id, wf);
      }
    }

    const items: PendingItem[] = [];
    for (const r of reviews) {
      let wf: AgentPipeline | undefined;
      let stepIdx = -1;

      if (r.source_workflow_id) {
        wf = workflows.find((w) => w.id === r.source_workflow_id);
        stepIdx = typeof r.source_step_index === "number" ? r.source_step_index : -1;
      } else {
        wf = agentToWorkflow.get(r.pod_model_id);
        stepIdx = wf ? wf.steps.findIndex((s) => s.agent_id === r.pod_model_id) : -1;
      }
      if (!wf) continue;

      items.push({
        review: r,
        workflowId: wf.id,
        workflowName: wf.name,
        stepIndex: stepIdx >= 0 ? stepIdx : 0,
        stepCount: wf.steps.length,
        agentName: wf.steps[stepIdx]?.agent_name ?? r.pod_model_name,
      });
    }
    items.sort((a, b) => {
      const ta = a.review.threshold_exceeded ? 1 : 0;
      const tb = b.review.threshold_exceeded ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return +new Date(b.review.created_at) - +new Date(a.review.created_at);
    });

    return items;
  }, [reviews, workflows]);

  // ─── filtered + grouped ───
  const filtered = useMemo(() => {
    let out = pending;
    if (activeFilter === "threshold") out = out.filter((p) => p.review.threshold_exceeded);
    if (activeWorkflow !== "all")     out = out.filter((p) => p.workflowId === activeWorkflow);
    return limit ? out.slice(0, limit) : out;
  }, [pending, activeFilter, activeWorkflow, limit]);

  const grouped = useMemo<WorkflowGroup[]>(() => {
    const map = new Map<string, WorkflowGroup>();
    for (const item of filtered) {
      let g = map.get(item.workflowId);
      if (!g) {
        g = { id: item.workflowId, name: item.workflowName, items: [], thresholdCount: 0 };
        map.set(item.workflowId, g);
      }
      g.items.push(item);
      if (item.review.threshold_exceeded) g.thresholdCount += 1;
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  // workflows that appear in `pending` — for filter chips
  const workflowsInQueue = useMemo(() => {
    const set = new Map<string, { id: string; name: string; count: number }>();
    for (const p of pending) {
      const existing = set.get(p.workflowId);
      if (existing) existing.count += 1;
      else set.set(p.workflowId, { id: p.workflowId, name: p.workflowName, count: 1 });
    }
    return [...set.values()].sort((a, b) => b.count - a.count);
  }, [pending]);

  const totals = useMemo(() => ({
    all: pending.length,
    threshold: pending.filter((p) => p.review.threshold_exceeded).length,
  }), [pending]);

  // ─── action handler ───
  const handleAction = async (
    review: DecisionReview,
    action: "approved" | "overridden" | "rejected",
  ) => {
    setProcessingId(review.id);
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const notes = reviewerNotes[review.id] || null;

      let correctedOutput: Record<string, any> | null = null;
      if (action === "overridden") {
        const raw = (overrideDraft[review.id] || "").trim();
        if (!raw) {
          toast({ title: "Override needs a corrected answer", variant: "destructive" });
          setProcessingId(null);
          return;
        }
        try {
          correctedOutput = JSON.parse(raw);
          if (typeof correctedOutput !== "object" || correctedOutput === null) {
            correctedOutput = { value: correctedOutput };
          }
        } catch {
          correctedOutput = { text: raw };
        }
      }

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

      if (review.decision_record_id) {
        const gov = action === "overridden" ? "approved" : action;
        await applyHumanDecision(
          review.decision_record_id,
          gov as "approved" | "rejected",
          undefined,
          notes ?? undefined,
        );
      }

      if (action === "approved" || action === "overridden") {
        try {
          await supabase
            .from("training_examples" as any)
            .upsert({
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
            } as any, { onConflict: "source_review_id" });
        } catch (e) {
          console.warn("[ApprovalsPanel] training write failed:", e);
        }
      }

      toast({
        title:
          action === "approved"   ? "Approved" :
          action === "overridden" ? "Override saved" :
                                    "Rejected",
        description:
          action === "rejected"
            ? "Recorded in the audit trail."
            : "Recorded and added to training data.",
      });

      setOverrideOpen((p) => { const n = new Set(p); n.delete(review.id); return n; });
      setOverrideDraft((p) => { const { [review.id]: _, ...rest } = p; return rest; });
      void load();
    } catch (e: any) {
      toast({ title: "Couldn't process", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const toggleOverride = (rid: string, prefill: string) => {
    setOverrideOpen((p) => {
      const n = new Set(p);
      if (n.has(rid)) {
        n.delete(rid);
      } else {
        n.add(rid);
        if (!overrideDraft[rid]) {
          setOverrideDraft((d) => ({ ...d, [rid]: prefill }));
        }
      }
      return n;
    });
  };

  const toggleGroup = (id: string) => {
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // ─── render ───
  const body = (
    <>
      {/* Filter strip — only when there's something to filter */}
      {!loading && pending.length > 0 && (
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mr-1">
              <Filter className="h-3 w-3" /> Show
            </div>
            <FilterChip
              active={activeFilter === "all"}
              onClick={() => setActiveFilter("all")}
              label="All"
              count={totals.all}
            />
            <FilterChip
              active={activeFilter === "threshold"}
              onClick={() => setActiveFilter("threshold")}
              label="Threshold exceeded"
              count={totals.threshold}
              tone="warning"
            />
            {workflowsInQueue.length > 1 && (
              <>
                <span className="h-4 w-px bg-border mx-1" aria-hidden />
                <FilterChip
                  active={activeWorkflow === "all"}
                  onClick={() => setActiveWorkflow("all")}
                  label="All pipelines"
                />
                {workflowsInQueue.map((w) => (
                  <FilterChip
                    key={w.id}
                    active={activeWorkflow === w.id}
                    onClick={() => setActiveWorkflow(w.id)}
                    label={w.name}
                    count={w.count}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-16 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : pending.length === 0 ? (
        <EmptyAllClear />
      ) : filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
          Nothing matches the current filter.
          <button
            className="ml-1.5 text-primary font-semibold hover:underline"
            onClick={() => { setActiveFilter("all"); setActiveWorkflow("all"); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {grouped.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            return (
              <section key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full px-5 py-3 flex items-center gap-2.5 hover:bg-muted/25 transition-colors text-left"
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed
                    ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <Workflow className="h-3.5 w-3.5 text-primary shrink-0" />
                  <h3 className="text-[13px] font-semibold text-foreground tracking-tight truncate flex-1">
                    {group.name}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {group.thresholdCount > 0 && (
                      <StatusPill tone="warning" size="sm">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {group.thresholdCount} flagged
                      </StatusPill>
                    )}
                    <StatusPill tone="neutral" size="sm">
                      {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                    </StatusPill>
                  </div>
                </button>

                {!isCollapsed && (
                  <ul className="divide-y divide-border border-t border-border bg-muted/10">
                    {group.items.map((item) => (
                      <ApprovalCard
                        key={item.review.id}
                        item={item}
                        processing={processingId === item.review.id}
                        notes={reviewerNotes[item.review.id] ?? ""}
                        onNotesChange={(v) => setReviewerNotes((p) => ({ ...p, [item.review.id]: v }))}
                        overrideOpen={overrideOpen.has(item.review.id)}
                        overrideValue={overrideDraft[item.review.id] ?? ""}
                        onOverrideChange={(v) => setOverrideDraft((p) => ({ ...p, [item.review.id]: v }))}
                        onToggleOverride={() => toggleOverride(
                          item.review.id,
                          JSON.stringify(item.review.output_data ?? {}, null, 2),
                        )}
                        onAction={handleAction}
                        onOpenDetails={() => setDetailsId(item.review.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );

  const wrapped = variant === "card" ? (
    <Card className="overflow-hidden">
      {!hideHeader && (
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
              <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
              Pending decisions
            </h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {pending.length === 0
                ? "Nothing waiting on you."
                : `${pending.length} item${pending.length !== 1 ? "s" : ""} across ${workflowsInQueue.length} workflow${workflowsInQueue.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {totals.threshold > 0 && (
            <StatusPill tone="warning" size="md">
              <AlertTriangle className="h-3 w-3" />
              {totals.threshold} flagged
            </StatusPill>
          )}
        </div>
      )}
      {body}
    </Card>
  ) : (
    body
  );

  return (
    <>
      {wrapped}

      <Sheet open={detailsId !== null} onOpenChange={(o) => !o && setDetailsId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
          {detailsReview && (
            <>
              <SheetHeader className="px-6 py-4 pr-12 border-b border-border bg-muted/30">
                <SheetTitle className="font-semibold text-[16px] tracking-tight">{detailsReview.title}</SheetTitle>
                <SheetDescription className="text-[12px]">
                  {detailsReview.source_workflow_name ?? detailsReview.pod_model_name}
                  {typeof detailsReview.source_step_index === "number" && (
                    <> · step {detailsReview.source_step_index + 1}</>
                  )}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-4">
                  <DetailField label="Decision type" value={DECISION_TYPE_LABELS[detailsReview.decision_type] ?? detailsReview.decision_type} />
                  <DetailField label="Confidence" value={typeof detailsReview.confidence_score === "number" ? `${Math.round(detailsReview.confidence_score * 100)}%` : "—"} />
                  <DetailField label="Threshold exceeded" value={detailsReview.threshold_exceeded ? "Yes — manual review recommended" : "No"} />
                  {detailsReview.summary && <DetailField label="Summary" value={detailsReview.summary} multiline />}
                  {detailsReview.ai_recommendation && <DetailField label="Fideon's recommendation" value={detailsReview.ai_recommendation} multiline />}
                  <DetailField label="Input" value={JSON.stringify(detailsReview.input_data ?? {}, null, 2)} multiline mono />
                  <DetailField label="AI output" value={JSON.stringify(detailsReview.output_data ?? {}, null, 2)} multiline mono />

                  {detailsReview.decision_record_id && (
                    <Button variant="outline" size="sm" onClick={() => router.push(`/governance/decisions/${detailsReview.decision_record_id}`)}>
                      <Shield className="h-3.5 w-3.5" />Open decision record <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─────────────────────────── filter chip ───────────────────────────

function FilterChip({
  active, onClick, label, count, tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tone?: "warning";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
        active
          ? tone === "warning"
            ? "bg-warning text-warning-foreground"
            : "bg-foreground text-background"
          : "bg-card border border-border text-foreground/80 hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span className="truncate max-w-[180px]">{label}</span>
      {typeof count === "number" && (
        <span className={cn(
          "tabular-nums text-[11px]",
          active ? "opacity-80" : "text-muted-foreground",
        )}>{count}</span>
      )}
    </button>
  );
}

// ─────────────────────────── empty state ───────────────────────────

function EmptyAllClear() {
  return (
    <div className="px-4 py-16 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success mb-3">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <p className="text-[14.5px] font-semibold text-foreground">All clear</p>
      <p className="text-[12.5px] text-muted-foreground mt-1 max-w-sm mx-auto">
        Nothing waiting on you. When one of your workflows flags a decision, it'll show up here.
      </p>
    </div>
  );
}

// ─────────────────────────── approval card ───────────────────────────

function ApprovalCard({
  item, processing,
  overrideOpen, overrideValue, onOverrideChange, onToggleOverride,
  onAction, onOpenDetails,
}: {
  item: PendingItem;
  processing: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  overrideOpen: boolean;
  overrideValue: string;
  onOverrideChange: (v: string) => void;
  onToggleOverride: () => void;
  onAction: (r: DecisionReview, a: "approved" | "overridden" | "rejected") => void;
  onOpenDetails: () => void;
}) {
  const r = item.review;
  const confPct = typeof r.confidence_score === "number" ? Math.round(r.confidence_score * 100) : null;
  const confTone =
    confPct === null     ? "muted" :
    confPct >= 80        ? "success" :
    confPct >= 50        ? "warning" :
                           "danger";

  const account = extractContextLabel(r.input_data);
  const carrier = extractCarrier(r.input_data);

  return (
    <li className={cn(
      "px-5 py-4 transition-colors",
      r.threshold_exceeded ? "border-l-2 border-warning/60" : "border-l-2 border-transparent",
      "hover:bg-card",
    )}>
      {/* Top: title + threshold lozenge */}
      <div className="flex items-start gap-3 mb-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-foreground leading-snug">
            {r.title}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            {DECISION_TYPE_LABELS[r.decision_type] ?? r.decision_type}
            <span className="mx-1.5">·</span>
            <Clock className="h-3 w-3 inline -mt-0.5 mr-1" />
            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
          </p>
        </div>
        {r.threshold_exceeded && (
          <StatusPill tone="warning" size="sm">
            <AlertTriangle className="h-2.5 w-2.5" />
            Threshold exceeded
          </StatusPill>
        )}
      </div>

      {/* Compact context strip */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <ContextChip icon={Bot}      label={item.agentName} subLabel={`Step ${item.stepIndex + 1}/${item.stepCount}`} />
        {account && <ContextChip icon={Building2} label={account} subLabel={carrier ?? undefined} />}
      </div>

      {/* AI recommendation */}
      {r.ai_recommendation && (
        <div className="rounded-md border border-primary/15 bg-accent/30 px-3.5 py-2.5 mb-3">
          <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-primary mb-1 inline-flex items-center gap-1.5">
            <Brain className="h-3 w-3" />Fideon's recommendation
          </p>
          <p className="text-[13px] text-foreground/90 leading-relaxed">{r.ai_recommendation}</p>
        </div>
      )}

      {/* Field-level extractions when structured output is present */}
      <ExtractedFieldsPreview output={r.output_data} />

      {/* Confidence bar */}
      {confPct !== null && (
        <div className="mb-3.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              Agent confidence
            </span>
            <span className={cn(
              "text-[12.5px] font-bold tabular-nums",
              confTone === "success" && "text-success",
              confTone === "warning" && "text-warning-foreground",
              confTone === "danger"  && "text-destructive",
              confTone === "muted"   && "text-muted-foreground",
            )}>{confPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                confTone === "success" && "bg-success",
                confTone === "warning" && "bg-warning",
                confTone === "danger"  && "bg-destructive",
                confTone === "muted"   && "bg-muted-foreground/40",
              )}
              style={{ width: `${Math.max(2, Math.min(100, confPct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Override panel */}
      {overrideOpen && (
        <div className="rounded-md border border-primary/30 bg-accent/20 p-3 mb-3 space-y-2">
          <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-primary inline-flex items-center gap-1.5">
            <Edit3 className="h-3 w-3" />Your corrected answer
          </p>
          <p className="text-[11.5px] text-muted-foreground leading-snug">
            Replace the AI's output with what it should have been. Fideon captures this as a training example.
          </p>
          <Textarea
            value={overrideValue}
            onChange={(e) => onOverrideChange(e.target.value)}
            rows={4}
            className="font-mono text-[12px] bg-card"
            placeholder='{"corrected": "value"}'
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onAction(r, "approved")}
          disabled={processing}
        >
          {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Approve
        </Button>
        {!overrideOpen ? (
          <Button variant="outline" size="sm" onClick={onToggleOverride} disabled={processing}>
            <Edit3 className="h-3.5 w-3.5" />Override
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onAction(r, "overridden")} disabled={processing}>
            <Edit3 className="h-3.5 w-3.5" />Save override
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAction(r, "rejected")}
          disabled={processing}
          className="text-destructive hover:text-destructive"
        >
          <XCircle className="h-3.5 w-3.5" />Reject
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onOpenDetails} className="text-muted-foreground hover:text-foreground">
          View details <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

// ─────────────────────────── extracted fields preview ───────────────────────────
//
// When the agent emitted structured fields (extracted_fields, fnol_fields,
// changes, quotes, etc.), render them inline so the broker can see at a
// glance WHAT they're being asked to verify. Low-confidence fields are
// flagged with a warning rail. The override JSON editor stays as the
// edit surface — this is a read-only preview.

interface FieldLike {
  key?: string;
  label?: string;
  value?: any;
  confidence?: number;
  needs_review?: boolean;
  classification?: string;
  source?: string;
}

function ExtractedFieldsPreview({ output }: { output: Record<string, any> | null | undefined }) {
  if (!output || typeof output !== "object") return null;

  // Look for any of the known field-array keys our templates emit.
  const KNOWN_KEYS = ["extracted_fields", "fnol_fields", "changes", "quotes", "fields"];
  let arr: FieldLike[] | null = null;
  let arrKey: string | null = null;
  for (const k of KNOWN_KEYS) {
    if (Array.isArray(output[k]) && output[k].length > 0) {
      arr = output[k] as FieldLike[];
      arrKey = k;
      break;
    }
  }
  if (!arr || !arrKey) return null;

  const flagged = arr.filter((f) => f.needs_review).length;

  return (
    <div className="rounded-md border border-border bg-muted/20 mb-3 overflow-hidden">
      <div className="px-3.5 py-2 border-b border-border flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          {labelForArrKey(arrKey)} · {arr.length}
        </span>
        {flagged > 0 && (
          <span className="text-[10.5px] font-semibold text-warning-foreground">
            {flagged} need{flagged !== 1 ? "" : "s"} your review
          </span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {arr.slice(0, 8).map((f, i) => (
          <FieldRow key={f.key ?? i} field={f} />
        ))}
      </ul>
      {arr.length > 8 && (
        <div className="px-3.5 py-1.5 text-[11px] text-muted-foreground border-t border-border">
          + {arr.length - 8} more field{arr.length - 8 !== 1 ? "s" : ""} — see View details
        </div>
      )}
    </div>
  );
}

function labelForArrKey(k: string): string {
  switch (k) {
    case "extracted_fields": return "Extracted fields";
    case "fnol_fields":      return "FNOL fields";
    case "changes":          return "Policy changes detected";
    case "quotes":           return "Carrier quotes returned";
    default:                  return "Fields";
  }
}

function FieldRow({ field }: { field: FieldLike }) {
  const conf = typeof field.confidence === "number" ? field.confidence : null;
  const confPct = conf !== null ? Math.round(conf * 100) : null;
  const confCls =
    conf === null      ? "text-muted-foreground" :
    conf >= 0.85       ? "text-success" :
    conf >= 0.70       ? "text-foreground" :
                          "text-warning-foreground";
  const needsReview = field.needs_review === true;

  return (
    <li className={cn(
      "grid grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-2",
      needsReview && "bg-warning/[0.06] border-l-2 border-warning/50",
    )}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] font-semibold text-foreground">{field.label ?? field.key}</span>
          {field.classification && (
            <span className={cn(
              "text-[9.5px] font-medium px-1.5 py-0 rounded border",
              field.classification === "material" ? "border-warning/40 bg-warning/10 text-warning-foreground" :
                                                     "border-border bg-muted/40 text-muted-foreground",
            )}>{field.classification}</span>
          )}
        </div>
        <p className="text-[12px] text-foreground/90 mt-0.5 truncate">
          {formatValue(field.value)}
        </p>
        {field.source && (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate italic">{field.source}</p>
        )}
      </div>
      {confPct !== null && (
        <span className={cn("text-[11px] font-semibold tabular-nums shrink-0", confCls)}>
          {confPct}%
        </span>
      )}
    </li>
  );
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return JSON.stringify(v);
}

// ─────────────────────────── context chip ───────────────────────────

function ContextChip({
  icon: Icon, label, subLabel,
}: {
  icon: LucideIcon;
  label: string;
  subLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/60 text-[11.5px]">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="font-semibold text-foreground truncate max-w-[200px]">{label}</span>
      {subLabel && (
        <span className="text-muted-foreground truncate max-w-[140px]">· {subLabel}</span>
      )}
    </span>
  );
}

// ─────────────────────────── detail field ───────────────────────────

function DetailField({ label, value, multiline, mono }: { label: string; value: string; multiline?: boolean; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
      {multiline ? (
        <pre className={cn(
          "text-[12.5px] text-foreground/90 whitespace-pre-wrap leading-relaxed bg-muted/30 rounded border border-border p-3 max-h-[260px] overflow-auto",
          mono && "font-mono text-[11.5px]",
        )}>{value}</pre>
      ) : (
        <p className="text-[12.5px] text-foreground/90">{value}</p>
      )}
    </div>
  );
}
