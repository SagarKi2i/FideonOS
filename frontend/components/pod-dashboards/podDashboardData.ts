// Per-pod rich datasets used by PodAnalyticsDashboard
// Mirrors the depth of Loss Run Reporting: KPIs, time series, breakdowns, top items, AI narrative.

export type Trend = "up" | "down" | "flat";

export interface KpiTile {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
  hint?: string;
}

export interface SeriesPoint {
  label: string;
  primary: number;
  secondary?: number;
}

export interface BreakdownSlice {
  name: string;
  value: number;
  color: string;
}

export interface ActivityRow {
  id: string;
  date: string;
  primary: string;
  secondary: string;
  amount?: string;
  status: "success" | "warning" | "danger" | "info";
  meta?: string;
}

export interface NarrativeBlock {
  headline: string;
  summary: string;
  highlights: { label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }[];
  recommendations: string[];
}

export interface PodDataset {
  podId: string;
  title: string;
  subtitle: string;
  primaryMetricLabel: string;

  kpis: KpiTile[];
  trend: { title: string; primaryName: string; secondaryName?: string; data: SeriesPoint[] };
  breakdown: { title: string; data: BreakdownSlice[] };
  funnel?: { title: string; stages: { name: string; value: number }[] };

  activity: {
    title: string;
    columns: { key: keyof ActivityRow | "actions"; label: string }[];
    rows: ActivityRow[];
  };

  topItems: { title: string; items: { label: string; sub: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }[] };

  narrative: NarrativeBlock;
}

const COLORS = {
  primary: "hsl(245, 58%, 51%)",
  primary2: "hsl(245, 70%, 65%)",
  primary3: "hsl(245, 80%, 78%)",
  primary4: "hsl(245, 85%, 88%)",
  amber: "hsl(38, 92%, 50%)",
  emerald: "hsl(160, 60%, 45%)",
  rose: "hsl(350, 80%, 55%)",
};

/* ---------- DOCUMENT RETRIEVAL ---------- */
const documentRetrieval: PodDataset = {
  podId: "document-retrieval",
  title: "Document Retrieval",
  subtitle: "Carrier portal pulls and AMS attachments across your book",
  primaryMetricLabel: "Documents Synced",
  kpis: [
    { label: "Documents Synced", value: "2,847", delta: "+18.2%", trend: "up", tone: "primary", hint: "Last 30 days" },
    { label: "Sync Success Rate", value: "98.4%", delta: "+1.2%", trend: "up", tone: "success" },
    { label: "Avg. Retrieval Time", value: "11.7s", delta: "−3.1s", trend: "down", tone: "primary", hint: "Per document" },
    { label: "Carriers Connected", value: "24", delta: "+3", trend: "up", tone: "neutral" },
    { label: "Failed Pulls", value: "46", delta: "−12", trend: "down", tone: "warning" },
  ],
  trend: {
    title: "Retrieval Volume — Last 12 Weeks",
    primaryName: "Successful",
    secondaryName: "Failed",
    data: [
      { label: "W1", primary: 142, secondary: 4 }, { label: "W2", primary: 158, secondary: 3 },
      { label: "W3", primary: 171, secondary: 6 }, { label: "W4", primary: 184, secondary: 5 },
      { label: "W5", primary: 196, secondary: 4 }, { label: "W6", primary: 211, secondary: 7 },
      { label: "W7", primary: 224, secondary: 3 }, { label: "W8", primary: 238, secondary: 5 },
      { label: "W9", primary: 251, secondary: 4 }, { label: "W10", primary: 267, secondary: 2 },
      { label: "W11", primary: 282, secondary: 4 }, { label: "W12", primary: 298, secondary: 3 },
    ],
  },
  breakdown: {
    title: "Document Types",
    data: [
      { name: "Renewals", value: 38, color: COLORS.primary },
      { name: "Endorsements", value: 22, color: COLORS.primary2 },
      { name: "Loss Runs", value: 18, color: COLORS.primary3 },
      { name: "Invoices", value: 14, color: COLORS.amber },
      { name: "Certificates", value: 8, color: COLORS.emerald },
    ],
  },
  funnel: {
    title: "Retrieval Pipeline",
    stages: [
      { name: "Requests Queued", value: 2893 },
      { name: "Portals Reached", value: 2871 },
      { name: "Documents Pulled", value: 2847 },
      { name: "OCR Validated", value: 2832 },
      { name: "Filed in AMS", value: 2801 },
    ],
  },
  activity: {
    title: "Recent Retrievals",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Carrier" },
      { key: "secondary", label: "Document" }, { key: "amount", label: "Size" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "DR-9821", date: "2026-02-08 14:22", primary: "Travelers", secondary: "Renewal · POL-2025-12345", amount: "245 KB", status: "success", meta: "Applied Epic" },
      { id: "DR-9820", date: "2026-02-08 13:08", primary: "Chubb", secondary: "Loss Run 5yr", amount: "412 KB", status: "success", meta: "Applied Epic" },
      { id: "DR-9819", date: "2026-02-08 12:41", primary: "Hartford", secondary: "Endorsement A1", amount: "128 KB", status: "warning", meta: "OCR confidence 84%" },
      { id: "DR-9818", date: "2026-02-08 11:30", primary: "Liberty Mutual", secondary: "Invoice INV-67890", amount: "89 KB", status: "success", meta: "AMS 360" },
      { id: "DR-9817", date: "2026-02-08 10:14", primary: "Progressive", secondary: "Dec Page", amount: "204 KB", status: "danger", meta: "Portal 2FA timeout" },
      { id: "DR-9816", date: "2026-02-08 09:02", primary: "Nationwide", secondary: "Memo — Coverage Update", amount: "156 KB", status: "success", meta: "HawkSoft" },
    ],
  },
  topItems: {
    title: "Top Carriers by Volume",
    items: [
      { label: "Travelers", sub: "612 docs · 99.2% success", value: "21.5%", tone: "success" },
      { label: "The Hartford", sub: "498 docs · 97.8% success", value: "17.5%", tone: "success" },
      { label: "Chubb", sub: "421 docs · 98.6% success", value: "14.8%", tone: "success" },
      { label: "Liberty Mutual", sub: "356 docs · 96.4% success", value: "12.5%", tone: "warning" },
      { label: "Progressive", sub: "284 docs · 94.1% success", value: "10.0%", tone: "warning" },
    ],
  },
  narrative: {
    headline: "Retrieval volume is up 18% with healthy success rates",
    summary: "Sync throughput accelerated 18.2% over the last 30 days, driven by 3 newly connected carriers and improved Hartford OCR. Failure rate dropped to 1.6% — primarily 2FA timeouts on Progressive's portal. AMS attachment latency improved from 14.8s to 11.7s after the Applied Epic webhook upgrade.",
    highlights: [
      { label: "Carriers Added", value: "+3", tone: "success" },
      { label: "OCR Confidence", value: "96.2%", tone: "success" },
      { label: "Failed Pulls", value: "46 (−21%)", tone: "success" },
      { label: "Portal 2FA Issues", value: "12 incidents", tone: "warning" },
    ],
    recommendations: [
      "Enable Progressive's API token flow to bypass 2FA portal timeouts.",
      "Schedule renewal pulls 45 days pre-expiry to give underwriters more lead time.",
      "Add Markel and Berkshire connectors — currently routed through manual broker email.",
    ],
  },
};

