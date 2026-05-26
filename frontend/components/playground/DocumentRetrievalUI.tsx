'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from "react";
import { agentsApi, type DocRetrievalRunState } from "@/lib/api";
import { pollRun } from "@/lib/pollRun";
import MfaPromptDialog from "@/components/playground/MfaPromptDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  FileText,
  Loader2,
  Building2,
  FolderOpen,
  CheckCircle2,
  File,
  FileSpreadsheet,
  FileBadge,
  Receipt,
  ScrollText,
  FileCheck,
  ClipboardList,
  BarChart3,
  Scale,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Info,
  RefreshCw,
  DollarSign,
  Clock,
  HardDrive,
  Activity,
  AlertTriangle,
  Flame,
  ShieldCheck,
} from "lucide-react";
import { useWorkflowSettings } from "@/hooks/useWorkflowSettings";

import appliedEpicLogo from "@/assets/logos/applied-epic-logo.png";
import hawksoftLogo from "@/assets/logos/hawksoft-logo.png";
import ams360Logo from "@/assets/logos/ams360-logo.png";
import qqCatalystLogo from "@/assets/logos/qq-catalyst-logo.png";
import ezlynxLogo from "@/assets/logos/ezlynx-logo.png";

interface DocumentRetrievalUIProps {
  onRun: (data: any) => void;
  isRunning: boolean;
  result: string;
}

const documentTypes = [
  { id: "policy-renewal", label: "Renewal", icon: FileCheck },
  { id: "cancellation", label: "Cancellation", icon: File },
  { id: "endorsement", label: "Endorsement", icon: FileBadge },
  { id: "memo", label: "Memo", icon: ScrollText },
  { id: "invoice", label: "Invoice", icon: Receipt },
  { id: "certificate", label: "Certificate", icon: FileSpreadsheet },
  { id: "dec-page", label: "Dec Page", icon: ClipboardList },
  { id: "loss-run", label: "Loss Run", icon: BarChart3 },
];

const carriers = [
  { id: "travelers", name: "Travelers", logo: "🏢" },
  { id: "hartford", name: "Hartford", logo: "🦌" },
  { id: "chubb", name: "Chubb", logo: "🛡️" },
  { id: "liberty-mutual", name: "Liberty Mutual", logo: "🗽" },
  { id: "nationwide", name: "Nationwide", logo: "🏠" },
  { id: "progressive", name: "Progressive", logo: "📊" },
  { id: "amtrust", name: "AmTrust", logo: "💼" },
  { id: "markel", name: "Markel", logo: "📈" },
  { id: "berkshire", name: "Berkshire", logo: "🏛️" },
  { id: "zurich", name: "Zurich", logo: "🏔️" },
];

const amsOptions = [
  { id: "applied-epic", name: "Applied Epic", logo: appliedEpicLogo },
  { id: "hawksoft", name: "HawkSoft", logo: hawksoftLogo },
  { id: "ams360", name: "AMS 360", logo: ams360Logo },
  { id: "qq-catalyst", name: "QQ Catalyst", logo: qqCatalystLogo },
  { id: "ezlynx", name: "EZLynx", logo: ezlynxLogo },
];

interface RetrievedDocument {
  name: string;
  type: string;
  size: string;
  status: "success" | "pending" | "error";
  amsLocation?: string;
  premium?: number;
  effectiveDate?: string;
  expirationDate?: string;
}

interface LossRunSummary {
  carrier: string;
  policyNumber: string;
  insured: string;
  period: string;
  totalClaims: number;
  openClaims: number;
  paid: number;
  outstanding: number;
  recoveries: number;
  incurred: number;
  lossRatio: number;
  largestLoss: { id: string; cause: string; incurred: number; status: string };
}

interface ParsedRetrievalResult {
  documents: RetrievedDocument[];
  stats: { found: number; downloaded: number; attached: number; totalSize: string; time: string };
  hasRenewalDocs: boolean;
  hasInvoiceDocs: boolean;
  hasLossRunDocs: boolean;
  totalPremium: number;
  daysUntilExpiration: number;
  lossRuns: LossRunSummary[];
}

