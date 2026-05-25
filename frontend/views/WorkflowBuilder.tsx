'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter, usePathname, useParams } from 'next/navigation';
// Workflow Builder — two-pane page for assembling agent chains.
//
// Left pane:  the chain you're building. Numbered, reorderable, each step
//             expands inline to show its config form.
// Right pane: the agent catalog. Search + grouped-by-category. Tap an agent
//             to append it to the chain.
//
// Routes:
//   /agent-workflows/new   → fresh builder
//   /agent-workflows/:id   → load an existing pipeline

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, ChevronRight,
  Save, Loader2, Search, GripVertical, Link2, Workflow,
  GitBranch, ArrowDown, Sparkles, Wand2,
} from "lucide-react";

import AgentConfigForm, { AGENT_REGISTRY, type AgentConfig } from "@/components/pipeline/AgentConfigForm";
import { cn } from "@/lib/utils";

// ─────────────────────────── catalog ───────────────────────────
//
// The right-pane catalog shows everything that can be chained into a
// workflow:
//   • Workflow agents — AGENT_REGISTRY (the building blocks the runtime
//     supports, grouped by their declared category: Broker, Carrier, etc.)
//   • Custom pods — the user's custom_agents (engineered by Fideon).
//
// This is intentionally NOT filtered by activated_models. Activation gates
// catalog pods for individual use; workflows can compose any supported
// agent block plus the user's custom pods.

interface CatalogItem {
  id: string;             // agent_id used in the step + AgentConfigForm
  name: string;
  category: string;       // free-form (matches AGENT_REGISTRY.category) or "Custom pods"
  description: string;
}


// ─────────────────────────── types ───────────────────────────

interface PipelineStep {
  id: string;
  agent_id: string;
  agent_name: string;
  config: AgentConfig;
  pass_output: boolean;
}

interface PipelineRow {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
}

// ─────────────────────────── component ───────────────────────────

