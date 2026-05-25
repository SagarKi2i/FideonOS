'use client';
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Loader2, Globe, FileText, RefreshCw, Scale, Send, CheckCircle2,
  Clock, Building2, DollarSign, AlertCircle, ArrowRight, Bot, Shield,
  Calendar, MapPin, Phone, Mail, User, Briefcase, Award, CheckSquare,
  FileCheck, Download, Eye, Sparkles, KeyRound, ClipboardList, Calculator,
  TrendingDown, BadgeCheck, Activity, Target, Zap, Trophy, Wallet,
  Database, FormInput, Network, Send as SendIcon, ChevronRight, Users,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import QuoteComparisonAnalysis from "./QuoteComparisonAnalysis";
import EmailPreviewDialog from "./EmailPreviewDialog";
import PolicyCoverageDetails from "./PolicyCoverageDetails";
import jsPDF from "jspdf";

interface QuoteGenerationUIProps {
  onRun: (data: any) => void;
  isRunning: boolean;
  result: string;
}

interface CarrierQuote {
  carrier: string;
  logo: string;
  premium: number;
  coverage: string;
  deductible: number;
  status: "pending" | "fetching" | "complete" | "error";
  features: string[];
  rating?: number;
  claimsScore?: number;
  financialStrength?: string;
}

const CARRIERS = [
  { id: "progressive", name: "Progressive" },
  { id: "geico", name: "GEICO" },
  { id: "state-farm", name: "State Farm" },
  { id: "allstate", name: "Allstate" },
  { id: "liberty-mutual", name: "Liberty Mutual" },
  { id: "travelers", name: "Travelers" },
  { id: "nationwide", name: "Nationwide" },
  { id: "farmers", name: "Farmers Insurance" },
  { id: "usaa", name: "USAA" },
  { id: "american-family", name: "American Family" },
  { id: "hartford", name: "The Hartford" },
  { id: "chubb", name: "Chubb" },
  { id: "aig", name: "AIG" },
  { id: "zurich", name: "Zurich" },
  { id: "hanover", name: "The Hanover" },
  { id: "cincinnati", name: "Cincinnati Insurance" },
  { id: "erie", name: "Erie Insurance" },
  { id: "auto-owners", name: "Auto-Owners" },
];

const INSURANCE_TYPES = [
  { id: "auto", name: "Auto Insurance" },
  { id: "home", name: "Homeowners Insurance" },
  { id: "commercial", name: "Commercial Property" },
  { id: "general-liability", name: "General Liability" },
  { id: "workers-comp", name: "Workers Compensation" },
  { id: "professional-liability", name: "Professional Liability" },
];

type QuoteLog = {
  id: number;
  ts: string;
  phase: number;
  carrier?: string;
  message: string;
  type?: "info" | "success" | "divider";
};

const DATA_SOURCES = [
  { id: "ams", name: "AMS (Applied Epic)", desc: "Pull insured profile, vehicles, drivers & prior policies", icon: Database },
  { id: "jotform", name: "Jotform Intake", desc: "Use latest customer-submitted quote request form", icon: FormInput },
];

const SUBMISSION_TARGETS = [
  { id: "direct", name: "Carrier Portals (Direct)", desc: "Log into each carrier website and request a quote", icon: Globe },
  { id: "vertafore", name: "Vertafore PL Rater", desc: "Submit once, rate across all appointed personal-lines carriers", icon: Network },
  { id: "ezlynx", name: "EZLynx Rating Engine", desc: "Bridge submission to EZLynx for multi-carrier rating", icon: Network },
];

const QUOTE_PHASES = [
  { id: 0, label: "Fetch details", sublabel: "Pull from AMS / Jotform", icon: Database,
    explanation: "The agent pulls the insured's full profile — contact info, address, vehicles, drivers, prior claims — from the connected data source so nothing has to be re-keyed." },
  { id: 1, label: "Sign in", sublabel: "Connect to quote system", icon: KeyRound,
    explanation: "The agent securely signs into the chosen quoting destination — each carrier portal directly, or a rater like Vertafore / EZLynx." },
  { id: 2, label: "Submit details", sublabel: "Auto-fill the application", icon: ClipboardList,
    explanation: "The agent fills every field of the quote application using the data it just retrieved, then submits it for rating." },
  { id: 3, label: "Receive quote", sublabel: "Pull premium & coverage", icon: BadgeCheck,
    explanation: "The agent waits for each carrier to return a bindable indication, then captures the premium, deductible and included coverages." },
  { id: 4, label: "Compare & rank", sublabel: "Best-fit recommendation", icon: Trophy,
    explanation: "All carrier quotes are normalized side-by-side. The agent recommends the best price-to-coverage match and offers to convert it into a proposal." },
];

