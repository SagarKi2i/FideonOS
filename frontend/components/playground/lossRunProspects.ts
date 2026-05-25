// Prospect data for the new-business mode of the Loss Run Reporting
// dashboard. Prospects don't live in the AMS yet — the broker enters
// them during intake, then Fideon orchestrates the BOR flow + loss-run
// pulls from current carriers + comparative quoting against target
// markets.

export type BORStatus = "none" | "requested" | "signed";
export type ProspectStage =
  | "intake"             // broker just entered
  | "bor-pending"        // BOR sent, awaiting signature
  | "loss-runs-pending"  // BOR signed, pulling loss runs
  | "analyzing"          // loss runs in, building narrative
  | "shopping"           // out to target markets
  | "quoted"             // quotes received
  | "won" | "lost";

export type ProspectSource = "referral" | "cold-outreach" | "inbound" | "rfp";

export type CarrierLossRunStatus =
  | "received"
  | "requested"
  | "pending-bor"
  | "missing";

export interface ProspectCarrier {
  carrier: string;
  lob: string;
  policyNumber?: string;
  lossRunStatus: CarrierLossRunStatus;
  daysOutstanding: number;
}

export interface TargetMarket {
  carrier: string;
  status: "not-quoted" | "submitted" | "quoted" | "declined";
  quotedPremium?: number;
  saving?: number;
  notes?: string;
}

export interface Prospect {
  id: string;
  name: string;
  industry: string;
  hq: string;
  employees: number;
  locations: number;
  proposalDueDate: string;            // ISO
  daysToProposal: number;             // recomputed by helper
  borStatus: BORStatus;
  borSignedDate?: string;             // ISO
  source: ProspectSource;
  producer: string;
  estimatedCurrentPremium: number;
  expectedQuotedPremium: number;
  currentCarriers: ProspectCarrier[];
  targetMarkets: TargetMarket[];
  stage: ProspectStage;
  notes: string;
  riskScore: string;
  riskTone: "success" | "warning";
  recommendedPlacement: string;       // best-fit target market
}

