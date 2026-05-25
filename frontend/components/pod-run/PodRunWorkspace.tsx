'use client';
// PodRunWorkspace — the surface that replaces the Playground.
//
// Three regions stacked top-to-bottom:
//   1. Input picker — pick from book, drag a document, or try a sample.
//   2. Streaming timeline — agent reasoning as it executes, step by step.
//   3. Output — pod-specific structured renderer, plus action footer.
// Right rail: recent runs for this pod.

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sparkles, Upload, Search, Briefcase, FileText, Loader2,
  CheckCircle2, AlertTriangle, Circle, Clock, RotateCcw,
  type LucideIcon,
} from "lucide-react";

import type { RunInput, RunRecord, RunStep } from "./types";
import { startRun } from "./runEngine";
import { getSampleForPod } from "./samples";
import { runPod } from "@/lib/pods";
import { OUTPUT_RENDERERS } from "./outputRenderers";
import { cn } from "@/lib/utils";

// ───────────────────────── helpers ─────────────────────────

const STEP_ICON: Record<RunStep["status"], LucideIcon> = {
  pending: Circle,
  running: Loader2,
  done:    CheckCircle2,
  warning: AlertTriangle,
  error:   AlertTriangle,
};

const STEP_TONE: Record<RunStep["status"], string> = {
  pending: "text-muted-foreground/50 bg-muted/40 border-border",
  running: "text-primary bg-accent border-primary/40",
  done:    "text-success bg-success/10 border-success/30",
  warning: "text-warning-foreground/85 bg-warning/10 border-warning/40",
  error:   "text-destructive bg-destructive/10 border-destructive/40",
};

// ───────────────────────── component ─────────────────────────

interface PodRunWorkspaceProps {
  podId: string;
  podName: string;
}

