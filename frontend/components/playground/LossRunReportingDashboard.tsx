'use client';
// Loss Run Reporting — broker renewal cockpit + new-business cockpit.
//
// Layout: cards as containers with their own headers. Restrained color —
// status tones only (success / warning / destructive) and only when
// meaningful. Typography hierarchy via size and weight. Generous
// whitespace inside cards, clear visual containment between sections.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Search, FileSpreadsheet, Download, CalendarClock,
  ListChecks, Target, Trophy, FileText, Sparkles,
  ShieldAlert, Brain, ChevronDown,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CLIENT_DATASETS, getClientDataset, buildCustomerBook,
  type CustomerBookRow,
} from "./lossRunClients";
import {
  getProspects, PROSPECT_STAGE_LABEL, stageTone,
  type Prospect, type CarrierLossRunStatus,
} from "./lossRunProspects";

/* ─────────────────────────── helpers ─────────────────────────── */

const fmt  = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
  :                `$${n}`;

const monthDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
};

const renewalText = (days: number) => {
  if (days < 0)    return `${Math.abs(days)}d overdue`;
  if (days === 0)  return `today`;
  if (days <= 90)  return `in ${days}d`;
  return `in ${Math.round(days / 30)}mo`;
};

/* ─────────────────────────── recommended actions ─────────────────────────── */

type ActionPriority = "high" | "medium" | "low";

interface RecommendedAction {
  priority: ActionPriority;
  title: string;       // imperative — "Push for closure on…"
  reason: string;      // one-line why it matters
  context?: string;    // amount, carrier, claim # — optional inline detail
}

