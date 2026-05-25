'use client';
import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play, Pause, RotateCcw, CheckCircle2, Loader2, Clock, Cpu,
  Sparkles, Zap, Activity, ArrowRight, Terminal, FileText,
  Building2, FolderOpen, Shield, BarChart3, TrendingDown, TrendingUp,
  ShieldCheck, Database, Download, FileCheck2, Layers, Lock, Wifi,
} from "lucide-react";
import { LOSS_RUN_DATA, PORTFOLIO_SUMMARY, type CarrierLossRun } from "./runtime/lossRunData";

interface PipelineStep {
  id: string;
  agent_id: string;
  agent_name: string;
  config: Record<string, any>;
  pass_output: boolean;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
}

interface WorkflowRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  /** Called once when the run animation finishes — used by the parent
   *  page to seed Approvals queue items and update last_run_at. */
  onComplete?: (workflow: Workflow) => void;
}

type StepStatus = "pending" | "running" | "complete";

interface LogEntry {
  ts: string;
  stepIdx: number;
  message: string;
  type: "info" | "action" | "success" | "data" | "carrier";
  carrier?: string;
  phase?: number;
}

const AGENT_ICONS: Record<string, any> = {
  "document-retrieval": FolderOpen,
  "policy-comparison": FileText,
  "quote-generation": Sparkles,
  "claims-fnol": Activity,
  "loss-run-reporting": BarChart3,
  "acord-parser": FileText,
  "carrier-submission-intake": Building2,
  "carrier-claims-adjudication": Shield,
  "carrier-fraud-detection": Shield,
  "carrier-subrogation": Shield,
  "custom-workflow": Zap,
};

// ───────────────────────────────────────────────────────────────────
// Narration scripts — drive both logs and visual carrier panel state
// ───────────────────────────────────────────────────────────────────
type ScriptStep = {
  msg: string;
  type: LogEntry["type"];
  delay?: number;
  carrier?: string;
  effect?: "carrier-connect" | "carrier-fetch" | "carrier-attach" | "kpi" | "report-ready" | "phase";
  phase?: number;
};

// Business-friendly phase tracker for Document Retrieval
const DOC_PHASES: { id: number; label: string; sublabel: string; explanation: string; Icon: any }[] = [
  { id: 0, label: "Sign in",           sublabel: "Connect to carrier portals",      Icon: Lock,
    explanation: "The agent uses the agency's saved (encrypted) credentials to log into each carrier's website — just like a CSR would, but in parallel across every carrier at once. Multi-factor prompts are handled automatically." },
  { id: 1, label: "Find documents",    sublabel: "Search every carrier portal",     Icon: FolderOpen,
    explanation: "For each carrier, the agent navigates the portal and locates every document type you asked for (renewals, dec pages, invoices, etc.) tied to your agency's book of business." },
  { id: 2, label: "Download & verify", sublabel: "Pull files & confirm integrity",  Icon: Download,
    explanation: "The files are downloaded over a secure channel and checked to make sure none are corrupted or partial before being processed." },
  { id: 3, label: "Read & extract",    sublabel: "Pull out policy #, dates, $$",    Icon: FileCheck2,
    explanation: "Each document is read by the AI to pull out the key details — policy numbers, effective dates, premium amounts, named insured — with a confidence score so you know what to trust." },
  { id: 4, label: "File in AMS",       sublabel: "Attach to Applied Epic",          Icon: Database,
    explanation: "Every extracted document is matched to the right client and policy folder in Applied Epic and filed automatically, so your team can find it instantly." },
];

// Friendly labels for document types selected by the user
const DOC_TYPE_LABELS: Record<string, string> = {
  "policy-renewal": "Renewal Policies",
  "cancellation": "Cancellation Notices",
  "endorsement": "Endorsements",
  "memo": "Carrier Memos",
  "invoice": "Invoices",
  "certificate": "Certificates of Insurance",
  "dec-page": "Declaration Pages",
  "loss-run": "Loss Run Reports",
};

const DOC_TYPE_SINGULAR: Record<string, string> = {
  "policy-renewal": "renewal policy",
  "cancellation": "cancellation notice",
  "endorsement": "endorsement",
  "memo": "memo",
  "invoice": "invoice",
  "certificate": "certificate",
  "dec-page": "declaration page",
  "loss-run": "loss run report",
};

