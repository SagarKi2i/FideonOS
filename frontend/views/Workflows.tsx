'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Plus, Play, Loader2, CheckCircle2, Circle, ArrowRight,
  Sparkles, FileText, Trash2, MessageSquare, Send, X, Workflow as WorkflowIcon,
  Search, Filter, Calendar, Activity, GitBranch,
  Briefcase, Shield, Receipt, ScrollText, Banknote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { streamFromEdgeFunction } from "@/lib/streamHelper";
import { streamChat } from "@/lib/aiChat";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// Category → { icon, accent } so cards aren't all monochrome
const CATEGORY_META: Record<string, { icon: typeof Brain; tone: "primary" | "success" | "warning" | "info" | "neutral" }> = {
  general:        { icon: WorkflowIcon, tone: "primary" },
  underwriting:   { icon: Shield,       tone: "info" },
  claims:         { icon: ScrollText,   tone: "warning" },
  "policy-admin": { icon: Briefcase,    tone: "primary" },
  compliance:     { icon: CheckCircle2, tone: "success" },
  billing:        { icon: Banknote,     tone: "neutral" },
};

const categoryMeta = (cat: string) => CATEGORY_META[cat] ?? { icon: Receipt, tone: "neutral" as const };

interface WorkflowStep {
  step_number: number; title: string; description: string;
  action_type: string; ai_can_assist: boolean; estimated_minutes: number;
}

interface Workflow {
  id: string; title: string; description: string | null; sop_text: string;
  category: string; parsed_steps: WorkflowStep[]; created_at: string;
}

interface WorkflowRun {
  id: string; workflow_id: string; status: string; current_step: number;
  step_results: { step: number; notes: string; completed_at: string }[];
  started_at: string; completed_at: string | null;
}

interface ActivatedModel {
  id: string; model_id: string; model_name: string; domain: string;
}