export default function WorkflowBuilder() {
  const _p = useParams(); const id = Array.isArray(_p?.id) ? _p.id[0] : _p?.id;
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const isNew = !id || id === "new";

  const tpl = null as { name?: string; description?: string; steps?: PipelineStep[] } | null;

  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [name, setName]         = useState(tpl?.name ?? "");
  const [description, setDesc]  = useState(tpl?.description ?? "");
  const [steps, setSteps]       = useState<PipelineStep[]>(tpl?.steps ?? []);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [query, setQuery]       = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Dynamic catalog — activated marketplace pods + user's custom pods.
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => { void loadCatalog(); }, []);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const items: CatalogItem[] = [];

      // 1) Workflow agents — every block the workflow runtime supports.
      for (const a of AGENT_REGISTRY) {
        items.push({
          id: a.id,
          name: a.name,
          category: a.category,
          description: a.description,
        });
      }

      // 2) Custom pods — engineered for this user.
      const user = await getCurrentUser();
      if (user) {
        const { data: custRes } = await supabase
          .from("custom_agents" as any)
          .select("id, name, description")
          .eq("user_id", user.id)
          .eq("status", "live")
          .eq("is_active", true);
        for (const c of (custRes ?? []) as unknown as Array<{ id: string; name: string; description: string | null }>) {
          items.push({
            id: `custom-${c.id}`,
            name: c.name,
            category: "Custom pods",
            description: c.description ?? "Engineered by Fideon — custom workflow pod.",
          });
        }
      }

      setCatalog(items);
    } catch (e) {
      console.warn("[WorkflowBuilder] catalog load failed:", e);
    } finally {
      setCatalogLoading(false);
    }
  };

  // Lookup helper for StepCard — resolves an agent_id back to its display
  // metadata. Falls back to the static registry, then to a generic stub
  // for agents that have been removed (e.g. a custom pod was deleted).
  const lookupStep = (agentId: string): CatalogItem => {
    const fromCatalog = catalog.find((c) => c.id === agentId);
    if (fromCatalog) return fromCatalog;
    const fromRegistry = AGENT_REGISTRY.find((a) => a.id === agentId);
    if (fromRegistry) {
      return {
        id: agentId,
        name: fromRegistry.name,
        category: fromRegistry.category,
        description: fromRegistry.description,
      };
    }
    return {
      id: agentId,
      name: agentId.replace(/-/g, " "),
      category: "Unknown",
      description: "This agent is no longer available in your workspace.",
    };
  };

  // Load existing pipeline when editing
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("agent_pipelines")
          .select("id, name, description, steps")
          .eq("id", id!)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          toast({ title: "Workflow not found", variant: "destructive" });
          router.push("/agent-workflows");
          return;
        }
        const row = data as unknown as PipelineRow;
        setName(row.name);
        setDesc(row.description ?? "");
        setSteps((Array.isArray(row.steps) ? row.steps : []) as PipelineStep[]);
      } catch (e) {
        console.error("[WorkflowBuilder] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, router, toast]);

  // ───────── chain ops ─────────

  const addStep = (agentId: string) => {
    const agent = catalog.find((a) => a.id === agentId);
    if (!agent) return;
    const newStep: PipelineStep = {
      id: crypto.randomUUID(),
      agent_id: agent.id,
      agent_name: agent.name,
      config: {},
      pass_output: true,
    };
    setSteps((prev) => [...prev, newStep]);
    setExpandedStep(newStep.id);
  };

  const updateStepConfig = (stepId: string, config: AgentConfig) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, config } : s)));
  };

  const setStepPassOutput = (stepId: string, v: boolean) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, pass_output: v } : s)));
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    if (expandedStep === stepId) setExpandedStep(null);
  };

  const moveStep = (stepId: string, dir: "up" | "down") => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      const ni = dir === "up" ? idx - 1 : idx + 1;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[ni]] = [next[ni], next[idx]];
      return next;
    });
  };

  // ───────── save / delete ─────────

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give your workflow a name first.", variant: "destructive" });
      return;
    }
    if (steps.length === 0) {
      toast({ title: "No steps yet", description: "Add at least one agent to the chain.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      if (isNew) {
        const { data, error } = await supabase
          .from("agent_pipelines")
          .insert({
            user_id: user.id,
            name: name.trim(),
            description: description.trim() || null,
            steps: steps as any,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        toast({ title: "Workflow created", description: `${steps.length} agent${steps.length !== 1 ? "s" : ""} chained.` });
        router.push(`/agent-workflows/${(data as { id: string }).id}`);
      } else {
        const { error } = await supabase
          .from("agent_pipelines")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            steps: steps as any,
          } as any)
          .eq("id", id!);
        if (error) throw error;
        toast({ title: "Workflow saved" });
      }
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("agent_pipelines").delete().eq("id", id!);
      if (error) throw error;
      toast({ title: "Workflow deleted" });
      router.push("/agent-workflows");
    } catch (e: any) {
      toast({ title: "Couldn't delete", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
      setDeleteOpen(false);
    }
  };

  // ───────── catalog (right pane) ─────────

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    const grouped: Record<string, CatalogItem[]> = {};
    for (const agent of catalog) {
      if (q && !agent.name.toLowerCase().includes(q) && !agent.description.toLowerCase().includes(q)) continue;
      (grouped[agent.category] = grouped[agent.category] ?? []).push(agent);
    }
    return grouped;
  }, [query, catalog]);

  // ───────── render ─────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push("/agent-workflows")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              Workflow builder
            </p>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground inline-flex items-center gap-2">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              {isNew ? "New workflow" : name || "Untitled workflow"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && (
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/agent-workflows")}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !name.trim() || steps.length === 0}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5" />Save workflow</>}
          </Button>
        </div>
      </div>

      {/* Name + description bar */}
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Workflow name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Renewal preparation"
              className="mt-1 text-[14px]"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="One line: when does this workflow run, what does it produce?"
              className="mt-1 text-[14px]"
            />
          </div>
        </div>
      </Card>

      {/* Two-pane builder */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* ─── LEFT PANE: chain ─── */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                Chain
              </h2>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                {steps.length === 0
                  ? "Pick an agent from the catalog →"
                  : `${steps.length} agent${steps.length !== 1 ? "s" : ""} · runs top to bottom`}
              </p>
            </div>
          </div>

          {steps.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground mb-3">
                <Workflow className="h-5 w-5" />
              </div>
              <p className="text-[13.5px] font-semibold text-foreground">No agents yet</p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                Click any agent in the catalog on the right. They'll execute in the order you add them.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {steps.map((step, idx) => (
                <StepCard
                  key={step.id}
                  step={step}
                  meta={lookupStep(step.agent_id)}
                  index={idx}
                  total={steps.length}
                  expanded={expandedStep === step.id}
                  onToggle={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  onMoveUp={() => moveStep(step.id, "up")}
                  onMoveDown={() => moveStep(step.id, "down")}
                  onRemove={() => removeStep(step.id)}
                  onConfigChange={(c) => updateStepConfig(step.id, c)}
                  onPassOutputChange={(v) => setStepPassOutput(step.id, v)}
                  prevStepPassOutput={idx > 0 ? steps[idx - 1].pass_output : false}
                />
              ))}
            </div>
          )}
        </Card>

        {/* ─── RIGHT PANE: catalog ─── */}
        <Card className="overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[14px] font-semibold text-foreground tracking-tight">Catalog</h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">Click to add to your chain.</p>
          </div>
          <div className="px-4 py-2.5 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents…"
                className="pl-9 h-9 text-[13px]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {catalogLoading ? (
              <div className="px-4 py-8 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : Object.entries(filteredCatalog).length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                No agents match this search.
              </div>
            ) : (
              Object.entries(filteredCatalog).map(([category, agents]) => (
                <div key={category} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-2 pt-1">
                    {category === "Custom pods" ? (
                      <Wand2 className="h-2.5 w-2.5 text-muted-foreground/70" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5 text-muted-foreground/70" />
                    )}
                    <p className="text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground/80">
                      {category}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">{agents.length}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {agents.map((agent) => (
                      <li key={agent.id}>
                        <button
                          type="button"
                          onClick={() => addStep(agent.id)}
                          className="w-full text-left px-2 py-2 rounded hover:bg-muted/60 transition-colors group flex items-start gap-2"
                        >
                          <Plus className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary mt-0.5 shrink-0 transition-colors" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {agent.name}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">
                              {agent.description}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
              onClick={remove}
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

// ─────────────────────────── StepCard ───────────────────────────

function StepCard({
  step, meta, index, total, expanded, prevStepPassOutput,
  onToggle, onMoveUp, onMoveDown, onRemove, onConfigChange, onPassOutputChange,
}: {
  step: PipelineStep;
  meta: CatalogItem;
  index: number;
  total: number;
  expanded: boolean;
  prevStepPassOutput: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onConfigChange: (c: AgentConfig) => void;
  onPassOutputChange: (v: boolean) => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div>
      {/* Connector from previous step */}
      {index > 0 && (
        <div className="flex items-center justify-center py-1 gap-2">
          <ArrowDown className={cn("h-3.5 w-3.5", prevStepPassOutput ? "text-primary" : "text-muted-foreground/40")} />
          {prevStepPassOutput && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
              <Link2 className="h-2.5 w-2.5" />
              output → input
            </span>
          )}
        </div>
      )}

      <div className={cn(
        "rounded border transition-colors",
        expanded ? "border-primary/30 bg-accent/20" : "border-border bg-card hover:border-border-strong",
      )}>
        {/* Header row — div instead of button to avoid nested <button> hydration error */}
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
          className="w-full text-left px-3 py-2.5 flex items-center gap-3 cursor-pointer select-none"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <div className="h-6 w-6 rounded bg-muted text-foreground/80 flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground truncate">{step.agent_name}</p>
            <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
              {meta.category}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={index === 0} className="text-muted-foreground hover:text-foreground">
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onMoveDown} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Chevron className="h-4 w-4 text-muted-foreground ml-1" />
          </div>
        </div>

        {/* Body */}
        {expanded && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/60">
            {meta.description && (
              <p className="text-[12px] text-muted-foreground leading-relaxed">{meta.description}</p>
            )}
            <AgentConfigForm
              agentId={step.agent_id}
              config={step.config}
              onChange={onConfigChange}
            />
            {index < total - 1 && (
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/60">
                <Label className="text-[12px] flex items-center gap-1.5 text-foreground/85">
                  <Link2 className="h-3 w-3" />Pass output to the next agent
                </Label>
                <Switch checked={step.pass_output} onCheckedChange={onPassOutputChange} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