// Deterministic per-carrier doc count for a given doc type (1–3, stable per carrier+type)
function docCountFor(carrierShort: string, docType: string): number {
  let h = 0;
  const s = `${carrierShort}::${docType}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % 3);
}

export function buildDocPlan(selectedDocTypes: string[]): Record<string, { total: number; perType: { type: string; label: string; count: number }[] }> {
  const plan: Record<string, { total: number; perType: { type: string; label: string; count: number }[] }> = {};
  LOSS_RUN_DATA.forEach((c) => {
    const perType = selectedDocTypes.map((dt) => ({
      type: dt,
      label: DOC_TYPE_LABELS[dt] || dt,
      count: docCountFor(c.carrierShort, dt),
    }));
    plan[c.carrierShort] = { total: perType.reduce((s, t) => s + t.count, 0), perType };
  });
  return plan;
}

function getScriptFor(agentId: string, config: any): ScriptStep[] {
  if (agentId === "document-retrieval") {
    const carriers = LOSS_RUN_DATA;
    const selectedDocTypes: string[] = (config?.documentTypes && config.documentTypes.length > 0)
      ? config.documentTypes
      : ["policy-renewal", "dec-page", "invoice"];
    const docLabels = selectedDocTypes.map((id) => DOC_TYPE_LABELS[id] || id);
    const docList = docLabels.length <= 2
      ? docLabels.join(" and ")
      : `${docLabels.slice(0, -1).join(", ")}, and ${docLabels[docLabels.length - 1]}`;
    const plan = buildDocPlan(selectedDocTypes);

    const agencyName = "Every Insurance Agency";

    const steps: ScriptStep[] = [
      { msg: `▶ Starting document retrieval for ${agencyName} · ${carriers.length} carriers · ${docLabels.length} document type${docLabels.length === 1 ? "" : "s"}`, type: "info", delay: 700 },
    ];

    // ── PHASE 1: Sign in ───────────────────────────────────────────
    steps.push({ msg: `━━━ STEP 1 of 5 · Sign in to carrier portals ━━━`, type: "info", effect: "phase", phase: 0, delay: 900 });
    steps.push({ msg: `🔐 Using ${agencyName}'s saved credentials (encrypted vault)`, type: "action", phase: 0, delay: 900 });
    steps.push({ msg: `🛰  Opening secure connection to ${carriers.length} carrier websites`, type: "action", phase: 0, delay: 1100 });
    carriers.forEach((c) => {
      steps.push({ msg: `→ ${c.carrier}: opening agent portal`, type: "action", carrier: c.carrierShort, phase: 0, effect: "carrier-connect", delay: 1100 });
      steps.push({ msg: `   ${c.carrier}: signing in · multi-factor approved`, type: "action", carrier: c.carrierShort, phase: 0, delay: 900 });
      steps.push({ msg: `✓ ${c.carrier}: signed in · agency book of business loaded`, type: "success", carrier: c.carrierShort, phase: 0, delay: 700 });
    });

    // ── PHASE 2: Find documents ────────────────────────────────────
    steps.push({ msg: `━━━ STEP 2 of 5 · Find requested documents ━━━`, type: "info", effect: "phase", phase: 1, delay: 900 });
    steps.push({ msg: `📋 Looking for: ${docList}`, type: "action", phase: 1, delay: 1000 });
    carriers.forEach((c) => {
      const carrierPlan = plan[c.carrierShort].perType;
      const total = plan[c.carrierShort].total;
      steps.push({ msg: `→ ${c.carrier}: searching ${agencyName}'s policies`, type: "action", carrier: c.carrierShort, phase: 1, delay: 900 });
      carrierPlan.forEach((entry) => {
        const singular = DOC_TYPE_SINGULAR[entry.type] || "document";
        steps.push({ msg: `   ${c.carrier}: found ${entry.count} ${entry.count === 1 ? singular : singular + "s"} in "${entry.label}"`, type: "data", carrier: c.carrierShort, phase: 1, delay: 800 });
      });
      steps.push({ msg: `✓ ${c.carrier}: ${total} document${total === 1 ? "" : "s"} located`, type: "success", carrier: c.carrierShort, phase: 1, delay: 700 });
    });

    // ── PHASE 3: Download & verify ─────────────────────────────────
    steps.push({ msg: `━━━ STEP 3 of 5 · Download & verify files ━━━`, type: "info", effect: "phase", phase: 2, delay: 900 });
    carriers.forEach((c) => {
      const total = plan[c.carrierShort].total;
      steps.push({ msg: `⬇ ${c.carrier}: downloading ${total} file${total === 1 ? "" : "s"}...`, type: "action", carrier: c.carrierShort, phase: 2, effect: "carrier-fetch", delay: 1300 });
      steps.push({ msg: `   ${c.carrier}: file integrity verified · no corruption detected`, type: "data", carrier: c.carrierShort, phase: 2, delay: 800 });
      steps.push({ msg: `✓ ${c.carrier}: ${total} file${total === 1 ? "" : "s"} downloaded safely`, type: "success", carrier: c.carrierShort, phase: 2, delay: 700 });
    });

    // ── PHASE 4: Read & extract ────────────────────────────────────
    steps.push({ msg: `━━━ STEP 4 of 5 · Read documents & pull out key details ━━━`, type: "info", effect: "phase", phase: 3, delay: 900 });
    carriers.forEach((c) => {
      const total = plan[c.carrierShort].total;
      steps.push({ msg: `📖 ${c.carrier}: reading ${total} document${total === 1 ? "" : "s"} · extracting policy #, dates, amounts`, type: "action", carrier: c.carrierShort, phase: 3, delay: 1200 });
      steps.push({ msg: `✓ ${c.carrier}: details verified · ${(94 + Math.random() * 5).toFixed(1)}% match accuracy`, type: "success", carrier: c.carrierShort, phase: 3, delay: 700 });
    });

    // ── PHASE 5: File in AMS ───────────────────────────────────────
    steps.push({ msg: `━━━ STEP 5 of 5 · File documents in your AMS ━━━`, type: "info", effect: "phase", phase: 4, delay: 900 });
    steps.push({ msg: `🔌 Connecting to Applied Epic`, type: "action", phase: 4, delay: 1000 });
    steps.push({ msg: `   matching each document to the right client and policy folder`, type: "action", phase: 4, delay: 1000 });
    carriers.forEach((c) => {
      steps.push({ msg: `📎 ${c.carrier}: filing under ${agencyName} · policy ${c.policyNumber}`, type: "data", carrier: c.carrierShort, phase: 4, effect: "carrier-attach", delay: 1100 });
      steps.push({ msg: `✓ ${c.carrier}: filed in AMS · ready to search`, type: "success", carrier: c.carrierShort, phase: 4, delay: 600 });
    });
    steps.push({ msg: `🧾 Activity log saved (timestamps + sources for every document)`, type: "action", phase: 4, delay: 800 });
    steps.push({ msg: `🛡  Signed out of all carrier portals safely`, type: "action", phase: 4, delay: 700 });
    steps.push({ msg: `✅ All done · documents from ${carriers.length} carriers filed in your AMS · 97.2% average accuracy`, type: "success", phase: 4, delay: 800 });
    return steps;
  }

  if (agentId === "loss-run-reporting") {
    return [
      { msg: `📊 Loading ${LOSS_RUN_DATA.length} loss runs from Document Retrieval output...`, type: "action", delay: 600 },
      { msg: `🔍 Aggregating claims across ${PORTFOLIO_SUMMARY.carriers} carriers · ${PORTFOLIO_SUMMARY.insureds} insureds`, type: "action", delay: 600 },
      ...LOSS_RUN_DATA.map((c) => ({
        msg: `→ ${c.carrier} · ${c.insured.split(/[—,]/)[0].trim()}: ${c.totalClaims} claims · ${c.policyType} · ${c.lookbackYears}yr lookback`,
        type: "data" as const,
        carrier: c.carrierShort,
        effect: "kpi" as const,
        delay: 500,
      })),
      { msg: `📈 Computing loss ratio · frequency · severity trend...`, type: "action", delay: 700 },
      { msg: `💎 Loss ratio: ${PORTFOLIO_SUMMARY.lossRatio}% · ${PORTFOLIO_SUMMARY.totalClaims} claims · $${PORTFOLIO_SUMMARY.totalIncurred.toLocaleString()} incurred`, type: "data", delay: 500 },
      { msg: `📑 Generating underwriter PDF · renewal summary · Excel pivot...`, type: "action", delay: 700 },
      { msg: `✅ Renewal package compiled · ${PORTFOLIO_SUMMARY.cleanInsureds}/${LOSS_RUN_DATA.length} clean · recommendation: ${PORTFOLIO_SUMMARY.recommendation}`, type: "success", effect: "report-ready", delay: 500 },
    ];
  }

  // generic fallback
  return [
    { msg: `Initializing agent...`, type: "action", delay: 400 },
    { msg: `Processing input from previous step...`, type: "action", delay: 600 },
    { msg: `Generating output...`, type: "data", delay: 600 },
    { msg: `✓ Step complete`, type: "success", delay: 400 },
  ];
}

