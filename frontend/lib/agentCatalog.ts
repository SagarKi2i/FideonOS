// ─────────────────────────────────────────────────────────────────────────
// Unified agent catalog
// ─────────────────────────────────────────────────────────────────────────
// Wraps the existing insurance models (in src/lib/insuranceMocks.ts) with
// the metadata that powers the new Marketplace: status, JTBD lane, MCP
// availability, connectors supported, time saved, social proof.
//
// Designed to expand: when banking/healthcare/legal/travel agents land,
// they go here too. The Marketplace UI is sector-agnostic.
// ─────────────────────────────────────────────────────────────────────────

import {
  brokerModels,
  mgaModels,
  carrierModels,
  type InsuranceModel,
} from "./insuranceMocks";
import type { SectorId, JobLaneId, AgentStatus } from "./sectors";

export interface CatalogAgent {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name (matches iconMap in Marketplace). */
  icon: string;

  sector: SectorId;
  /** Sector sub-segment, e.g. "broker" / "mga" / "carrier" for insurance. */
  segment?: string;

  status: AgentStatus;
  jobLane: JobLaneId;

  /** Connectors / external systems the agent works with. */
  connectors?: string[];

  /** Average minutes saved per run, used for the headline number. */
  timeSavedMinutes?: number;
  /** How many tenants are running it (anonymized social proof). */
  usedByCount?: number;

  /** Available via MCP from Claude / ChatGPT / Copilot? */
  mcpAvailable?: boolean;
  /** MCP tool name (matches what the mcp-server exposes). */
  mcpToolName?: string;

  /** Pricing hint for the card. */
  pricingHint?: string;

  /** A 1-line "what it does" used on the card under the title. */
  oneLiner?: string;
  /** Sample input/output for the detail page. */
  samplePrompt?: string;
  sampleOutput?: string;

