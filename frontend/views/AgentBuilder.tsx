'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Agent Builder — SOP → workflow → custom agent compiler.
//
// Three-step wizard:
//   1. Compose: user pastes/types their SOP (template-assisted).
//   2. Review:  AI parses the SOP into steps; user edits name, icon, lane,
//               description, and the step list inline.
//   3. Deploy:  agent is inserted into custom_agents, surfaces in
//               Marketplace ("Built by you") + My Agents.
//
// The parse step calls the existing workflow-ai edge function with
// action="parse", which streams a JSON array of {step_number, title,
// description, action_type, ai_can_assist, estimated_minutes}.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { streamFromEdgeFunction } from "@/lib/streamHelper";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Wand2,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  FileText,
  Mail,
  Search,
  Scale,
  Shield,
  ClipboardCheck,
  RefreshCw,
  Bot,
  Briefcase,
  CalendarClock,
  Building2,
  AlertCircle,
  Send,
  Layers,
  Code2,
  Globe,
  KeyRound,
  Download,
  PlayCircle,
  Lock,
  type LucideIcon,
} from "lucide-react";

import { JOB_LANES, type JobLaneId } from "@/lib/sectors";
import { cn } from "@/lib/utils";

// ───────────────────────────── icon picker ─────────────────────────────

const ICON_OPTIONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "bot",            icon: Bot,            label: "Bot" },
  { key: "file-text",      icon: FileText,       label: "Document" },
  { key: "mail",           icon: Mail,           label: "Mail" },
  { key: "search",         icon: Search,         label: "Search" },
  { key: "scale",          icon: Scale,          label: "Compare" },
  { key: "shield-check",   icon: Shield,         label: "Validate" },
  { key: "clipboard-check",icon: ClipboardCheck, label: "Checklist" },
  { key: "refresh-cw",     icon: RefreshCw,      label: "Renewal" },
  { key: "briefcase",      icon: Briefcase,      label: "Broker" },
  { key: "calendar-clock", icon: CalendarClock,  label: "Schedule" },
  { key: "building-2",     icon: Building2,      label: "Carrier" },
  { key: "alert-circle",   icon: AlertCircle,    label: "Claim" },
  { key: "send",           icon: Send,           label: "Send" },
  { key: "layers",         icon: Layers,         label: "Workflow" },
];

const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.key, o.icon]),
);

// ───────────────────────────── SOP template ─────────────────────────────

const TEMPLATE_SOP = `Title: Renewal preparation for an account
Trigger: 60 days before policy expiration

Steps:
1. Pull the latest expiring policy from the AMS for the account.
2. Pull the renewal proposal from the carrier portal once available.
3. Compare the expiring vs renewal policy clause-by-clause.
4. Flag any reduction in coverage, new exclusions, or premium changes > 5%.
5. Draft a client-facing email summarizing the renewal in plain English.
6. Attach the renewal proposal and the change summary to the AMS record.
7. Surface in the broker's Inbox for approval before sending.

Output: A renewal package ready to send, with a client email pre-drafted.`;

// ───────────────────────────── types ─────────────────────────────

interface ParsedStep {
  step_number: number;
  title: string;
  description: string;
  action_type?: string;
  ai_can_assist?: boolean;
  estimated_minutes?: number;
}

interface AutomationTarget {
  label: string;
  url: string;
  credential_keys: string[];
}

type WizardStep = "compose" | "review" | "automate" | "deployed";

// ───────────────────────────── component ─────────────────────────────