type LossRunStatus = "received" | "requested" | "stale" | "missing";
function lossRunStatusFor(policyId: string, policyTermEnd: string): LossRunStatus {
  let h = 0;
  for (let i = 0; i < policyId.length; i++) h = (h * 31 + policyId.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 10;
  const isCurrent = policyTermEnd.includes("2026") || policyTermEnd.includes("2027");
  if (!isCurrent) return "received";
  if (bucket < 6) return "received";
  if (bucket < 8) return "requested";
  if (bucket < 9) return "stale";
  return "missing";
}
const lossRunDaysOutstandingFor = (policyId: string) => {
  let h = 0;
  for (let i = 0; i < policyId.length; i++) h = (h * 17 + policyId.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % 12);
};

/* ─────────────── action builders (decision support) ─────────────── */

// Derives a list of broker actions from the loss-run analysis. Each
// action is specific, prioritized, and carries a one-line reason so the
// broker doesn't have to interpret the data themselves.
function buildRenewalActions(
  dataset: ReturnType<typeof getClientDataset>,
  totals: { incurred: number; premium: number; lossRatio: number; open: number; large: number; outstanding: number; claims: number; carriers: number },
  currentTerm: { carrier: string; lob: string; policyNumber: string; expiration: string; lossRunStatus: LossRunStatus; daysOutstanding: number }[],
  rollup: { received: number; requested: number; stale: number; missing: number; total: number },
  lrTrend: { year: string; ratio: number; incurred: number; premium: number }[],
  row: CustomerBookRow,
): RecommendedAction[] {
  const out: RecommendedAction[] = [];

  /* 1. Push for closure on the largest open claim with material reserve */
  const largestOpen = [...dataset.topLosses]
    .filter((l) => l.status === "Open")
    .sort((a, b) => b.incurred - a.incurred)[0];
  if (largestOpen) {
    const pp = totals.incurred > 0 ? (largestOpen.incurred / totals.incurred) * 100 : 0;
    out.push({
      priority: "high",
      title: `Push ${largestOpen.carrier} claims rep to close the ${largestOpen.cause.split("—")[0].trim().toLowerCase()} claim before renewal review`,
      reason: `Closing this claim removes ${pp.toFixed(0)}pp from the renewal loss ratio the underwriter sees. Call the claims handler this week and ask for a closure timeline.`,
      context: `${largestOpen.carrier} · ${largestOpen.lob} · ${fmtK(largestOpen.incurred)} incurred`,
    });
  }

  /* 2. Pricing recommendation based on LR + trend direction */
  const recent = lrTrend.slice(-2);
  const trendingDown = recent.length === 2 && recent[1].ratio < recent[0].ratio;
  if (totals.lossRatio < 50 && trendingDown) {
    out.push({
      priority: "high",
      title: "Pitch the incumbent underwriter for a 5–8% rate concession",
      reason: `5-yr LR ${totals.lossRatio.toFixed(1)}% with frequency improving. Lead the renewal meeting with the loss-control trajectory and ask for the credit before the carrier sends preliminary terms.`,
    });
  } else if (totals.lossRatio >= 50 && totals.lossRatio < 70) {
    out.push({
      priority: "medium",
      title: "Defend a flat rate at renewal — counter any carrier-proposed increase",
      reason: `LR ${totals.lossRatio.toFixed(1)}% within range. Walk the underwriter through the mitigation story to push back on any indication of an increase.`,
    });
  } else if (totals.lossRatio >= 70) {
    out.push({
      priority: "high",
      title: "Take the account to market — start with 3 alternative carriers",
      reason: `LR ${totals.lossRatio.toFixed(1)}% above 60%. Incumbent likely to ask for ≥10% increase or non-renew. Get competing indications in hand before renewal terms drop.`,
    });
  }

  /* 3. Re-pull stale loss runs */
  if (rollup.stale > 0 || rollup.missing > 0) {
    const carrierName = currentTerm.find((c) => c.lossRunStatus === "stale" || c.lossRunStatus === "missing")?.carrier ?? "outstanding carriers";
    out.push({
      priority: "high",
      title: `Re-pull stale/missing loss runs from ${carrierName}${(rollup.stale + rollup.missing) > 1 ? ` and ${(rollup.stale + rollup.missing) - 1} other${(rollup.stale + rollup.missing) > 2 ? "s" : ""}` : ""}`,
      reason: `Underwriter will reject anything dated over 90 days old. Document Retrieval can re-pull on your behalf — kick it off now so the renewal package is fresh.`,
    });
  }

  /* 4. Loss-control / safety-program follow-through if trend is improving */
  if (trendingDown && dataset.narrative.outlook.toLowerCase().includes("frequency dropped")) {
    out.push({
      priority: "medium",
      title: "Ask the incumbent for a no-cost loss-control inspection",
      reason: "Shows the carrier you're investing in ongoing mitigation — strengthens the rate-concession conversation and gives the underwriter a defensible reason to credit you.",
    });
  }

  /* 5. Brief the underwriter on the dominant exposure before they find it cold */
  if (largestOpen && largestOpen.severity === "Large") {
    out.push({
      priority: "medium",
      title: `Brief the underwriter on the ${largestOpen.cause.split("—")[0].trim().toLowerCase()} claim before they raise it`,
      reason: `Frame this as a one-time event with mitigation in place — operator retrained, process changed, on-track for closure. Volunteering the story is much stronger than the underwriter discovering it from the loss-run.`,
      context: `${largestOpen.carrier} · ${largestOpen.date}`,
    });
  }

  /* 6. Urgency cue if renewal is close */
  if (row.daysToRenewal >= 0 && row.daysToRenewal <= 45) {
    out.push({
      priority: "high",
      title: `Get the underwriter meeting on the calendar this week`,
      reason: `Renewal in ${row.daysToRenewal === 0 ? "0 days" : `${row.daysToRenewal} days`}. Pricing conversations need to happen before the carrier sends preliminary terms — typically 30 days out.`,
    });
  }

  /* Sort by priority then cap at 6 */
  const order: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
}

function buildProspectActions(prospect: Prospect): RecommendedAction[] {
  const out: RecommendedAction[] = [];
  const received = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const total    = prospect.currentCarriers.length;
  const blocked  = prospect.currentCarriers.filter((c) => c.lossRunStatus === "pending-bor").length;
  const outstanding = prospect.currentCarriers.filter((c) => c.lossRunStatus === "requested").length;

  /* 1. BOR-driven actions */
  if (prospect.borStatus === "none") {
    out.push({
      priority: "high",
      title: "Send the BOR letter to the prospect for signature",
      reason: `Most carriers will not release loss runs without a signed BOR. This is the first step before any pulls can begin — get it out today.`,
    });
  } else if (prospect.borStatus === "requested") {
    out.push({
      priority: "high",
      title: "Follow up with the prospect on the outstanding BOR signature",
      reason: `${blocked} of ${total} loss runs blocked until BOR returns. Proposal due in ${prospect.daysToProposal} days — a polite nudge today saves the timeline.`,
    });
  }

  /* 2. Outstanding pull follow-ups */
  if (outstanding > 0) {
    out.push({
      priority: "medium",
      title: `Nudge ${outstanding} carrier${outstanding !== 1 ? "s" : ""} on outstanding loss-run requests`,
      reason: `Past day 10, carrier customer service typically needs a follow-up call. Have your CSR phone or email the producer contacts on those carriers.`,
    });
  }

  /* 3. Once all in, kick off market submission */
  if (received === total && total > 0) {
    out.push({
      priority: "high",
      title: "Build the submission package and take the account to market",
      reason: `All ${total} loss runs received and analyzed. Time to package the loss runs + narrative + ACORDs and route to your target markets.`,
    });
  }

  /* 4. Urgency cue */
  if (prospect.daysToProposal >= 0 && prospect.daysToProposal <= 14) {
    out.push({
      priority: "high",
      title: `Confirm the proposal date with the prospect — ${prospect.daysToProposal}d out`,
      reason: `Inside 2-week window. Any slippage now puts the proposal at risk. Reach out to confirm the meeting still holds.`,
    });
  } else if (prospect.daysToProposal >= 0 && prospect.daysToProposal <= 30) {
    out.push({
      priority: "medium",
      title: "Confirm the proposal date with the prospect",
      reason: `Proposal due in ${prospect.daysToProposal} days. Quick touch base to make sure the timeline still holds on their side.`,
    });
  }

  /* 5. Risk-driven framing */
  if (prospect.riskTone === "success") {
    out.push({
      priority: "low",
      title: "Lead the carrier pitch with the clean-book story",
      reason: `Risk score ${prospect.riskScore} — below-average for the class. Underwriters quote sharper when you frame the data clearly up front.`,
    });
  } else {
    out.push({
      priority: "medium",
      title: "Draft the mitigation narrative for the concerning exposures",
      reason: `Risk score ${prospect.riskScore}. Context decides whether the carrier quotes aggressively or declines. Volunteer the story; don't make them hunt for it.`,
    });
  }

  const order: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
}

/* ─────────────────────────── component ─────────────────────────── */

export default function LossRunReportingDashboard() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"renewal" | "new_business">("renewal");
  const [clientId, setClientId] = useState<string>(CLIENT_DATASETS[0].id);
  const prospects = useMemo(() => getProspects(), []);
  const [prospectId, setProspectId] = useState<string>(prospects[0].id);
  const [filter, setFilter] = useState<"all" | "30d" | "90d" | "attention">("all");
  const [search, setSearch] = useState("");

  const book = useMemo(() => buildCustomerBook(), []);
  const dataset = useMemo(() => getClientDataset(clientId), [clientId]);

  const portfolio = useMemo(() => {
    const totalPremium = book.reduce((s, c) => s + c.totalPremium5yr, 0);
    const totalIncurred = book.reduce((s, c) => s + c.totalIncurred, 0);
    const openClaims = book.reduce((s, c) => s + c.openClaims, 0);
    const largeOpen = book.reduce((s, c) => s + c.largeOpen, 0);
    const renewalDue30 = book.filter((c) => c.daysToRenewal >= 0 && c.daysToRenewal <= 30).length;
    const renewalDue90 = book.filter((c) => c.daysToRenewal >= 0 && c.daysToRenewal <= 90).length;
    const attention = book.filter((c) => c.status === "attention").length;
    return {
      customers: book.length,
      totalPremium, totalIncurred, openClaims, largeOpen,
      renewalDue30, renewalDue90, attention,
      lossRatio: totalPremium ? +(100 * totalIncurred / totalPremium).toFixed(1) : 0,
    };
  }, [book]);

  const queue = useMemo(() => {
    let rows = [...book];
    if (filter === "30d")        rows = rows.filter((c) => c.daysToRenewal >= 0 && c.daysToRenewal <= 30);
    else if (filter === "90d")   rows = rows.filter((c) => c.daysToRenewal >= 0 && c.daysToRenewal <= 90);
    else if (filter === "attention") rows = rows.filter((c) => c.status === "attention");
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q));
    return rows.sort((a, b) => a.daysToRenewal - b.daysToRenewal);
  }, [book, filter, search]);

  const totals = useMemo(() => {
    const incurred = dataset.policies.reduce((s, p) => s + p.incurred, 0);
    const paid     = dataset.policies.reduce((s, p) => s + p.paid, 0);
    const outstanding = dataset.policies.reduce((s, p) => s + p.outstanding, 0);
    const claims   = dataset.policies.reduce((s, p) => s + p.claims, 0);
    const premium  = dataset.yearlyTrend.reduce((s, y) => s + y.premium, 0);
    const lossRatio = premium ? (incurred / premium) * 100 : 0;
    const carriers = new Set(dataset.policies.map(p => p.carrier)).size;
    const open = dataset.topLosses.filter(c => c.status === "Open").length;
    const large = dataset.topLosses.filter(c => c.severity === "Large").length;
    return { incurred, paid, outstanding, claims, premium, lossRatio, carriers, open, large };
  }, [dataset]);

  const currentTerm = useMemo(() => {
    const grouped = new Map<string, { carrier: string; lob: string; policyNumber: string; effective: string; expiration: string; lossRunStatus: LossRunStatus; daysOutstanding: number }>();
    dataset.policies.forEach((p) => {
      const isCurrent = p.expiration.includes("2026") || p.expiration.includes("2027");
      if (!isCurrent) return;
      const key = `${p.carrier}::${p.lob}`;
      const status = lossRunStatusFor(p.id, p.expiration);
      grouped.set(key, {
        carrier: p.carrier,
        lob: p.lob,
        policyNumber: p.policyNumber,
        effective: p.effective,
        expiration: p.expiration,
        lossRunStatus: status,
        daysOutstanding: status === "requested" || status === "stale" ? lossRunDaysOutstandingFor(p.id) : 0,
      });
    });
    return [...grouped.values()].sort((a, b) => a.carrier.localeCompare(b.carrier));
  }, [dataset]);

  const lossRunRollup = useMemo(() => ({
    received:  currentTerm.filter((p) => p.lossRunStatus === "received").length,
    requested: currentTerm.filter((p) => p.lossRunStatus === "requested").length,
    stale:     currentTerm.filter((p) => p.lossRunStatus === "stale").length,
    missing:   currentTerm.filter((p) => p.lossRunStatus === "missing").length,
    total:     currentTerm.length,
  }), [currentTerm]);

  const selected = useMemo(() => book.find((c) => c.id === clientId) ?? book[0], [book, clientId]);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${dataset.name} — Loss Run Summary`, 14, 18);
    doc.setFontSize(10);
    doc.text(`${dataset.industry} · ${dataset.hq}`, 14, 26);
    doc.text(`Period ${dataset.reportPeriod} · Generated ${dataset.runDate}`, 14, 32);
    autoTable(doc, {
      startY: 42,
      head: [["Metric", "Value"]],
      body: [
        ["Carriers", String(totals.carriers)],
        ["Policy terms", String(dataset.policies.length)],
        ["Total claims", String(totals.claims)],
        ["Total incurred", fmt(totals.incurred)],
        ["Outstanding reserves", fmt(totals.outstanding)],
        ["5-year loss ratio", `${totals.lossRatio.toFixed(1)}%`],
      ],
    });
    autoTable(doc, {
      head: [["Carrier", "Policy #", "Term", "LOB", "Clms", "Paid", "O/S", "Incurred"]],
      body: dataset.policies.map(p => [p.carrier, p.policyNumber, `${p.effective} – ${p.expiration}`, p.lob, p.claims, fmt(p.paid), fmt(p.outstanding), fmt(p.incurred)]),
      styles: { fontSize: 8 },
    });
    doc.save(`loss-run-${dataset.name.replace(/\W+/g, "-")}.pdf`);
    toast({ title: "PDF exported" });
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataset.policies), "Policies");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataset.yearlyTrend), "YearlyTrend");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataset.topLosses), "TopLosses");
    XLSX.writeFile(wb, `loss-run-${dataset.name.replace(/\W+/g, "-")}.xlsx`);
    toast({ title: "Excel exported" });
  };

  const lrTrend = useMemo(() =>
    dataset.yearlyTrend.map(y => ({
      year: y.year, incurred: y.incurred, premium: y.premium,
      ratio: y.premium ? +(y.incurred / y.premium * 100).toFixed(1) : 0,
    })),
  [dataset]);

  /* ── New business ── */
  const selectedProspect = useMemo(
    () => prospects.find((p) => p.id === prospectId) ?? prospects[0],
    [prospects, prospectId],
  );

  const prospectPortfolio = useMemo(() => {
    const closing30 = prospects.filter((p) => p.daysToProposal >= 0 && p.daysToProposal <= 30).length;
    const borOutstanding = prospects.filter((p) => p.borStatus !== "signed").length;
    let runsReceived = 0, runsOutstanding = 0, runsBlockedByBor = 0;
    prospects.forEach((p) => {
      p.currentCarriers.forEach((c) => {
        if (c.lossRunStatus === "received") runsReceived++;
        else if (c.lossRunStatus === "pending-bor") runsBlockedByBor++;
        else runsOutstanding++;
      });
    });
    const totalRuns = runsReceived + runsOutstanding + runsBlockedByBor;
    return { count: prospects.length, closing30, borOutstanding, runsReceived, runsOutstanding, runsBlockedByBor, totalRuns };
  }, [prospects]);

  return (
    <div className="space-y-5">
      <PortfolioCard
        mode={mode}
        onModeChange={setMode}
        portfolio={portfolio}
        prospectPortfolio={prospectPortfolio}
      />

      {mode === "renewal" ? (
        <div className="space-y-5">
          <CustomerTabs
            book={book}
            selectedId={clientId}
            onSelect={setClientId}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            counts={{
              all: book.length,
              "30d": portfolio.renewalDue30,
              "90d": portfolio.renewalDue90,
              attention: portfolio.attention,
            }}
            queue={queue}
          />
          <CockpitHeader row={selected} dataset={dataset} onExportPdf={exportPdf} onExportExcel={exportExcel} />
          <SnapshotKpis totals={totals} carriers={selected.carriers} policies={selected.policies} />
          {/* Actions + Top exposures side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <RecommendedActionsCard
              actions={buildRenewalActions(dataset, totals, currentTerm, lossRunRollup, lrTrend, selected)}
              title="Recommended actions"
              subtitle="What Fideon thinks you should do this renewal cycle"
            />
            <TopExposuresCard topLosses={dataset.topLosses} totalIncurred={totals.incurred} />
          </div>
          {/* Loss-run table + cause chart side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            <LossRunStatusCard currentTerm={currentTerm} rollup={lossRunRollup} />
            <CauseBreakdownCard causeBreakdown={dataset.causeBreakdown} />
          </div>
          {/* Narrative + 5-yr trend chart side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            <NarrativeCard dataset={dataset} totals={totals} />
            <LossRatioTrendCard lrTrend={lrTrend} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ProspectTabs
            prospects={prospects}
            selectedId={prospectId}
            onSelect={setProspectId}
          />
          <ProspectHeader prospect={selectedProspect} />
          <ProspectSnapshot prospect={selectedProspect} />
          {/* Actions + Carriers side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <RecommendedActionsCard
              actions={buildProspectActions(selectedProspect)}
              title="Recommended actions"
              subtitle="Next steps to move this prospect forward"
            />
            <ProspectCarriersCard prospect={selectedProspect} />
          </div>
          <ProspectLossRunSummary prospect={selectedProspect} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════ portfolio card ════════════════════════ */

function PortfolioCard({
  mode, onModeChange, portfolio, prospectPortfolio,
}: {
  mode: "renewal" | "new_business";
  onModeChange: (m: "renewal" | "new_business") => void;
  portfolio: any;
  prospectPortfolio: { count: number; closing30: number; borOutstanding: number; runsReceived: number; runsOutstanding: number; runsBlockedByBor: number; totalRuns: number };
}) {
  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-none">
              Loss Run Reporting
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-2">
              {mode === "renewal"
                ? `${portfolio.customers} commercial accounts · renewal cockpit`
                : `${prospectPortfolio.count} prospects · new-business pipeline`}
            </p>
          </div>
          <div className="inline-flex items-center bg-muted/50 rounded-md p-0.5 border border-border">
            <ModeButton active={mode === "renewal"}      onClick={() => onModeChange("renewal")}      label="Renewal book" />
            <ModeButton active={mode === "new_business"} onClick={() => onModeChange("new_business")} label="New business" />
          </div>
        </div>

        {mode === "renewal" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Renewals ≤ 30d" value={portfolio.renewalDue30} sub="next 30 days" accent={portfolio.renewalDue30 > 0 ? "warning" : "neutral"} />
            <Kpi label="Renewals ≤ 90d" value={portfolio.renewalDue90} sub="upcoming window" accent="primary" />
            <Kpi label="Open claims"    value={portfolio.openClaims}   sub={portfolio.largeOpen > 0 ? `${portfolio.largeOpen} large open` : "no large losses"} accent={portfolio.largeOpen > 0 ? "danger" : "neutral"} />
            <Kpi label="Portfolio LR"   value={`${portfolio.lossRatio}%`} sub="5-yr book-wide" accent={portfolio.lossRatio < 50 ? "success" : portfolio.lossRatio < 70 ? "neutral" : "danger"} />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Prospects"        value={prospectPortfolio.count} sub="active intake / analysis" accent="primary" />
            <Kpi label="Loss runs in"     value={`${prospectPortfolio.runsReceived}/${prospectPortfolio.totalRuns}`} sub={`${prospectPortfolio.runsOutstanding} outstanding`} accent={prospectPortfolio.runsReceived === prospectPortfolio.totalRuns ? "success" : "neutral"} />
            <Kpi label="Blocked by BOR"   value={prospectPortfolio.runsBlockedByBor} sub={`${prospectPortfolio.borOutstanding} BOR outstanding`} accent={prospectPortfolio.runsBlockedByBor > 0 ? "warning" : "neutral"} />
            <Kpi label="Proposals ≤ 30d"  value={prospectPortfolio.closing30} sub="deadline window" accent={prospectPortfolio.closing30 > 0 ? "warning" : "neutral"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded text-[12px] font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

type Accent = "primary" | "success" | "warning" | "danger" | "neutral";

function Kpi({ label, value, sub, accent = "neutral" }: { label: string; value: number | string; sub?: string; accent?: Accent }) {
  const barCls =
    accent === "primary" ? "bg-primary" :
    accent === "success" ? "bg-success" :
    accent === "warning" ? "bg-warning" :
    accent === "danger"  ? "bg-destructive" :
                            "bg-border";
  const valueCls =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning-foreground" :
    accent === "danger"  ? "text-destructive" :
                            "text-foreground";
  return (
    <div className="relative pl-4">
      <span className={cn("absolute left-0 top-0.5 bottom-1 w-[3px] rounded-full", barCls)} />
      <p className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-[26px] font-semibold tabular-nums mt-1.5 leading-none tracking-tight", valueCls)}>{value}</p>
      {sub && <p className="text-[11.5px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

/* ════════════════════════ customer tabs (horizontal) ════════════════════════ */

interface TabsProps {
  book: CustomerBookRow[];
  queue: CustomerBookRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  filter: "all" | "30d" | "90d" | "attention";
  onFilterChange: (f: "all" | "30d" | "90d" | "attention") => void;
  search: string;
  onSearchChange: (s: string) => void;
  counts: Record<string, number>;
}

// Always-visible horizontal strip of customer tabs across the top of
// the cockpit. Each tab is a clickable compact card showing name, days
// to renewal, and loss ratio. Selected tab gets primary accent. "View
// all" trigger at the end opens a popover with the full queue (filters,
// search) for when the book is too long to fit inline.
function CustomerTabs({ book, queue, selectedId, onSelect, filter, onFilterChange, search, onSearchChange, counts }: TabsProps) {
  const [open, setOpen] = useState(false);
  // Show all customers inline (small books) — for production with 100s
  // of customers, this would slice to the top N by urgency.
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {book.map((row) => (
        <CustomerTab
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          onClick={() => onSelect(row.id)}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "shrink-0 min-w-[120px] flex flex-col items-start justify-center gap-1 px-3.5 py-2.5",
              "rounded-lg border border-dashed border-border bg-muted/20 hover:bg-muted/40 hover:border-border-strong transition-colors",
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">
              <ListChecks className="h-3 w-3" />
              Browse all
            </span>
            <span className="text-[12px] font-semibold text-foreground tabular-nums">{counts.all} accounts</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[420px] p-0 max-h-[70vh] flex flex-col">
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[12.5px] font-semibold text-foreground tracking-tight">Renewal queue</h3>
              <span className="text-[11px] text-muted-foreground tabular-nums">{queue.length} of {counts.all}</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <Chip active={filter === "all"}       onClick={() => onFilterChange("all")}       label="All"       count={counts.all} />
              <Chip active={filter === "30d"}       onClick={() => onFilterChange("30d")}       label="≤ 30d"     count={counts["30d"]} />
              <Chip active={filter === "90d"}       onClick={() => onFilterChange("90d")}       label="≤ 90d"     count={counts["90d"]} />
              <Chip active={filter === "attention"} onClick={() => onFilterChange("attention")} label="Attention" count={counts.attention} />
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search account or industry…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-7 h-8 text-[12px]"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-border">
            {queue.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-muted-foreground">No matches.</li>
            )}
            {queue.map((row) => (
              <li key={row.id}>
                <QueueRow
                  row={row}
                  selected={row.id === selectedId}
                  onClick={() => { onSelect(row.id); setOpen(false); }}
                />
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CustomerTab({
  row, selected, onClick,
}: {
  row: CustomerBookRow;
  selected: boolean;
  onClick: () => void;
}) {
  const urgent = row.daysToRenewal >= 0 && row.daysToRenewal <= 30;
  const upcoming = row.daysToRenewal > 30 && row.daysToRenewal <= 90;
  const lrCls =
    row.lossRatioPct < 30 ? "text-success" :
    row.lossRatioPct < 60 ? "text-foreground" :
                             "text-destructive";
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 min-w-[200px] text-left px-3.5 py-2.5 rounded-lg border transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-muted/30 hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className={cn(
          "text-[12.5px] font-semibold leading-tight truncate",
          selected ? "text-primary" : "text-foreground",
        )}>{row.name}</p>
        <span className={cn(
          "text-[10.5px] font-semibold tabular-nums shrink-0 mt-0.5",
          urgent ? "text-destructive" : upcoming ? "text-primary" : "text-muted-foreground",
        )}>
          {row.daysToRenewal >= 0 ? `${row.daysToRenewal}d` : `${Math.abs(row.daysToRenewal)}d↑`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        <span className="text-muted-foreground truncate">{row.industry.split("(")[0].trim()}</span>
        <span className={cn("font-semibold tabular-nums shrink-0", lrCls)}>LR {row.lossRatioPct}%</span>
      </div>
      {row.openClaims > 0 && (
        <p className={cn(
          "text-[10px] mt-1.5",
          row.largeOpen > 0 ? "text-destructive" : "text-warning-foreground",
        )}>
          {row.openClaims} open{row.largeOpen > 0 ? ` · ${row.largeOpen} large` : ""}
        </p>
      )}
    </button>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
        active ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums text-[10.5px] opacity-70">{count}</span>
    </button>
  );
}

function QueueRow({ row, selected, onClick }: { row: CustomerBookRow; selected: boolean; onClick: () => void }) {
  const urgent = row.daysToRenewal >= 0 && row.daysToRenewal <= 30;
  const lrColor =
    row.lossRatioPct < 30 ? "text-success" :
    row.lossRatioPct < 60 ? "text-foreground" :
                             "text-destructive";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors relative",
        selected ? "bg-primary/5" : "hover:bg-muted/30",
      )}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[12.5px] font-semibold leading-tight truncate",
            selected ? "text-primary" : "text-foreground",
          )}>{row.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{row.industry.split("(")[0].trim()}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn(
            "text-[11.5px] font-semibold tabular-nums",
            urgent ? "text-destructive" : "text-foreground",
          )}>
            {renewalText(row.daysToRenewal)}
          </p>
          <p className={cn("text-[10.5px] tabular-nums mt-0.5", lrColor)}>LR {row.lossRatioPct}%</p>
        </div>
      </div>
      {row.openClaims > 0 && (
        <p className={cn(
          "text-[10.5px] mt-1.5",
          row.largeOpen > 0 ? "text-destructive" : "text-muted-foreground",
        )}>
          {row.openClaims} open{row.largeOpen > 0 ? ` · ${row.largeOpen} large` : ""}
        </p>
      )}
    </button>
  );
}

/* ════════════════════════ cockpit header ════════════════════════ */

function CockpitHeader({
  row, dataset, onExportPdf, onExportExcel,
}: {
  row: CustomerBookRow;
  dataset: ReturnType<typeof getClientDataset>;
  onExportPdf: () => void;
  onExportExcel: () => void;
}) {
  const urgent = row.daysToRenewal >= 0 && row.daysToRenewal <= 30;
  const upcoming = row.daysToRenewal > 30 && row.daysToRenewal <= 90;
  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold tracking-tight text-foreground leading-none">
              {dataset.name}
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-2.5">
              {dataset.industry.split("(")[0].trim()} · {dataset.hq} · {dataset.locations} locations · {dataset.employees} employees
            </p>
            <p className="text-[11.5px] text-muted-foreground mt-1">FEIN {dataset.fein}</p>
          </div>
          <div className="flex items-start gap-5">
            <div className={cn(
              "rounded-lg border px-3 py-2 min-w-[140px]",
              urgent ? "border-destructive/30 bg-destructive/[0.04]" :
              upcoming ? "border-primary/25 bg-primary/[0.04]" :
                          "border-border bg-muted/30",
            )}>
              <p className="text-[10px] uppercase tracking-[0.06em] font-medium text-muted-foreground inline-flex items-center gap-1">
                <CalendarClock className={cn("h-3 w-3", urgent ? "text-destructive" : upcoming ? "text-primary" : "text-muted-foreground")} />
                Renews
              </p>
              <p className={cn(
                "text-[15px] font-semibold tabular-nums mt-1 leading-none",
                urgent ? "text-destructive" : upcoming ? "text-primary" : "text-foreground",
              )}>
                {renewalText(row.daysToRenewal)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">{monthDay(row.nextRenewalISO)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" size="sm" onClick={onExportExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={onExportPdf}>
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════ snapshot kpis ════════════════════════ */

function SnapshotKpis({ totals, carriers, policies }: {
  totals: { incurred: number; premium: number; lossRatio: number; open: number; claims: number; outstanding: number; large: number };
  carriers: number;
  policies: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SnapKpi label="5-yr premium"          value={fmtK(totals.premium)}     sub={`${policies} terms · ${carriers} carriers`} accent="primary" />
      <SnapKpi label="Loss ratio"            value={`${totals.lossRatio.toFixed(1)}%`} sub={totals.lossRatio < 30 ? "Below threshold" : totals.lossRatio < 60 ? "Within threshold" : "Above 60%"} accent={totals.lossRatio < 30 ? "success" : totals.lossRatio < 60 ? "neutral" : "danger"} />
      <SnapKpi label="Open claims"           value={String(totals.open)}      sub={totals.large > 0 ? `${totals.large} large open` : `${totals.claims} total · 5y`} accent={totals.large > 0 ? "danger" : "neutral"} />
      <SnapKpi label="Outstanding reserves"  value={fmtK(totals.outstanding)} sub={`${fmtK(totals.incurred)} incurred`} accent="neutral" />
    </div>
  );
}

function SnapKpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: Accent }) {
  const valueCls =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning-foreground" :
    accent === "danger"  ? "text-destructive" :
                            "text-foreground";
  const barCls =
    accent === "primary" ? "bg-primary" :
    accent === "success" ? "bg-success" :
    accent === "warning" ? "bg-warning" :
    accent === "danger"  ? "bg-destructive" :
                            "bg-border";
  return (
    <Card>
      <CardContent className="px-4 py-4 relative">
        <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full", barCls)} />
        <div className="pl-2">
          <p className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{label}</p>
          <p className={cn("text-[24px] font-semibold tabular-nums mt-1.5 leading-none tracking-tight", valueCls)}>{value}</p>
          <p className="text-[11.5px] text-muted-foreground mt-2 truncate">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════ recommended actions ════════════════════════ */

function RecommendedActionsCard({
  actions, title, subtitle,
}: {
  actions: RecommendedAction[];
  title: string;
  subtitle: string;
}) {
  if (actions.length === 0) return null;
  const counts = {
    high:   actions.filter((a) => a.priority === "high").length,
    medium: actions.filter((a) => a.priority === "medium").length,
    low:    actions.filter((a) => a.priority === "low").length,
  };
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary" />
            {title}
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium tabular-nums">
          {counts.high > 0   && <span className="px-2 py-0.5 rounded border border-destructive/40 bg-destructive/5 text-destructive">{counts.high} high</span>}
          {counts.medium > 0 && <span className="px-2 py-0.5 rounded border border-warning/40 bg-warning/10 text-warning-foreground">{counts.medium} med</span>}
          {counts.low > 0    && <span className="px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">{counts.low} low</span>}
        </div>
      </div>
      <ol className="divide-y divide-border">
        {actions.map((action, i) => (
          <ActionRow key={i} action={action} index={i + 1} />
        ))}
      </ol>
    </Card>
  );
}

function ActionRow({ action, index }: { action: RecommendedAction; index: number }) {
  const dotCls =
    action.priority === "high"   ? "bg-destructive" :
    action.priority === "medium" ? "bg-warning" :
                                    "bg-muted-foreground/40";
  const priorityLabel =
    action.priority === "high" ? "High" : action.priority === "medium" ? "Medium" : "Low";
  const priorityCls =
    action.priority === "high"   ? "text-destructive" :
    action.priority === "medium" ? "text-warning-foreground" :
                                    "text-muted-foreground";
  return (
    <li className="px-5 py-3.5 hover:bg-muted/15 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-4 text-right">{index}.</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground leading-snug">{action.title}</p>
          <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">{action.reason}</p>
          {action.context && (
            <p className="text-[10.5px] text-muted-foreground/80 mt-1 font-mono">{action.context}</p>
          )}
        </div>
        <span className={cn("text-[10px] uppercase tracking-[0.06em] font-semibold shrink-0", priorityCls)}>
          {priorityLabel}
        </span>
      </div>
    </li>
  );
}

/* ════════════════════════ loss-run status ════════════════════════ */

function LossRunStatusCard({
  currentTerm, rollup,
}: {
  currentTerm: { carrier: string; lob: string; policyNumber: string; expiration: string; lossRunStatus: LossRunStatus; daysOutstanding: number }[];
  rollup: { received: number; requested: number; stale: number; missing: number; total: number };
}) {
  const allIn = rollup.received === rollup.total;
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Loss runs · current term
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            {rollup.received}/{rollup.total} carriers in
            {rollup.requested > 0 && ` · ${rollup.requested} awaiting`}
            {rollup.stale > 0     && ` · ${rollup.stale} stale`}
            {rollup.missing > 0   && ` · ${rollup.missing} missing`}
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "text-[10.5px] font-medium",
          allIn ? "border-success/40 bg-success/5 text-success" : "border-primary/30 bg-primary/5 text-primary",
        )}>
          {allIn ? "All received" : "Document Retrieval running"}
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {currentTerm.map((p) => (
          <li key={`${p.carrier}-${p.policyNumber}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 hover:bg-muted/15 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-semibold text-foreground">{p.carrier}</span>
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{p.lob}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                <span className="font-mono">{p.policyNumber}</span> · term to {p.expiration}
              </p>
            </div>
            <LossRunStatusPill status={p.lossRunStatus} days={p.daysOutstanding} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LossRunStatusPill({ status, days }: { status: LossRunStatus; days: number }) {
  const cfg: Record<LossRunStatus, { label: string; cls: string }> = {
    received:  { label: "Received",             cls: "border-success/40 bg-success/5 text-success" },
    requested: { label: `Requested · ${days}d`, cls: "border-primary/30 bg-primary/5 text-primary" },
    stale:     { label: "Stale",                cls: "border-warning/40 bg-warning/10 text-warning-foreground" },
    missing:   { label: "Missing",              cls: "border-destructive/40 bg-destructive/5 text-destructive" },
  };
  const c = cfg[status];
  return <Badge variant="outline" className={cn("text-[10.5px] font-medium", c.cls)}>{c.label}</Badge>;
}