const actionColors: Record<string, string> = {
  review: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  analyze: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  verify: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  input: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  decision: "bg-red-500/10 text-red-600 dark:text-red-400",
  communicate: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  document: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  calculate: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

export default function Workflows() {
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSopText, setNewSopText] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [parsing, setParsing] = useState(false);

  const [activeRun, setActiveRun] = useState<{ workflow: Workflow; run: WorkflowRun } | null>(null);
  const [aiGuidance, setAiGuidance] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [stepNotes, setStepNotes] = useState("");

  const [models, setModels] = useState<ActivatedModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelPrompt, setModelPrompt] = useState("");
  const [modelResponse, setModelResponse] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [showModelChat, setShowModelChat] = useState(false);

  useEffect(() => { loadWorkflows(); loadModels(); }, []);

  const loadModels = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data } = await supabase.from("activated_models").select("*").eq("user_id", user.id);
      if (data && data.length > 0) { setModels(data); setSelectedModel(data[0].model_id); }
    } catch (e) { console.error("Error loading models:", e); }
  };

  const loadWorkflows = async () => {
    try {
      const { data, error } = await supabase.from("workflows").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setWorkflows((data || []).map((w: any) => ({ ...w, parsed_steps: Array.isArray(w.parsed_steps) ? w.parsed_steps : [] })));
    } catch (e) { console.error("Error loading workflows:", e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newTitle || !newSopText) {
      toast({ title: "Missing fields", description: "Title and SOP text are required", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      let parsedSteps: WorkflowStep[] = [];
      let fullResponse = "";
      await streamFromEdgeFunction("workflow-ai", { sop_text: newSopText, action: "parse" }, {
        onDelta: (delta) => { fullResponse += delta; },
        onDone: () => {},
        onError: (err) => { throw new Error(err); },
      });
      const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsedSteps = JSON.parse(jsonMatch[0]);

      const user = await getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("workflows").insert({
        user_id: user.id, title: newTitle, description: newDescription || null,
        sop_text: newSopText, category: newCategory, parsed_steps: parsedSteps as any,
      });
      if (error) throw error;
      toast({ title: "Workflow Created", description: `${parsedSteps.length} steps parsed from your SOP` });
      setCreateOpen(false); setNewTitle(""); setNewDescription(""); setNewSopText(""); setNewCategory("general");
      loadWorkflows();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to create workflow", variant: "destructive" });
    } finally { setParsing(false); }
  };

  const startRun = async (workflow: Workflow) => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, error } = await supabase.from("workflow_runs").insert({
        workflow_id: workflow.id, user_id: user.id, status: "in_progress",
        current_step: 0, step_results: [] as any,
      }).select().single();
      if (error) throw error;
      setActiveRun({ workflow, run: { ...data, step_results: [] } });
      setAiGuidance(""); setStepNotes("");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const getAiAssistance = async () => {
    if (!activeRun) return;
    const step = activeRun.workflow.parsed_steps[activeRun.run.current_step];
    if (!step) return;
    setAiLoading(true); setAiGuidance("");
    try {
      const previousNotes = activeRun.run.step_results.map(r => `Step ${r.step + 1}: ${r.notes}`).join("\n");
      await streamFromEdgeFunction("workflow-ai", {
        sop_text: activeRun.workflow.sop_text, action: "assist", current_step: step, step_context: previousNotes,
      }, {
        onDelta: (delta) => { setAiGuidance(prev => prev + delta); },
        onDone: () => { setAiLoading(false); },
        onError: () => { setAiLoading(false); },
      });
    } catch { setAiLoading(false); }
  };

  const completeStep = async () => {
    if (!activeRun) return;
    const newResults = [
      ...activeRun.run.step_results,
      { step: activeRun.run.current_step, notes: stepNotes, completed_at: new Date().toISOString() },
    ];
    const nextStep = activeRun.run.current_step + 1;
    const isComplete = nextStep >= activeRun.workflow.parsed_steps.length;
    await supabase.from("workflow_runs").update({
      current_step: nextStep, step_results: newResults as any,
      status: isComplete ? "completed" : "in_progress",
      completed_at: isComplete ? new Date().toISOString() : null,
    }).eq("id", activeRun.run.id);

    if (isComplete) {
      toast({ title: "Workflow Complete!", description: `All ${activeRun.workflow.parsed_steps.length} steps finished` });
      setActiveRun(null);
    } else {
      setActiveRun({ ...activeRun, run: { ...activeRun.run, current_step: nextStep, step_results: newResults } });
      setStepNotes(""); setAiGuidance("");
    }
  };

  const deleteWorkflow = async (id: string) => {
    await supabase.from("workflows").delete().eq("id", id);
    loadWorkflows();
  };

  const runModelPrompt = async () => {
    if (!modelPrompt.trim() || !selectedModel) return;
    setModelLoading(true); setModelResponse("");
    const currentStep = activeRun?.workflow.parsed_steps[activeRun.run.current_step];
    const contextPrefix = currentStep
      ? `[Workflow: ${activeRun?.workflow.title} | Step ${activeRun.run.current_step + 1}: ${currentStep.title}]\n\n`
      : "";
    try {
      await streamChat({
        messages: [{ role: "user", content: contextPrefix + modelPrompt }],
        modelId: selectedModel,
        onDelta: (delta) => { setModelResponse(prev => prev + delta); },
        onDone: () => { setModelLoading(false); },
        onError: (err) => {
          toast({ title: "Error", description: typeof err === "string" ? err : "Model request failed", variant: "destructive" });
          setModelLoading(false);
        },
      });
    } catch { setModelLoading(false); }
  };

  // === RUNNER VIEW ===
  if (activeRun) {
    const currentStep = activeRun.workflow.parsed_steps[activeRun.run.current_step];
    const progress = ((activeRun.run.current_step) / activeRun.workflow.parsed_steps.length) * 100;

    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        {/* Runner Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{activeRun.workflow.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Step {activeRun.run.current_step + 1} of {activeRun.workflow.parsed_steps.length}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setActiveRun(null)}>
            <X className="h-4 w-4 mr-1.5" />Exit
          </Button>
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-1.5" />

        {/* Step pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {activeRun.workflow.parsed_steps.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
                i < activeRun.run.current_step
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : i === activeRun.run.current_step
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < activeRun.run.current_step ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {s.title}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Step */}
          <Card className="border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={actionColors[currentStep?.action_type] || "bg-muted text-muted-foreground"}>
                  {currentStep?.action_type}
                </Badge>
                <span className="text-xs text-muted-foreground">~{currentStep?.estimated_minutes} min</span>
              </div>
              <CardTitle className="text-lg">{currentStep?.title}</CardTitle>
              <CardDescription>{currentStep?.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Your Notes / Actions Taken</Label>
                <Textarea
                  value={stepNotes}
                  onChange={(e) => setStepNotes(e.target.value)}
                  placeholder="Document what you did for this step..."
                  rows={4}
                />
              </div>
              <Button onClick={completeStep} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Step
                {activeRun.run.current_step < activeRun.workflow.parsed_steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 ml-2" />
                )}
              </Button>
            </CardContent>
          </Card>

          {/* AI Guidance */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Guidance
              </CardTitle>
              <CardDescription>Get AI suggestions for this step</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentStep?.ai_can_assist && (
                <Button variant="outline" onClick={getAiAssistance} disabled={aiLoading} className="w-full">
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                  {aiLoading ? "Generating..." : "Get AI Suggestions"}
                </Button>
              )}
              {aiGuidance && (
                <div className="prose prose-sm max-w-none text-foreground bg-muted/50 rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
                  {aiGuidance}
                </div>
              )}
              {!currentStep?.ai_can_assist && !aiGuidance && (
                <p className="text-sm text-muted-foreground italic">This step requires manual action.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Model Chat */}
        {models.length > 0 && (
          <Card className="border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Consult Agent
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowModelChat(!showModelChat); setModelResponse(""); setModelPrompt(""); }}>
                  {showModelChat ? "Hide" : "Open"}
                </Button>
              </div>
            </CardHeader>
            {showModelChat && (
              <CardContent className="space-y-4">
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    {models.map(m => <SelectItem key={m.id} value={m.model_id}>{m.model_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Textarea value={modelPrompt} onChange={(e) => setModelPrompt(e.target.value)}
                    placeholder="Ask anything related to this step..." rows={2} className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runModelPrompt(); } }}
                  />
                  <Button onClick={runModelPrompt} disabled={modelLoading || !modelPrompt.trim()} size="icon" className="shrink-0 self-end">
                    {modelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {modelResponse && (
                  <div className="prose prose-sm max-w-none text-foreground bg-muted/50 rounded-lg p-4 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">
                    {modelResponse}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Completed Steps */}
        {activeRun.run.step_results.length > 0 && (
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Completed Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeRun.run.step_results.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{activeRun.workflow.parsed_steps[r.step]?.title}</span>
                      {r.notes && <p className="text-muted-foreground text-xs mt-0.5">{r.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // === MAIN VIEW ===
  return <MainView
    workflows={workflows}
    loading={loading}
    createOpen={createOpen}
    setCreateOpen={setCreateOpen}
    newTitle={newTitle} setNewTitle={setNewTitle}
    newDescription={newDescription} setNewDescription={setNewDescription}
    newSopText={newSopText} setNewSopText={setNewSopText}
    newCategory={newCategory} setNewCategory={setNewCategory}
    parsing={parsing}
    onCreate={handleCreate}
    onDelete={deleteWorkflow}
    onRun={startRun}
  />;
}

interface MainViewProps {
  workflows: Workflow[];
  loading: boolean;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  newTitle: string; setNewTitle: (v: string) => void;
  newDescription: string; setNewDescription: (v: string) => void;
  newSopText: string; setNewSopText: (v: string) => void;
  newCategory: string; setNewCategory: (v: string) => void;
  parsing: boolean;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRun: (w: Workflow) => void;
}

function MainView({
  workflows, loading, createOpen, setCreateOpen,
  newTitle, setNewTitle, newDescription, setNewDescription,
  newSopText, setNewSopText, newCategory, setNewCategory,
  parsing, onCreate, onDelete, onRun,
}: MainViewProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categoriesInUse = useMemo(() => {
    const set = new Set(workflows.map((w) => w.category));
    return Array.from(set);
  }, [workflows]);

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      if (categoryFilter !== "all" && w.category !== categoryFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        w.title.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q) ||
        w.parsed_steps.some((s) => s.title.toLowerCase().includes(q))
      );
    });
  }, [workflows, query, categoryFilter]);

  const totalSteps = workflows.reduce((n, w) => n + w.parsed_steps.length, 0);
  const avgSteps = workflows.length > 0 ? Math.round(totalSteps / workflows.length) : 0;
  const newestPipeline = workflows[0];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="SOP pipelines"
        title="Pipeline workflows"
        description="Write procedures in natural language. AI parses them into guided, step-by-step pipelines you can run on real cases."
        icon={WorkflowIcon}
        actions={
          <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />New pipeline
          </Button>
        }
      />

      {/* KPI strip */}
      {workflows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Pipelines"          value={workflows.length}        icon={GitBranch}  tone="primary" />
          <KpiCard label="Total steps"        value={totalSteps}              icon={Activity}   tone="primary" />
          <KpiCard label="Avg steps each"     value={avgSteps}                icon={WorkflowIcon} tone="success" hint={avgSteps > 0 ? `~${avgSteps} per pipeline` : undefined} />
          <KpiCard
            label="Last created"
            value={newestPipeline ? formatDistanceToNow(new Date(newestPipeline.created_at), { addSuffix: false }) : "—"}
            icon={Calendar}
            tone="warning"
            hint={newestPipeline ? `${newestPipeline.title}` : undefined}
          />
        </div>
      )}

      {/* Toolbar — search + category filter */}
      {workflows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pipelines, steps…"
              className="pl-9 h-9 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/40 border border-border">
            <FilterPillBtn label="All" count={workflows.length} active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} />
            {categoriesInUse.map((cat) => {
              const meta = categoryMeta(cat);
              const Icon = meta.icon;
              const cnt = workflows.filter((w) => w.category === cat).length;
              return (
                <FilterPillBtn
                  key={cat}
                  icon={Icon}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " ")}
                  count={cnt}
                  active={categoryFilter === cat}
                  onClick={() => setCategoryFilter(cat)}
                />
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No pipelines yet"
          description="Describe any procedure in plain language and AI will structure it into actionable steps with built-in guidance."
          action={
            <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />Create your first pipeline
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No matches"
          description="Try a different search term or category."
          action={
            <Button variant="outline" onClick={() => { setQuery(""); setCategoryFilter("all"); }}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((w) => {
            const meta = categoryMeta(w.category);
            const Icon = meta.icon;
            const stepsToShow = w.parsed_steps.slice(0, 3);
            return (
              <Card
                key={w.id}
                className={cn(
                  "group flex flex-col transition-all duration-200 overflow-hidden",
                  "hover:border-border-strong hover:shadow-elevated hover:-translate-y-0.5",
                )}
              >
                {/* Header band */}
                <div className="p-5 pb-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        meta.tone === "primary" && "bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                        meta.tone === "success" && "bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground",
                        meta.tone === "warning" && "bg-warning/10 text-warning-foreground/80 group-hover:bg-warning group-hover:text-warning-foreground",
                        meta.tone === "info" && "bg-info/10 text-info group-hover:bg-info group-hover:text-info-foreground",
                        meta.tone === "neutral" && "bg-muted text-foreground/70 group-hover:bg-foreground/80 group-hover:text-background",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <StatusPill tone={meta.tone} size="sm" className="mb-1.5 capitalize">
                        {w.category.replace(/-/g, " ")}
                      </StatusPill>
                      <h3
                        className="font-display text-[15px] font-semibold text-foreground tracking-tight leading-tight line-clamp-2"
                        title={w.title}
                      >
                        {w.title || "Untitled pipeline"}
                      </h3>
                      {w.description && (
                        <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                          {w.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive shrink-0 -mr-1 -mt-1"
                      onClick={() => onDelete(w.id)}
                      aria-label="Delete pipeline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Steps */}
                <div className="px-5 pb-4 flex-1">
                  {stepsToShow.length > 0 ? (
                    <ol className="space-y-1.5">
                      {stepsToShow.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/80">
                          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                          <span className="truncate" title={s.title}>{s.title}</span>
                        </li>
                      ))}
                      {w.parsed_steps.length > 3 && (
                        <li className="text-[11.5px] text-muted-foreground pl-3.5">
                          +{w.parsed_steps.length - 3} more step{w.parsed_steps.length - 3 !== 1 ? "s" : ""}
                        </li>
                      )}
                    </ol>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground italic">No steps parsed yet.</p>
                  )}
                </div>

                {/* Footer — meta + run */}
                <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground min-w-0">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {w.parsed_steps.length} step{w.parsed_steps.length !== 1 ? "s" : ""}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate">
                      Created {formatDistanceToNow(new Date(w.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onRun(w)}
                    disabled={w.parsed_steps.length === 0}
                  >
                    <Play className="h-3 w-3 fill-current" />Run
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create-pipeline dialog (lifted out of PageHeader so the trigger always renders) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create pipeline from SOP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. New Policy Issuance" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="underwriting">Underwriting</SelectItem>
                    <SelectItem value="claims">Claims</SelectItem>
                    <SelectItem value="policy-admin">Policy Admin</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="space-y-2">
              <Label>SOP / Procedure (natural language)</Label>
              <Textarea
                value={newSopText}
                onChange={(e) => setNewSopText(e.target.value)}
                placeholder={`Write your procedure here. Example:\n\n1. Receive submission from broker via email\n2. Log submission in AMS and assign submission ID\n3. Check if the line of business is within our appetite\n4. Review loss runs for the past 5 years\n5. Request any missing documents from the broker`}
                rows={10}
              />
            </div>
            <Button variant="primary" size="lg" onClick={onCreate} disabled={parsing} className="w-full">
              {parsing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />AI is parsing your SOP…</>
              ) : (
                <><Sparkles className="h-4 w-4" />Create &amp; parse with AI</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterPillBtn({
  icon: Icon, label, count, active, onClick,
}: {
  icon?: typeof Filter;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors whitespace-nowrap",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground hover:bg-background/50",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {typeof count === "number" && (
        <span className={cn("text-[10.5px] font-bold tabular-nums", active && "text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}