/* ---------- QUOTE GENERATION ---------- */
const quoteGeneration: PodDataset = {
  podId: "quote-generation",
  title: "Quote Generation",
  subtitle: "AI-generated quotes across carrier appetites and lines of business",
  primaryMetricLabel: "Quotes Generated",
  kpis: [
    { label: "Quotes Generated", value: "1,284", delta: "+22.4%", trend: "up", tone: "primary" },
    { label: "Bind Rate", value: "31.6%", delta: "+4.2%", trend: "up", tone: "success" },
    { label: "Avg. Premium", value: "$14,820", delta: "+$1,210", trend: "up", tone: "primary" },
    { label: "Avg. Turn-Around", value: "47s", delta: "−18s", trend: "down", tone: "success", hint: "Submission → quote" },
    { label: "Quoted Premium", value: "$19.0M", delta: "+$3.2M", trend: "up", tone: "primary" },
  ],
  trend: {
    title: "Quotes & Bound Premium — Last 12 Weeks",
    primaryName: "Quotes",
    secondaryName: "Bound",
    data: [
      { label: "W1", primary: 72, secondary: 21 }, { label: "W2", primary: 81, secondary: 24 },
      { label: "W3", primary: 89, secondary: 28 }, { label: "W4", primary: 94, secondary: 31 },
      { label: "W5", primary: 102, secondary: 34 }, { label: "W6", primary: 108, secondary: 37 },
      { label: "W7", primary: 116, secondary: 39 }, { label: "W8", primary: 124, secondary: 41 },
      { label: "W9", primary: 132, secondary: 44 }, { label: "W10", primary: 141, secondary: 47 },
      { label: "W11", primary: 148, secondary: 49 }, { label: "W12", primary: 158, secondary: 52 },
    ],
  },
  breakdown: {
    title: "Lines of Business",
    data: [
      { name: "Commercial Auto", value: 28, color: COLORS.primary },
      { name: "BOP", value: 22, color: COLORS.primary2 },
      { name: "Workers Comp", value: 18, color: COLORS.primary3 },
      { name: "General Liability", value: 16, color: COLORS.amber },
      { name: "Property", value: 10, color: COLORS.emerald },
      { name: "Cyber", value: 6, color: COLORS.rose },
    ],
  },
  funnel: {
    title: "Quote Funnel",
    stages: [
      { name: "Submissions", value: 1612 },
      { name: "Appetite Matched", value: 1421 },
      { name: "Quotes Generated", value: 1284 },
      { name: "Presented to Insured", value: 982 },
      { name: "Bound", value: 406 },
    ],
  },
  activity: {
    title: "Recent Quotes",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Insured" },
      { key: "secondary", label: "Line · Carrier" }, { key: "amount", label: "Premium" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "QT-4821", date: "2026-02-08", primary: "Apex Manufacturing", secondary: "Comm. Auto · Travelers", amount: "$12,450", status: "success", meta: "Bound" },
      { id: "QT-4820", date: "2026-02-08", primary: "Coastal Dining LLC", secondary: "BOP · Hartford", amount: "$8,200", status: "success", meta: "Presented" },
      { id: "QT-4819", date: "2026-02-07", primary: "Summit Construction", secondary: "Workers Comp · Liberty", amount: "$15,800", status: "info", meta: "In review" },
      { id: "QT-4818", date: "2026-02-07", primary: "DataFlow Systems", secondary: "Cyber · Chubb", amount: "$6,500", status: "success", meta: "Bound" },
      { id: "QT-4817", date: "2026-02-06", primary: "Metro Retail Group", secondary: "Property · Nationwide", amount: "$22,100", status: "success", meta: "Presented" },
      { id: "QT-4816", date: "2026-02-06", primary: "Harbor Logistics", secondary: "Comm. Auto · Progressive", amount: "$18,400", status: "warning", meta: "Pricing flagged" },
    ],
  },
  topItems: {
    title: "Top Carriers by Bound Premium",
    items: [
      { label: "Travelers", sub: "147 quotes · 38% bind", value: "$3.8M", tone: "success" },
      { label: "The Hartford", sub: "128 quotes · 34% bind", value: "$3.1M", tone: "success" },
      { label: "Chubb", sub: "96 quotes · 41% bind", value: "$2.7M", tone: "success" },
      { label: "Liberty Mutual", sub: "112 quotes · 28% bind", value: "$2.2M", tone: "warning" },
      { label: "Nationwide", sub: "84 quotes · 31% bind", value: "$1.8M", tone: "success" },
    ],
  },
  narrative: {
    headline: "Bind rate climbed to 31.6% — best quarter on record",
    summary: "1,284 quotes were produced this period, generating $19M in quoted premium and binding $4.7M. The bind-rate lift is concentrated in BOP and Cyber where appetite scoring v3.2 reduced wasted submissions by 22%. Workers Comp continues to underperform at 21% bind — primarily due to Liberty Mutual's tight class-code appetite.",
    highlights: [
      { label: "Bound Premium", value: "$4.7M", tone: "success" },
      { label: "Avg. Quote Time", value: "47s", tone: "success" },
      { label: "Cyber Bind Rate", value: "44%", tone: "success" },
      { label: "WC Bind Rate", value: "21%", tone: "warning" },
    ],
    recommendations: [
      "Route Workers Comp away from Liberty toward AmTrust for restaurant/hospitality classes.",
      "Pre-fill ACORD 125/126 from prior-year quotes to cut turn-around to under 30 seconds.",
      "Trigger automatic re-quote when carrier rate filings change mid-cycle.",
    ],
  },
};