const parseRetrievalResult = (result: string, includeLossRun: boolean, insured: string): ParsedRetrievalResult | null => {
  if (!result || !result.includes("Document Retrieval Results")) return null;

  const documents: RetrievedDocument[] = [
    { name: "POL-2025-12345_Renewal_Notice.pdf", type: "Policy Renewal", size: "245 KB", status: "success", amsLocation: "Policies > Documents", premium: 12450, effectiveDate: "2025-03-01", expirationDate: "2026-03-01" },
    { name: "POL-2025-12345_Endorsement_AI.pdf", type: "Endorsement", size: "128 KB", status: "success", amsLocation: "Policies > Endorsements" },
    { name: "INV-2025-67890.pdf", type: "Invoice", size: "89 KB", status: "success", amsLocation: "Accounting > Invoices", premium: 12450 },
    { name: "MEMO-2025-Coverage_Update.pdf", type: "Memo", size: "156 KB", status: "success", amsLocation: "Client > Correspondence" },
  ];

  const lossRuns: LossRunSummary[] = [];
  if (includeLossRun) {
    documents.push(
      { name: "Travelers_LossRun_5yr.pdf", type: "Loss Run", size: "412 KB", status: "success", amsLocation: "Client > Loss Runs" },
      { name: "Hartford_LossRun_5yr.pdf",  type: "Loss Run", size: "298 KB", status: "success", amsLocation: "Client > Loss Runs" },
      { name: "Chubb_LossRun_5yr.pdf",     type: "Loss Run", size: "186 KB", status: "success", amsLocation: "Client > Loss Runs" },
    );
    const insuredName = insured?.trim() || "Apex Manufacturing Co.";
    lossRuns.push(
      { carrier: "Travelers",      policyNumber: "B1001347",     insured: insuredName, period: "2021–2026", totalClaims: 3, openClaims: 1, paid: 70_400, outstanding: 12_500, recoveries: 3_200, incurred: 79_700, lossRatio: 32.1, largestLoss: { id: "CLM-2024-5489", cause: "Slip & fall — restaurant", incurred: 51_100, status: "Closed" } },
      { carrier: "The Hartford",   policyNumber: "72WEC DD2216", insured: insuredName, period: "2021–2026", totalClaims: 4, openClaims: 0, paid: 293_300, outstanding: 64_200, recoveries: 0,     incurred: 357_500, lossRatio: 71.8, largestLoss: { id: "CLM-2023-7821", cause: "Forklift back injury",   incurred: 168_400, status: "Open"   } },
      { carrier: "Chubb",          policyNumber: "D03124007",    insured: insuredName, period: "2022–2026", totalClaims: 1, openClaims: 1, paid: 18_400,  outstanding: 4_200,  recoveries: 0,     incurred: 22_600,  lossRatio: 14.5, largestLoss: { id: "CYB-2024-0118", cause: "Cyber incident — phishing", incurred: 22_600, status: "Open" } },
    );
  }

  const hasRenewalDocs = documents.some(d => d.type === "Policy Renewal");
  const hasInvoiceDocs = documents.some(d => d.type === "Invoice");
  const hasLossRunDocs = documents.some(d => d.type === "Loss Run");
  const premDocs = documents.filter(d => d.premium);
  const totalPremium = premDocs.length > 0 ? premDocs.reduce((s, d) => s + (d.premium || 0), 0) / premDocs.length : 0;
  const renewalDoc = documents.find(d => d.expirationDate);
  const daysUntilExpiration = renewalDoc ? Math.ceil((new Date(renewalDoc.expirationDate!).getTime() - Date.now()) / 86400000) : 0;

  const totalSizeKb = documents.reduce((s, d) => s + parseInt(d.size), 0);
  return {
    documents,
    stats: { found: documents.length, downloaded: documents.length, attached: documents.length, totalSize: `${totalSizeKb} KB`, time: includeLossRun ? "18.7s" : "12.3s" },
    hasRenewalDocs, hasInvoiceDocs, hasLossRunDocs, totalPremium, daysUntilExpiration, lossRuns,
  };
};

// Map the UI's hyphen-id carrier values to the backend's canonical mock_ ids.
// The UI list is decoupled from the registry on purpose (so we can rename
// labels without touching backend), but the click handler needs a 1:1 map.
const CARRIER_ID_MAP: Record<string, string> = {
  "travelers":       "mock_travelers",
  "hartford":        "mock_hartford",
  "chubb":           "mock_chubb",
  "liberty-mutual":  "mock_liberty",
  "nationwide":      "mock_nationwide",
  "progressive":     "mock_progressive",
  "amtrust":         "mock_amtrust",
  "markel":          "mock_markel",
  "berkshire":       "mock_berkshire",
  "zurich":          "mock_zurich",
};