export default function AgentBuilder() {
  const router = useRouter();
  const { toast } = useToast();

  const [wizardStep, setWizardStep] = useState<WizardStep>("compose");

  // Compose
  const [sopText, setSopText] = useState("");

  // Review (compiled agent)
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>("bot");
  const [jobLane, setJobLane] = useState<JobLaneId>("save_my_mornings");

  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployedId, setDeployedId] = useState<string | null>(null);

  // Automate (optional Playwright compilation)
  const [playwrightScript, setPlaywrightScript] = useState<string>("");
  const [automationTargets, setAutomationTargets] = useState<AutomationTarget[]>([]);
  const [automating, setAutomating] = useState(false);
  const [automateError, setAutomateError] = useState<string | null>(null);
  const [automationStreamBuffer, setAutomationStreamBuffer] = useState<string>("");

  // ───────────── helpers ─────────────

  const compile = async () => {
    if (!sopText.trim()) {
      toast({ title: "Paste your SOP first", variant: "destructive" });
      return;
    }
    setCompiling(true);
    setCompileError(null);
    setParsedSteps([]);

    let buffer = "";
    await streamFromEdgeFunction(
      "workflow-ai",
      { sop_text: sopText, action: "parse" },
      {
        onDelta: (chunk) => { buffer += chunk; },
        onDone: () => {
          // The edge function returns a JSON array somewhere in the stream.
          const match = buffer.match(/\[[\s\S]*\]/);
          if (!match) {
            setCompileError("Couldn't extract a step list from the AI response. Try rephrasing your SOP.");
            setCompiling(false);
            return;
          }
          try {
            const arr = JSON.parse(match[0]) as ParsedStep[];
            if (!Array.isArray(arr) || arr.length === 0) throw new Error("Empty step list");
            setParsedSteps(arr);

            // Auto-suggest a name + icon from the SOP first line if not set.
            const titleLine = sopText.split("\n").find((l) => l.toLowerCase().startsWith("title:"));
            const suggestedName = titleLine
              ? titleLine.replace(/^title:\s*/i, "").trim()
              : "Custom Agent";
            setName(suggestedName);
            setDescription(`Custom agent compiled from your SOP — ${arr.length} steps.`);

            // Heuristic icon picker
            const lower = (suggestedName + " " + sopText).toLowerCase();
            if (lower.includes("renewal"))        setIcon("refresh-cw");
            else if (lower.includes("quote"))     setIcon("send");
            else if (lower.includes("claim"))     setIcon("alert-circle");
            else if (lower.includes("policy"))    setIcon("scale");
            else if (lower.includes("submission"))setIcon("file-text");
            else if (lower.includes("loss run"))  setIcon("search");
            else                                  setIcon("bot");

            // Lane heuristic
            if (lower.includes("claim") || lower.includes("loss run"))   setJobLane("handle_cases");
            else if (lower.includes("quote") || lower.includes("submission")) setJobLane("win_more_business");
            else if (lower.includes("audit") || lower.includes("compliance") || lower.includes("regulator")) setJobLane("stay_compliant");
            else                                                          setJobLane("save_my_mornings");

            setCompiling(false);
            setWizardStep("review");
          } catch (e: any) {
            setCompileError(`Parse failed: ${e.message ?? "invalid response"}`);
            setCompiling(false);
          }
        },
        onError: (err) => {
          setCompileError(typeof err === "string" ? err : "AI parsing failed");
          setCompiling(false);
        },
      },
    );
  };

  const updateStep = (idx: number, patch: Partial<ParsedStep>) => {
    setParsedSteps((p) => p.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeStep = (idx: number) => {
    setParsedSteps((p) => p.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  };
  const addStep = () => {
    setParsedSteps((p) => [
      ...p,
      { step_number: p.length + 1, title: "New step", description: "", action_type: "review", ai_can_assist: true, estimated_minutes: 5 },
    ]);
  };

  const mcpToolNameFromName = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

  // ───────────── automation compile ─────────────
  //
  // Calls workflow-ai with action="automate", which streams a Playwright
  // TypeScript script followed by "---TARGETS---" + a JSON array of
  // automation targets (URLs + credential keys).

  const compileAutomation = async () => {
    setAutomating(true);
    setAutomateError(null);
    setPlaywrightScript("");
    setAutomationTargets([]);
    setAutomationStreamBuffer("");
    setWizardStep("automate");

    let buffer = "";
    await streamFromEdgeFunction(
      "workflow-ai",
      { sop_text: sopText, parsed_steps: parsedSteps, action: "automate" },
      {
        onDelta: (chunk) => {
          buffer += chunk;
          setAutomationStreamBuffer(buffer);
        },
        onDone: () => {
          // Split on the ---TARGETS--- marker
          const marker = "---TARGETS---";
          const idx = buffer.indexOf(marker);
          let script = buffer;
          let targets: AutomationTarget[] = [];
          if (idx !== -1) {
            script = buffer.slice(0, idx).trim();
            const tail = buffer.slice(idx + marker.length).trim();
            const jsonMatch = tail.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try {
                const arr = JSON.parse(jsonMatch[0]);
                if (Array.isArray(arr)) {
                  targets = arr.filter(
                    (t: any) =>
                      t && typeof t.label === "string" && typeof t.url === "string",
                  ).map((t: any) => ({
                    label: t.label,
                    url: t.url,
                    credential_keys: Array.isArray(t.credential_keys) ? t.credential_keys : [],
                  }));
                }
              } catch {
                /* swallow — targets are best-effort */
              }
            }
          }
          // Strip any accidental markdown fences
          script = script.replace(/^```(?:typescript|ts)?\s*/i, "").replace(/```\s*$/i, "").trim();

          if (!script || script.length < 50) {
            setAutomateError("Couldn't extract a Playwright script from the AI response. Try rephrasing the SOP with concrete URLs and selectors.");
            setAutomating(false);
            return;
          }
          setPlaywrightScript(script);
          setAutomationTargets(targets);
          setAutomating(false);
        },
        onError: (err) => {
          setAutomateError(typeof err === "string" ? err : "AI automation failed");
          setAutomating(false);
        },
      },
    );
  };

  const downloadScript = () => {
    const blob = new Blob([playwrightScript], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mcpToolNameFromName(name) || "custom_agent"}.spec.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deploy = async () => {
    if (!name.trim() || parsedSteps.length === 0) {
      toast({ title: "Missing fields", description: "Agent needs a name and at least one step.", variant: "destructive" });
      return;
    }
    setDeploying(true);
    try {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }
      const automationFields: Record<string, any> = playwrightScript
        ? {
            playwright_script: playwrightScript,
            automation_status: "ready",
            automation_targets: automationTargets,
          }
        : {};
      const { data, error } = await supabase
        .from("custom_agents" as any)
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          icon,
          job_lane: jobLane,
          category: playwrightScript ? "Automated · Custom" : "Custom",
          sop_text: sopText,
          parsed_steps: parsedSteps as any,
          status: "live",
          mcp_tool_name: mcpToolNameFromName(name),
          ...automationFields,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      setDeployedId((data as unknown as { id: string }).id);
      setWizardStep("deployed");
      toast({ title: "Agent deployed", description: `${name} is now live in your workspace.` });
    } catch (e: any) {
      toast({ title: "Deploy failed", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  const reset = () => {
    setWizardStep("compose");
    setSopText("");
    setParsedSteps([]);
    setName("");
    setDescription("");
    setIcon("bot");
    setJobLane("save_my_mornings");
    setDeployedId(null);
    setCompileError(null);
    setPlaywrightScript("");
    setAutomationTargets([]);
    setAutomateError(null);
    setAutomationStreamBuffer("");
  };

  // ───────────── render ─────────────

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Agent Builder · alpha"
        title="Build your own agent from an SOP"
        description="Paste your Standard Operating Procedure. Fideon compiles it into a runnable agent — same governance, same audit trail, same MCP layer as the catalog agents."
        icon={Wand2}
        actions={
          wizardStep !== "compose" && wizardStep !== "deployed" ? (
            <Button variant="outline" size="sm" onClick={() => setWizardStep("compose")}>
              <ArrowLeft className="h-3.5 w-3.5" />Back to SOP
            </Button>
          ) : null
        }
      />

      {/* Step indicator */}
      <Stepper step={wizardStep} />

      {/* STEP 1 — COMPOSE */}
      {wizardStep === "compose" && (
        <Card className="overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-display text-[15px] font-bold text-foreground tracking-tight">Paste your SOP</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Plain English works. A Title + Steps + Output structure helps Fideon nail the compile.</p>
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="text-primary"
              onClick={() => setSopText(TEMPLATE_SOP)}
              disabled={compiling}
            >
              <FileText className="h-3 w-3" />Use template
            </Button>
          </div>

          <div className="p-6 space-y-4">
            <Textarea
              value={sopText}
              onChange={(e) => setSopText(e.target.value)}
              placeholder={`Title: <what this agent does>\nTrigger: <when it should run>\n\nSteps:\n1. <action>\n2. <action>\n3. <action>\n\nOutput: <what the broker gets at the end>`}
              rows={16}
              className="font-mono text-[13px] leading-[1.65] resize-y"
              disabled={compiling}
            />

            {compileError && (
              <Card className="px-4 py-3 bg-destructive/5 border-destructive/30">
                <p className="text-[12.5px] text-destructive font-medium">{compileError}</p>
              </Card>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11.5px] text-muted-foreground">
                {sopText.trim().split(/\s+/).filter(Boolean).length} words · {sopText.split("\n").length} lines
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={compile}
                disabled={compiling || sopText.trim().length < 20}
              >
                {compiling ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Compiling with AI…</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Compile into agent</>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2 — REVIEW */}
      {wizardStep === "review" && (
        <div className="space-y-4">
          {/* Identity card */}
          <Card>
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-display text-[15px] font-bold text-foreground tracking-tight">Agent identity</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">How this agent appears in your Marketplace and Inbox.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. ABC Brokerage Renewal Prep"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Job lane</Label>
                  <Select value={jobLane} onValueChange={(v) => setJobLane(v as JobLaneId)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_LANES.filter((l) => l.id !== "explore").map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1.5 text-[13.5px]"
                  placeholder="One sentence describing what this agent does."
                />
              </div>

              <div>
                <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Icon</Label>
                <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
                  {ICON_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = icon === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setIcon(opt.key)}
                        aria-label={opt.label}
                        title={opt.label}
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center border transition-all",
                          active
                            ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* Compiled steps */}
          <Card>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display text-[15px] font-bold text-foreground tracking-tight">Compiled workflow</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">{parsedSteps.length} step{parsedSteps.length !== 1 ? "s" : ""} · edit anything before deploy</p>
              </div>
              <Button variant="ghost" size="xs" className="text-primary" onClick={addStep}>
                <Plus className="h-3 w-3" />Add step
              </Button>
            </div>
            <ol className="divide-y divide-border">
              {parsedSteps.map((s, idx) => (
                <li key={idx} className="px-6 py-4 flex items-start gap-4">
                  <div className="h-7 w-7 rounded-full bg-accent text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={s.title}
                      onChange={(e) => updateStep(idx, { title: e.target.value })}
                      className="font-semibold"
                    />
                    <Textarea
                      value={s.description}
                      onChange={(e) => updateStep(idx, { description: e.target.value })}
                      rows={2}
                      className="text-[13px]"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.action_type && (
                        <StatusPill tone="primary" size="sm" className="capitalize">{s.action_type}</StatusPill>
                      )}
                      {s.ai_can_assist && (
                        <StatusPill tone="success" size="sm">
                          <Sparkles className="h-2.5 w-2.5" />AI-assisted
                        </StatusPill>
                      )}
                      {typeof s.estimated_minutes === "number" && s.estimated_minutes > 0 && (
                        <StatusPill tone="neutral" size="sm">~{s.estimated_minutes}m</StatusPill>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeStep(idx)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove step"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ol>
          </Card>

          {/* Trust footer */}
          <Card className="bg-success/5 border-success/20 px-5 py-3.5 flex items-start gap-3">
            <Shield className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <p className="text-[12.5px] text-foreground/85 flex-1">
              <strong className="text-foreground">Governance applies automatically.</strong>{" "}
              When this agent runs, every output is confidence-scored and routed through your Decision Review Queue. Every action gets logged in the immutable audit trail. Just like the catalog agents.
            </p>
          </Card>

          {/* Automation upsell — only relevant for web-based SOPs */}
          <Card className="bg-gradient-hero border-primary/20 overflow-hidden">
            <div className="px-5 py-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
                <Code2 className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-[13.5px] font-semibold text-foreground">
                  Want this to run headlessly? Compile a Playwright automation.
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                  Fideon emits a Playwright TypeScript script from your SOP — logs into the carrier portal,
                  navigates the UI, extracts the result. Same review queue, same audit trail. (Skip if this SOP needs human judgement.)
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={compileAutomation} disabled={!name.trim() || parsedSteps.length === 0}>
                <Wand2 className="h-3.5 w-3.5" />Generate Playwright
              </Button>
            </div>
          </Card>

          {/* Deploy bar */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setWizardStep("compose")} disabled={deploying}>
              <ArrowLeft className="h-4 w-4" />Edit SOP
            </Button>
            <Button variant="primary" size="lg" onClick={deploy} disabled={deploying || !name.trim() || parsedSteps.length === 0}>
              {deploying ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Deploying…</>
              ) : (
                <><Sparkles className="h-4 w-4" />Deploy as manual agent</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — AUTOMATE (optional) */}
      {wizardStep === "automate" && (
        <div className="space-y-4">
          {/* Header card */}
          <Card>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="font-display text-[15px] font-bold text-foreground tracking-tight">Playwright automation</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {automating
                    ? "Compiling the SOP into a deterministic browser script…"
                    : playwrightScript
                      ? `Generated · ${playwrightScript.split("\n").length} lines · ${automationTargets.length} target${automationTargets.length !== 1 ? "s" : ""}`
                      : "Run the compile to see the generated script."}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {playwrightScript && !automating && (
                  <>
                    <Button variant="outline" size="sm" onClick={downloadScript}>
                      <Download className="h-3.5 w-3.5" />Download .ts
                    </Button>
                    <Button variant="ghost" size="sm" onClick={compileAutomation} disabled={automating}>
                      <RefreshCw className="h-3.5 w-3.5" />Re-generate
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Stream / script display */}
            <div className="p-0 max-h-[440px] overflow-auto bg-muted/30">
              {automating && !playwrightScript ? (
                <div className="px-6 py-6 space-y-3">
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Streaming Playwright TypeScript…
                  </div>
                  <pre className="font-mono text-[11.5px] leading-[1.65] text-foreground/70 whitespace-pre-wrap break-words">
                    {automationStreamBuffer || "// waiting for first chunk…"}
                  </pre>
                </div>
              ) : playwrightScript ? (
                <pre className="px-6 py-4 font-mono text-[11.5px] leading-[1.65] text-foreground whitespace-pre-wrap break-words">
                  {playwrightScript}
                </pre>
              ) : (
                <div className="px-6 py-8 text-center text-[12.5px] text-muted-foreground">
                  No script yet.
                </div>
              )}
            </div>

            {automateError && (
              <div className="px-6 py-3 bg-destructive/5 border-t border-destructive/20">
                <p className="text-[12.5px] text-destructive font-medium">{automateError}</p>
              </div>
            )}
          </Card>

          {/* Targets */}
          {automationTargets.length > 0 && (
            <Card>
              <div className="px-6 py-4 border-b border-border">
                <h3 className="font-display text-[14px] font-bold text-foreground tracking-tight">What this script needs at runtime</h3>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  URLs the script visits and the credentials it pulls from <code className="font-mono">ctx.credentials</code> — never inlined.
                </p>
              </div>
              <ul className="divide-y divide-border">
                {automationTargets.map((t, idx) => (
                  <li key={idx} className="px-6 py-3.5 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
                      <Globe className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{t.label}</p>
                      <p className="text-[11.5px] text-muted-foreground font-mono truncate">{t.url}</p>
                      {t.credential_keys.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <KeyRound className="h-3 w-3 text-muted-foreground shrink-0" />
                          {t.credential_keys.map((k) => (
                            <code key={k} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-muted text-foreground/85 border border-border">
                              {k}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Trust + runtime note */}
          <Card className="bg-warning/5 border-warning/30 px-5 py-3.5 flex items-start gap-3">
            <Lock className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-[12.5px] text-foreground/85 flex-1">
              <strong className="text-foreground">Script generated · execution runtime in alpha.</strong>{" "}
              The script is stored on this agent and downloadable now. Headless execution against carrier portals
              (with a secrets vault, screenshot audit trail, and per-run review entries) is rolling out next. In the meantime,
              your ops team can run the .ts locally with <code className="font-mono">npx playwright</code>.
            </p>
          </Card>

          {/* Deploy bar */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setWizardStep("review")} disabled={deploying || automating}>
              <ArrowLeft className="h-4 w-4" />Back to review
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => { setPlaywrightScript(""); setAutomationTargets([]); deploy(); }}
                disabled={deploying || automating}
              >
                Deploy as manual instead
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={deploy}
                disabled={deploying || automating || !playwrightScript}
              >
                {deploying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Deploying…</>
                ) : (
                  <><PlayCircle className="h-4 w-4" />Deploy as automated pod</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4 — DEPLOYED */}
      {wizardStep === "deployed" && (
        <Card className="overflow-hidden">
          <div className="px-8 py-10 text-center bg-gradient-hero">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow mb-4">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="font-display text-[24px] font-bold text-foreground tracking-tight">
              {name} is live.
            </h2>
            <p className="text-[14px] text-muted-foreground max-w-xl mx-auto mt-2 leading-relaxed">
              Your custom agent has been deployed to your workspace. You'll find it in your Marketplace under <strong>Built by you</strong>, and in <strong>My Agents</strong>. Same governance, same audit trail, same MCP layer as the catalog agents.
            </p>

            {/* Preview card */}
            <div className="mt-7 inline-flex items-center gap-3 px-5 py-3.5 rounded-xl border border-primary/30 bg-card shadow-card">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
                {(() => {
                  const Icon = ICON_BY_KEY[icon] ?? Bot;
                  return <Icon className="h-5 w-5" />;
                })()}
              </div>
              <div className="text-left">
                <p className="font-display text-[14px] font-bold text-foreground tracking-tight">{name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusPill tone="success" dot pulse size="sm">Live</StatusPill>
                  <StatusPill tone="primary" size="sm">{parsedSteps.length} steps</StatusPill>
                  {playwrightScript && (
                    <StatusPill tone="info" size="sm">
                      <Code2 className="h-2.5 w-2.5" />Browser-automated
                    </StatusPill>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mt-7 flex-wrap">
              <Button variant="outline" size="lg" onClick={() => router.push("/my-models")}>
                Open My Agents <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="lg" onClick={reset}>
                <Plus className="h-4 w-4" />Build another
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────── Stepper ─────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
  // 4-step stepper with Automate marked optional.
  const steps: { key: WizardStep; label: string; optional?: boolean }[] = [
    { key: "compose",  label: "Compose" },
    { key: "review",   label: "Review" },
    { key: "automate", label: "Automate", optional: true },
    { key: "deployed", label: "Deploy" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {steps.map((s, i) => {
        const done = i < activeIndex || step === "deployed";
        const active = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors",
                done   ? "bg-success text-success-foreground"
              : active ? "bg-gradient-primary text-primary-foreground shadow-glow"
              :          "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              "text-[12.5px] font-semibold",
              active ? "text-foreground" : "text-muted-foreground",
            )}>
              {s.label}
              {s.optional && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  optional
                </span>
              )}
            </span>
            {i < steps.length - 1 && (
              <span className={cn(
                "h-px w-6 mx-1",
                i < activeIndex || step === "deployed" ? "bg-primary" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