/* ════════════════════════ top exposures ════════════════════════ */

function TopExposuresCard({ topLosses, totalIncurred }: { topLosses: any[]; totalIncurred: number }) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
          Top exposures
        </h3>
        <p className="text-[11.5px] text-muted-foreground mt-1">Claims driving the renewal story</p>
      </div>
      <ul className="divide-y divide-border">
        {topLosses.slice(0, 5).map((l) => {
          const pct = totalIncurred > 0 ? (l.incurred / totalIncurred) * 100 : 0;
          const open = l.status === "Open";
          const large = l.severity === "Large";
          return (
            <li key={l.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-snug">{l.cause}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    <span className="font-mono">{l.id}</span> · {l.carrier} · {l.lob} · {l.date}
                    {open && <span className="text-warning-foreground font-medium ml-1.5">· Open</span>}
                    {large && <span className="text-destructive font-medium ml-1.5">· Large</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-[15px] font-semibold tabular-nums leading-none",
                    large ? "text-destructive" : "text-foreground",
                  )}>{fmtK(l.incurred)}</p>
                  <p className="text-[10.5px] text-muted-foreground mt-1.5">{pct.toFixed(0)}% of book</p>
                </div>
              </div>
              <Progress value={pct} className="h-1" />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ════════════════════════ narrative ════════════════════════ */

function NarrativeCard({
  dataset, totals,
}: {
  dataset: ReturnType<typeof getClientDataset>;
  totals: { lossRatio: number; premium: number; carriers: number };
}) {
  const narrative =
    `${dataset.name} carries ${totals.carriers} carriers across ${dataset.policies.length} policy terms. ` +
    `5-year loss ratio is ${totals.lossRatio.toFixed(1)}% on ${fmtK(totals.premium)} of earned premium. ` +
    `Activity is concentrated in ${dataset.narrative.concentration}, driven by ${dataset.narrative.drivers}. ` +
    `${dataset.narrative.outlook}`;

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Underwriter narrative
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-1">Auto-generated · context · drivers · outlook</p>
        </div>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Fideon-drafted
        </span>
      </div>
      <CardContent className="px-5 py-5">
        <p className="text-[13px] leading-relaxed text-foreground/90">{narrative}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
          <NarrativeFact label="Renewal posture" value={dataset.narrative.recommendation} accent="success" />
          <NarrativeFact label="Risk score"      value={dataset.narrative.riskScore}      accent={dataset.narrative.riskTone === "success" ? "success" : "warning"} />
          <NarrativeFact label="Confidence"      value={dataset.narrative.confidence}     accent="primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function NarrativeFact({ label, value, accent }: { label: string; value: string; accent: Accent }) {
  const valueCls =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning-foreground" :
    accent === "danger"  ? "text-destructive" :
    accent === "primary" ? "text-primary" :
                            "text-foreground";
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.06em] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-[13.5px] font-semibold mt-1.5 leading-snug", valueCls)}>{value}</p>
    </div>
  );
}

/* ════════════════════════ trends ════════════════════════ */

function LossRatioTrendCard({ lrTrend }: { lrTrend: { year: string; incurred: number; premium: number; ratio: number }[] }) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">5-year loss ratio</h3>
        <p className="text-[11.5px] text-muted-foreground mt-1">Incurred vs earned premium per year</p>
      </div>
      <CardContent className="px-5 py-4">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={lrTrend} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmt(v)} />
            <Area type="monotone" dataKey="incurred" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#incGrad)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-5 gap-3 mt-3 pt-3 border-t border-border">
          {lrTrend.map(y => (
            <div key={y.year}>
              <p className="text-[10px] text-muted-foreground">{y.year}</p>
              <p className={cn(
                "text-[13px] font-semibold tabular-nums mt-0.5",
                y.ratio > 100 ? "text-destructive" : y.ratio > 60 ? "text-warning-foreground" : "text-foreground",
              )}>
                {y.ratio}%
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CauseBreakdownCard({ causeBreakdown }: { causeBreakdown: { name: string; value: number; color: string }[] }) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Loss by cause</h3>
        <p className="text-[11.5px] text-muted-foreground mt-1">Share of total incurred</p>
      </div>
      <CardContent className="px-5 py-4">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={causeBreakdown} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={1}>
              {causeBreakdown.map((c, i) => <Cell key={i} fill={c.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="space-y-1.5 mt-3 pt-3 border-t border-border">
          {causeBreakdown.map(c => (
            <li key={c.name} className="flex items-center justify-between text-[11.5px]">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: c.color }} />
                <span className="text-foreground/80 truncate">{c.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground shrink-0">{fmtK(c.value)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════ new-business: queue ════════════════════════ */

function ProspectTabs({
  prospects, selectedId, onSelect,
}: {
  prospects: Prospect[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {prospects.map((p) => (
        <ProspectTab
          key={p.id}
          prospect={p}
          selected={p.id === selectedId}
          onClick={() => onSelect(p.id)}
        />
      ))}
    </div>
  );
}

function ProspectTab({
  prospect, selected, onClick,
}: {
  prospect: Prospect;
  selected: boolean;
  onClick: () => void;
}) {
  const urgent = prospect.daysToProposal >= 0 && prospect.daysToProposal <= 30;
  const tone = stageTone(prospect.stage);
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning-foreground" :
    tone === "primary" ? "text-primary" :
    tone === "danger"  ? "text-destructive" :
                          "text-muted-foreground";
  const runsReceived = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const runsTotal    = prospect.currentCarriers.length;
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 min-w-[220px] text-left px-3.5 py-2.5 rounded-lg border transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-muted/30 hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className={cn(
          "text-[12.5px] font-semibold leading-tight truncate",
          selected ? "text-primary" : "text-foreground",
        )}>{prospect.name}</p>
        <span className={cn(
          "text-[10.5px] font-semibold tabular-nums shrink-0 mt-0.5",
          urgent ? "text-destructive" : "text-primary",
        )}>
          {prospect.daysToProposal}d
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        <span className={cn("font-medium truncate", toneCls)}>{PROSPECT_STAGE_LABEL[prospect.stage]}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">{runsReceived}/{runsTotal} LR</span>
      </div>
      {prospect.borStatus !== "signed" && (
        <p className="text-[10px] text-warning-foreground mt-1.5 font-medium">
          BOR {prospect.borStatus}
        </p>
      )}
    </button>
  );
}

function ProspectRow({ prospect, selected, onClick }: { prospect: Prospect; selected: boolean; onClick: () => void }) {
  const urgent = prospect.daysToProposal >= 0 && prospect.daysToProposal <= 30;
  const runsReceived = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const runsTotal    = prospect.currentCarriers.length;
  const tone = stageTone(prospect.stage);
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning-foreground" :
    tone === "primary" ? "text-primary" :
    tone === "danger"  ? "text-destructive" :
                          "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors relative",
        selected ? "bg-primary/5" : "hover:bg-muted/30",
      )}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[12.5px] font-semibold leading-tight truncate",
            selected ? "text-primary" : "text-foreground",
          )}>{prospect.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{prospect.industry.split("(")[0].trim()}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn(
            "text-[11.5px] font-semibold tabular-nums",
            urgent ? "text-destructive" : "text-foreground",
          )}>{prospect.daysToProposal}d</p>
          <p className="text-[10.5px] text-muted-foreground tabular-nums mt-0.5">{runsReceived}/{runsTotal} LR</p>
        </div>
      </div>
      <p className={cn("text-[10.5px] mt-1.5 font-medium", toneCls)}>
        {PROSPECT_STAGE_LABEL[prospect.stage]}
        {prospect.borStatus !== "signed" && (
          <span className="text-muted-foreground ml-1.5 font-normal">· BOR {prospect.borStatus}</span>
        )}
      </p>
    </button>
  );
}

/* ════════════════════════ new-business: cockpit ════════════════════════ */

function ProspectHeader({ prospect }: { prospect: Prospect }) {
  const urgent = prospect.daysToProposal >= 0 && prospect.daysToProposal <= 30;
  return (
    <Card>
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px] font-medium border-primary/30 bg-primary/5 text-primary">
                <Trophy className="h-2.5 w-2.5 mr-1" /> Prospect
              </Badge>
              <span className="text-[11px] text-muted-foreground font-medium">{PROSPECT_STAGE_LABEL[prospect.stage]}</span>
            </div>
            <h2 className="text-[22px] font-semibold tracking-tight text-foreground leading-none">
              {prospect.name}
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-2.5">
              {prospect.industry.split("(")[0].trim()} · {prospect.hq} · {prospect.locations} loc · {prospect.employees} employees
            </p>
            <p className="text-[11.5px] text-muted-foreground mt-1">
              Producer: <span className="text-foreground font-medium">{prospect.producer}</span>
            </p>
          </div>
          <div className={cn(
            "rounded-lg border px-3 py-2 min-w-[140px]",
            urgent ? "border-destructive/30 bg-destructive/[0.04]" : "border-primary/25 bg-primary/[0.04]",
          )}>
            <p className="text-[10px] uppercase tracking-[0.06em] font-medium text-muted-foreground inline-flex items-center gap-1">
              <CalendarClock className={cn("h-3 w-3", urgent ? "text-destructive" : "text-primary")} />
              Proposal due
            </p>
            <p className={cn(
              "text-[15px] font-semibold tabular-nums mt-1 leading-none",
              urgent ? "text-destructive" : "text-primary",
            )}>{prospect.daysToProposal}d</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{monthDay(prospect.proposalDueDate)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProspectSnapshot({ prospect }: { prospect: Prospect }) {
  const received = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const blocked  = prospect.currentCarriers.filter((c) => c.lossRunStatus === "pending-bor").length;
  const total    = prospect.currentCarriers.length;
  const allIn    = received === total;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SnapKpi
        label="BOR status"
        value={prospect.borStatus === "signed" ? "Signed" : prospect.borStatus === "requested" ? "Pending" : "Not sent"}
        sub={prospect.borStatus === "signed" && prospect.borSignedDate ? `${monthDay(prospect.borSignedDate)}` : prospect.borStatus === "requested" ? "awaiting prospect" : "first step"}
        accent={prospect.borStatus === "signed" ? "success" : prospect.borStatus === "requested" ? "warning" : "danger"}
      />
      <SnapKpi
        label="Current carriers"
        value={String(total)}
        sub={`${new Set(prospect.currentCarriers.map((c) => c.lob)).size} lines of business`}
        accent="primary"
      />
      <SnapKpi
        label="Loss runs in"
        value={`${received}/${total}`}
        sub={allIn ? "ready to analyze" : blocked > 0 ? `${blocked} blocked by BOR` : `${total - received} outstanding`}
        accent={allIn ? "success" : blocked > 0 ? "warning" : "neutral"}
      />
      <SnapKpi
        label="Source"
        value={prospect.source === "rfp" ? "RFP" : prospect.source === "referral" ? "Referral" : prospect.source === "inbound" ? "Inbound" : "Outreach"}
        sub={`Risk score ${prospect.riskScore}`}
        accent="neutral"
      />
    </div>
  );
}

function ProspectCarriersCard({ prospect }: { prospect: Prospect }) {
  const received = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const total    = prospect.currentCarriers.length;
  const blocked  = prospect.currentCarriers.filter((c) => c.lossRunStatus === "pending-bor").length;
  const allIn    = received === total;
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Loss runs · current carriers
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            {received}/{total} received{blocked > 0 && ` · ${blocked} blocked by BOR`}
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "text-[10.5px] font-medium",
          allIn ? "border-success/40 bg-success/5 text-success" : "border-primary/30 bg-primary/5 text-primary",
        )}>
          {allIn ? "All received" : "Pulling"}
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {prospect.currentCarriers.map((c, i) => (
          <li key={`${c.carrier}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 hover:bg-muted/15 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-semibold text-foreground">{c.carrier}</span>
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{c.lob}</Badge>
              </div>
              {c.policyNumber && (
                <p className="text-[11px] text-muted-foreground mt-1 truncate font-mono">{c.policyNumber}</p>
              )}
            </div>
            <ProspectLossRunPill status={c.lossRunStatus} days={c.daysOutstanding} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProspectLossRunPill({ status, days }: { status: CarrierLossRunStatus; days: number }) {
  const cfg: Record<CarrierLossRunStatus, { label: string; cls: string }> = {
    received:      { label: "Received",            cls: "border-success/40 bg-success/5 text-success" },
    requested:     { label: `Requested · ${days}d`, cls: "border-primary/30 bg-primary/5 text-primary" },
    "pending-bor": { label: "Waiting on BOR",      cls: "border-warning/40 bg-warning/10 text-warning-foreground" },
    missing:       { label: "Missing",              cls: "border-destructive/40 bg-destructive/5 text-destructive" },
  };
  const c = cfg[status];
  return <Badge variant="outline" className={cn("text-[10.5px] font-medium", c.cls)}>{c.label}</Badge>;
}

function ProspectLossRunSummary({ prospect }: { prospect: Prospect }) {
  const received = prospect.currentCarriers.filter((c) => c.lossRunStatus === "received").length;
  const total    = prospect.currentCarriers.length;
  const allIn    = received === total;

  const narrative =
    `${prospect.name} currently insured across ${total} carrier${total !== 1 ? "s" : ""} covering ${new Set(prospect.currentCarriers.map((c) => c.lob)).size} line${new Set(prospect.currentCarriers.map((c) => c.lob)).size !== 1 ? "s" : ""} of business. ` +
    (prospect.borStatus === "signed"
      ? `BOR signed${prospect.borSignedDate ? ` ${monthDay(prospect.borSignedDate)}` : ""} — Fideon has authority to pull loss runs. `
      : prospect.borStatus === "requested"
        ? `BOR letter sent — loss-run pulls blocked until prospect signature lands. `
        : `BOR letter not yet sent — required before most carriers will release loss runs. `) +
    (allIn
      ? `All ${total} loss runs received and analyzed — ready for downstream workflow. `
      : `${received} of ${total} loss runs received. ${total - received} outstanding. `) +
    prospect.notes;

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Loss-run analysis
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-1">Auto-generated · BOR · pull status · risk read</p>
        </div>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Fideon-drafted
        </span>
      </div>
      <CardContent className="px-5 py-5">
        <p className="text-[13px] leading-relaxed text-foreground/90">{narrative}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
          <NarrativeFact label="Risk score" value={prospect.riskScore} accent={prospect.riskTone === "success" ? "success" : "warning"} />
          <NarrativeFact label="Stage"      value={PROSPECT_STAGE_LABEL[prospect.stage]} accent="primary" />
          <NarrativeFact label="Source"     value={prospect.source === "rfp" ? "RFP" : prospect.source === "referral" ? "Referral" : prospect.source === "inbound" ? "Inbound" : "Outreach"} accent="neutral" />
        </div>
      </CardContent>
    </Card>
  );
}