// UI doc-type ids → backend canonical strings (snake_case). The set lives in
// services.doc_retrieval.registry.CANONICAL_DOC_TYPES.
const DOC_TYPE_MAP: Record<string, string> = {
  "policy-renewal": "policy_renewal",
  "cancellation":   "cancellation",
  "endorsement":    "endorsement",
  "memo":           "memo",
  "invoice":        "invoice",
  "certificate":    "certificate",
  "dec-page":       "deck_page",
  "loss-run":       "loss_run",
};

export default function DocumentRetrievalUI({ onRun, isRunning, result }: DocumentRetrievalUIProps) {
  const router = useRouter();
  const { settings: workflowSettings } = useWorkflowSettings();
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([]);
  const [selectedAMS, setSelectedAMS] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [insuredName, setInsuredName] = useState("");
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);

  // Real backend integration (FNF-572). Holds the latest poll state. The
  // existing mock parseRetrievalResult path stays as a fallback for users
  // who haven't kicked off a real run yet.
  const [realRun, setRealRun] = useState<DocRetrievalRunState | null>(null);
  const [realRunError, setRealRunError] = useState<string | null>(null);
  const [realRunBusy, setRealRunBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleCarrier = (id: string) => setSelectedCarriers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleDocType = (id: string) => setSelectedDocTypes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleRun = async () => {
    if (selectedCarriers.length === 0 || !selectedAMS || selectedDocTypes.length === 0) return;
    // Notify the parent (legacy demo flow).
    onRun({ type: "document-retrieval", carriers: selectedCarriers, ams: selectedAMS, policyNumber, insuredName, documentTypes: selectedDocTypes });

    // Kick off a real backend run for the first (carrier, doc_type) combo.
    // V1 only runs one carrier at a time; multi-carrier fan-out is FNF-Nxx
    // (separate ticket).
    const carrierId = CARRIER_ID_MAP[selectedCarriers[0]] || selectedCarriers[0];
    const docType = DOC_TYPE_MAP[selectedDocTypes[0]] || selectedDocTypes[0];
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRealRunError(null);
    setRealRunBusy(true);
    try {
      const { run_id } = await agentsApi.startDocRetrievalRun({
        carrier_id: carrierId,
        ams_target_id: selectedAMS,
        doc_type: docType,
        policy_number: policyNumber || "POL-2025-12345",
        insured_name: insuredName || "Demo Insured",
        attach_to: "policy",
      });
      for await (const state of pollRun(run_id, { signal: ac.signal, pauseOnAwaitingMfa: true })) {
        setRealRun(state);
      }
    } catch (err) {
      setRealRunError(String((err as Error).message));
    } finally {
      setRealRunBusy(false);
    }
  };

  const isFormValid = selectedCarriers.length > 0 && selectedAMS && selectedDocTypes.length > 0;
  const parsedResult = parseRetrievalResult(result, selectedDocTypes.includes("loss-run"), insuredName);
  const selectedAMSData = amsOptions.find(a => a.id === selectedAMS);

  const completedSteps = [selectedCarriers.length > 0, !!selectedAMS, selectedDocTypes.length > 0].filter(Boolean).length;
  const progressPct = (completedSteps / 3) * 100;

  return (
    <div className="space-y-5">
      {/* Hero Header */}
      <Card className="border-border overflow-hidden">
        <div className="relative bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent border-b border-border">
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 flex-shrink-0">
                <Download className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Document Retrieval</h3>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    <Sparkles className="h-2.5 w-2.5 mr-1" />AI-Powered
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Pull documents from carrier portals and auto-file them in your AMS</p>
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Setup</span>
              <div className="flex items-center gap-2">
                <Progress value={progressPct} className="w-24 h-1.5" />
                <span className="text-xs font-semibold text-foreground tabular-nums">{completedSteps}/3</span>
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-5 space-y-6">
          {/* Step 1 — Carriers */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedCarriers.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Source Carriers
                </Label>
              </div>
              {selectedCarriers.length > 0 && (
                <Badge variant="secondary" className="text-xs">{selectedCarriers.length} selected</Badge>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {carriers.map((c) => {
                const sel = selectedCarriers.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCarrier(c.id)}
                    className={`relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border transition-all text-center min-h-[72px] ${
                      sel
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-accent/40"
                    }`}
                  >
                    {sel && <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-primary" />}
                    <span className="text-xl leading-none">{c.logo}</span>
                    <span className="text-[10px] font-medium text-foreground leading-tight truncate w-full px-0.5">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-border/60" />

          {/* Step 2 — AMS + Policy details (side by side on wide screens) */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Target AMS */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedAMS ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Target AMS
                </Label>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {amsOptions.map((ams) => {
                  const sel = selectedAMS === ams.id;
                  return (
                    <button
                      key={ams.id}
                      type="button"
                      onClick={() => setSelectedAMS(ams.id)}
                      className={`relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border transition-all min-h-[80px] ${
                        sel
                          ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-accent/40"
                      }`}
                    >
                      {sel && <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-primary" />}
                      <div className="h-9 w-9 rounded-md bg-accent flex items-center justify-center overflow-hidden">
                        <img src={(ams as any).logo || ""} alt={ams.name} className="h-7 w-7 object-contain" />
                      </div>
                      <span className="text-[10px] font-medium text-foreground leading-tight truncate w-full px-0.5 text-center">{ams.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Policy Details */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-muted text-muted-foreground">·</span>
                <Label className="text-sm font-semibold">Policy Details <span className="text-[10px] font-normal text-muted-foreground ml-1">optional</span></Label>
              </div>
              <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-1">
                  <Label htmlFor="policy-number" className="text-[11px] text-muted-foreground">Policy Number</Label>
                  <Input id="policy-number" placeholder="POL-2025-12345" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="h-9 text-sm bg-background" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="insured-name" className="text-[11px] text-muted-foreground">Insured Name</Label>
                  <Input id="insured-name" placeholder="ABC Corporation" value={insuredName} onChange={(e) => setInsuredName(e.target.value)} className="h-9 text-sm bg-background" />
                </div>
              </div>
            </div>
          </section>

          <div className="h-px bg-border/60" />

          {/* Step 3 — Document Types */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedDocTypes.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>3</span>
                <Label className="text-sm font-semibold">Document Types</Label>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocTypes.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{selectedDocTypes.length} selected</Badge>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDocTypes(selectedDocTypes.length === documentTypes.length ? [] : documentTypes.map(d => d.id))}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  {selectedDocTypes.length === documentTypes.length ? "Clear all" : "Select all"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {documentTypes.map((dt) => {
                const Icon = dt.icon;
                const selected = selectedDocTypes.includes(dt.id);
                return (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => toggleDocType(dt.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left min-h-[44px] ${
                      selected
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-accent/40"
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-medium truncate flex-1">{dt.label}</span>
                    {selected && <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        </CardContent>

        {/* Sticky-feel action bar */}
        <div className="border-t border-border bg-muted/30 px-5 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground min-w-0 truncate">
            {isFormValid ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                Ready to retrieve <strong className="text-foreground">{selectedDocTypes.length}</strong> doc type{selectedDocTypes.length === 1 ? "" : "s"} from <strong className="text-foreground">{selectedCarriers.length}</strong> carrier{selectedCarriers.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span>Complete all 3 steps to begin retrieval</span>
            )}
          </div>
          <Button onClick={handleRun} disabled={!isFormValid || isRunning} className="flex-shrink-0">
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Retrieving…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Retrieve & Attach</>
            )}
          </Button>
        </div>
      </Card>

      {/* Real backend run status (FNF-572). Sits above the mock results. */}
      {(realRunBusy || realRun || realRunError) && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {realRunBusy && realRun?.status !== "completed" && realRun?.status !== "failed" ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  ) : realRun?.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : realRun?.status === "failed" || realRunError ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Activity className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {realRun ? `Run ${realRun.id.slice(0, 8)} · ${realRun.carrier_id}` : "Starting run…"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {realRunError
                      ? `Error: ${realRunError}`
                      : realRun
                      ? `Status: ${realRun.status}${realRun.error ? ` · ${realRun.error}` : ""}`
                      : "Posting to /api/agents/doc_retrieval_v0/run…"}
                  </p>
                </div>
              </div>
              {realRun?.status === "awaiting_mfa" && (
                <Badge variant="secondary" className="text-xs">MFA required</Badge>
              )}
            </div>

            {realRun?.status === "completed" && realRun.metadata.documents && realRun.metadata.documents.length > 0 && (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
                <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Real downloads ({realRun.metadata.documents.length})
                </p>
                {realRun.metadata.documents.map((d) => (
                  <div key={d.doc_id} className="flex items-center gap-2 text-xs">
                    <FileText className="h-3 w-3 text-primary flex-shrink-0" />
                    <span className="font-mono truncate flex-1">{d.filename}</span>
                    <span className="text-muted-foreground tabular-nums">{(d.size_bytes / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            )}

            {realRun?.status === "awaiting_mfa" && realRun.metadata.mfa_prompt && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">Awaiting MFA — prompt opened in the dialog.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal lifecycle is gated on the poll observing awaiting_mfa. The
          dialog itself POSTs to /mfa-response; the poll loop above picks up
          the resumed status on the next tick. */}
      {realRun?.status === "awaiting_mfa" && realRun.metadata.mfa_prompt && (
        <MfaPromptDialog
          open={true}
          runId={realRun.id}
          prompt={realRun.metadata.mfa_prompt}
          onClose={() => { /* The poll will see status leave awaiting_mfa and stop rendering this. */ }}
        />
      )}

      {/* Results */}
      {result && parsedResult && (
        <div className="space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "Found", value: parsedResult.stats.found, icon: FileText, color: "text-primary" },
              { label: "Downloaded", value: parsedResult.stats.downloaded, icon: Download, color: "text-primary" },
              { label: "Attached", value: parsedResult.stats.attached, icon: CheckCircle2, color: "text-primary" },
              { label: "Size", value: parsedResult.stats.totalSize, icon: HardDrive, color: "text-foreground" },
              { label: "Time", value: parsedResult.stats.time, icon: Clock, color: "text-foreground" },
            ].map((s) => (
              <Card key={s.label} className="border-border">
                <CardContent className="p-3 text-center">
                  <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color} opacity-60`} />
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Document List */}
          <Card className="border-border">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Retrieved Documents</span>
              </div>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                All Synced
              </Badge>
            </div>
            <CardContent className="p-0 divide-y divide-border">
              {parsedResult.documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.type} · {doc.size}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-primary font-medium">Attached</p>
                    <p className="text-[10px] text-muted-foreground">{doc.amsLocation}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AMS Sync */}
          {selectedAMSData && (
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <img src={(selectedAMSData as any).logo || ""} alt={selectedAMSData.name} className="h-8 w-8 object-contain flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{selectedAMSData.name}</p>
                    <p className="text-xs text-muted-foreground">All documents synced</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Progress value={100} className="w-20 h-1.5" />
                    <span className="text-xs font-semibold text-primary">100%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loss Run Details */}
          {parsedResult.hasLossRunDocs && parsedResult.lossRuns.length > 0 && (
            <Card className="border-primary/20 overflow-hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.06] to-transparent" />
                <div className="relative flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">Loss Run Report Details</span>
                      <p className="text-[11px] text-muted-foreground">Extracted claims data from {parsedResult.lossRuns.length} carrier reports</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => router.push("/playground?model=loss-run-reporting")} className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/5">
                    <BarChart3 className="h-3 w-3 mr-1.5" />
                    Open Loss Run Pod
                    <ArrowRight className="h-3 w-3 ml-1.5" />
                  </Button>
                </div>
              </div>

              {/* Aggregated KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border-b border-border bg-muted/30">
                {(() => {
                  const agg = parsedResult.lossRuns.reduce((a, l) => ({
                    claims: a.claims + l.totalClaims,
                    open: a.open + l.openClaims,
                    paid: a.paid + l.paid,
                    outstanding: a.outstanding + l.outstanding,
                    incurred: a.incurred + l.incurred,
                  }), { claims: 0, open: 0, paid: 0, outstanding: 0, incurred: 0 });
                  const blendedLR = (parsedResult.lossRuns.reduce((s, l) => s + l.lossRatio, 0) / parsedResult.lossRuns.length).toFixed(1);
                  const tiles = [
                    { label: "Claims", value: agg.claims, icon: FileText },
                    { label: "Open", value: agg.open, icon: AlertTriangle, accent: "text-amber-600" },
                    { label: "Incurred", value: `$${(agg.incurred / 1000).toFixed(0)}K`, icon: DollarSign },
                    { label: "Outstanding", value: `$${(agg.outstanding / 1000).toFixed(0)}K`, icon: Activity },
                    { label: "Loss Ratio", value: `${blendedLR}%`, icon: ShieldCheck, accent: parseFloat(blendedLR) > 60 ? "text-amber-600" : "text-emerald-600" },
                  ];
                  return tiles.map((t) => (
                    <div key={t.label} className="rounded-lg bg-card border border-border p-2.5 text-center">
                      <t.icon className={`h-3.5 w-3.5 mx-auto mb-1 ${t.accent ?? "text-primary"} opacity-80`} />
                      <p className={`text-base font-bold ${t.accent ?? "text-foreground"}`}>{t.value}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
                    </div>
                  ));
                })()}
              </div>

              {/* Per-carrier breakdown */}
              <CardContent className="p-0 divide-y divide-border">
                {parsedResult.lossRuns.map((lr, i) => (
                  <div key={i} className="p-4 hover:bg-accent/20 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{lr.carrier}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{lr.policyNumber}</span>
                          <Badge variant="outline" className="text-[10px]">{lr.period}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{lr.insured}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={lr.lossRatio > 60 ? "text-amber-600 border-amber-600" : "text-emerald-600 border-emerald-600"}
                      >
                        {lr.lossRatio > 60 ? <Flame className="h-3 w-3 mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                        {lr.lossRatio}% LR
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <Stat label="Claims" value={`${lr.totalClaims}`} sub={`${lr.openClaims} open`} />
                      <Stat label="Paid" value={`$${(lr.paid / 1000).toFixed(0)}K`} />
                      <Stat label="Outstanding" value={`$${(lr.outstanding / 1000).toFixed(0)}K`} />
                      <Stat label="Recoveries" value={`$${(lr.recoveries / 1000).toFixed(0)}K`} />
                      <Stat label="Incurred" value={`$${(lr.incurred / 1000).toFixed(0)}K`} highlight />
                    </div>

                    <div className="mt-3 p-2.5 rounded-md bg-muted/40 border border-border flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <Flame className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground">Largest Loss</p>
                        <p className="text-xs font-medium text-foreground truncate">
                          <span className="font-mono text-muted-foreground">{lr.largestLoss.id}</span> · {lr.largestLoss.cause}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-foreground">${(lr.largestLoss.incurred / 1000).toFixed(0)}K</p>
                        <p className="text-[10px] text-muted-foreground">{lr.largestLoss.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Smart Recommendations
            </h4>

            {parsedResult.hasRenewalDocs && (
              <Card className="border-primary/20 bg-primary/[0.03]">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Scale className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-foreground">Compare Expiring vs. Renewal</span>
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">Renewal Detected</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Identify coverage changes, gaps, and ensure optimal terms with our Policy Comparison Engine.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => router.push("/playground?model=policy-comparison")} className="border-primary/30 text-primary hover:bg-primary/5 text-xs h-8">
                      <Scale className="h-3 w-3 mr-1.5" />
                      Compare Policies
                      <ArrowRight className="h-3 w-3 ml-1.5" />
                    </Button>
                    {parsedResult.daysUntilExpiration > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Expires in <strong className="text-foreground">{parsedResult.daysUntilExpiration}d</strong>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {workflowSettings.enableSmartRecommendations && parsedResult.hasInvoiceDocs && parsedResult.totalPremium > workflowSettings.documentRetrievalPremiumThreshold && (
              <Card className="border-primary/20 bg-primary/[0.03]">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-foreground">Savings Opportunity</span>
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">High Premium</Badge>
                      </div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-lg font-bold text-foreground">${parsedResult.totalPremium.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-primary" />
                          Current premium
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Potential savings of <strong className="text-primary">${Math.round(parsedResult.totalPremium * 0.15).toLocaleString()} – ${Math.round(parsedResult.totalPremium * 0.25).toLocaleString()}/yr</strong> across 18+ carriers.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => router.push("/playground?model=quote-generation")} className="text-xs h-8">
                    <Sparkles className="h-3 w-3 mr-1.5" />
                    Generate Quotes
                    <ArrowRight className="h-3 w-3 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {!parsedResult.hasRenewalDocs && !(workflowSettings.enableSmartRecommendations && parsedResult.hasInvoiceDocs && parsedResult.totalPremium > workflowSettings.documentRetrievalPremiumThreshold) && (
              <Card className="border-border bg-accent/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Documents Synced Successfully</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Access them from the client record in {selectedAMSData?.name}.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