export default function QuoteGenerationUI({ onRun, isRunning, result }: QuoteGenerationUIProps) {
  const { toast } = useToast();
  const proposalRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"input" | "fetching" | "compare" | "proposal">("input");
  const [insuranceType, setInsuranceType] = useState("");
  const [selectedCarriers, setSelectedCarriers] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<string>("ams");
  const [submissionTarget, setSubmissionTarget] = useState<string>("direct");
  // Insured profile (auto-populated from chosen data source — agent does not ask the user to type)
  const [applicantInfo, setApplicantInfo] = useState({
    name: "Michael Reynolds",
    businessName: "Reynolds Logistics LLC",
    email: "michael@reynolds-logistics.com",
    phone: "(312) 555-0184",
    address: "1845 W Fulton St, Chicago, IL 60612",
    coverageAmount: "1000000",
  });
  const [quotes, setQuotes] = useState<CarrierQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [currentCarrier, setCurrentCarrier] = useState("");
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [logs, setLogs] = useState<QuoteLog[]>([]);
  const [currentPhase, setCurrentPhase] = useState<number>(-1);
  const [carrierPhase, setCarrierPhase] = useState<Record<string, number>>({});
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  const pushLog = (entry: Omit<QuoteLog, "id" | "ts">) => {
    setLogs(prev => [...prev, {
      ...entry,
      id: ++logIdRef.current,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    }]);
  };

  const getProposalNumber = () => `PROP-${Date.now().toString(36).toUpperCase()}`;
  const proposalNumber = useRef(getProposalNumber());

  const today = new Date();
  const effectiveDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const handleSendProposal = () => {
    setShowEmailPreview(false);
    toast({
      title: "✅ Proposal Sent Successfully!",
      description: `The insurance proposal has been sent to ${applicantInfo.email || applicantInfo.name || 'the insured'}.`,
    });
  };

  const handleExportPdf = async () => {
    const quote = quotes.find(q => q.carrier === selectedQuote);
    if (!quote) return;

    setIsExportingPdf(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 20;

      // Header
      pdf.setFillColor(59, 130, 246);
      pdf.rect(0, 0, pageWidth, 40, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Insurance Proposal', margin, 25);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Proposal #: ${proposalNumber.current}`, margin, 35);
      pdf.text(`Date: ${today.toLocaleDateString()}`, pageWidth - margin - 50, 35);

      yPos = 55;
      pdf.setTextColor(0, 0, 0);

      // Carrier Info
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Carrier Information', margin, yPos);
      yPos += 10;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Carrier: ${quote.carrier}`, margin, yPos);
      yPos += 7;
      pdf.text(`Insurance Type: ${INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || insuranceType}`, margin, yPos);
      yPos += 15;

      // Premium Details
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Premium & Coverage Details', margin, yPos);
      yPos += 10;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Annual Premium: $${quote.premium.toLocaleString()}`, margin, yPos);
      yPos += 7;
      pdf.text(`Monthly Payment: $${Math.round(quote.premium / 12).toLocaleString()}/mo`, margin, yPos);
      yPos += 7;
      pdf.text(`Coverage Limit: ${quote.coverage}`, margin, yPos);
      yPos += 7;
      pdf.text(`Deductible: $${quote.deductible.toLocaleString()}`, margin, yPos);
      yPos += 7;
      pdf.text(`Policy Term: 12 Months`, margin, yPos);
      yPos += 15;

      // Policy Period
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Policy Period', margin, yPos);
      yPos += 10;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Effective Date: ${effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, yPos);
      yPos += 7;
      const expirationDate = new Date(effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      pdf.text(`Expiration Date: ${expirationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, yPos);
      yPos += 15;

      // Insured Information
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Named Insured', margin, yPos);
      yPos += 10;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Name: ${applicantInfo.name || 'N/A'}`, margin, yPos);
      yPos += 7;
      if (applicantInfo.businessName) {
        pdf.text(`Business: ${applicantInfo.businessName}`, margin, yPos);
        yPos += 7;
      }
      pdf.text(`Email: ${applicantInfo.email || 'N/A'}`, margin, yPos);
      yPos += 7;
      pdf.text(`Phone: ${applicantInfo.phone || 'N/A'}`, margin, yPos);
      yPos += 7;
      pdf.text(`Address: ${applicantInfo.address || 'N/A'}`, margin, yPos);
      yPos += 15;

      // Features
      if (quote.features.length > 0) {
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Included Benefits', margin, yPos);
        yPos += 10;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        quote.features.forEach(feature => {
          pdf.text(`• ${feature}`, margin, yPos);
          yPos += 6;
        });
        pdf.text(`• 24/7 Customer Support`, margin, yPos);
        yPos += 6;
        pdf.text(`• Online Policy Management`, margin, yPos);
        yPos += 15;
      }

      // Footer
      pdf.setFillColor(245, 245, 245);
      pdf.rect(0, 270, pageWidth, 30, 'F');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text('This proposal is valid for 30 days from the date of issue.', margin, 280);
      pdf.text(`Document ID: ${proposalNumber.current} | Generated by AI Quote Agent`, margin, 286);

      pdf.save(`Insurance_Proposal_${proposalNumber.current}.pdf`);

      toast({
        title: "📄 PDF Exported Successfully!",
        description: "The proposal has been downloaded to your device.",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toggleCarrier = (carrierId: string) => {
    setSelectedCarriers(prev => 
      prev.includes(carrierId) 
        ? prev.filter(c => c !== carrierId)
        : [...prev, carrierId]
    );
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const setCarrierTo = (name: string, phase: number) => {
    setCarrierPhase(prev => ({ ...prev, [name]: phase }));
  };

  const simulateFetchQuotes = async () => {
    if (!insuranceType || selectedCarriers.length === 0) return;

    const insuredLabel = applicantInfo.businessName || applicantInfo.name || "the insured";
    const lobLabel = INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || "the policy";
    const sourceMeta = DATA_SOURCES.find(s => s.id === dataSource);
    const targetMeta = SUBMISSION_TARGETS.find(t => t.id === submissionTarget);
    const sourceLabel = sourceMeta?.name ?? "the connected source";
    const targetLabel = targetMeta?.name ?? "carrier portals";

    setStep("fetching");
    setFetchProgress(0);
    setQuotes([]);
    setLogs([]);
    setCarrierPhase({});
    setCurrentPhase(-1);
    setExpandedPhase(null);

    const carriers = selectedCarriers
      .map(id => CARRIERS.find(c => c.id === id))
      .filter(Boolean) as { id: string; name: string }[];

    const initialQuotes: CarrierQuote[] = carriers.map(c => ({
      carrier: c.name, logo: "shield", premium: 0, coverage: "", deductible: 0,
      status: "pending", features: [],
    }));
    setQuotes(initialQuotes);
    carriers.forEach(c => setCarrierTo(c.name, -1));

    pushLog({ phase: 0, type: "divider", message: `Preparing ${lobLabel} quote run for ${insuredLabel} · ${carriers.length} carriers via ${targetLabel}` });
    await sleep(400);

    // ---- Phase 0: Fetch insured details ----
    setCurrentPhase(0);
    pushLog({ phase: 0, type: "divider", message: `STEP 1 of 5 — Fetching insured details from ${sourceLabel}` });
    pushLog({ phase: 0, message: `Connecting to ${sourceLabel}…` });
    await sleep(350);
    if (dataSource === "ams") {
      pushLog({ phase: 0, type: "success", message: `Located client record for ${insuredLabel}` });
      await sleep(180);
      pushLog({ phase: 0, message: `Pulling contact info, address, prior policies & loss history…` });
      await sleep(280);
      pushLog({ phase: 0, type: "success", message: `Loaded 4 vehicles, 2 drivers, 12-month clean loss history` });
    } else {
      pushLog({ phase: 0, type: "success", message: `Found latest Jotform submission from ${insuredLabel}` });
      await sleep(80);
      await sleep(220);
      pushLog({ phase: 0, message: `Parsing form fields and uploaded supporting documents…` });
      await sleep(300);
      pushLog({ phase: 0, type: "success", message: `Extracted 18 fields and 3 attachments — ready to submit` });
    }
    carriers.forEach(c => setCarrierTo(c.name, 0));
    setFetchProgress(15);

    // ---- Phase 1: Sign in ----
    setCurrentPhase(1);
    pushLog({ phase: 1, type: "divider", message: `STEP 2 of 5 — Signing into ${targetLabel}` });
    if (submissionTarget === "direct") {
      for (const c of carriers) {
        setCarrierTo(c.name, 1);
        pushLog({ phase: 1, carrier: c.name, message: `Opening ${c.name} agent portal…` });
        await sleep(160);
        pushLog({ phase: 1, carrier: c.name, type: "success", message: `Signed into ${c.name} as agency user` });
      }
    } else {
      pushLog({ phase: 1, message: `Authenticating with ${targetLabel} using SSO…` });
      await sleep(400);
      pushLog({ phase: 1, type: "success", message: `Connected to ${targetLabel} — ${carriers.length} carrier appointments verified` });
      carriers.forEach(c => setCarrierTo(c.name, 1));
    }
    setFetchProgress(30);

    // ---- Phase 2: Submit details ----
    setCurrentPhase(2);
    pushLog({ phase: 2, type: "divider", message: `STEP 3 of 5 — Auto-filling and submitting the application` });
    if (submissionTarget === "direct") {
      for (const c of carriers) {
        setCarrierTo(c.name, 2);
        pushLog({ phase: 2, carrier: c.name, message: `Auto-filling ${c.name} ${lobLabel} application from ${sourceMeta?.name}…` });
        await sleep(220);
        pushLog({ phase: 2, carrier: c.name, type: "success", message: `${c.name} accepted the submission — waiting for rating` });
      }
    } else {
      pushLog({ phase: 2, message: `Submitting one application to ${targetLabel} for bridge to all ${carriers.length} carriers…` });
      await sleep(500);
      pushLog({ phase: 2, type: "success", message: `${targetLabel} accepted submission · bridging to carriers now` });
      carriers.forEach(c => setCarrierTo(c.name, 2));
    }
    setFetchProgress(50);

    // ---- Phase 3: Receive quote ----
    setCurrentPhase(3);
    pushLog({ phase: 3, type: "divider", message: `STEP 4 of 5 — Waiting for carrier quotes` });

    for (let i = 0; i < carriers.length; i++) {
      const c = carriers[i];
      setCurrentCarrier(c.name);
      setCarrierTo(c.name, 3);
      setQuotes(prev => prev.map((q, idx) => idx === i ? { ...q, status: "fetching" } : q));

      pushLog({ phase: 3, carrier: c.name, message: `${c.name} is rating the risk…` });
      await sleep(420);

      const mockQuote: CarrierQuote = {
        carrier: c.name, logo: "shield",
        premium: Math.floor(1200 + Math.random() * 3000),
        coverage: `$${(parseInt(applicantInfo.coverageAmount) || 500000).toLocaleString()}`,
        deductible: [500, 1000, 1500, 2000, 2500][Math.floor(Math.random() * 5)],
        status: "complete",
        features: [
          "24/7 Claims Support",
          Math.random() > 0.5 ? "Multi-policy Discount" : "New Customer Discount",
          Math.random() > 0.5 ? "Paperless Billing Discount" : "Autopay Discount",
          Math.random() > 0.3 ? "Accident Forgiveness" : "Roadside Assistance",
        ].slice(0, 2 + Math.floor(Math.random() * 2)),
      };

      setQuotes(prev => prev.map((q, idx) => idx === i ? mockQuote : q));
      pushLog({
        phase: 3, carrier: c.name, type: "success",
        message: `${c.name} returned $${mockQuote.premium.toLocaleString()}/yr · $${mockQuote.deductible.toLocaleString()} deductible`,
      });
      setFetchProgress(50 + ((i + 1) / carriers.length) * 40);
    }

    // ---- Phase 4: Compare & rank ----
    setCurrentPhase(4);
    pushLog({ phase: 4, type: "divider", message: `STEP 5 of 5 — Identifying the best quote for ${insuredLabel}` });
    await sleep(400);
    carriers.forEach(c => setCarrierTo(c.name, 4));
    pushLog({ phase: 4, type: "success", message: `Ranked ${carriers.length} quotes by price-to-coverage value` });
    pushLog({ phase: 4, type: "success", message: `Best quote identified — ready to convert into a proposal and send to the insured` });
    setFetchProgress(100);
    await sleep(500);

    setCurrentCarrier("");
    setStep("compare");

    onRun({ type: "quote-generation", action: "compare", insuranceType, dataSource, submissionTarget, carriers: selectedCarriers });
  };

  const generateProposal = () => {
    if (!selectedQuote) return;
    const quote = quotes.find(q => q.carrier === selectedQuote);
    if (!quote) return;
    setStep("proposal");
    onRun({ type: "quote-generation", action: "generate-proposal", insuranceType, applicantInfo, selectedQuote: quote });
  };

  const resetFlow = () => {
    setStep("input");
    setQuotes([]);
    setSelectedQuote(null);
    setFetchProgress(0);
    setLogs([]);
    setCarrierPhase({});
    setCurrentPhase(-1);
    setExpandedPhase(null);
  };

  const renderInputStep = () => {
    const insuredLabel = applicantInfo.businessName || applicantInfo.name;
    return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden border-primary/20 shadow-[var(--shadow-premium,0_20px_60px_-20px_hsl(245_58%_51%/0.4))]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[hsl(245_65%_42%)]" />
        <div className="absolute inset-0 opacity-50"
          style={{ backgroundImage: "radial-gradient(circle at 90% 10%, hsl(245 80% 70% / 0.55), transparent 55%), radial-gradient(circle at 10% 100%, hsl(245 90% 30% / 0.5), transparent 50%)" }} />
        <CardContent className="relative pt-6 pb-6 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <Badge variant="outline" className="border-white/30 bg-white/10 text-primary-foreground backdrop-blur-sm mb-2">
                <Zap className="h-3 w-3 mr-1.5" /> Quote Generation Agent
              </Badge>
              <h2 className="text-2xl font-bold leading-none">Get bindable quotes — without re-keying anything</h2>
              <p className="text-sm text-primary-foreground/80 mt-1.5">
                Pulls insured details from your AMS or Jotform, submits to carriers (or a rater), and recommends the best fit.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2">
            {QUOTE_PHASES.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.id} className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-white/15 flex items-center justify-center">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-primary-foreground/70">Step {p.id + 1}</div>
                      <div className="text-xs font-semibold truncate">{p.label}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Configure the run
          </CardTitle>
          <CardDescription>Three quick choices. The agent handles the rest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 1. Data source */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">1</Badge>
              <Label className="text-base font-semibold">Where should we pull the insured's details from?</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DATA_SOURCES.map(src => {
                const Icon = src.icon;
                const active = dataSource === src.id;
                return (
                  <button key={src.id} type="button" onClick={() => setDataSource(src.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{src.name}</span>
                          {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{src.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {insuredLabel && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-semibold truncate">{insuredLabel}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {applicantInfo.email} · {applicantInfo.phone} · {applicantInfo.address}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40 shrink-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Loaded from {DATA_SOURCES.find(s => s.id === dataSource)?.name}
                </Badge>
              </div>
            )}
          </div>

          <Separator />

          {/* 2. LOB */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">2</Badge>
              <Label className="text-base font-semibold">What line of business?</Label>
            </div>
            <Select value={insuranceType} onValueChange={setInsuranceType}>
              <SelectTrigger><SelectValue placeholder="Select insurance type" /></SelectTrigger>
              <SelectContent>
                {INSURANCE_TYPES.map(type => (
                  <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 3. Submission target */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">3</Badge>
              <Label className="text-base font-semibold">Where should we submit the quote request?</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SUBMISSION_TARGETS.map(t => {
                const Icon = t.icon;
                const active = submissionTarget === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setSubmissionTarget(t.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-primary/40"
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{t.name}</span>
                          {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* 4. Carriers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">4</Badge>
                <Label className="text-base font-semibold">Which carriers should we quote?</Label>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCarriers(CARRIERS.slice(0, 6).map(c => c.id))}>
                  Quick pick (top 6)
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCarriers([])}>Clear</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {CARRIERS.map(carrier => (
                <div key={carrier.id} onClick={() => toggleCarrier(carrier.id)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedCarriers.includes(carrier.id) ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground"
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10"><Shield className="h-4 w-4 text-primary" /></div>
                    <span className="font-medium text-sm flex-1 truncate">{carrier.name}</span>
                    {selectedCarriers.includes(carrier.id) && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
            {selectedCarriers.length > 0 && (
              <p className="text-sm text-muted-foreground">{selectedCarriers.length} carrier{selectedCarriers.length === 1 ? "" : "s"} selected</p>
            )}
          </div>

          {/* Run summary + CTA */}
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Run summary</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="font-normal"><Database className="h-3 w-3 mr-1" /> {DATA_SOURCES.find(s => s.id === dataSource)?.name}</Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="secondary" className="font-normal">{INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || "Pick a line of business"}</Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="secondary" className="font-normal"><Network className="h-3 w-3 mr-1" /> {SUBMISSION_TARGETS.find(t => t.id === submissionTarget)?.name}</Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="secondary" className="font-normal"><Building2 className="h-3 w-3 mr-1" /> {selectedCarriers.length} carrier{selectedCarriers.length === 1 ? "" : "s"}</Badge>
            </div>
            <Button onClick={simulateFetchQuotes} disabled={!insuranceType || selectedCarriers.length === 0 || isRunning} className="w-full bg-gradient-primary hover:opacity-90">
              {isRunning ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>)
                : (<><Zap className="h-4 w-4 mr-2" />Start Quote Run<ArrowRight className="h-4 w-4 ml-2" /></>)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderFetchingStep = () => {
    const totalCarriers = quotes.length || selectedCarriers.length || 1;
    const insuredLabel = applicantInfo.businessName || applicantInfo.name || "the insured";
    const lobLabel = INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || "this policy";

    return (
      <div className="space-y-6">
        {/* ===== Hero header ===== */}
        <Card className="relative overflow-hidden border-primary/20 shadow-[var(--shadow-premium,0_20px_60px_-20px_hsl(245_58%_51%/0.4))]">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[hsl(245_65%_42%)]" />
          <div className="absolute inset-0 opacity-50"
            style={{ backgroundImage: "radial-gradient(circle at 90% 10%, hsl(245 80% 70% / 0.55), transparent 55%), radial-gradient(circle at 10% 100%, hsl(245 90% 30% / 0.5), transparent 50%)" }} />
          <CardContent className="relative pt-6 pb-6 text-primary-foreground">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <Badge variant="outline" className="border-white/30 bg-white/10 text-primary-foreground backdrop-blur-sm mb-2">
                    <Zap className="h-3 w-3 mr-1.5" /> Quote Generation Agent · Live
                  </Badge>
                  <h2 className="text-2xl font-bold leading-none">Shopping {lobLabel} for {insuredLabel}</h2>
                  <p className="text-sm text-primary-foreground/80 mt-1.5">
                    Asking {totalCarriers} carriers for indicative quotes · 5 simple steps
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-primary-foreground/70">Overall progress</p>
                  <p className="text-2xl font-bold">{Math.round(fetchProgress)}%</p>
                </div>
                <div className="h-14 w-14 rounded-full border-4 border-white/30 flex items-center justify-center relative">
                  <svg className="absolute inset-0" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="white" strokeOpacity="0.95"
                      strokeWidth="4" strokeDasharray={`${(fetchProgress / 100) * 150.8} 150.8`}
                      strokeLinecap="round" transform="rotate(-90 28 28)"
                      style={{ transition: "stroke-dasharray 0.5s ease" }} />
                  </svg>
                  <Activity className="h-5 w-5" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== Phase tracker ===== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> What the agent is doing right now
            </CardTitle>
            <CardDescription>Click any step to see what's happening in plain English</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {QUOTE_PHASES.map((phase) => {
                const Icon = phase.icon;
                const carriersDone = quotes.filter(q => (carrierPhase[q.carrier] ?? -1) > phase.id).length
                  + (phase.id === 4 ? quotes.filter(q => (carrierPhase[q.carrier] ?? -1) === 4).length : 0);
                const carriersHere = quotes.filter(q => (carrierPhase[q.carrier] ?? -1) === phase.id).length;
                const completedHere = phase.id < 4
                  ? quotes.filter(q => (carrierPhase[q.carrier] ?? -1) > phase.id).length
                  : quotes.filter(q => (carrierPhase[q.carrier] ?? -1) >= 4).length;
                const pct = Math.round((completedHere / totalCarriers) * 100);
                const isActive = currentPhase === phase.id;
                const isDone = currentPhase > phase.id || (phase.id === 4 && step === "compare");
                const isExpanded = expandedPhase === phase.id;

                return (
                  <motion.button
                    key={phase.id}
                    layout
                    onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                    className={`text-left rounded-xl border-2 p-3 transition-all ${
                      isActive ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : isDone ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-border bg-card hover:border-primary/30"
                    } ${isExpanded ? "ring-2 ring-primary/40" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        isActive ? "bg-primary text-primary-foreground"
                        : isDone ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                      }`}>
                        {isActive ? <Loader2 className="h-4 w-4 animate-spin" />
                        : isDone ? <CheckCircle2 className="h-4 w-4" />
                        : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Step {phase.id + 1}</div>
                    </div>
                    <div className="text-sm font-semibold text-foreground leading-tight">{phase.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{phase.sublabel}</div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-primary"}`}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{completedHere}/{totalCarriers} carriers</span>
                      {carriersHere > 0 && isActive && (
                        <span className="text-primary font-medium">{carriersHere} working</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Expanded phase explanation */}
            <AnimatePresence>
              {expandedPhase !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          Step {expandedPhase + 1}: {QUOTE_PHASES[expandedPhase].label}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">{QUOTE_PHASES[expandedPhase].explanation}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3 max-h-48 overflow-y-auto space-y-1.5">
                      {logs.filter(l => l.phase === expandedPhase).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Waiting for this step to start…</p>
                      ) : logs.filter(l => l.phase === expandedPhase).map(l => (
                        <div key={l.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground/60 font-mono">{l.ts}</span>
                          {l.type === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                            : l.type === "divider" ? <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                            : <Activity className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                          <span className={l.type === "divider" ? "font-semibold text-foreground" : "text-foreground/80"}>
                            {l.carrier && <span className="font-medium text-primary">[{l.carrier}] </span>}
                            {l.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* ===== Per-carrier progress tiles ===== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Carriers
            </CardTitle>
            <CardDescription>Each carrier moves through the same 5 steps</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {quotes.map((quote, idx) => {
                const cp = carrierPhase[quote.carrier] ?? -1;
                const cPct = Math.max(0, Math.min(100, ((cp + 1) / QUOTE_PHASES.length) * 100));
                const done = quote.status === "complete";
                const working = quote.status === "fetching" || (cp >= 0 && cp < 4);
                return (
                  <motion.div key={idx} layout
                    className={`rounded-xl border p-3 transition-all ${
                      done ? "border-emerald-500/40 bg-emerald-500/5"
                      : working ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm truncate">{quote.carrier}</span>
                      </div>
                      {done ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-600 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Quoted
                        </Badge>
                      ) : working ? (
                        <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Working
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          <Clock className="h-3 w-3 mr-1" /> Waiting
                        </Badge>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                      <motion.div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-primary"}`}
                        initial={{ width: 0 }} animate={{ width: `${cPct}%` }} transition={{ duration: 0.4 }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {cp < 0 ? "Queued"
                        : cp === 4 ? "Compared"
                        : `Step ${cp + 1}: ${QUOTE_PHASES[cp].label}`}
                      </span>
                      {done && (
                        <span className="font-semibold text-emerald-600">
                          ${quote.premium.toLocaleString()}/yr
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ===== Live activity log ===== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Live activity
            </CardTitle>
            <CardDescription>What the agent is saying as it works — written for business users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-muted/30 p-3 h-64 overflow-y-auto space-y-1.5">
              {logs.map(l => l.type === "divider" ? (
                <div key={l.id} className="flex items-center gap-2 mt-2 mb-1 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-bold text-primary">{l.message}</span>
                </div>
              ) : (
                <div key={l.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground/60 font-mono shrink-0">{l.ts}</span>
                  {l.type === "success"
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    : <Activity className="h-3.5 w-3.5 text-primary/70 shrink-0 mt-0.5" />}
                  <span className="text-foreground/85">
                    {l.carrier && <span className="font-medium text-primary">[{l.carrier}] </span>}
                    {l.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCompareStep = () => {
    const completed = quotes.filter(q => q.status === "complete");
    const insuredLabel = applicantInfo.businessName || applicantInfo.name || "the insured";
    const lobLabel = INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || "policy";
    const premiums = completed.map(q => q.premium);
    const lowest = premiums.length ? Math.min(...premiums) : 0;
    const highest = premiums.length ? Math.max(...premiums) : 0;
    const avg = premiums.length ? Math.round(premiums.reduce((a, b) => a + b, 0) / premiums.length) : 0;
    const savings = highest - lowest;
    const recommended = completed.find(q => q.premium === lowest);

    return (
    <div className="space-y-6">
      {/* ===== Results Hero ===== */}
      <Card className="relative overflow-hidden border-primary/20 shadow-[var(--shadow-premium,0_20px_60px_-20px_hsl(245_58%_51%/0.4))]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[hsl(245_65%_42%)]" />
        <div className="absolute inset-0 opacity-50"
          style={{ backgroundImage: "radial-gradient(circle at 90% 10%, hsl(245 80% 70% / 0.55), transparent 55%), radial-gradient(circle at 10% 100%, hsl(245 90% 30% / 0.5), transparent 50%)" }} />
        <CardContent className="relative pt-6 pb-6 text-primary-foreground space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <Badge variant="outline" className="border-white/30 bg-white/10 text-primary-foreground backdrop-blur-sm mb-2">
                  <CheckCircle2 className="h-3 w-3 mr-1.5" /> {completed.length} quotes ready
                </Badge>
                <h2 className="text-2xl font-bold leading-none">Quotes for {insuredLabel}</h2>
                <p className="text-sm text-primary-foreground/80 mt-1.5">{lobLabel} · Recommended: <span className="font-semibold">{recommended?.carrier ?? "—"}</span></p>
              </div>
            </div>
            {recommended && (
              <Button onClick={() => setSelectedQuote(recommended.carrier)} className="bg-white text-primary hover:bg-white/90">
                <BadgeCheck className="h-4 w-4 mr-2" /> Pick recommended
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Wallet, label: "Lowest premium", value: `$${lowest.toLocaleString()}/yr`, sub: recommended?.carrier ?? "—" },
              { icon: TrendingDown, label: "Potential savings", value: `$${savings.toLocaleString()}`, sub: "vs. highest quote" },
              { icon: Calculator, label: "Average premium", value: `$${avg.toLocaleString()}/yr`, sub: `${completed.length} carriers` },
              { icon: Award, label: "Highest premium", value: `$${highest.toLocaleString()}/yr`, sub: "Top of market" },
            ].map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-primary-foreground/70 font-medium">{k.label}</span>
                    <Icon className="h-4 w-4 text-primary-foreground/80" />
                  </div>
                  <p className="text-xl font-bold leading-none">{k.value}</p>
                  <p className="text-[11px] text-primary-foreground/70 mt-1">{k.sub}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Compare Quotes
          </CardTitle>
          <CardDescription>
            Select the best quote to convert into a proposal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completed.map((quote, idx) => {
              const isBest = quote.premium === lowest && completed.length > 1;
              return (
              <div
                key={idx}
                onClick={() => setSelectedQuote(quote.carrier)}
                className={`p-5 rounded-xl border-2 cursor-pointer transition-all relative ${
                  selectedQuote === quote.carrier
                    ? "border-primary bg-primary/5 shadow-lg"
                    : isBest ? "border-emerald-500/40 hover:border-emerald-500"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                {isBest && (
                  <Badge className="absolute -top-2 left-4 bg-emerald-500 hover:bg-emerald-500 text-white border-0 text-[10px]">
                    <Trophy className="h-3 w-3 mr-1" /> BEST PRICE
                  </Badge>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Annual Premium</span>
                    <span className="text-xl font-bold text-primary">
                      ${quote.premium.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Coverage</span>
                    <span>{quote.coverage}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Deductible</span>
                    <span>${quote.deductible.toLocaleString()}</span>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Included Features:</span>
                    <div className="flex flex-wrap gap-1">
                      {quote.features.map((feature, fidx) => (
                        <Badge key={fidx} variant="secondary" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={resetFlow}>
              Start Over
            </Button>
            <Button
              onClick={generateProposal}
              disabled={!selectedQuote || isRunning}
              className="flex-1 bg-gradient-primary hover:opacity-90"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Proposal...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Proposal
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Visual Analysis - always show when quotes are complete */}
      <QuoteComparisonAnalysis quotes={quotes} insuranceType={insuranceType} />

      {/* Detailed Coverage Schedule */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" />
            Policy Coverage Details
          </CardTitle>
          <CardDescription>
            Complete coverage schedule, limits, exclusions, and conditions for {INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || 'this policy type'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyCoverageDetails insuranceType={insuranceType} />
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderProposalStep = () => {
    const quote = quotes.find(q => q.carrier === selectedQuote);
    const expirationDate = new Date(effectiveDate.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    return (
      <div className="space-y-6">
        {/* Professional Insurance Proposal Document */}
        <div className="bg-white dark:bg-card rounded-xl border-2 border-border shadow-lg overflow-hidden">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl">
                  <Shield className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Insurance Proposal</h1>
                  <p className="text-primary-foreground/80 text-sm">
                    {INSURANCE_TYPES.find(t => t.id === insuranceType)?.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-primary-foreground/80">Proposal #</p>
                <p className="font-mono font-bold">{proposalNumber.current}</p>
              </div>
            </div>
          </div>

          {/* Document Body */}
          <div className="p-6 space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <Badge className="bg-green-500/10 text-green-600 border-green-500/30 px-4 py-1">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Ready for Review
              </Badge>
              <p className="text-sm text-muted-foreground">
                Generated on {today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <Separator />

            {/* Carrier & Coverage Section */}
            {quote && (
              <>
                {/* Carrier Info */}
                <div className="bg-muted/30 rounded-xl p-5 border border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{quote.carrier}</h2>
                      <p className="text-sm text-muted-foreground">Insurance Carrier</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-background rounded-lg p-3">
                      <Award className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-xs text-muted-foreground">AM Best Rating</p>
                      <p className="font-bold text-foreground">A+ (Superior)</p>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <Shield className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                      <p className="text-xs text-muted-foreground">Years in Business</p>
                      <p className="font-bold text-foreground">75+ Years</p>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <CheckSquare className="h-5 w-5 mx-auto text-green-500 mb-1" />
                      <p className="text-xs text-muted-foreground">Claims Satisfaction</p>
                      <p className="font-bold text-foreground">4.7/5.0</p>
                    </div>
                  </div>
                </div>

                {/* Premium & Coverage Details */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Premium Card */}
                  <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl p-5 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-foreground">Premium Details</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Annual Premium</span>
                        <span className="text-2xl font-bold text-green-600">${quote.premium.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Monthly Payment</span>
                        <span className="font-medium">${Math.round(quote.premium / 12).toLocaleString()}/mo</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Payment Options</span>
                        <span className="font-medium">Annual, Semi-Annual, Monthly</span>
                      </div>
                    </div>
                  </div>

                  {/* Coverage Card */}
                  <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl p-5 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold text-foreground">Coverage Summary</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Coverage Limit</span>
                        <span className="text-2xl font-bold text-blue-600">{quote.coverage}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Deductible</span>
                        <span className="font-medium">${quote.deductible.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Policy Term</span>
                        <span className="font-medium">12 Months</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Policy Dates */}
                <div className="bg-muted/20 rounded-xl p-5 border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Policy Period</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-muted-foreground mb-1">Effective Date</p>
                      <p className="font-bold text-lg text-foreground">
                        {effectiveDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="bg-background rounded-lg p-4">
                      <p className="text-xs text-muted-foreground mb-1">Expiration Date</p>
                      <p className="font-bold text-lg text-foreground">
                        {expirationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Included Features */}
                <div className="bg-muted/20 rounded-xl p-5 border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <FileCheck className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Included Benefits & Features</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {quote.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-background rounded-lg p-3">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 bg-background rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-foreground">24/7 Customer Support</span>
                    </div>
                    <div className="flex items-center gap-2 bg-background rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-foreground">Online Policy Management</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Coverage Schedule - New Section */}
                <PolicyCoverageDetails insuranceType={insuranceType} />
              </>
            )}

            <Separator />

            {/* Insured Information */}
            <div className="bg-muted/20 rounded-xl p-5 border border-border">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Named Insured</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Full Name</p>
                      <p className="font-medium text-foreground">{applicantInfo.name || 'N/A'}</p>
                    </div>
                  </div>
                  {applicantInfo.businessName && (
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Business Name</p>
                        <p className="font-medium text-foreground">{applicantInfo.businessName}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="font-medium text-foreground">{applicantInfo.address || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email Address</p>
                      <p className="font-medium text-foreground">{applicantInfo.email || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone Number</p>
                      <p className="font-medium text-foreground">{applicantInfo.phone || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Important Notice</p>
                  <p>
                    This proposal is valid for 30 days from the date of issue. Coverage is subject to 
                    underwriting approval and policy terms and conditions. Please review all documents 
                    carefully before accepting. Contact your agent for any questions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-muted/30 px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>Document ID: {proposalNumber.current} | Generated by AI Quote Agent</p>
              <p>Page 1 of 1</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={resetFlow}>
            New Quote
          </Button>
          <Button 
            variant="outline"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export PDF
          </Button>
          <Button 
            className="flex-1 bg-gradient-primary hover:opacity-90"
            onClick={() => setShowEmailPreview(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview & Send Email
          </Button>
        </div>

        {/* Email Preview Dialog */}
        {quote && (
          <EmailPreviewDialog
            open={showEmailPreview}
            onOpenChange={setShowEmailPreview}
            onSend={handleSendProposal}
            proposalData={{
              recipientName: applicantInfo.name,
              recipientEmail: applicantInfo.email,
              carrierName: quote.carrier,
              premium: quote.premium,
              coverage: quote.coverage,
              deductible: quote.deductible,
              insuranceType: INSURANCE_TYPES.find(t => t.id === insuranceType)?.name || insuranceType,
              proposalNumber: proposalNumber.current,
              effectiveDate: effectiveDate,
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {step === "input" && renderInputStep()}
      {step === "fetching" && renderFetchingStep()}
      {step === "compare" && renderCompareStep()}
      {step === "proposal" && renderProposalStep()}
    </div>
  );
}