/* ---------- POLICY COMPARISON ---------- */
const policyComparison: PodDataset = {
  podId: "policy-comparison",
  title: "Policy Comparison",
  subtitle: "Side-by-side coverage analysis with AI Coverage Score",
  primaryMetricLabel: "Comparisons",
  kpis: [
    { label: "Comparisons Run", value: "418", delta: "+12.6%", trend: "up", tone: "primary" },
    { label: "Avg. Coverage Score", value: "8.4 / 10", delta: "+0.3", trend: "up", tone: "success" },
    { label: "Coverage Gaps Found", value: "287", delta: "+34", trend: "up", tone: "warning" },
    { label: "Avg. Premium Delta", value: "−$1,840", delta: "saved", trend: "down", tone: "success" },
    { label: "Recommendations Acted", value: "76%", delta: "+8%", trend: "up", tone: "primary" },
  ],
  trend: {
    title: "Comparisons & Gaps Detected — Last 12 Weeks",
    primaryName: "Comparisons",
    secondaryName: "Gaps Found",
    data: [
      { label: "W1", primary: 24, secondary: 14 }, { label: "W2", primary: 28, secondary: 18 },
      { label: "W3", primary: 31, secondary: 20 }, { label: "W4", primary: 29, secondary: 19 },
      { label: "W5", primary: 33, secondary: 22 }, { label: "W6", primary: 36, secondary: 25 },
      { label: "W7", primary: 38, secondary: 26 }, { label: "W8", primary: 41, secondary: 28 },
      { label: "W9", primary: 39, secondary: 27 }, { label: "W10", primary: 42, secondary: 29 },
      { label: "W11", primary: 44, secondary: 31 }, { label: "W12", primary: 47, secondary: 33 },
    ],
  },
  breakdown: {
    title: "Coverage Gap Categories",
    data: [
      { name: "Sublimit Reductions", value: 32, color: COLORS.primary },
      { name: "Exclusion Additions", value: 24, color: COLORS.amber },
      { name: "Deductible Increases", value: 18, color: COLORS.primary2 },
      { name: "Endorsement Removals", value: 14, color: COLORS.rose },
      { name: "Definition Changes", value: 12, color: COLORS.primary3 },
    ],
  },
  activity: {
    title: "Recent Comparisons",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Insured" },
      { key: "secondary", label: "Compared" }, { key: "amount", label: "Score" },
      { key: "status", label: "Outcome" },
    ],
    rows: [
      { id: "PC-2018", date: "2026-02-08", primary: "Apex Manufacturing", secondary: "Travelers vs Chubb · Comm. Auto", amount: "9.1 / 10", status: "success", meta: "Recommend Travelers" },
      { id: "PC-2017", date: "2026-02-08", primary: "Coastal Dining", secondary: "Hartford vs Liberty · BOP", amount: "8.6 / 10", status: "success", meta: "Recommend Hartford" },
      { id: "PC-2016", date: "2026-02-07", primary: "Metro Retail", secondary: "Progressive vs Nationwide · Property", amount: "7.4 / 10", status: "warning", meta: "3 sublimit gaps" },
      { id: "PC-2015", date: "2026-02-07", primary: "Summit Construction", secondary: "Chubb vs AIG · Umbrella", amount: "8.9 / 10", status: "success", meta: "Recommend AIG" },
      { id: "PC-2014", date: "2026-02-06", primary: "DataFlow Systems", secondary: "Beazley vs Coalition · Cyber", amount: "6.8 / 10", status: "danger", meta: "Critical exclusion added" },
    ],
  },
  topItems: {
    title: "Most-Compared Lines of Business",
    items: [
      { label: "Commercial Auto", sub: "112 comparisons · avg 8.6", value: "26.8%", tone: "success" },
      { label: "BOP", sub: "94 comparisons · avg 8.4", value: "22.5%", tone: "success" },
      { label: "Workers Comp", sub: "76 comparisons · avg 8.1", value: "18.2%", tone: "success" },
      { label: "Property", sub: "68 comparisons · avg 7.9", value: "16.3%", tone: "warning" },
      { label: "Cyber", sub: "42 comparisons · avg 7.2", value: "10.0%", tone: "warning" },
    ],
  },
  narrative: {
    headline: "Coverage scoring caught $512K in unintentional gaps this quarter",
    summary: "Of 418 comparisons run, 287 surfaced material gaps — most commonly sublimit reductions on cyber and property renewals. Insureds accepted recommendations 76% of the time, retaining $512K of coverage value that would have been silently dropped at renewal. Progressive's auto renewal endorsements continue to introduce hired/non-owned exclusions that require manual escalation.",
    highlights: [
      { label: "Coverage Saved", value: "$512K", tone: "success" },
      { label: "Critical Findings", value: "34", tone: "danger" },
      { label: "Acceptance Rate", value: "76%", tone: "success" },
      { label: "Avg. Decision Time", value: "1.4 days", tone: "success" },
    ],
    recommendations: [
      "Auto-flag any cyber renewal that drops social engineering sublimit below $250K.",
      "Trigger comparison 60 days pre-renewal so producers have negotiation runway.",
      "Add Coalition's new MFA endorsement to the comparison library.",
    ],
  },
};