// ───────────────────────────────────────────────────────────────────
// Carrier panel — visualizes live state per carrier
// ───────────────────────────────────────────────────────────────────
type CarrierState = "idle" | "connecting" | "connected" | "fetching" | "fetched" | "attaching" | "attached";

const CARRIER_STATE_LABEL: Record<CarrierState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Authenticated",
  fetching: "Pulling docs…",
  fetched: "Extracted",
  attaching: "Syncing AMS…",
  attached: "✓ In Applied Epic",
};

function CarrierTile({ carrier, state, mode = "docs", docCount }: { carrier: CarrierLossRun; state: CarrierState; mode?: "docs" | "claims"; docCount?: number }) {
  const displayName = mode === "docs" ? "Every Insurance Agency" : carrier.insured.split(/[—+]/)[0].trim();
  const active = state !== "idle";
  const done = state === "attached";
  return (
    <motion.div
      layout
      className={`relative rounded-lg border p-2 overflow-hidden transition-all ${
        done
          ? "border-emerald-500/40 bg-emerald-500/5"
          : active
            ? "border-primary/40 bg-primary/5 shadow-md shadow-primary/10"
            : "border-border bg-background"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${carrier.color} opacity-40 pointer-events-none`} />
      <div className="relative z-10 flex items-center justify-between gap-1.5 mb-1.5">
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
          done ? "bg-emerald-500/15 text-emerald-700" : "bg-primary/10 text-primary"
        }`}>
          {carrier.carrierShort}
        </span>
        <div className="flex-shrink-0">
          {state === "idle" && <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />}
          {(state === "connecting" || state === "fetching" || state === "attaching") && (
            <Loader2 className="h-3 w-3 text-primary animate-spin" />
          )}
          {(state === "connected" || state === "fetched") && (
            <Wifi className="h-3 w-3 text-primary" />
          )}
          {state === "attached" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
        </div>
      </div>
      <div className="relative z-10 min-w-0">
        <p className="text-[11px] font-bold truncate leading-tight">{carrier.carrier}</p>
        <p className="text-[9px] text-muted-foreground truncate mt-0.5">{displayName}</p>
      </div>
      <div className="relative z-10 mt-1.5 pt-1.5 border-t border-border/50">
        <p className={`text-[9px] font-semibold ${
          done ? "text-emerald-700" : active ? "text-primary" : "text-muted-foreground"
        }`}>
          {CARRIER_STATE_LABEL[state]}
        </p>
        {(state === "fetched" || state === "attaching" || state === "attached") && (
          <p className="text-[9px] font-mono text-muted-foreground mt-0.5">
            {mode === "claims"
              ? `${carrier.totalClaims} clm · $${(carrier.totalIncurred / 1000).toFixed(0)}K`
              : `${docCount ?? 0} doc${docCount === 1 ? "" : "s"} retrieved`}
          </p>
        )}
      </div>
      {active && !done && (
        <motion.div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/15">
          <motion.div
            className="h-full w-1/3 bg-primary"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = display;
    const diff = value - start;
    const duration = 800;
    const startTime = performance.now();
    let frame: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startTime) / duration);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="font-mono tabular-nums">{prefix}{display.toLocaleString()}{suffix}</span>;
}

export default function WorkflowRunDialog({ open, onOpenChange, workflow, onComplete }: WorkflowRunDialogProps) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [completed, setCompleted] = useState(false);
  const completionDispatchedRef = useRef(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [carrierStates, setCarrierStates] = useState<Record<string, CarrierState>>({});
  const [kpiVisible, setKpiVisible] = useState(0); // # of carrier KPIs revealed in loss-run step
  const [reportReady, setReportReady] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<number>(-1); // -1 = not started, 0..4 = doc-retrieval phases
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const hasDocRetrieval = useMemo(
    () => workflow?.steps.some((s) => s.agent_id === "document-retrieval") ?? false,
    [workflow]
  );
  const hasLossRun = useMemo(
    () => workflow?.steps.some((s) => s.agent_id === "loss-run-reporting") ?? false,
    [workflow]
  );
  const docPlan = useMemo(() => {
    const docStep = workflow?.steps.find((s) => s.agent_id === "document-retrieval");
    const types: string[] = (docStep?.config?.documentTypes && docStep.config.documentTypes.length > 0)
      ? docStep.config.documentTypes
      : ["policy-renewal", "dec-page", "invoice"];
    return buildDocPlan(types);
  }, [workflow]);
  const totalDocsPlanned = useMemo(
    () => Object.values(docPlan).reduce((s, p) => s + p.total, 0),
    [docPlan]
  );
  const computeLiveDocs = (states: Record<string, CarrierState>) =>
    LOSS_RUN_DATA.reduce((s, c) => {
      const st = states[c.carrierShort];
      return st === "fetched" || st === "attaching" || st === "attached" ? s + (docPlan[c.carrierShort]?.total ?? 0) : s;
    }, 0);

  // Reset on open/close
  useEffect(() => {
    if (open && workflow) {
      setRunning(false);
      setPaused(false);
      setCurrentStep(0);
      setStepStatuses(workflow.steps.map(() => "pending"));
      setLogs([]);
      setCompleted(false);
      setStartTime(null);
      setElapsed(0);
      setCarrierStates(Object.fromEntries(LOSS_RUN_DATA.map((c) => [c.carrierShort, "idle" as CarrierState])));
      setKpiVisible(0);
      setReportReady(false);
      setCurrentPhase(-1);
      completionDispatchedRef.current = false;
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [open, workflow]);

  // Elapsed timer
  useEffect(() => {
    if (running && !paused && startTime) {
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 250);
      return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    }
  }, [running, paused, startTime]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  // Execution engine
  useEffect(() => {
    if (!running || paused || !workflow || completed) return;
    if (currentStep >= workflow.steps.length) {
      setCompleted(true);
      setRunning(false);
      // Fire the parent completion hook once per run — used to seed
      // Approvals decision_reviews + update last_run_at.
      if (!completionDispatchedRef.current) {
        completionDispatchedRef.current = true;
        try { onComplete?.(workflow); } catch (e) { console.warn("[WorkflowRunDialog] onComplete failed:", e); }
      }
      return;
    }

    const step = workflow.steps[currentStep];
    const script = getScriptFor(step.agent_id, step.config);

    setStepStatuses((prev) => prev.map((s, i) => (i === currentStep ? "running" : s)));

    let lineIdx = 0;
    let timeoutId: number;
    const runLine = () => {
      if (lineIdx >= script.length) {
        setStepStatuses((prev) => prev.map((s, i) => (i === currentStep ? "complete" : s)));
        setLogs((prev) => [...prev, {
          ts: new Date().toLocaleTimeString(),
          stepIdx: currentStep,
          message: `✓ Step ${currentStep + 1} (${step.agent_name}) finished`,
          type: "success",
        }]);
        setTimeout(() => setCurrentStep((p) => p + 1), 600);
        return;
      }
      const line = script[lineIdx];
      setLogs((prev) => [...prev, {
        ts: new Date().toLocaleTimeString(),
        stepIdx: currentStep,
        message: line.msg,
        type: line.type,
        carrier: line.carrier,
        phase: line.phase,
      }]);

      // Side effects
      if (line.effect === "carrier-connect" && line.carrier) {
        setCarrierStates((p) => ({ ...p, [line.carrier!]: "connecting" }));
        setTimeout(() => setCarrierStates((p) => ({ ...p, [line.carrier!]: "connected" })), 350);
      } else if (line.effect === "carrier-fetch" && line.carrier) {
        setCarrierStates((p) => ({ ...p, [line.carrier!]: "fetching" }));
        setTimeout(() => setCarrierStates((p) => ({ ...p, [line.carrier!]: "fetched" })), 400);
      } else if (line.effect === "carrier-attach" && line.carrier) {
        setCarrierStates((p) => ({ ...p, [line.carrier!]: "attaching" }));
        setTimeout(() => setCarrierStates((p) => ({ ...p, [line.carrier!]: "attached" })), 400);
      } else if (line.effect === "kpi") {
        setKpiVisible((p) => p + 1);
      } else if (line.effect === "report-ready") {
        setReportReady(true);
      } else if (line.effect === "phase" && typeof line.phase === "number") {
        setCurrentPhase(line.phase);
      }

      lineIdx++;
      timeoutId = window.setTimeout(runLine, line.delay ?? 600);
    };
    timeoutId = window.setTimeout(runLine, 350);
    return () => window.clearTimeout(timeoutId);
  }, [currentStep, running, paused, workflow, completed]);

  if (!workflow) return null;

  const start = () => {
    setRunning(true);
    setPaused(false);
    setStartTime(Date.now());
    setLogs([{
      ts: new Date().toLocaleTimeString(),
      stepIdx: -1,
      message: `▶ Workflow "${workflow.name}" started · ${workflow.steps.length} agents · agency: ${PORTFOLIO_SUMMARY.agency}`,
      type: "info",
    }]);
  };

  const reset = () => {
    setRunning(false);
    setPaused(false);
    setCurrentStep(0);
    setStepStatuses(workflow.steps.map(() => "pending"));
    setLogs([]);
    setCompleted(false);
    setStartTime(null);
    setElapsed(0);
    setCarrierStates(Object.fromEntries(LOSS_RUN_DATA.map((c) => [c.carrierShort, "idle" as CarrierState])));
    setKpiVisible(0);
    setReportReady(false);
    setCurrentPhase(-1);
    completionDispatchedRef.current = false;
  };

  const progress = workflow.steps.length === 0
    ? 0
    : Math.round((stepStatuses.filter((s) => s === "complete").length / workflow.steps.length) * 100);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Aggregate stats based on what's been "fetched"
  const fetchedCarriers = LOSS_RUN_DATA.filter((c) => {
    const st = carrierStates[c.carrierShort];
    return st === "fetched" || st === "attaching" || st === "attached";
  });
  const liveTotalClaims = fetchedCarriers.reduce((s, c) => s + c.totalClaims, 0);
  const liveTotalIncurred = fetchedCarriers.reduce((s, c) => s + c.totalIncurred, 0);
  const liveAttached = LOSS_RUN_DATA.filter((c) => carrierStates[c.carrierShort] === "attached").length;
  const liveDocsRetrieved = computeLiveDocs(carrierStates);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[94vh] overflow-hidden p-0 gap-0 bg-background">
        {/* HERO HEADER */}
        <div className="relative overflow-hidden border-b border-border">
          {/* layered gradient + grid background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-primary/8 blur-3xl" />

          <div className="relative z-10 p-6 pb-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <motion.div
                  animate={running ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow ring-1 ring-primary/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/30"
                >
                  {running ? (
                    <Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
                  ) : completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <Zap className="h-5 w-5 text-primary-foreground" />
                  )}
                </motion.div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                      Live Workflow Execution
                    </span>
                    {running && !paused && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        LIVE
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight truncate">{workflow.name}</h2>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="font-medium">{PORTFOLIO_SUMMARY.agency}</span>
                    <span>·</span>
                    <span>{workflow.steps.length} agents</span>
                    <span>·</span>
                    <span>{LOSS_RUN_DATA.length} carriers</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!running && !completed && (
                  <Button onClick={start} size="sm" className="gap-1.5 shadow-lg shadow-primary/30 bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                    <Play className="h-3.5 w-3.5" /> Run Workflow
                  </Button>
                )}
                {running && (
                  <Button onClick={() => setPaused((p) => !p)} size="sm" variant="outline" className="gap-1.5 bg-background/80 backdrop-blur">
                    {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
                  </Button>
                )}
                {(running || completed) && (
                  <Button onClick={reset} size="sm" variant="ghost" className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
            </div>

            {/* LIVE KPI STRIP */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              {(hasLossRun
                ? [
                    { label: "Carriers Connected", icon: Wifi, value: Object.values(carrierStates).filter((s) => s !== "idle").length, max: LOSS_RUN_DATA.length },
                    { label: "Docs Retrieved", icon: FileCheck2, value: fetchedCarriers.length, max: LOSS_RUN_DATA.length },
                    { label: "Claims Aggregated", icon: Database, value: liveTotalClaims },
                    { label: "Attached to AMS", icon: Layers, value: liveAttached, max: LOSS_RUN_DATA.length },
                  ]
                : [
                    { label: "Carriers Connected", icon: Wifi, value: Object.values(carrierStates).filter((s) => s !== "idle").length, max: LOSS_RUN_DATA.length },
                    { label: "Portals Completed", icon: FileCheck2, value: fetchedCarriers.length, max: LOSS_RUN_DATA.length },
                    { label: "Documents Retrieved", icon: Database, value: liveDocsRetrieved, max: totalDocsPlanned },
                    { label: "Filed in AMS", icon: Layers, value: liveAttached, max: LOSS_RUN_DATA.length },
                  ]
              ).map((kpi: any) => (
                <div key={kpi.label} className="rounded-xl border border-border bg-background/60 backdrop-blur p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <kpi.icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold tracking-tight">
                      <AnimatedCounter value={kpi.value} suffix={kpi.suffix ?? ""} />
                    </span>
                    {kpi.max !== undefined && (
                      <span className="text-xs text-muted-foreground">/ {kpi.max}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* PROGRESS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground font-medium">
                  {completed ? "All agents completed successfully" : running ? `Executing step ${currentStep + 1} of ${workflow.steps.length}` : "Click Run to start"}
                </span>
                <span className="font-mono font-bold text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="flex flex-col overflow-hidden" style={{ maxHeight: "calc(94vh - 280px)" }}>
          {/* TOP STRIP — horizontal pipeline + carrier portals */}
          <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-3 flex-shrink-0">
            {/* Pipeline chips (horizontal) */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Workflow · {workflow.steps.length} agents
              </p>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {workflow.steps.map((step, idx) => {
                  const Icon = AGENT_ICONS[step.agent_id] || Zap;
                  const status = stepStatuses[idx];
                  return (
                    <div key={step.id} className="flex items-center gap-1.5 flex-shrink-0">
                      <motion.div
                        layout
                        className={`relative flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
                          status === "running"
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-md shadow-primary/20"
                            : status === "complete"
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-border bg-background"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          status === "running" ? "bg-primary/20"
                            : status === "complete" ? "bg-emerald-500/20"
                              : "bg-muted"
                        }`}>
                          {status === "running" ? (
                            <Loader2 className="h-3 w-3 text-primary animate-spin" />
                          ) : status === "complete" ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Icon className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <span className={`text-[11px] font-semibold whitespace-nowrap ${
                          status === "running" ? "text-primary"
                            : status === "complete" ? "text-emerald-700"
                              : "text-foreground"
                        }`}>
                          {step.agent_name}
                        </span>
                      </motion.div>
                      {idx < workflow.steps.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Big visual phase tracker (Document Retrieval) */}
            {hasDocRetrieval && !hasLossRun && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="h-3 w-3" /> What's happening right now
                  <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/70">· click any step for details</span>
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {DOC_PHASES.map((phase) => {
                    const isActive = currentPhase === phase.id;
                    const isDone = currentPhase > phase.id || completed;
                    const isExpanded = expandedPhase === phase.id;
                    const Icon = phase.Icon;
                    const total = LOSS_RUN_DATA.length;
                    const carriersDoneInPhase = LOSS_RUN_DATA.filter((c) =>
                      logs.some((l) => l.phase === phase.id && l.carrier === c.carrierShort && l.type === "success")
                    ).length;
                    const pct = Math.round((carriersDoneInPhase / total) * 100);
                    return (
                      <motion.button
                        type="button"
                        onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                        key={phase.id}
                        layout
                        animate={isActive ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                        transition={isActive ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
                        className={`relative text-left rounded-xl border p-2.5 overflow-hidden transition-all hover:border-primary/60 hover:shadow-sm ${
                          isExpanded
                            ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                            : isActive
                              ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md shadow-primary/20"
                              : isDone
                                ? "border-emerald-500/40 bg-emerald-500/5"
                                : "border-border bg-background/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isActive ? "bg-primary/20"
                              : isDone ? "bg-emerald-500/20"
                                : "bg-muted"
                          }`}>
                            {isActive ? (
                              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                            ) : isDone ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <span className={`text-[10px] font-mono font-bold ${
                            isActive ? "text-primary" : isDone ? "text-emerald-700" : "text-muted-foreground"
                          }`}>
                            {phase.id + 1}/5
                          </span>
                        </div>
                        <p className={`text-[12px] font-bold leading-tight ${
                          isActive ? "text-primary" : isDone ? "text-emerald-700" : "text-foreground"
                        }`}>
                          {phase.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                          {phase.sublabel}
                        </p>
                        {/* Per-carrier mini progress */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[9px] font-mono mb-0.5">
                            <span className={isDone ? "text-emerald-700" : isActive ? "text-primary" : "text-muted-foreground"}>
                              {carriersDoneInPhase}/{total} carriers
                            </span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className={`h-full ${isDone ? "bg-emerald-500" : "bg-primary"}`}
                              initial={false}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.4 }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-0.5 mt-1.5">
                            {LOSS_RUN_DATA.map((c) => {
                              const cDone = logs.some((l) => l.phase === phase.id && l.carrier === c.carrierShort && l.type === "success");
                              const cBusy = !cDone && logs.some((l) => l.phase === phase.id && l.carrier === c.carrierShort);
                              return (
                                <span
                                  key={c.carrierShort}
                                  title={`${c.carrier}: ${cDone ? "done" : cBusy ? "in progress" : "waiting"}`}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    cDone ? "bg-emerald-500" : cBusy ? "bg-primary animate-pulse" : "bg-muted-foreground/25"
                                  }`}
                                />
                              );
                            })}
                          </div>
                        </div>
                        {isActive && (
                          <motion.div
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/15"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          >
                            <motion.div
                              className="h-full w-1/3 bg-primary"
                              animate={{ x: ["-100%", "300%"] }}
                              transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                            />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Expanded phase explanation + filtered log lines */}
                <AnimatePresence initial={false}>
                  {expandedPhase !== null && (() => {
                    const phase = DOC_PHASES[expandedPhase];
                    const phaseLogs = logs.filter((l) => l.phase === expandedPhase && !l.message.startsWith("━"));
                    return (
                      <motion.div
                        key={`exp-${expandedPhase}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-2 overflow-hidden"
                      >
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <phase.Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-primary">Step {phase.id + 1} · {phase.label}</p>
                                <p className="text-[11px] text-foreground/80 mt-1 leading-relaxed">{phase.explanation}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedPhase(null)}
                              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0"
                            >
                              Close ✕
                            </button>
                          </div>
                          <div className="mt-2 rounded-md bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
                            {phaseLogs.length === 0 ? (
                              <p className="text-slate-500 text-[11px] italic px-1 py-2">Waiting for this step to start…</p>
                            ) : (
                              phaseLogs.map((l, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-slate-600 text-[10px] mt-0.5 flex-shrink-0">{l.ts}</span>
                                  {l.carrier && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 flex-shrink-0 font-bold leading-tight">
                                      {l.carrier}
                                    </span>
                                  )}
                                  <span className={`flex-1 leading-relaxed ${
                                    l.type === "success" ? "text-emerald-400 font-medium"
                                      : l.type === "data" ? "text-slate-100"
                                        : l.type === "action" ? "text-slate-300"
                                          : "text-slate-500"
                                  }`}>{l.message}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            )}

            {/* Carrier portals (horizontal scroll) */}
            {hasDocRetrieval && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Carrier Portals · {LOSS_RUN_DATA.length} sources
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {Object.values(carrierStates).filter((s) => s !== "idle").length}/{LOSS_RUN_DATA.length} active
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {LOSS_RUN_DATA.map((c) => (
                    <CarrierTile
                      key={c.carrierShort}
                      carrier={c}
                      state={carrierStates[c.carrierShort] || "idle"}
                      mode={hasLossRun ? "claims" : "docs"}
                      docCount={docPlan[c.carrierShort]?.total ?? 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MAIN STAGE — Activity (large) + Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] flex-1 overflow-hidden min-h-0">
            {/* LIVE ACTIVITY — terminal centerpiece */}
            <div className="flex flex-col bg-slate-950 overflow-hidden border-r border-border">
              {/* Terminal chrome header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                  </div>
                  <Terminal className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-200">Live Activity Stream</span>
                  {running && !paused && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 ml-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                      </span>
                      LIVE
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{logs.length} events</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs min-h-0 relative">
                {/* subtle scanline effect */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
                  style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, white 2px, white 3px)" }} />

                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12 relative">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mb-4 ring-1 ring-primary/30"
                    >
                      <Play className="h-7 w-7 text-primary" />
                    </motion.div>
                    <p className="text-sm font-semibold text-slate-200">Ready to execute</p>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-xs">
                      Pulling real loss runs from {LOSS_RUN_DATA.length} carriers · {PORTFOLIO_SUMMARY.policies} policies · {PORTFOLIO_SUMMARY.agency}
                    </p>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {logs.map((log, i) => {
                    const isPhaseDivider = log.message.startsWith("━");
                    if (isPhaseDivider) {
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3 }}
                          className="my-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 flex items-center gap-2"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="text-[12px] font-bold tracking-wide text-primary">
                            {log.message.replace(/━/g, "").trim()}
                          </span>
                        </motion.div>
                      );
                    }
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2 group relative"
                      >
                        <span className="text-slate-600 text-[10px] mt-0.5 flex-shrink-0 font-mono">{log.ts}</span>
                        {log.stepIdx >= 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary flex-shrink-0 font-bold leading-tight">
                            S{log.stepIdx + 1}
                          </span>
                        )}
                        {log.carrier && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 flex-shrink-0 font-bold leading-tight">
                            {log.carrier}
                          </span>
                        )}
                        <span className={`flex-1 leading-relaxed ${
                          log.type === "success" ? "text-emerald-400 font-medium"
                            : log.type === "data" ? "text-slate-100"
                              : log.type === "action" ? "text-slate-300"
                                : "text-slate-500"
                        }`}>
                          {log.message}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {/* blinking cursor */}
                {running && !paused && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-emerald-400 text-xs">▸</span>
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="inline-block h-3 w-1.5 bg-emerald-400"
                    />
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

          {/* RIGHT: Insights panel */}
          <div className="border-l border-border bg-muted/10 overflow-y-auto p-4 space-y-3 hidden lg:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Live Insights
            </p>

            {/* Portfolio summary card */}
            <motion.div
              layout
              className="rounded-xl border border-border bg-background p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{hasLossRun ? "Portfolio" : "Retrieval"}</span>
                <Badge variant="outline" className="text-[9px]">{PORTFOLIO_SUMMARY.agency.split(" ")[0]}</Badge>
              </div>
              {hasLossRun ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Claims</p>
                    <p className="text-lg font-bold tabular-nums">
                      <AnimatedCounter value={liveTotalClaims} />
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Incurred</p>
                    <p className="text-lg font-bold tabular-nums">
                      <AnimatedCounter value={liveTotalIncurred} prefix="$" />
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Loss Ratio</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-600">{PORTFOLIO_SUMMARY.lossRatio}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Clean Insureds</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-600">
                      {fetchedCarriers.length}/{LOSS_RUN_DATA.length}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Documents Retrieved</p>
                    <p className="text-lg font-bold tabular-nums">
                      <AnimatedCounter value={liveDocsRetrieved} />
                      <span className="text-xs text-muted-foreground"> / {totalDocsPlanned}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Portals Completed</p>
                    <p className="text-lg font-bold tabular-nums">
                      <AnimatedCounter value={fetchedCarriers.length} />
                      <span className="text-xs text-muted-foreground"> / {LOSS_RUN_DATA.length}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Avg Confidence</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-600">97.2%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">AMS Attached</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-600">
                      {liveAttached}/{LOSS_RUN_DATA.length}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Per-carrier KPIs (loss-run step) */}
            {hasLossRun && kpiVisible > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Carrier Analysis
                </p>
                {LOSS_RUN_DATA.slice(0, kpiVisible).map((c) => (
                  <motion.div
                    key={c.carrierShort}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-border bg-background p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                          {c.carrierShort}
                        </span>
                        <span className="text-xs font-bold truncate">{c.carrier}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono bg-emerald-500/10 text-emerald-700 border-emerald-500/20 flex-shrink-0">
                        CLEAN
                      </Badge>
                    </div>
                    <p className="text-[10px] font-medium text-foreground truncate">{c.insured}</p>
                    <div className="space-y-0.5 text-[10px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Policy #</span>
                        <span className="font-mono text-foreground truncate">{c.policyNumber}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Type</span>
                        <span className="text-foreground truncate">{c.policyType}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Term</span>
                        <span className="font-mono text-foreground truncate">{c.policyTerm}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">As of</span>
                        <span className="font-mono text-foreground">{c.asOfDate}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Claims</p>
                        <p className="font-bold tabular-nums">{c.totalClaims}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-bold tabular-nums">${c.totalPaid.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reserve</p>
                        <p className="font-bold tabular-nums">${c.totalReserve.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lookback</p>
                        <p className="font-bold tabular-nums">{c.lookbackYears}yr</p>
                      </div>
                    </div>
                    {c.notes && (
                      <p className="text-[10px] text-muted-foreground italic border-l-2 border-emerald-500/30 pl-2 leading-snug">
                        {c.notes}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Final report card */}
            <AnimatePresence>
              {reportReady && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="rounded-xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Renewal Recommendation</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-700">{PORTFOLIO_SUMMARY.recommendation}</p>
                    <p className="text-[11px] text-emerald-700/80 mt-1">
                      {PORTFOLIO_SUMMARY.totalClaims} claims · ${PORTFOLIO_SUMMARY.totalIncurred.toLocaleString()} incurred · {PORTFOLIO_SUMMARY.lossRatio}% loss ratio · {PORTFOLIO_SUMMARY.cleanInsureds}/{LOSS_RUN_DATA.length} insureds clean
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-2 border-t border-emerald-500/20">
                    <TrendingDown className="h-3 w-3 text-emerald-600" />
                    <span className="text-[10px] text-emerald-700/80">Recommend 5–8% rate decrease at renewal</span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-1.5 bg-background/80 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10">
                    <Download className="h-3 w-3" /> Download Underwriter Package
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {completed && !reportReady && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">Workflow Complete</span>
                </div>
                <p className="text-[11px] text-emerald-700/80">
                  Finished in {formatElapsed(elapsed)}
                </p>
              </motion.div>
            )}
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