  /** Underlying category from the insurance source (kept for compat). */
  category?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Hand-curated metadata for the agents that have shipped or are imminent.
// Anything not listed here gets sensible defaults below.
// ─────────────────────────────────────────────────────────────────────────

interface MetaPatch {
  status?: AgentStatus;
  jobLane?: JobLaneId;
  connectors?: string[];
  timeSavedMinutes?: number;
  usedByCount?: number;
  mcpAvailable?: boolean;
  mcpToolName?: string;
  pricingHint?: string;
  oneLiner?: string;
  samplePrompt?: string;
  sampleOutput?: string;
}

// Only the six pods we're focused on are LIVE.
// Everything else falls through to the default at the bottom of fromInsurance(),
// which marks them as "coming_soon" with a generic JTBD lane.

const INSURANCE_META: Record<string, MetaPatch> = {
  // ─── LIVE pods (the six in current focus) ─────────────────────────────
  "document-retrieval": {
    status: "live",
    jobLane: "save_my_mornings",
    connectors: ["Applied Epic", "AMS360", "HawkSoft", "EZLynx", "QQ Catalyst", "Travelers", "Hartford", "Progressive"],
    timeSavedMinutes: 14,
    usedByCount: 47,
    mcpAvailable: true,
    mcpToolName: "document_retrieval_pull",
    oneLiner: "Pulls renewals, endorsements and cancellations from carriers and attaches them to your AMS automatically.",
    samplePrompt: "Pull the latest renewal proposal for ABC Hardware from Travelers and attach it to AMS360.",
    sampleOutput: "✓ Found PA-2026-44821 (renewal) on Travelers portal\n✓ Downloaded 3 documents (renewal proposal, schedule, certificate)\n✓ Attached to ABC Hardware account in AMS360\n✓ Created inbox item for your review (premium up 3.2%)",
  },
  "loss-run-reporting": {
    status: "live",
    jobLane: "handle_cases",
    connectors: ["Travelers", "Hartford", "Progressive", "Liberty Mutual", "Chubb"],
    timeSavedMinutes: 25,
    usedByCount: 34,
    mcpAvailable: true,
    mcpToolName: "loss_run_pull_report",
    oneLiner: "Pulls 5-year loss runs from every carrier in one go and produces the underwriting-ready summary.",
    samplePrompt: "Pull 5-year loss runs for ABC Hardware from all carriers we've placed business with.",
    sampleOutput: "Pulled 5-year loss data from 4 carriers:\n• 2 claims total ($14,200 incurred)\n• Loss ratio: 6.3% (excellent)\n• No frequency pattern\n• Underwriting summary PDF ready for submissions",
  },
  "quote-generation": {
    status: "live",
    jobLane: "win_more_business",
    connectors: ["Travelers", "Hartford", "Progressive", "Liberty Mutual", "Nationwide", "Chubb"],
    timeSavedMinutes: 22,
    usedByCount: 38,
    mcpAvailable: true,
    mcpToolName: "quote_generation_fetch_quotes",
    oneLiner: "Submits to multiple carriers, parses quotes back, and produces a side-by-side proposal in under a minute.",
    samplePrompt: "Get BOP quotes for ABC Hardware (5 employees, $500k revenue, no losses) from our top 4 carriers.",
    sampleOutput: "Submitted to 4 carriers · 3 came back\n• Travelers: $8,750/yr  · best price\n• Hartford:  $9,420/yr  · best loss control\n• Progressive: $9,180/yr · fastest binding\n· Liberty Mutual: declined (appetite mismatch)\n\nProposal PDF attached. Recommend Travelers — premium and equipment breakdown coverage.",
  },
  "policy-comparison": {
    status: "live",
    jobLane: "save_my_mornings",
    connectors: ["Any PDF", "Applied Epic", "AMS360", "Carrier portals"],
    timeSavedMinutes: 18,
    usedByCount: 41,
    mcpAvailable: true,
    mcpToolName: "policy_compare",
    oneLiner: "Diffs two policies clause-by-clause — and checks the issued policy against what was quoted — in language a client can actually read.",
    samplePrompt: "Compare expiring ABC Hardware GL policy vs. proposed renewal, and check the issued policy matches the quote we accepted. Flag every coverage difference.",
    sampleOutput: "12 changes detected:\n• Aggregate limit raised $1M → $2M ✓\n• New cyber sublimit $50k ✓\n• Mold exclusion tightened ⚠️\n• Liquor liability removed (was incidental) ⚠️\n\nIssued-vs-quoted check:\n• Hired/non-owned: ⚠️ missing — was on the quote\n\nClient-ready summary attached.",
  },
  "renewal-review": {
    // Displayed as "Policy Renewal" (renamed in insuranceMocks.ts)
    status: "live",
    jobLane: "save_my_mornings",
    connectors: ["Applied Epic", "AMS360", "HawkSoft", "Travelers", "Hartford"],
    timeSavedMinutes: 16,
    usedByCount: 28,
    mcpAvailable: true,
    mcpToolName: "policy_renewal",
    oneLiner: "Pulls the renewal proposal, compares it to expiring, drafts the client-ready summary explaining what changed.",
    samplePrompt: "Prep the renewal for ABC Hardware — pull the proposal, compare to expiring, draft the client email.",
    sampleOutput: "Renewal prep complete — ABC Hardware:\n• Pulled proposal from Travelers\n• Compared vs expiring: 12 changes, 2 require client review\n• Premium delta: +3.2% ($380/yr)\n• Drafted client email (in your outbox)\n\nReady to send.",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Banking — preview catalog (so the marketplace can demonstrate the
// expansion model without claiming live coverage we don't have).
// ─────────────────────────────────────────────────────────────────────────

// Banking — all coming soon while we focus on the six insurance pods.
const BANKING_AGENTS: CatalogAgent[] = [
  {
    id: "banking-kyc-review",
    name: "KYC Document Review",
    description: "Reviews KYC documents for completeness, expiry, and watchlist hits.",
    icon: "shield-check",
    sector: "banking",
    status: "coming_soon",
    jobLane: "stay_compliant",
    pricingHint: "Coming soon",
    oneLiner: "Clears the KYC queue with watchlist-aware document review.",
  },
  {
    id: "banking-aml-screening",
    name: "AML Transaction Screening",
    description: "Flags suspicious transactions and drafts SAR narratives.",
    icon: "alert-circle",
    sector: "banking",
    status: "coming_soon",
    jobLane: "stay_compliant",
    pricingHint: "Coming soon",
    oneLiner: "Surfaces and explains suspicious transactions in plain English.",
  },
  {
    id: "banking-loan-completeness",
    name: "Loan File Completeness",
    description: "Checks loan files for missing documents and inconsistencies.",
    icon: "file-check",
    sector: "banking",
    status: "coming_soon",
    jobLane: "save_my_mornings",
    pricingHint: "Coming soon",
    oneLiner: "Audits loan files end-to-end before submission to credit.",
  },
  {
    id: "banking-credit-memo",
    name: "Credit Memo Drafter",
    description: "Drafts credit memos from financial statements and CRM data.",
    icon: "file-text",
    sector: "banking",
    status: "coming_soon",
    jobLane: "win_more_business",
    pricingHint: "Coming soon",
    oneLiner: "Drafts the credit memo so the relationship manager only edits.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Build the unified catalog
// ─────────────────────────────────────────────────────────────────────────

// Default JTBD lane for unlisted agents — best-guess by segment.
function defaultLaneFor(model: InsuranceModel): JobLaneId {
  if (model.segment === "carrier") return "win_more_business";
  if (model.segment === "mga")     return "win_more_business";
  return "explore";
}

function fromInsurance(model: InsuranceModel): CatalogAgent {
  const meta = INSURANCE_META[model.id] ?? {};
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    icon: model.icon,
    sector: "insurance",
    segment: model.segment,
    category: model.category,
    // Only the six in INSURANCE_META are "live". Everything else: "coming_soon".
    status: meta.status ?? "coming_soon",
    jobLane: meta.jobLane ?? defaultLaneFor(model),
    connectors: meta.connectors,
    timeSavedMinutes: meta.timeSavedMinutes,
    usedByCount: meta.usedByCount,
    mcpAvailable: meta.mcpAvailable ?? false,
    mcpToolName: meta.mcpToolName,
    pricingHint: meta.pricingHint ?? "Coming soon",
    oneLiner: meta.oneLiner ?? model.description,
    samplePrompt: meta.samplePrompt,
    sampleOutput: meta.sampleOutput,
  };
}

const insuranceCatalog: CatalogAgent[] = [
  ...brokerModels.map(fromInsurance),
  ...mgaModels.map(fromInsurance),
  ...carrierModels.map(fromInsurance),
];

export const CATALOG: CatalogAgent[] = [
  ...insuranceCatalog,
  ...BANKING_AGENTS,
];

export const getAgent = (id: string): CatalogAgent | undefined =>
  CATALOG.find((a) => a.id === id);

export const agentsBySector = (sector: SectorId): CatalogAgent[] =>
  CATALOG.filter((a) => a.sector === sector);

// Stats — used by the Today / Marketplace pages.
export const sectorStats = (sector: SectorId) => {
  const agents = agentsBySector(sector);
  return {
    total: agents.length,
    live: agents.filter((a) => a.status === "live").length,
    beta: agents.filter((a) => a.status === "beta").length,
    comingSoon: agents.filter((a) => a.status === "coming_soon").length,
    mcpEnabled: agents.filter((a) => a.mcpAvailable).length,
  };
};

// Lightweight social-proof feed — anonymized, "what other tenants did this week".
// Real product would back this with real events; for now a curated set.
export const SOCIAL_PROOF_FEED: { id: string; orgInitials: string; orgKind: string; agentName: string; agentId: string; ago: string }[] = [
  { id: "1", orgInitials: "MD", orgKind: "Brokerage in Texas",        agentName: "Document Retrieval",     agentId: "document-retrieval", ago: "2 hours ago" },
  { id: "2", orgInitials: "PG", orgKind: "Brokerage in Florida",      agentName: "Quote Generation Agent", agentId: "quote-generation",   ago: "5 hours ago" },
  { id: "3", orgInitials: "RH", orgKind: "MGA in California",         agentName: "Loss Run Reporting",      agentId: "loss-run-reporting", ago: "yesterday" },
  { id: "4", orgInitials: "SK", orgKind: "Brokerage in NYC",          agentName: "Policy Comparison Engine",agentId: "policy-comparison",  ago: "yesterday" },
  { id: "5", orgInitials: "TC", orgKind: "Carrier in Illinois",       agentName: "Submission Intake",       agentId: "carrier-submission-intake", ago: "2 days ago" },
];