/* ---------- CLAIMS FNOL ---------- */
const claimsFnol: PodDataset = {
  podId: "claims-fnol",
  title: "Claims FNOL",
  subtitle: "First Notice of Loss intake and carrier routing",
  primaryMetricLabel: "Claims Filed",
  kpis: [
    { label: "Claims Filed", value: "612", delta: "+8.4%", trend: "up", tone: "primary" },
    { label: "Avg. Filing Time", value: "3.2 min", delta: "−1.4 min", trend: "down", tone: "success" },
    { label: "Carrier Acknowledged", value: "98.6%", delta: "+0.8%", trend: "up", tone: "success" },
    { label: "Touchless FNOL", value: "64%", delta: "+12%", trend: "up", tone: "primary" },
    { label: "Severity Flags", value: "47", delta: "+9", trend: "up", tone: "warning" },
  ],
  trend: {
    title: "Claims Filed — Last 12 Weeks",
    primaryName: "Filed",
    secondaryName: "Severity-Flagged",
    data: [
      { label: "W1", primary: 38, secondary: 3 }, { label: "W2", primary: 42, secondary: 4 },
      { label: "W3", primary: 45, secondary: 3 }, { label: "W4", primary: 41, secondary: 5 },
      { label: "W5", primary: 48, secondary: 4 }, { label: "W6", primary: 52, secondary: 6 },
      { label: "W7", primary: 49, secondary: 4 }, { label: "W8", primary: 54, secondary: 5 },
      { label: "W9", primary: 58, secondary: 4 }, { label: "W10", primary: 56, secondary: 6 },
      { label: "W11", primary: 62, secondary: 5 }, { label: "W12", primary: 67, secondary: 7 },
    ],
  },
  breakdown: {
    title: "Claim Types",
    data: [
      { name: "Auto Collision", value: 34, color: COLORS.primary },
      { name: "Property Damage", value: 22, color: COLORS.primary2 },
      { name: "Workers Comp", value: 18, color: COLORS.amber },
      { name: "General Liability", value: 14, color: COLORS.emerald },
      { name: "Cargo / Inland Marine", value: 12, color: COLORS.rose },
    ],
  },
  funnel: {
    title: "FNOL Pipeline",
    stages: [
      { name: "Notifications Received", value: 698 },
      { name: "Triage Completed", value: 671 },
      { name: "Filed with Carrier", value: 612 },
      { name: "Carrier Acknowledged", value: 603 },
      { name: "Adjuster Assigned", value: 578 },
    ],
  },
  activity: {
    title: "Recent FNOL",
    columns: [
      { key: "date", label: "Filed" }, { key: "primary", label: "Claim ID · Insured" },
      { key: "secondary", label: "Type · Carrier" }, { key: "amount", label: "Severity" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "FN-1234", date: "2026-02-08 11:42", primary: "CLM-2026-1234 · Apex Mfg.", secondary: "Auto Collision · Travelers", amount: "Standard", status: "success", meta: "Acknowledged" },
      { id: "FN-1233", date: "2026-02-08 09:18", primary: "CLM-2026-1233 · Coastal Dining", secondary: "Slip & Fall · Hartford", amount: "Severity", status: "warning", meta: "Adjuster paged" },
      { id: "FN-1232", date: "2026-02-07 16:05", primary: "CLM-2026-1232 · Summit Constr.", secondary: "Workers Comp · Liberty", amount: "Severity", status: "warning", meta: "OSHA reportable" },
      { id: "FN-1231", date: "2026-02-07 13:21", primary: "CLM-2026-1231 · Metro Retail", secondary: "Theft · Nationwide", amount: "Standard", status: "success", meta: "Acknowledged" },
      { id: "FN-1230", date: "2026-02-06 08:44", primary: "CLM-2026-1230 · Harbor Logistics", secondary: "Cargo Damage · Progressive", amount: "Standard", status: "info", meta: "In carrier queue" },
    ],
  },
  topItems: {
    title: "Top Filing Carriers",
    items: [
      { label: "Travelers", sub: "184 claims · 4.2 min avg", value: "30.1%", tone: "success" },
      { label: "The Hartford", sub: "142 claims · 3.8 min avg", value: "23.2%", tone: "success" },
      { label: "Liberty Mutual", sub: "98 claims · 5.1 min avg", value: "16.0%", tone: "warning" },
      { label: "Nationwide", sub: "76 claims · 3.4 min avg", value: "12.4%", tone: "success" },
      { label: "Progressive", sub: "62 claims · 6.8 min avg", value: "10.1%", tone: "warning" },
    ],
  },
  narrative: {
    headline: "Touchless FNOL crossed 64% — saving 38 hours of CSR time/week",
    summary: "612 claims were filed this period with 98.6% carrier acknowledgment within 15 minutes. Touchless filing (no human review) climbed to 64% as the auto-collision template stabilized. 47 severity-flagged claims were correctly escalated, including 4 OSHA-reportable Workers Comp losses. Progressive's portal latency continues to drag overall filing time.",
    highlights: [
      { label: "CSR Hours Saved", value: "38 / week", tone: "success" },
      { label: "Acknowledgment SLA", value: "98.6%", tone: "success" },
      { label: "Severity Catch Rate", value: "100%", tone: "success" },
      { label: "Progressive Latency", value: "6.8 min", tone: "warning" },
    ],
    recommendations: [
      "Switch Progressive submissions to direct API once their v2 endpoints are GA in Q2.",
      "Auto-text insured a confirmation with claim number within 60 seconds of filing.",
      "Train severity model on the 9 missed escalations from prior quarter.",
    ],
  },
};

/* ---------- MULTI-DOCUMENT ---------- */
const multiDocument: PodDataset = {
  podId: "multi-document",
  title: "Multi-Document Analysis",
  subtitle: "Cross-document coverage, gap, and consolidation analysis",
  primaryMetricLabel: "Analyses",
  kpis: [
    { label: "Analyses Completed", value: "187", delta: "+14.2%", trend: "up", tone: "primary" },
    { label: "Avg. Documents / Run", value: "6.4", delta: "+0.8", trend: "up", tone: "primary" },
    { label: "Findings Surfaced", value: "1,124", delta: "+182", trend: "up", tone: "warning" },
    { label: "Critical Findings", value: "94", delta: "+22", trend: "up", tone: "danger" },
    { label: "Acceptance Rate", value: "82%", delta: "+6%", trend: "up", tone: "success" },
  ],
  trend: {
    title: "Analyses & Findings — Last 12 Weeks",
    primaryName: "Analyses",
    secondaryName: "Findings",
    data: [
      { label: "W1", primary: 11, secondary: 62 }, { label: "W2", primary: 13, secondary: 71 },
      { label: "W3", primary: 12, secondary: 68 }, { label: "W4", primary: 14, secondary: 82 },
      { label: "W5", primary: 16, secondary: 91 }, { label: "W6", primary: 15, secondary: 88 },
      { label: "W7", primary: 17, secondary: 102 }, { label: "W8", primary: 18, secondary: 108 },
      { label: "W9", primary: 19, secondary: 114 }, { label: "W10", primary: 17, secondary: 109 },
      { label: "W11", primary: 18, secondary: 112 }, { label: "W12", primary: 17, secondary: 117 },
    ],
  },
  breakdown: {
    title: "Analysis Types",
    data: [
      { name: "Coverage Gap Review", value: 36, color: COLORS.primary },
      { name: "Renewal Comparison", value: 24, color: COLORS.primary2 },
      { name: "Risk Assessment", value: 18, color: COLORS.amber },
      { name: "Policy Consolidation", value: 14, color: COLORS.emerald },
      { name: "Audit Reconciliation", value: 8, color: COLORS.rose },
    ],
  },
  activity: {
    title: "Recent Analyses",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Analysis" },
      { key: "secondary", label: "Insured · Documents" }, { key: "amount", label: "Findings" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "MD-318", date: "2026-02-08", primary: "Coverage Gap Review", secondary: "Apex Mfg. · 8 docs", amount: "12 (3 critical)", status: "warning", meta: "Producer notified" },
      { id: "MD-317", date: "2026-02-07", primary: "Renewal Comparison", secondary: "Coastal Dining · 4 docs", amount: "6 (0 critical)", status: "success", meta: "Approved" },
      { id: "MD-316", date: "2026-02-07", primary: "Risk Assessment", secondary: "Summit Constr. · 11 docs", amount: "18 (4 critical)", status: "danger", meta: "Underwriter review" },
      { id: "MD-315", date: "2026-02-06", primary: "Policy Consolidation", secondary: "Metro Retail · 6 docs", amount: "9 (1 critical)", status: "warning", meta: "Producer notified" },
      { id: "MD-314", date: "2026-02-05", primary: "Audit Reconciliation", secondary: "Harbor Logistics · 5 docs", amount: "4 (0 critical)", status: "success", meta: "Approved" },
    ],
  },
  topItems: {
    title: "Highest-Impact Findings",
    items: [
      { label: "Cyber sublimit dropped 50%", sub: "DataFlow Systems · renewal", value: "Critical", tone: "danger" },
      { label: "WC class code mismatch", sub: "Summit Construction · audit", value: "Critical", tone: "danger" },
      { label: "Hired auto exclusion added", sub: "Apex Manufacturing · auto", value: "Critical", tone: "danger" },
      { label: "Property co-insurance to 90%", sub: "Metro Retail · renewal", value: "High", tone: "warning" },
      { label: "Pollution exclusion broadened", sub: "Coastal Dining · GL", value: "High", tone: "warning" },
    ],
  },
  narrative: {
    headline: "Cross-document analysis flagged 94 critical issues — preventing $1.2M in coverage erosion",
    summary: "187 multi-document analyses surfaced 1,124 findings, of which 94 were critical and 312 high-severity. Acceptance rate climbed to 82% as producers grew confident in AI-flagged gaps. The largest avoided loss came from a cyber renewal where social-engineering coverage was silently halved — caught and renegotiated to $500K.",
    highlights: [
      { label: "Critical Findings", value: "94", tone: "danger" },
      { label: "Coverage Erosion Prevented", value: "$1.2M", tone: "success" },
      { label: "Avg. Findings / Run", value: "6.0", tone: "neutral" },
      { label: "Producer Acceptance", value: "82%", tone: "success" },
    ],
    recommendations: [
      "Auto-trigger coverage gap review for any renewal where premium drops >15%.",
      "Add NAIC bulletin watch so analyses pick up regulatory exclusion changes within 24h.",
      "Bundle audit reconciliation into the year-end accounting close workflow.",
    ],
  },
};