function daysFromNow(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Build prospect list with live days-to-proposal based on today's date.
export function getProspects(): Prospect[] {
  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  const prospects: Prospect[] = [
    {
      id: "stillwater-logistics",
      name: "Stillwater Logistics Inc.",
      industry: "Long-haul Freight & Warehousing (NAICS 484121)",
      hq: "Memphis, TN",
      employees: 142,
      locations: 3,
      proposalDueDate: inDays(28),
      daysToProposal: 28,
      borStatus: "signed",
      borSignedDate: inDays(-9),
      source: "referral",
      producer: "Maya Henderson",
      estimatedCurrentPremium: 425_000,
      expectedQuotedPremium: 392_000,
      currentCarriers: [
        { carrier: "Northland",         lob: "Commercial Auto",   policyNumber: "NLD-CA-77182",  lossRunStatus: "received",  daysOutstanding: 0 },
        { carrier: "The Hartford",      lob: "Workers' Comp",     policyNumber: "HFD-WC-44021",  lossRunStatus: "received",  daysOutstanding: 0 },
        { carrier: "Liberty Mutual",    lob: "General Liability", policyNumber: "LBM-GL-11982",  lossRunStatus: "requested", daysOutstanding: 4 },
        { carrier: "Travelers",         lob: "Cargo",             policyNumber: "TRV-CG-66201",  lossRunStatus: "received",  daysOutstanding: 0 },
      ],
      targetMarkets: [
        { carrier: "Progressive",    status: "quoted",    quotedPremium: 387_000, saving: 38_000, notes: "Best auto rate · matched limits" },
        { carrier: "Travelers",      status: "quoted",    quotedPremium: 401_500, saving: 23_500, notes: "Bundle discount on WC + auto" },
        { carrier: "Liberty Mutual", status: "submitted",                                          notes: "Underwriter reviewing this week" },
        { carrier: "Berkshire",      status: "not-quoted",                                          notes: "Appetite mismatch — skip" },
      ],
      stage: "quoted",
      notes: "Strong referral. CFO previously a client at prior agency. Open to single-carrier consolidation.",
      riskScore: "4.1 / 10",
      riskTone: "success",
      recommendedPlacement: "Progressive — $38K saving, same limits, incumbent quality on Cargo",
    },
    {
      id: "greenfield-hospitality",
      name: "Greenfield Hospitality Group",
      industry: "Hotel & Restaurant Operations (NAICS 721110)",
      hq: "Asheville, NC",
      employees: 88,
      locations: 5,
      proposalDueDate: inDays(56),
      daysToProposal: 56,
      borStatus: "requested",
      source: "inbound",
      producer: "Daniel Park",
      estimatedCurrentPremium: 218_000,
      expectedQuotedPremium: 198_000,
      currentCarriers: [
        { carrier: "Chubb",           lob: "Property",           policyNumber: "CHB-PR-33012", lossRunStatus: "pending-bor", daysOutstanding: 0 },
        { carrier: "Chubb",           lob: "General Liability",  policyNumber: "CHB-GL-33013", lossRunStatus: "pending-bor", daysOutstanding: 0 },
        { carrier: "AmTrust",         lob: "Workers' Comp",      policyNumber: "AMT-WC-99821", lossRunStatus: "pending-bor", daysOutstanding: 0 },
        { carrier: "Hartford Steam",  lob: "Boiler & Machinery", policyNumber: "HSB-BM-11442", lossRunStatus: "pending-bor", daysOutstanding: 0 },
      ],
      targetMarkets: [
        { carrier: "Liberty Mutual",  status: "not-quoted", notes: "Strong hospitality appetite" },
        { carrier: "Travelers",       status: "not-quoted", notes: "Multi-line packager" },
        { carrier: "Zurich",          status: "not-quoted", notes: "Boiler & machinery specialist" },
      ],
      stage: "bor-pending",
      notes: "Hotel + restaurant mix. Owner wants single broker across all 5 locations. BOR letter sent Monday.",
      riskScore: "5.6 / 10",
      riskTone: "warning",
      recommendedPlacement: "Liberty Mutual — best hospitality book, expected 10% savings",
    },
    {
      id: "aurora-tech",
      name: "Aurora Tech Holdings",
      industry: "Software Development & Hosting (NAICS 541512)",
      hq: "Austin, TX",
      employees: 312,
      locations: 2,
      proposalDueDate: inDays(14),
      daysToProposal: 14,
      borStatus: "signed",
      borSignedDate: inDays(-21),
      source: "rfp",
      producer: "Sarah Chen",
      estimatedCurrentPremium: 364_000,
      expectedQuotedPremium: 338_000,
      currentCarriers: [
        { carrier: "Beazley",          lob: "Cyber",                  policyNumber: "BZL-CY-77192", lossRunStatus: "received", daysOutstanding: 0 },
        { carrier: "Chubb",            lob: "Tech E&O",               policyNumber: "CHB-TE-22034", lossRunStatus: "received", daysOutstanding: 0 },
        { carrier: "The Hartford",     lob: "Workers' Comp",          policyNumber: "HFD-WC-88712", lossRunStatus: "received", daysOutstanding: 0 },
        { carrier: "Travelers",        lob: "General Liability",      policyNumber: "TRV-GL-44012", lossRunStatus: "received", daysOutstanding: 0 },
        { carrier: "AIG",              lob: "D&O",                    policyNumber: "AIG-DO-66042", lossRunStatus: "stale" as any, daysOutstanding: 112 },
      ],
      targetMarkets: [
        { carrier: "Beazley",      status: "quoted",   quotedPremium: 332_000, saving: 32_000, notes: "Best cyber rate · incumbent stays" },
        { carrier: "Chubb",        status: "quoted",   quotedPremium: 344_500, saving: 19_500, notes: "Tech E&O strength" },
        { carrier: "Hiscox",       status: "submitted",                                         notes: "Smaller tech appetite — pending response" },
        { carrier: "Markel",       status: "declined",                                          notes: "Outside appetite — class declined" },
      ],
      stage: "quoted",
      notes: "Competitive RFP. Three other brokers in play. Aurora's outgoing broker has D&O loss run >90d old — re-pull needed.",
      riskScore: "3.2 / 10",
      riskTone: "success",
      recommendedPlacement: "Beazley — keep incumbent, save $32K, no business disruption",
    },
  ];

  // Recompute daysToProposal in case the constants drift.
  return prospects.map((p) => ({
    ...p,
    daysToProposal: daysFromNow(p.proposalDueDate),
  }));
}

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  "intake":              "Intake",
  "bor-pending":         "BOR pending",
  "loss-runs-pending":   "Loss runs pending",
  "analyzing":           "Analyzing",
  "shopping":            "Out to market",
  "quoted":              "Quoted",
  "won":                 "Won",
  "lost":                "Lost",
};

export function stageTone(stage: ProspectStage): "default" | "primary" | "warning" | "success" | "danger" {
  switch (stage) {
    case "intake":             return "default";
    case "bor-pending":        return "warning";
    case "loss-runs-pending":  return "warning";
    case "analyzing":          return "primary";
    case "shopping":           return "primary";
    case "quoted":             return "success";
    case "won":                return "success";
    case "lost":               return "danger";
  }
}