export default function PodRunWorkspace({ podId, podName }: PodRunWorkspaceProps) {
  const { toast } = useToast();
  const [inputMode, setInputMode] = useState<"sample" | "book" | "document">("sample");
  const [selectedInput, setSelectedInput] = useState<RunInput | null>(null);
  const [pickQuery, setPickQuery] = useState("");

  // Current run state
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [output, setOutput] = useState<any | null>(null);
  const [confidence, setConfidence] = useState<number | undefined>();
  const [status, setStatus] = useState<"idle" | "streaming" | "complete" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  // Recent runs (in-memory for now — would be persisted later)
  const [recent, setRecent] = useState<RunRecord[]>([]);

  // Active run cleanup
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  // Mock book — would be loaded from AMS connector
  const mockBook = useMemo(() => [
    { id: "acme-manufacturing", name: "ACME Manufacturing, Inc.",   sublabel: "WC + GL · Travelers" },
    { id: "riverside-logistics", name: "Riverside Logistics",        sublabel: "Auto · Progressive" },
    { id: "pinecrest-restaurants", name: "Pinecrest Restaurants",   sublabel: "Property + GL · Liberty" },
    { id: "summit-trucking",       name: "Summit Trucking",          sublabel: "Auto · Progressive" },
    { id: "hilltop-construction",  name: "Hilltop Construction",     sublabel: "WC · Zurich" },
    { id: "coastal-marina",        name: "Coastal Marina",           sublabel: "GL · Hartford" },
    { id: "brookside-auto-body",   name: "Brookside Auto Body",      sublabel: "GL · Travelers" },
  ], []);

  const filteredBook = pickQuery
    ? mockBook.filter((b) => b.name.toLowerCase().includes(pickQuery.toLowerCase()))
    : mockBook;

  const sample = getSampleForPod(podId);
  const Renderer = OUTPUT_RENDERERS[podId] ?? null;

  // ───────────── run lifecycle ─────────────

  const launchRun = (input: RunInput) => {
    if (!sample) {
      toast({ title: "No sample available for this pod yet.", variant: "destructive" });
      return;
    }
    cancelRef.current?.();
    setSelectedInput(input);
    setOutput(null);
    setConfidence(undefined);
    setError(null);
    // Reset step list from sample template
    setSteps(sample.steps.map((s) => ({ ...s, status: "pending", startedAt: undefined, finishedAt: undefined })));
    setStatus("streaming");

    cancelRef.current = startRun(podId, input, {
      onStepUpdate: (idx, patch) => {
        setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
      },
      onComplete: (out, conf) => {
        setOutput(out);
        setConfidence(conf);
        setStatus("complete");
        // Persist a real pod_run when this pod is installed (no-op otherwise),
        // so dashboards / review queue read from real execution data. The rich
        // demo output above is kept for display while pod internals are stubbed.
        void runPod(podId, { label: input.label, payload: input.payload ?? {} }, "ui").catch(() => {});
        // Add to recent
        const rec: RunRecord = {
          id: crypto.randomUUID(),
          podId,
          input,
          steps: [],
          output: out,
          confidence: conf,
          status: "complete",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
        setRecent((p) => [rec, ...p].slice(0, 8));
      },
      onError: (msg) => {
        setError(msg);
        setStatus("failed");
      },
    });
  };

  const handleSample = () => {
    if (!sample) return;
    launchRun(sample.input);
  };

  const handlePickAccount = (acct: typeof mockBook[number]) => {
    launchRun({
      kind: "account",
      label: acct.name,
      sublabel: acct.sublabel,
      payload: { account: acct.id },
    });
  };

  const handleDocument = (file: File) => {
    launchRun({
      kind: "document",
      label: file.name,
      sublabel: `${Math.round(file.size / 1024)} KB · ${file.type || "unknown"}`,
      payload: { fileName: file.name },
    });
  };

  const handleReset = () => {
    cancelRef.current?.();
    setStatus("idle");
    setSteps([]);
    setOutput(null);
    setConfidence(undefined);
    setSelectedInput(null);
    setError(null);
  };

  // ───────────── render ─────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-4 min-w-0">
        {/* 1. Input region (only when idle) */}
        {status === "idle" && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow shrink-0">
                <Sparkles className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-[15px] font-bold text-foreground tracking-tight">Run {podName}</h2>
                <p className="text-[11.5px] text-muted-foreground">Pick a case. The agent works in the background. Outputs land in your AMS.</p>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex items-center gap-1 px-5 pt-3">
              <ModeTab icon={Sparkles}  label="Try a sample"     active={inputMode === "sample"}   onClick={() => setInputMode("sample")} />
              <ModeTab icon={Briefcase} label="Pick from book"   active={inputMode === "book"}     onClick={() => setInputMode("book")} />
              <ModeTab icon={Upload}    label="Drag a document"  active={inputMode === "document"} onClick={() => setInputMode("document")} />
            </div>

            {/* Mode content */}
            <div className="p-5">
              {inputMode === "sample" && (
                <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-accent/30 p-5">
                  <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground">{sample?.input.label ?? "No sample available"}</p>
                    {sample?.input.sublabel && <p className="text-[11.5px] text-muted-foreground mt-0.5">{sample.input.sublabel}</p>}
                    <p className="text-[12px] text-foreground/75 mt-2 leading-relaxed">
                      A pre-loaded case that walks the agent through realistic execution — perfect for demos or first runs.
                    </p>
                  </div>
                  <Button variant="primary" size="lg" onClick={handleSample} disabled={!sample}>
                    <Sparkles className="h-4 w-4" />Run sample
                  </Button>
                </div>
              )}

              {inputMode === "book" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={pickQuery}
                      onChange={(e) => setPickQuery(e.target.value)}
                      placeholder="Search your book…"
                      className="pl-9 h-9"
                    />
                  </div>
                  <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {filteredBook.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No accounts match.</p>
                    ) : (
                      filteredBook.map((acct) => (
                        <button
                          key={acct.id}
                          onClick={() => handlePickAccount(acct)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/40 transition-colors group"
                        >
                          <div className="h-8 w-8 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Briefcase className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{acct.name}</p>
                            <p className="text-[11.5px] text-muted-foreground truncate">{acct.sublabel}</p>
                          </div>
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {inputMode === "document" && (
                <label className="flex flex-col items-center justify-center gap-3 px-5 py-12 rounded-xl border-2 border-dashed border-border bg-muted/20 cursor-pointer hover:bg-muted/40 hover:border-primary/40 transition-colors">
                  <div className="h-12 w-12 rounded-xl bg-accent text-primary flex items-center justify-center">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13.5px] font-semibold text-foreground">Drag a document here</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">PDFs, emails, ACORDs, screenshots — Fideon handles parsing</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.eml"
                    onChange={(e) => e.target.files?.[0] && handleDocument(e.target.files[0])}
                  />
                </label>
              )}
            </div>
          </Card>
        )}

        {/* Active input chip + reset (when not idle) */}
        {status !== "idle" && selectedInput && (
          <Card className="px-4 py-3 flex items-center gap-3 bg-accent/20">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              {selectedInput.kind === "sample"   && <Sparkles  className="h-4 w-4" />}
              {selectedInput.kind === "account"  && <Briefcase className="h-4 w-4" />}
              {selectedInput.kind === "document" && <FileText  className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate">{selectedInput.label}</p>
              {selectedInput.sublabel && <p className="text-[11.5px] text-muted-foreground truncate">{selectedInput.sublabel}</p>}
            </div>
            <StatusPill
              tone={status === "streaming" ? "primary" : status === "complete" ? "success" : status === "failed" ? "danger" : "neutral"}
              dot
              pulse={status === "streaming"}
              size="sm"
            >
              {status === "streaming" ? "Running…" : status === "complete" ? "Complete" : status === "failed" ? "Failed" : "Idle"}
            </StatusPill>
            <Button variant="ghost" size="xs" onClick={handleReset}>
              <RotateCcw className="h-3 w-3" />New run
            </Button>
          </Card>
        )}

        {/* 2. Streaming timeline */}
        {(status === "streaming" || status === "complete" || status === "failed") && steps.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-[13px] font-semibold text-foreground">Agent reasoning</p>
              <span className="text-[11.5px] text-muted-foreground">
                · {steps.filter((s) => s.status === "done").length} of {steps.length} steps
              </span>
            </div>
            <ol className="p-5 space-y-3">
              {steps.map((step, idx) => {
                const Icon = STEP_ICON[step.status];
                const isRunning = step.status === "running";
                return (
                  <li key={step.id} className="flex items-start gap-3 animate-fade-in-fast">
                    <div className={cn(
                      "h-8 w-8 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      STEP_TONE[step.status],
                    )}>
                      <Icon className={cn("h-4 w-4", isRunning && "animate-spin")} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className={cn(
                        "text-[13px] font-semibold leading-tight transition-colors",
                        step.status === "pending" ? "text-muted-foreground/60" :
                        step.status === "running" ? "text-foreground" :
                        "text-foreground",
                      )}>
                        {idx + 1}. {step.title}
                      </p>
                      {step.detail && step.status !== "pending" && (
                        <p className="text-[11.5px] text-muted-foreground mt-0.5">{step.detail}</p>
                      )}
                      {step.data && step.status === "done" && (
                        <div className="mt-1.5 inline-flex flex-wrap gap-1.5">
                          {Object.entries(step.data).map(([k, v]) => (
                            <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[10.5px] text-foreground/85 font-mono">
                              <span className="text-muted-foreground">{k}:</span> {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {error && (
          <Card className="px-4 py-3 bg-destructive/5 border-destructive/30">
            <p className="text-[12.5px] text-destructive font-medium">{error}</p>
          </Card>
        )}

        {/* 3. Output */}
        {status === "complete" && output && Renderer && (
          <Renderer
            output={output}
            confidence={confidence}
            onFileToAms={() => { toast({ title: "Filed in your AMS", description: "Output written to the account record." }); handleReset(); }}
            onSendToReview={() => { toast({ title: "Sent to Review Queue", description: "Awaiting human approval." }); handleReset(); }}
            onDiscard={() => { toast({ title: "Run discarded" }); handleReset(); }}
          />
        )}

        {status === "complete" && output && !Renderer && (
          <Card className="p-5">
            <p className="text-[12.5px] text-muted-foreground">No structured renderer for this pod yet.</p>
            <pre className="mt-2 text-[11px] text-foreground/75 whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(output, null, 2)}
            </pre>
          </Card>
        )}
      </div>

      {/* Right rail: recent runs */}
      <aside className="space-y-4 min-w-0">
        <Card>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <p className="text-[13px] font-semibold text-foreground">Recent runs</p>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No runs yet"
              description="Your past runs will show up here for quick re-open."
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">{r.input.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {typeof r.confidence === "number" && (
                      <> · {Math.round(r.confidence * 100)}%</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}

// ───────────────────────── ModeTab ─────────────────────────

function ModeTab({
  icon: Icon, label, active, onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[12.5px] font-semibold transition-colors",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