/* ---------- CARRIER SUBMISSION INTAKE ---------- */
const submissionIntake: PodDataset = {
  podId: "carrier-submission-intake",
  title: "Submission Intake & Triage",
  subtitle: "AI-driven appetite scoring and underwriter routing",
  primaryMetricLabel: "Submissions Triaged",
  kpis: [
    { label: "Submissions Triaged", value: "2,184", delta: "+19.6%", trend: "up", tone: "primary" },
    { label: "In-Appetite Rate", value: "62%", delta: "+5%", trend: "up", tone: "success" },
    { label: "Avg. Triage Time", value: "1.8 min", delta: "−42s", trend: "down", tone: "success" },
    { label: "Auto-Declined", value: "418", delta: "+62", trend: "up", tone: "warning", hint: "Off-appetite" },
    { label: "Quoted Premium", value: "$28.4M", delta: "+$4.1M", trend: "up", tone: "primary" },
  ],
  trend: {
    title: "Submissions & Quotes — Last 12 Weeks",
    primaryName: "Submissions",
    secondaryName: "Quoted",
    data: [
      { label: "W1", primary: 142, secondary: 84 }, { label: "W2", primary: 156, secondary: 92 },
      { label: "W3", primary: 168, secondary: 102 }, { label: "W4", primary: 174, secondary: 108 },
      { label: "W5", primary: 182, secondary: 114 }, { label: "W6", primary: 196, secondary: 124 },
      { label: "W7", primary: 204, secondary: 132 }, { label: "W8", primary: 218, secondary: 142 },
      { label: "W9", primary: 226, secondary: 148 }, { label: "W10", primary: 234, secondary: 154 },
      { label: "W11", primary: 248, secondary: 162 }, { label: "W12", primary: 262, secondary: 174 },
    ],
  },
  breakdown: {
    title: "Submission Outcomes",
    data: [
      { name: "Quoted", value: 47, color: COLORS.emerald },
      { name: "Assigned", value: 21, color: COLORS.primary },
      { name: "Triaged — Pending", value: 14, color: COLORS.primary2 },
      { name: "Auto-Declined", value: 12, color: COLORS.amber },
      { name: "Manual Review", value: 6, color: COLORS.rose },
    ],
  },
  funnel: {
    title: "Submission Funnel",
    stages: [
      { name: "Submissions Received", value: 2412 },
      { name: "OCR + Field Extract", value: 2384 },
      { name: "Triage Complete", value: 2184 },
      { name: "In-Appetite", value: 1354 },
      { name: "Quoted", value: 1284 },
    ],
  },
  activity: {
    title: "Recent Submissions",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Insured · LOB" },
      { key: "secondary", label: "Underwriter" }, { key: "amount", label: "Appetite" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "SUB-0045", date: "2026-02-08", primary: "Tech Solutions Corp · Comm. Pkg.", secondary: "Sarah Chen", amount: "87 / 100", status: "success", meta: "Triaged" },
      { id: "SUB-0044", date: "2026-02-08", primary: "Metro Retail Group · Property", secondary: "Mike Johnson", amount: "92 / 100", status: "success", meta: "Assigned" },
      { id: "SUB-0043", date: "2026-02-07", primary: "Coastal Dining LLC · GL", secondary: "—", amount: "45 / 100", status: "danger", meta: "Auto-declined" },
      { id: "SUB-0042", date: "2026-02-07", primary: "Summit Construction · WC", secondary: "Lisa Park", amount: "78 / 100", status: "success", meta: "Quoted" },
      { id: "SUB-0041", date: "2026-02-06", primary: "DataFlow Systems · Cyber", secondary: "Sarah Chen", amount: "95 / 100", status: "success", meta: "Quoted" },
      { id: "SUB-0040", date: "2026-02-06", primary: "Apex Manufacturing · Property", secondary: "Mike Johnson", amount: "68 / 100", status: "warning", meta: "Manual review" },
    ],
  },
  topItems: {
    title: "Top Underwriter Workload",
    items: [
      { label: "Sarah Chen", sub: "284 submissions · 41% bind", value: "Cyber, Tech", tone: "success" },
      { label: "Mike Johnson", sub: "262 submissions · 36% bind", value: "Property", tone: "success" },
      { label: "Lisa Park", sub: "248 submissions · 34% bind", value: "Workers Comp", tone: "success" },
      { label: "Alex Rivera", sub: "218 submissions · 28% bind", value: "GL, BOP", tone: "warning" },
      { label: "Priya Shah", sub: "196 submissions · 32% bind", value: "Comm. Auto", tone: "success" },
    ],
  },
  narrative: {
    headline: "Triage time cut to 1.8 minutes — underwriters working only the deals worth working",
    summary: "Of 2,184 submissions triaged, 62% landed in-appetite and progressed to quoting. Auto-decline removed 418 off-appetite submissions before they touched an underwriter, freeing roughly 92 hours of senior UW time. Cyber and Property continue to be the highest-yielding lines; GL acceptance dropped 4% as the appetite tightened around restaurant exposures.",
    highlights: [
      { label: "UW Time Reclaimed", value: "92 hrs / week", tone: "success" },
      { label: "Quoted Premium", value: "$28.4M", tone: "success" },
      { label: "Auto-Decline Accuracy", value: "97.4%", tone: "success" },
      { label: "GL Acceptance", value: "−4%", tone: "warning" },
    ],
    recommendations: [
      "Reroute restaurant GL submissions to specialty MGA partners instead of declining outright.",
      "Push appetite-score explanations into broker portal to reduce off-appetite resubmits.",
      "Expand auto-triage to E&O and D&O lines once appetite v2 model finishes calibration.",
    ],
  },
};

