'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Download,
  CheckCircle2,
  Equal,
  FileCheck,
  FileScan,
  FileSpreadsheet,
  GitCompareArrows,
  Layers3,
  Loader2,
  MinusCircle,
  Scale,
  ScanSearch,
  Shield,
  Sparkles,
  Table2,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowSettings } from "@/hooks/useWorkflowSettings";
import OutputCorrection from "./OutputCorrection";

interface PolicyComparisonUIProps {
  modelId?: string;
  onRun: (data: any) => void;
  isRunning: boolean;
  result: string;
}

import { lobSections, type LobSection, type MatchStatus } from "./policyComparisonLobs";

const supportedLineGroups = [
  { title: "Personal lines supported", lines: ["Auto", "Umbrella"] },
  {
    title: "Commercial lines surfaced in this comparison",
    lines: ["Auto", "Crime", "Cyber", "D&O", "GL", "Property", "Umbrella", "Workers Comp"],
  },
];

const STATUS_META: Record<MatchStatus, { label: string; tone: string; ring: string; icon: typeof CheckCircle2 }> = {
  match:    { label: "Match",      tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", ring: "border-l-emerald-500", icon: CheckCircle2 },
  improved: { label: "Improved",   tone: "bg-primary/10 text-primary border-primary/30",             ring: "border-l-primary",     icon: TrendingUp },
  reduced:  { label: "Reduced",    tone: "bg-amber-500/10 text-amber-700 border-amber-500/30",      ring: "border-l-amber-500",   icon: TrendingDown },
  added:    { label: "Added",      tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", ring: "border-l-emerald-500", icon: ArrowUpRight },
  removed:  { label: "Removed",    tone: "bg-destructive/10 text-destructive border-destructive/30", ring: "border-l-destructive", icon: XCircle },
  mismatch: { label: "Mismatch",   tone: "bg-muted text-foreground border-border",                   ring: "border-l-muted-foreground", icon: MinusCircle },
};

function StatusBadge({ status }: { status: MatchStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

const totalFields = lobSections.reduce((sum, s) => sum + s.fieldCount, 0);

// (lobSections, STATUS_META, StatusBadge, totalFields imported above)

export default function PolicyComparisonUI({ modelId, onRun, isRunning, result }: PolicyComparisonUIProps) {
  const [policyA, setPolicyA] = useState<File | null>(null);
  const [policyB, setPolicyB] = useState<File | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const [filter, setFilter] = useState<"all" | "differences" | "matches">("all");
  const [selectedLob, setSelectedLob] = useState<string>("auto");
  const [activeLobIds, setActiveLobIds] = useState<string[] | null>(null);
  const router = useRouter();
  const { settings: workflowSettings } = useWorkflowSettings();

  // Animated workflow progress (visual orchestration before results render)
  // Total duration ~5 minutes (300s) split across stages
  const workflowSteps = useMemo(
    () => [
      { id: "ingest",   title: "Reading policy documents",        detail: "Opening both policies side-by-side",          icon: FileScan,         ms: 1_200 },
      { id: "ocr",      title: "Capturing every page",            detail: "Pulling out tables, schedules, declarations", icon: ScanSearch,       ms: 1_400 },
      { id: "detect",   title: "Identifying lines of business",   detail: "Recognizing the coverage type in scope",      icon: Layers3,          ms: 900 },
      { id: "extract",  title: "Extracting all coverage fields",  detail: "Mapping limits, deductibles, endorsements",   icon: Table2,           ms: 1_500 },
      { id: "compare",  title: "Comparing current vs. proposed",  detail: "Spotting every change between the two",       icon: GitCompareArrows, ms: 1_400 },
      { id: "score",    title: "Highlighting coverage changes",   detail: "Flagging improvements, reductions, gaps",     icon: Brain,            ms: 1_100 },
      { id: "render",   title: "Building the comparison report",  detail: "Organizing findings for review",              icon: Sparkles,         ms: 900 },
    ],
    [],
  );
  const [workflowState, setWorkflowState] = useState<"idle" | "running" | "done">("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const workflowTimers = useRef<number[]>([]);

  const startWorkflow = () => {
    workflowTimers.current.forEach((t) => window.clearTimeout(t));
    workflowTimers.current = [];
    setWorkflowState("running");
    setActiveStep(0);
    setStepProgress(0);

    let elapsed = 0;
    workflowSteps.forEach((step, i) => {
      // start of step
      workflowTimers.current.push(
        window.setTimeout(() => {
          setActiveStep(i);
          setStepProgress(0);
        }, elapsed),
      );
      // animate progress within step (tick every ~500ms)
      const ticks = Math.max(20, Math.round(step.ms / 500));
      for (let k = 1; k <= ticks; k++) {
        workflowTimers.current.push(
          window.setTimeout(() => setStepProgress((k / ticks) * 100), elapsed + (step.ms * k) / ticks),
        );
      }
      elapsed += step.ms;
    });
    // finish
    workflowTimers.current.push(
      window.setTimeout(() => {
        setActiveStep(workflowSteps.length);
        setStepProgress(100);
        setWorkflowState("done");
      }, elapsed),
    );
  };

  useEffect(() => () => {
    workflowTimers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  // Detect LOB from filename keywords
  const detectLobsFromFiles = (files: (File | null)[]): string[] => {
    const names = files.filter(Boolean).map((f) => f!.name.toLowerCase()).join(" ");
    const detected = new Set<string>();
    if (/\bauto|vehicle|fleet\b/.test(names)) detected.add("commercial-auto");
    if (/crime|fidelity|theft/.test(names)) detected.add("crime");
    if (/d&o|directors|officers|management.?liab/.test(names)) detected.add("do");
    if (/cyber|privacy|breach/.test(names)) detected.add("cyber");
    if (/\bgl\b|general.?liab/.test(names)) detected.add("gl");
    if (/property|building|bpp/.test(names)) detected.add("property");
    if (/umbrella|excess/.test(names)) detected.add("umbrella");
    if (/work(ers)?.?comp|\bwc\b/.test(names)) detected.add("wc");
    return Array.from(detected);
  };

  const lobIdToValue: Record<string, string> = {
    "commercial-auto": "auto",
    crime: "crime",
    do: "do",
    gl: "gl",
    property: "property",
    umbrella: "umbrella",
    "workers-no-payroll": "wc",
    "workers-with-payroll": "wc",
  };
  const valueToLobIds: Record<string, string[]> = {
    auto: ["commercial-auto"],
    crime: ["crime"],
    do: ["do"],
    cyber: ["cyber"],
    gl: ["gl"],
    property: ["property"],
    umbrella: ["umbrella"],
    wc: ["wc"],
  };

  const visibleSections = useMemo(() => {
    const ids = activeLobIds && activeLobIds.length > 0
      ? activeLobIds
      : valueToLobIds[selectedLob];
    return lobSections.filter((s) => ids.includes(s.id));
  }, [activeLobIds, selectedLob]);

  const tally = useMemo(() => {
    const counts = { match: 0, improved: 0, reduced: 0, added: 0, removed: 0, mismatch: 0 };
    let total = 0;
    for (const sec of visibleSections) {
      for (const g of sec.groups) {
        for (const f of g.fields) {
          counts[f.status]++;
          total++;
        }
      }
    }
    const differences = total - counts.match;
    const matchRate = total ? Math.round((counts.match / total) * 100) : 0;
    return { counts, total, differences, matchRate };
  }, [visibleSections]);

  const handleRun = () => {
    if (!policyA || !policyB) return;
    const detected = detectLobsFromFiles([policyA, policyB]);
    const ids = detected.length > 0 ? detected : valueToLobIds[selectedLob];
    setActiveLobIds(ids);
    setLastPrompt(`Compare ${ids.join(", ")}: ${policyA.name} vs ${policyB.name}`);
    startWorkflow();
    onRun({ type: "policy-comparison", policyA: policyA.name, policyB: policyB.name, lobs: ids });
  };

  const hasResults = Boolean(result) && workflowState !== "running";

  const exportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTableMod = await import("jspdf-autotable");
    const autoTable = (autoTableMod as any).default || (autoTableMod as any).autoTable;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const today = new Date().toLocaleDateString();

    // Header band
    doc.setFillColor(91, 78, 212);
    doc.rect(0, 0, pageWidth, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Fideon OS — Policy Comparison Report", margin, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated ${today}`, margin, 52);

    // Verdict block
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Comparison verdict", margin, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const verdictLines = doc.splitTextToSize(
      `Scope: ${activeLobLabel}. ${tally.counts.match} fields matched, ${tally.counts.improved + tally.counts.added} improved or added, ${tally.counts.reduced} reduced, and ${tally.counts.mismatch} flagged for underwriter review. Match rate: ${tally.matchRate}%.`,
      pageWidth - margin * 2,
    );
    doc.text(verdictLines, margin, 118);

    // KPI summary table
    autoTable(doc, {
      startY: 118 + verdictLines.length * 12 + 12,
      head: [["Metric", "Value"]],
      body: [
        ["Match rate", `${tally.matchRate}%`],
        ["Total fields compared", String(tally.total)],
        ["Differences detected", String(tally.differences)],
        ["LOBs analyzed", String(visibleSections.length)],
        ["Matched / Improved / Added", `${tally.counts.match} / ${tally.counts.improved} / ${tally.counts.added}`],
        ["Reduced / Mismatch / Removed", `${tally.counts.reduced} / ${tally.counts.mismatch} / ${tally.counts.removed}`],
      ],
      headStyles: { fillColor: [91, 78, 212], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 6 },
      margin: { left: margin, right: margin },
      theme: "grid",
    });

    // Per-LOB sections
    visibleSections.forEach((section) => {
      const lastY = (doc as any).lastAutoTable?.finalY ?? 200;
      let y = lastY + 24;
      if (y > 700) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(91, 78, 212);
      doc.text(section.title, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`${section.fieldCount} workbook fields  ·  ${section.grounding}`, margin, y + 14);
      const summaryLines = doc.splitTextToSize(section.summary, pageWidth - margin * 2);
      doc.text(summaryLines, margin, y + 28);

      let cursor = y + 28 + summaryLines.length * 11 + 6;

      section.groups.forEach((group) => {
        autoTable(doc, {
          startY: cursor,
          head: [[group.title, "Expiring / current", "Proposed / renewal", "Status", "Δ"]],
          body: group.fields.map((f) => [
            f.label,
            f.expiring,
            f.proposed,
            f.status.toUpperCase(),
            f.delta || "",
          ]),
          headStyles: { fillColor: [241, 240, 252], textColor: [40, 30, 110], fontStyle: "bold" },
          bodyStyles: { fontSize: 8.5, cellPadding: 4, valign: "top" },
          columnStyles: {
            0: { cellWidth: 150, fontStyle: "bold" },
            1: { cellWidth: 130 },
            2: { cellWidth: 130 },
            3: { cellWidth: 55 },
            4: { cellWidth: 55 },
          },
          margin: { left: margin, right: margin },
          theme: "striped",
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              const v = String(data.cell.raw).toLowerCase();
              if (v === "match")    data.cell.styles.textColor = [22, 163, 74];
              if (v === "improved") data.cell.styles.textColor = [91, 78, 212];
              if (v === "added")    data.cell.styles.textColor = [22, 163, 74];
              if (v === "reduced")  data.cell.styles.textColor = [217, 119, 6];
              if (v === "removed")  data.cell.styles.textColor = [220, 38, 38];
              if (v === "mismatch") data.cell.styles.textColor = [100, 100, 100];
              data.cell.styles.fontStyle = "bold";
            }
          },
        });
        cursor = (doc as any).lastAutoTable.finalY + 10;
      });
    });

    // Footer on every page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Fideon OS  ·  Policy comparison  ·  Page ${i} of ${pageCount}`,
        margin,
        doc.internal.pageSize.getHeight() - 18,
      );
    }

    const safeName = activeLobLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "comparison";
    doc.save(`fideon-policy-comparison-${safeName}-${Date.now()}.pdf`);
  };

  const premiumTrigger = workflowSettings.policyComparisonPremiumThreshold;
  const modeledPremium = 3837 + 2517 + 1320 + 522;
  const showQuoteRecommendation = workflowSettings.enableSmartRecommendations && modeledPremium > premiumTrigger;

  const filteredSections = useMemo(() => {
    if (filter === "all") return visibleSections;
    return visibleSections
      .map((sec) => ({
        ...sec,
        groups: sec.groups
          .map((g) => ({
            ...g,
            fields: g.fields.filter((f) => (filter === "matches" ? f.status === "match" : f.status !== "match")),
          }))
          .filter((g) => g.fields.length > 0),
      }))
      .filter((sec) => sec.groups.length > 0);
  }, [filter, visibleSections]);

  const activeLobLabel = visibleSections.map((s) => s.title).join(", ") || "—";

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <Card className="border-border bg-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Scale className="h-5 w-5 text-primary" />
                Policy Comparison Engine
              </CardTitle>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Field-by-field comparison across personal and commercial lines. Each LOB shows what matches, what improved, what was reduced, and what's net-new.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">300+ carriers</Badge>
              <Badge variant="outline">8 LOBs</Badge>
              <Badge variant="outline">{totalFields} workbook fields</Badge>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {supportedLineGroups.map((g) => (
              <div key={g.title} className="rounded-lg border border-border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Layers3 className="h-4 w-4 text-primary" />
                  {g.title}
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.lines.map((l) => (
                    <Badge key={l} variant="outline" className="bg-muted/40">{l}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              { id: "policy-a-input", label: "Current / expiring document", file: policyA, set: setPolicyA },
              { id: "policy-b-input", label: "Proposed / renewal document", file: policyB, set: setPolicyB },
            ].map((u) => (
              <div key={u.id} className="space-y-3">
                <Label className="text-base font-semibold text-foreground">{u.label}</Label>
                <div
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary hover:bg-muted/30 ${u.file ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => document.getElementById(u.id)?.click()}
                >
                  <Input id={u.id} type="file" accept=".pdf,.docx" className="hidden"
                    onChange={(e) => u.set(e.target.files?.[0] || null)} />
                  {u.file ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <FileCheck className="h-6 w-6 text-primary" />
                      </div>
                      <p className="font-medium text-foreground">{u.file.name}</p>
                      <p className="text-xs text-muted-foreground">{(u.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-muted-foreground">Click to upload</p>
                      <p className="text-xs text-muted-foreground">PDF or DOCX</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* LOB selector */}
          <div className="space-y-2 rounded-lg border border-border bg-background p-4">
            <Label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="h-4 w-4 text-primary" />
              Line of Business in this comparison
            </Label>
            <p className="text-xs text-muted-foreground">
              The engine compares only the LOB you select. We also auto-detect from filenames (e.g. "auto", "crime", "wc") and override this when a clear match is found.
            </p>
            <Select value={selectedLob} onValueChange={setSelectedLob}>
              <SelectTrigger className="w-full md:w-[360px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Commercial Auto (35 fields)</SelectItem>
                <SelectItem value="crime">Crime (59 fields)</SelectItem>
                <SelectItem value="do">Directors & Officers (71 fields)</SelectItem>
                <SelectItem value="cyber">Cyber Liability (31 fields)</SelectItem>
                <SelectItem value="gl">General Liability (36 fields)</SelectItem>
                <SelectItem value="property">Property (66 fields)</SelectItem>
                <SelectItem value="umbrella">Umbrella / Excess (27 fields)</SelectItem>
                <SelectItem value="wc">Workers Compensation (23 fields)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert className="border-primary/20 bg-primary/5">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <AlertTitle className="text-foreground">Single-LOB output</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Upload one LOB at a time — results will scope to just that line of business so the comparison stays grounded in what you provided.
            </AlertDescription>
          </Alert>

          <Button onClick={handleRun} disabled={!policyA || !policyB || isRunning} className="w-full" size="lg">
            {isRunning ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building comparison matrix...</>
            ) : (
              <><Scale className="mr-2 h-4 w-4" /> Run LOB-aware comparison</>
            )}
          </Button>
        </CardContent>
      </Card>

      {workflowState !== "idle" && (
        <Card className="overflow-hidden border-border bg-gradient-to-br from-primary/5 via-card to-card animate-fade-in">
          <CardHeader className="border-b border-border bg-card/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Comparison workflow
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Live trace of every stage Fideon runs to produce the comparison report.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  workflowState === "done"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : "border-primary/40 bg-primary/10 text-primary"
                }
              >
                {workflowState === "done" ? (
                  <><CheckCircle2 className="mr-1 h-3 w-3" /> Workflow complete</>
                ) : (
                  <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Step {Math.min(activeStep + 1, workflowSteps.length)} of {workflowSteps.length}</>
                )}
              </Badge>
            </div>
            <div className="mt-4 space-y-1.5">
              <Progress
                value={
                  workflowState === "done"
                    ? 100
                    : Math.round(((activeStep + stepProgress / 100) / workflowSteps.length) * 100)
                }
                className="h-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Pipeline progress</span>
                <span>
                  {workflowState === "done"
                    ? "100%"
                    : `${Math.round(((activeStep + stepProgress / 100) / workflowSteps.length) * 100)}%`}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-border">
              {workflowSteps.map((step, i) => {
                const isDone = i < activeStep || workflowState === "done";
                const isActive = i === activeStep && workflowState === "running";
                const isPending = i > activeStep && workflowState === "running";
                const Icon = step.icon;
                return (
                  <li
                    key={step.id}
                    className={`flex items-start gap-4 p-4 transition-colors ${
                      isActive ? "bg-primary/5" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                        isDone
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                          : isActive
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            isPending ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {step.title}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {isDone ? "Done" : isActive ? `${Math.round(stepProgress)}%` : "Queued"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{step.detail}</p>
                      {isActive && (
                        <Progress value={stepProgress} className="h-1" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <OutputCorrection modelId={modelId || "policy-comparison"} prompt={lastPrompt} output={result}>
          <div className="space-y-6 animate-fade-in">
            {/* Headline scorecard */}
            <Card className="relative overflow-hidden border-border bg-gradient-to-br from-primary/15 via-card to-card">
              <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
              <CardContent className="relative p-6">
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Comparison verdict</h3>
                      <Badge variant="secondary" className="ml-1">
                        <Target className="mr-1 h-3 w-3" /> Scope: {activeLobLabel}
                      </Badge>
                      <Badge className="ml-1 bg-gradient-to-r from-primary to-primary/80">Recommended: Proposed</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        onClick={exportPdf}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export PDF
                      </Button>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      Within <span className="font-medium text-foreground">{activeLobLabel}</span>: <span className="font-semibold text-emerald-700">{tally.counts.match} matched</span>, <span className="font-semibold text-primary">{tally.counts.improved + tally.counts.added} improved or added</span>, <span className="font-semibold text-amber-700">{tally.counts.reduced} reduced</span>, and <span className="font-semibold text-foreground">{tally.counts.mismatch} flagged</span> for underwriter review.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status="match" />
                      <StatusBadge status="improved" />
                      <StatusBadge status="added" />
                      <StatusBadge status="reduced" />
                      <StatusBadge status="mismatch" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/80 p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-5">
                      <div className="relative h-28 w-28 shrink-0">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="42" className="fill-none stroke-muted" strokeWidth="8" />
                          <circle
                            cx="50" cy="50" r="42"
                            className="fill-none stroke-primary transition-all duration-1000"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(tally.matchRate / 100) * 263.9} 263.9`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-foreground leading-none">{tally.matchRate}%</span>
                          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Match</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Fields compared</span>
                          <span className="font-semibold text-foreground">{tally.total}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Differences</span>
                          <span className="font-semibold text-foreground">{tally.differences}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">LOBs in scope</span>
                          <span className="font-semibold text-foreground">{visibleSections.length}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Matched</div>
                        <div className="text-lg font-semibold text-emerald-700">{tally.counts.match}</div>
                      </div>
                      <div className="rounded-md bg-primary/10 px-3 py-2 ring-1 ring-primary/20">
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary"><TrendingUp className="h-3 w-3" /> Improved</div>
                        <div className="text-lg font-semibold text-primary">{tally.counts.improved}</div>
                      </div>
                      <div className="rounded-md bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700"><ArrowUpRight className="h-3 w-3" /> Added</div>
                        <div className="text-lg font-semibold text-emerald-700">{tally.counts.added}</div>
                      </div>
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/20">
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-700"><TrendingDown className="h-3 w-3" /> Reduced</div>
                        <div className="text-lg font-semibold text-amber-700">{tally.counts.reduced}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPI tiles */}
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { label: "Total fields compared", value: tally.total, hint: `Scoped to ${activeLobLabel}`, icon: Table2, accent: "text-primary bg-primary/10" },
                { label: "Differences detected", value: tally.differences, hint: "Improved + reduced + added + mismatch", icon: GitCompareArrows, accent: "text-amber-700 bg-amber-500/10" },
                { label: "LOBs analyzed", value: visibleSections.length, hint: `${visibleSections.filter(s => s.grounding === "Document-grounded").length} document-grounded`, icon: Layers3, accent: "text-emerald-700 bg-emerald-500/10" },
                { label: "Carrier reach", value: "300+", hint: "Markets available for placement", icon: Shield, accent: "text-primary bg-primary/10" },
              ].map((k) => {
                const Icon = k.icon;
                return (
                  <Card key={k.label} className="group relative overflow-hidden border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="relative p-5">
                      <div className="flex items-start justify-between">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.accent}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-3xl font-semibold text-foreground">{k.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Filter tabs */}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  Drill into matches and differences for {activeLobLabel}
                </div>
                <TabsList>
                  <TabsTrigger value="all">All ({tally.total})</TabsTrigger>
                  <TabsTrigger value="differences">Differences ({tally.differences})</TabsTrigger>
                  <TabsTrigger value="matches">Matches ({tally.counts.match})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={filter} className="mt-4">
                <Accordion type="multiple" defaultValue={filteredSections.map((s) => s.id)} className="w-full space-y-3">
                  {filteredSections.map((section) => {
                    const allFields = section.groups.flatMap((g) => g.fields);
                    const matchN = allFields.filter((f) => f.status === "match").length;
                    const diffN = allFields.length - matchN;
                    return (
                      <AccordionItem key={section.id} value={section.id} className="overflow-hidden rounded-lg border border-border bg-card">
                        <AccordionTrigger className="px-4 hover:no-underline">
                          <div className="flex w-full flex-col gap-2 pr-4 text-left md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-foreground">{section.title}</span>
                                <Badge variant="outline">{section.fieldCount} workbook fields</Badge>
                                <Badge variant="outline">{allFields.length} compared</Badge>
                                <Badge variant={section.grounding === "Document-grounded" ? "secondary" : "outline"}>
                                  {section.grounding}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{section.summary}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> {matchN} matched
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                                <Equal className="h-3 w-3" /> {diffN} different
                              </span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="space-y-5">
                            {section.groups.map((group) => {
                              const gMatch = group.fields.filter((f) => f.status === "match").length;
                              const gDiff = group.fields.length - gMatch;
                              return (
                                <div key={group.title} className="overflow-hidden rounded-lg border border-border bg-background">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-foreground">{group.title}</span>
                                      {group.description && (
                                        <span className="text-xs text-muted-foreground">{group.description}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">{gMatch} match</span>
                                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700">{gDiff} diff</span>
                                    </div>
                                  </div>
                                  <div className="hidden grid-cols-12 bg-muted/30 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
                                    <div className="col-span-4 p-3">Field</div>
                                    <div className="col-span-3 p-3">Expiring / current</div>
                                    <div className="col-span-3 p-3">Proposed / renewal</div>
                                    <div className="col-span-2 p-3">Status</div>
                                  </div>
                                  {group.fields.map((field) => {
                                    const meta = STATUS_META[field.status];
                                    return (
                                      <div key={`${group.title}-${field.label}`} className={`grid grid-cols-1 border-t border-border border-l-4 md:grid-cols-12 ${meta.ring}`}>
                                        <div className="col-span-4 space-y-1 p-3">
                                          <p className="font-medium text-foreground">{field.label}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {field.source === "document" ? "From uploaded docs" : "Workbook-aligned"}
                                            {field.note ? ` · ${field.note}` : ""}
                                          </p>
                                        </div>
                                        <div className="col-span-3 p-3 text-sm text-muted-foreground">{field.expiring}</div>
                                        <div className="col-span-3 p-3 text-sm font-medium text-foreground">
                                          {field.proposed}
                                          {field.delta && <span className="ml-2 text-xs text-muted-foreground">({field.delta})</span>}
                                        </div>
                                        <div className="col-span-2 p-3">
                                          <StatusBadge status={field.status} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </TabsContent>
            </Tabs>

            {showQuoteRecommendation && (
              <Alert className="border-primary/30 bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
                <AlertTitle className="text-foreground">
                  Premium stack exceeds ${premiumTrigger.toLocaleString()} — quote shopping opportunity
                </AlertTitle>
                <AlertDescription className="mt-3 space-y-3">
                  <p className="text-muted-foreground">
                    Benchmark this account across 300+ carrier connections before binding.
                  </p>
                  <Button onClick={() => router.push("/playground?model=quote-generation")}>
                    Launch quote generation
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </OutputCorrection>
      )}
    </div>
  );
}
