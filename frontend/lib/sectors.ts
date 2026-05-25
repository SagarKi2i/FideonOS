// Sector definitions — Fideon launches in insurance and expands sector-by-sector.
// Each sector has its own catalog of agents, but they share the same shell:
// shared "jobs to be done" lanes, shared MCP layer, shared review/audit infrastructure.

import {
  Shield,
  Building2,
  Heart,
  Scale,
  Plane,
  Sparkles,
  Briefcase,
  Building,
  type LucideIcon,
} from "lucide-react";

export type SectorId = "insurance" | "banking" | "healthcare" | "legal" | "travel";

export type SectorStatus = "live" | "preview" | "waitlist";

export interface Sector {
  id: SectorId;
  label: string;
  shortLabel: string;
  status: SectorStatus;
  icon: LucideIcon;
  /** Promise to the buyer — single sentence. */
  tagline: string;
  /** Live agent count today, used to size the "live" badge. */
  liveAgentCount: number;
  /** Roadmap items (used on the Marketplace overview when sector isn't live). */
  comingSoon?: string[];
  /** Sub-segments (e.g. broker / MGA / carrier for insurance). */
  segments?: { id: string; label: string; icon: LucideIcon }[];
}

export const SECTORS: Sector[] = [
  {
    id: "insurance",
    label: "Insurance",
    shortLabel: "Insurance",
    status: "live",
    icon: Shield,
    tagline: "Six focused agents for the work brokers do every day. More coming.",
    liveAgentCount: 6,
    segments: [
      { id: "broker",  label: "Brokers",  icon: Briefcase },
      { id: "mga",     label: "MGA",      icon: Building },
      { id: "carrier", label: "Carriers", icon: Shield },
    ],
  },
  {
    id: "banking",
    label: "Banking & Finance",
    shortLabel: "Banking",
    status: "waitlist",
    icon: Building2,
    tagline: "KYC, AML, fraud and credit ops — agents that actually clear queues.",
    liveAgentCount: 0,
    comingSoon: [
      "KYC document review (Q3)",
      "AML transaction screening (Q3)",
      "Loan file completeness (Q4)",
      "Credit memo drafting (Q4)",
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    shortLabel: "Healthcare",
    status: "waitlist",
    icon: Heart,
    tagline: "Pre-auth, claims, and clinical summaries — payer-ready accuracy.",
    liveAgentCount: 2,
    comingSoon: [
      "Prior authorization drafting",
      "Clinical record summarization",
      "Eligibility verification",
      "Claims denial appeals",
    ],
  },
  {
    id: "legal",
    label: "Legal",
    shortLabel: "Legal",
    status: "waitlist",
    icon: Scale,
    tagline: "Contract review, clause discovery, and risk flagging.",
    liveAgentCount: 2,
    comingSoon: [
      "Contract diff & redline",
      "Clause discovery across deals",
      "Compliance gap analysis",
    ],
  },
  {
    id: "travel",
    label: "Travel",
    shortLabel: "Travel",
    status: "waitlist",
    icon: Plane,
    tagline: "Itinerary, visa, and policy compliance for corporate travel.",
    liveAgentCount: 2,
    comingSoon: [
      "Itinerary builder",
      "Visa-rule checker",
      "Travel-policy compliance",
    ],
  },
];

export const getSector = (id: SectorId): Sector =>
  SECTORS.find((s) => s.id === id) ?? SECTORS[0];

// ─────────────────────────────────────────────────────────────────────
// Jobs-to-be-done — shared lanes used to group agents in the marketplace.
// These cross sectors: "Save my mornings" applies equally to a broker
// and a banker. The agent is what differs.
// ─────────────────────────────────────────────────────────────────────

export type JobLaneId =
  | "save_my_mornings"
  | "win_more_business"
  | "handle_cases"
  | "stay_compliant"
  | "explore";

export interface JobLane {
  id: JobLaneId;
  label: string;
  /** What the broker / banker / etc actually says. */
  brokerWords: string;
  description: string;
  icon: LucideIcon;
  /** Marketing accent color tone. */
  tone: "primary" | "success" | "warning" | "info";
}

export const JOB_LANES: JobLane[] = [
  {
    id: "save_my_mornings",
    label: "Save my mornings",
    brokerWords: "I open the day buried — pull renewals, log submissions, chase carriers.",
    description: "Agents that handle the daily admin. Pull, log, attach, follow up.",
    icon: Sparkles,
    tone: "primary",
  },
  {
    id: "win_more_business",
    label: "Win more business",
    brokerWords: "I want to quote faster, triage submissions, never lose a deal to a slow turnaround.",
    description: "Submission triage, multi-carrier quoting, win/loss intelligence.",
    icon: Briefcase,
    tone: "success",
  },
  {
    id: "handle_cases",
    label: "Handle claims & cases",
    brokerWords: "When something goes wrong, I want it triaged, drafted, and ready to send.",
    description: "FNOL drafting, loss-run analysis, fraud signals, subrogation.",
    icon: Shield,
    tone: "warning",
  },
  {
    id: "stay_compliant",
    label: "Stay compliant",
    brokerWords: "Every action gets logged. Every decision is reviewable.",
    description: "Policy comparison, audit trail exports, model-version pinning.",
    icon: Scale,
    tone: "info",
  },
  {
    id: "explore",
    label: "Explore",
    brokerWords: "Show me what else AI can do for my book.",
    description: "Newer agents and experimental capabilities.",
    icon: Sparkles,
    tone: "primary",
  },
];

export const getJobLane = (id: JobLaneId): JobLane =>
  JOB_LANES.find((l) => l.id === id) ?? JOB_LANES[0];

// ─────────────────────────────────────────────────────────────────────
// Agent status — what the buyer sees on each card.
// ─────────────────────────────────────────────────────────────────────

export type AgentStatus = "live" | "beta" | "coming_soon" | "roadmap";

export const STATUS_META: Record<AgentStatus, { label: string; tone: "success" | "primary" | "warning" | "neutral"; description: string }> = {
  live:        { label: "Live",         tone: "success",  description: "Production-ready with real connectors." },
  beta:        { label: "Beta",         tone: "primary",  description: "Working agent, limited carrier coverage." },
  coming_soon: { label: "Coming soon",  tone: "warning",  description: "On the active roadmap, weeks out." },
  roadmap:     { label: "Roadmap",      tone: "neutral",  description: "Planned. Vote it up to prioritize." },
};