/* ---------- CARRIER CLAIMS ADJUDICATION ---------- */
const claimsAdjudication: PodDataset = {
  podId: "carrier-claims-adjudication",
  title: "Claims Adjudication",
  subtitle: "Automated reserve setting, fraud scoring, and payment authorization",
  primaryMetricLabel: "Claims Adjudicated",
  kpis: [
    { label: "Claims Adjudicated", value: "1,418", delta: "+11.4%", trend: "up", tone: "primary" },
    { label: "Avg. Cycle Time", value: "4.2 days", delta: "−1.6 days", trend: "down", tone: "success" },
    { label: "Reserves Set", value: "$32.8M", delta: "+$5.4M", trend: "up", tone: "primary" },
    { label: "Fraud Flagged", value: "62", delta: "+11", trend: "up", tone: "warning" },
    { label: "Subrogation Recovered", value: "$2.4M", delta: "+$0.6M", trend: "up", tone: "success" },
  ],
  trend: {
    title: "Adjudications & Payments — Last 12 Weeks",
    primaryName: "Adjudicated",
    secondaryName: "Paid",
    data: [
      { label: "W1", primary: 92, secondary: 71 }, { label: "W2", primary: 98, secondary: 76 },
      { label: "W3", primary: 104, secondary: 82 }, { label: "W4", primary: 112, secondary: 89 },
      { label: "W5", primary: 118, secondary: 94 }, { label: "W6", primary: 124, secondary: 98 },
      { label: "W7", primary: 132, secondary: 104 }, { label: "W8", primary: 138, secondary: 112 },
      { label: "W9", primary: 142, secondary: 116 }, { label: "W10", primary: 148, secondary: 121 },
      { label: "W11", primary: 154, secondary: 128 }, { label: "W12", primary: 162, secondary: 134 },
    ],
  },
  breakdown: {
    title: "Adjudication Outcomes",
    data: [
      { name: "Approved & Paid", value: 58, color: COLORS.emerald },
      { name: "Approved — Awaiting Payment", value: 18, color: COLORS.primary },
      { name: "Investigating", value: 12, color: COLORS.primary2 },
      { name: "Fraud Hold", value: 6, color: COLORS.amber },
      { name: "Denied", value: 6, color: COLORS.rose },
    ],
  },
  funnel: {
    title: "Adjudication Pipeline",
    stages: [
      { name: "FNOL Received", value: 1612 },
      { name: "Reserves Set", value: 1542 },
      { name: "Investigation Complete", value: 1462 },
      { name: "Adjudicated", value: 1418 },
      { name: "Paid", value: 1284 },
    ],
  },
  activity: {
    title: "Recent Adjudications",
    columns: [
      { key: "date", label: "Date" }, { key: "primary", label: "Claim · Claimant" },
      { key: "secondary", label: "Type · Reserve" }, { key: "amount", label: "Fraud Score" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "ADJ-0089", date: "2026-02-08", primary: "ADJ-2026-0089 · Johnson Mfg.", secondary: "Property · $125,000", amount: "Low (12)", status: "info", meta: "Investigating" },
      { id: "ADJ-0088", date: "2026-02-08", primary: "ADJ-2026-0088 · City Transport", secondary: "Auto Liab · $45,000", amount: "Medium (54)", status: "success", meta: "Approved" },
      { id: "ADJ-0087", date: "2026-02-07", primary: "ADJ-2026-0087 · Retail Holdings", secondary: "Slip & Fall · $78,000", amount: "Low (8)", status: "success", meta: "Approved" },
      { id: "ADJ-0086", date: "2026-02-07", primary: "ADJ-2026-0086 · Quick Delivery", secondary: "WC · $32,000", amount: "High (87)", status: "danger", meta: "Fraud hold" },
      { id: "ADJ-0085", date: "2026-02-06", primary: "ADJ-2026-0085 · Harbor Logistics", secondary: "Cargo · $156,000", amount: "Low (15)", status: "success", meta: "Paid" },
    ],
  },
  topItems: {
    title: "Largest Open Reserves",
    items: [
      { label: "Harbor Logistics", sub: "Cargo damage · ADJ-0085", value: "$156K", tone: "warning" },
      { label: "Johnson Manufacturing", sub: "Property · ADJ-0089", value: "$125K", tone: "warning" },
      { label: "Summit Construction", sub: "WC severity · ADJ-0078", value: "$98K", tone: "danger" },
      { label: "Retail Holdings", sub: "Slip & fall · ADJ-0087", value: "$78K", tone: "warning" },
      { label: "City Transport", sub: "Auto liab · ADJ-0088", value: "$45K", tone: "neutral" as any },
    ],
  },
  narrative: {
    headline: "Cycle time down 28% — and fraud catch is up by $1.1M in avoided losses",
    summary: "1,418 claims adjudicated this period, with average cycle time falling from 5.8 to 4.2 days. The fraud model identified 62 high-risk claims (87+ score), 47 of which were confirmed and held — preventing roughly $1.1M in fraudulent payouts. Subrogation engine recovered $2.4M, with auto-liability subrogation contributing 64% of that total.",
    highlights: [
      { label: "Fraud Loss Avoided", value: "$1.1M", tone: "success" },
      { label: "Subrogation Recovered", value: "$2.4M", tone: "success" },
      { label: "Cycle Time", value: "4.2 days", tone: "success" },
      { label: "Open Severity Cases", value: "11", tone: "warning" },
    ],
    recommendations: [
      "Auto-route any WC claim with fraud score >75 to SIU within 24 hours.",
      "Expand subrogation engine to property water-damage claims (currently auto-only).",
      "Set automated reserve-adequacy review at 60-day mark for severity claims.",
    ],
  },
};

/* ---------- LOSS RUN REPORTING ---------- */
const lossRunReporting: PodDataset = {
  podId: "loss-run-reporting",
  title: "Loss Run Reporting",
  subtitle: "Carrier loss-run pulls, parsed and rolled up across your book",
  primaryMetricLabel: "Loss Runs Processed",
  kpis: [
    { label: "Loss Runs Processed", value: "184", delta: "+22.7%", trend: "up",   tone: "primary", hint: "Last 30 days" },
    { label: "Avg. Loss Ratio",     value: "62.4%", delta: "−3.1%", trend: "down", tone: "success", hint: "Across the book" },
    { label: "Carriers Pulled",     value: "21",   delta: "+2",    trend: "up",   tone: "neutral" },
    { label: "Open Claims",         value: "47",   delta: "+5",    trend: "up",   tone: "warning" },
    { label: "Avg. Pull Time",      value: "14s",  delta: "−4s",   trend: "down", tone: "primary", hint: "Per carrier" },
  ],
  trend: {
    title: "Loss Run Volume — Last 12 Weeks",
    primaryName: "Successful",
    secondaryName: "Failed",
    data: [
      { label: "W1", primary: 11, secondary: 1 }, { label: "W2", primary: 13, secondary: 0 },
      { label: "W3", primary: 14, secondary: 1 }, { label: "W4", primary: 16, secondary: 0 },
      { label: "W5", primary: 15, secondary: 2 }, { label: "W6", primary: 18, secondary: 1 },
      { label: "W7", primary: 19, secondary: 0 }, { label: "W8", primary: 21, secondary: 1 },
      { label: "W9", primary: 22, secondary: 0 }, { label: "W10", primary: 24, secondary: 1 },
      { label: "W11", primary: 26, secondary: 0 }, { label: "W12", primary: 28, secondary: 1 },
    ],
  },
  breakdown: {
    title: "By Line of Business",
    data: [
      { name: "Workers' Comp", value: 36, color: COLORS.primary },
      { name: "General Liab.", value: 24, color: COLORS.primary2 },
      { name: "Auto",          value: 18, color: COLORS.primary3 },
      { name: "Property",      value: 14, color: COLORS.amber },
      { name: "Umbrella",      value: 8,  color: COLORS.emerald },
    ],
  },
  funnel: {
    title: "Loss Run Pipeline",
    stages: [
      { name: "Requests Queued",  value: 196 },
      { name: "Portals Reached",  value: 191 },
      { name: "Files Pulled",     value: 184 },
      { name: "Parsed + Validated", value: 181 },
      { name: "Filed in AMS",     value: 178 },
    ],
  },
  activity: {
    title: "Recent Loss Run Pulls",
    columns: [
      { key: "date",     label: "Date" },
      { key: "primary",  label: "Carrier" },
      { key: "secondary",label: "Client" },
      { key: "amount",   label: "Loss Ratio" },
      { key: "status",   label: "Status" },
    ],
    rows: [
      { id: "lr1", date: "Today",     primary: "Travelers", secondary: "ACME Manufacturing",  amount: "58.2%", status: "success" },
      { id: "lr2", date: "Today",     primary: "Chubb",     secondary: "Riverside Logistics", amount: "71.4%", status: "warning" },
      { id: "lr3", date: "Yesterday", primary: "Hartford",  secondary: "Coastal Marina",      amount: "44.9%", status: "success" },
      { id: "lr4", date: "Yesterday", primary: "Liberty",   secondary: "Pinecrest Restaurants", amount: "82.1%", status: "danger" },
      { id: "lr5", date: "2 days ago",primary: "Zurich",    secondary: "Hilltop Construction",  amount: "67.0%", status: "success" },
    ],
  },
  topItems: {
    title: "Highest-Loss Accounts (30 days)",
    items: [
      { label: "Pinecrest Restaurants", sub: "Liberty Mutual · WC",     value: "82.1%", tone: "danger" },
      { label: "Summit Trucking",       sub: "Progressive · Auto",       value: "78.3%", tone: "warning" },
      { label: "Riverside Logistics",   sub: "Chubb · GL",               value: "71.4%", tone: "warning" },
      { label: "Hilltop Construction",  sub: "Zurich · WC",              value: "67.0%", tone: "warning" },
      { label: "Brookside Auto Body",   sub: "Travelers · GL",           value: "61.8%", tone: "warning" },
    ],
  },
  narrative: {
    headline: "Loss-run automation cleared 184 pulls — and surfaced 4 accounts that need attention",
    summary: "Loss runs were pulled across 21 carrier portals in the past 30 days, with a 96% success rate. The agent flagged 4 accounts with loss ratios above 75% — Pinecrest Restaurants leads at 82.1%. WC continues to dominate the book by volume; the auto segment is trending toward elevated loss ratios and is worth a closer look at renewal.",
    highlights: [
      { label: "Loss Runs Processed", value: "184",   tone: "success" },
      { label: "Avg. Loss Ratio",     value: "62.4%", tone: "success" },
      { label: "Above-Threshold",     value: "4",     tone: "danger" },
      { label: "Carriers",            value: "21",    tone: "neutral" },
    ],
    recommendations: [
      "Reach out to Pinecrest Restaurants ahead of renewal — loss ratio above 80%.",
      "Schedule a portfolio review for the auto segment; ratios trending up.",
      "Auto-pull loss runs 90 days before every renewal (currently 60).",
    ],
  },
};

/* ---------- ACORD FORM UNDERSTANDING ---------- */
const acordParser: PodDataset = {
  podId: "acord-parser",
  title: "ACORD Form Understanding",
  subtitle: "Parses ACORD 125/126/130/140 etc. into structured AMS records",
  primaryMetricLabel: "Forms Parsed",
  kpis: [
    { label: "Forms Parsed",         value: "1,247", delta: "+14.6%", trend: "up", tone: "primary", hint: "Last 30 days" },
    { label: "Avg. Parse Time",      value: "8.2s",  delta: "−1.4s", trend: "down", tone: "primary" },
    { label: "Field Accuracy",       value: "97.8%", delta: "+0.6%", trend: "up", tone: "success" },
    { label: "Manual Corrections",   value: "28",    delta: "−12",   trend: "down", tone: "warning", hint: "Down from 40" },
    { label: "Forms Types Supported", value: "14",   delta: "+2",    trend: "up", tone: "neutral" },
  ],
  trend: {
    title: "Forms Parsed — Last 12 Weeks",
    primaryName: "Auto-parsed",
    secondaryName: "Needed correction",
    data: [
      { label: "W1", primary: 78,  secondary: 6 }, { label: "W2", primary: 84,  secondary: 5 },
      { label: "W3", primary: 91,  secondary: 4 }, { label: "W4", primary: 98,  secondary: 3 },
      { label: "W5", primary: 102, secondary: 4 }, { label: "W6", primary: 108, secondary: 3 },
      { label: "W7", primary: 112, secondary: 3 }, { label: "W8", primary: 118, secondary: 2 },
      { label: "W9", primary: 124, secondary: 3 }, { label: "W10", primary: 128, secondary: 2 },
      { label: "W11", primary: 133, secondary: 2 }, { label: "W12", primary: 142, secondary: 1 },
    ],
  },
  breakdown: {
    title: "Forms by Type",
    data: [
      { name: "ACORD 125 (Commercial)", value: 38, color: COLORS.primary },
      { name: "ACORD 126 (GL)",         value: 22, color: COLORS.primary2 },
      { name: "ACORD 130 (WC)",         value: 18, color: COLORS.primary3 },
      { name: "ACORD 140 (Property)",   value: 14, color: COLORS.amber },
      { name: "Other",                  value: 8,  color: COLORS.emerald },
    ],
  },
  funnel: {
    title: "Parse Pipeline",
    stages: [
      { name: "Received",     value: 1275 },
      { name: "OCR Complete", value: 1268 },
      { name: "Fields Mapped",value: 1247 },
      { name: "Validated",    value: 1219 },
      { name: "Filed in AMS", value: 1209 },
    ],
  },
  activity: {
    title: "Recent Forms",
    columns: [
      { key: "date",     label: "Date" },
      { key: "primary",  label: "Form" },
      { key: "secondary",label: "Client" },
      { key: "amount",   label: "Confidence" },
      { key: "status",   label: "Status" },
    ],
    rows: [
      { id: "ap1", date: "Today",     primary: "ACORD 125", secondary: "ACME Manufacturing",   amount: "98.4%", status: "success" },
      { id: "ap2", date: "Today",     primary: "ACORD 130", secondary: "Riverside Logistics",  amount: "96.2%", status: "success" },
      { id: "ap3", date: "Today",     primary: "ACORD 126", secondary: "Coastal Marina",       amount: "91.8%", status: "warning", meta: "Field needs review" },
      { id: "ap4", date: "Yesterday", primary: "ACORD 140", secondary: "Pinecrest Restaurants", amount: "99.1%", status: "success" },
      { id: "ap5", date: "Yesterday", primary: "ACORD 125", secondary: "Summit Trucking",      amount: "97.3%", status: "success" },
    ],
  },
  topItems: {
    title: "Lowest-Confidence Fields (recent)",
    items: [
      { label: "Effective date (handwriting)", sub: "Coastal Marina · ACORD 126", value: "78%", tone: "warning" },
      { label: "FEIN",                         sub: "Brookside Auto Body · ACORD 125", value: "84%", tone: "warning" },
      { label: "Class code (multi-state)",     sub: "Summit Trucking · ACORD 130", value: "86%", tone: "warning" },
      { label: "Property address (PDF)",       sub: "Hilltop Construction · ACORD 140", value: "89%", tone: "neutral" },
      { label: "Limits ($MM)",                 sub: "Pinecrest Restaurants · ACORD 125", value: "92%", tone: "neutral" },
    ],
  },
  narrative: {
    headline: "97.8% field accuracy — 28 manual corrections, down from 40 last month",
    summary: "1,247 ACORD forms were auto-parsed in the past 30 days across 14 form types, with field accuracy holding at 97.8%. The most error-prone fields remain handwritten effective dates and multi-state WC class codes. Manual correction volume is down 30% as the model improves on edge cases.",
    highlights: [
      { label: "Forms Parsed",      value: "1,247", tone: "success" },
      { label: "Field Accuracy",    value: "97.8%", tone: "success" },
      { label: "Manual Corrections",value: "28",    tone: "warning" },
      { label: "Form Types",        value: "14",    tone: "neutral" },
    ],
    recommendations: [
      "Re-train the handwriting recognizer on the 12 recent date-field misses.",
      "Add a soft-validation prompt for multi-state WC class codes.",
      "Expand support to ACORD 137 (statement of values) — frequently requested.",
    ],
  },
};

const datasets: Record<string, PodDataset> = {
  "document-retrieval": documentRetrieval,
  "document-search": { ...documentRetrieval, podId: "document-search", title: "Document Search", subtitle: "Semantic search across your AMS document library" },
  "quote-generation": quoteGeneration,
  "policy-comparison": policyComparison,
  "claims-fnol": claimsFnol,
  "multi-document": multiDocument,
  "carrier-submission-intake": submissionIntake,
  "carrier-submission-triage": submissionIntake,
  "carrier-claims-adjudication": claimsAdjudication,
  "carrier-claims-intake": claimsAdjudication,
  "carrier-fraud-detection": claimsAdjudication,
  "carrier-subrogation": claimsAdjudication,
  "loss-run-reporting": lossRunReporting,
  "acord-parser": acordParser,
};

export const getPodDataset = (podId: string): PodDataset | null => datasets[podId] ?? null;

// Minimal shape of a pod_runs row (kept local to avoid a cross-import cycle).
export interface PodRunLike {
  id: string;
  status: string;
  confidence: number | null;
  output: Record<string, unknown> | null;
  started_at: string;
  source?: string;
}

// Overlay real pod_runs onto a dataset: replace the activity feed with real runs
// and recompute the run-derived KPIs. Trend/breakdown/narrative stay as the
// template until there's enough history to chart. Returns the dataset unchanged
// when there are no real runs yet (graceful fallback).
export function applyRealRuns(dataset: PodDataset | null, runs: PodRunLike[]): PodDataset | null {
  if (!dataset || runs.length === 0) return dataset;

  const total = runs.length;
  const flagged = runs.filter((r) => r.status === "needs_review").length;
  const withConf = runs.filter((r) => typeof r.confidence === "number");
  const avgConf = withConf.length
    ? Math.round((withConf.reduce((a, r) => a + (r.confidence ?? 0), 0) / withConf.length) * 100)
    : null;
  const last = runs[0]?.started_at ? new Date(runs[0].started_at) : null;

  const realKpis: KpiTile[] = [
    { label: "Runs (real)", value: String(total), tone: "primary", hint: "executed via your runtime" },
    { label: "Flagged for review", value: String(flagged), tone: flagged ? "warning" : "success", hint: flagged ? "in your review queue" : "all auto-approved" },
    { label: "Avg confidence", value: avgConf !== null ? `${avgConf}%` : "—", tone: (avgConf ?? 100) >= 85 ? "success" : "warning" },
    { label: "Last run", value: last ? last.toLocaleString() : "—", tone: "neutral" },
  ];

  const rows: ActivityRow[] = runs.slice(0, 25).map((r) => ({
    id: r.id,
    date: new Date(r.started_at).toLocaleString(),
    primary: r.source === "mcp" ? "Run via MCP" : r.source === "workflow" ? "Run via workflow" : "Run",
    secondary: typeof r.output?.note === "string" ? (r.output.note as string) : "Completed",
    amount: typeof r.confidence === "number" ? `${Math.round(r.confidence * 100)}%` : undefined,
    status: r.status === "needs_review" ? "warning" : r.status === "failed" ? "danger" : "success",
  }));

  return {
    ...dataset,
    kpis: [...realKpis, ...dataset.kpis].slice(0, 5),
    activity: { ...dataset.activity, title: "Recent runs (live)", rows },
  };
}
