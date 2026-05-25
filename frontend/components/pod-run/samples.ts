// Sample runs per pod.
// Each entry is a pre-built RunInput + RunStep timeline + structured output,
// so prospects can hit "Try a sample" on any pod and see realistic execution
// without uploading their own data.

import type { RunInput, RunStep } from "./types";

interface SampleCase {
  input: RunInput;
  steps: RunStep[];
  output: any;
  confidence: number;
  /** Per-step delays for the simulated stream, ms. */
  stepDelays?: number[];
}

// ─────────────────────────── LOSS RUN REPORTING ───────────────────────────

const lossRunSample: SampleCase = {
  input: {
    kind: "sample",
    label: "ACME Manufacturing — 3-year loss runs",
    sublabel: "Travelers · WC · 2022–2024",
    payload: { account: "acme-manufacturing", lob: "WC" },
  },
  steps: [
    { id: "s1", title: "Authenticated with Travelers portal", detail: "MFA via stored credentials", status: "pending" },
    { id: "s2", title: "Located loss-run files for ACME (3 years)", detail: "2022, 2023, 2024 PDFs", status: "pending" },
    { id: "s3", title: "OCR + parse — extracted 47 claim records", data: { claims: 47, years: 3 }, status: "pending" },
    { id: "s4", title: "Computed per-year aggregates", data: { "2022": "$184k", "2023": "$226k", "2024": "$298k" }, status: "pending" },
    { id: "s5", title: "Flagged 4 high-severity claims (>$50k)", status: "pending" },
    { id: "s6", title: "Drafted client-facing summary", detail: "Plain-English explanation with recommendations", status: "pending" },
  ],
  output: {
    kind: "loss-run-report",
    account: "ACME Manufacturing",
    carrier: "Travelers",
    lineOfBusiness: "Workers' Comp",
    period: "2022 – 2024",
    summary: "Loss ratio is trending upward — 58% (2022) → 64% (2023) → 71% (2024). Four high-severity claims drive the 2024 spike, all from the night shift at the Carson plant. Recommend a safety review and a 5–8% rate adjustment at renewal.",
    yearlyAggregates: [
      { year: 2022, premium: 318_000, losses: 184_000, lossRatio: 0.58, claims: 12 },
      { year: 2023, premium: 353_000, losses: 226_000, lossRatio: 0.64, claims: 17 },
      { year: 2024, premium: 420_000, losses: 298_000, lossRatio: 0.71, claims: 18 },
    ],
    flaggedClaims: [
      { id: "WC-2024-0118", date: "2024-03-14", amount: 142_000, type: "Back injury",      status: "Open",   note: "Carson plant · night shift" },
      { id: "WC-2024-0237", date: "2024-06-22", amount:  87_000, type: "Hand laceration",  status: "Closed", note: "Carson plant · night shift" },
      { id: "WC-2024-0298", date: "2024-09-04", amount:  64_000, type: "Slip & fall",      status: "Open",   note: "Carson plant · night shift" },
      { id: "WC-2024-0345", date: "2024-11-19", amount:  51_000, type: "Repetitive motion", status: "Open",   note: "Carson plant · day shift" },
    ],
    recommendations: [
      "Schedule safety audit at Carson plant, night shift focus.",
      "Propose 5–8% rate adjustment at renewal given trend.",
      "Pull updated experience mod from NCCI before renewal proposal.",
    ],
  },
  confidence: 0.94,
  stepDelays: [800, 600, 1100, 900, 700, 1200],
};

// ─────────────────────────── ACORD PARSER ───────────────────────────

const acordSample: SampleCase = {
  input: {
    kind: "sample",
    label: "ACORD 125 — ACME Manufacturing",
    sublabel: "Commercial Insurance Application · 3 pages",
    payload: { form: "ACORD_125" },
  },
  steps: [
    { id: "s1", title: "Detected form type — ACORD 125 (Commercial Insurance)", status: "pending" },
    { id: "s2", title: "Ran OCR on 3 pages", detail: "all pages high-quality", status: "pending" },
    { id: "s3", title: "Mapped 47 fields to AMS schema", status: "pending" },
    { id: "s4", title: "Validated FEIN, NAICS, addresses", status: "pending" },
    { id: "s5", title: "Flagged 2 fields for review", detail: "handwritten effective date · multi-state class code", status: "pending" },
  ],
  output: {
    kind: "acord-parsed",
    formType: "ACORD 125",
    pages: 3,
    fields: [
      { key: "Insured Name",        value: "ACME Manufacturing, Inc.", confidence: 1.0 },
      { key: "FEIN",                value: "47-8392104",                confidence: 0.99 },
      { key: "Mailing Address",     value: "1420 Industrial Way, Carson, CA 90745", confidence: 0.98 },
      { key: "NAICS Code",          value: "332710 — Machine Shops", confidence: 0.97 },
      { key: "Years in Business",   value: "14",                        confidence: 1.0 },
      { key: "Effective Date",      value: "2025-04-01",                confidence: 0.78, flag: "handwritten" },
      { key: "Limit (Each Occ.)",   value: "$1,000,000",                confidence: 1.0 },
      { key: "Limit (Aggregate)",   value: "$2,000,000",                confidence: 1.0 },
      { key: "Class Code (primary)", value: "3632 — Machine Shop NOC",  confidence: 0.92 },
      { key: "Class Code (CA)",     value: "3632",                       confidence: 0.86, flag: "multi-state" },
      { key: "Estimated Annual Payroll", value: "$2,840,000",            confidence: 0.96 },
      { key: "Prior Carrier",       value: "Hartford",                   confidence: 0.99 },
    ],
  },
  confidence: 0.96,
  stepDelays: [600, 900, 1000, 700, 800],
};

// ─────────────────────────── QUOTE GENERATION ───────────────────────────

const quoteSample: SampleCase = {
  input: {
    kind: "sample",
    label: "Quote ACME Manufacturing — GL renewal",
    sublabel: "Compared across 3 carriers",
    payload: { account: "acme-manufacturing", lob: "GL" },
  },
  steps: [
    { id: "s1", title: "Pulled prior policy from AMS", status: "pending" },
    { id: "s2", title: "Built submission packet", status: "pending" },
    { id: "s3", title: "Sent to 3 carriers (Travelers, Chubb, Hartford)", status: "pending" },
    { id: "s4", title: "Received responses (2 of 3)", detail: "Travelers + Chubb · Hartford pending", status: "pending" },
    { id: "s5", title: "Compared quotes line-by-line", status: "pending" },
  ],
  output: {
    kind: "quote",
    account: "ACME Manufacturing",
    lineOfBusiness: "General Liability",
    quotes: [
      { carrier: "Travelers", premium: 38_400, change: "+4.2%", limits: "$1M / $2M", deductible: "$2,500", recommendation: "Best fit", tone: "success" as const },
      { carrier: "Chubb",     premium: 41_900, change: "+6.8%", limits: "$1M / $2M", deductible: "$2,500", recommendation: "Stronger property coverage", tone: "primary" as const },
      { carrier: "Hartford",  premium: null,   change: "—",     limits: "—",         deductible: "—",      recommendation: "Pending response",          tone: "warning" as const },
    ],
    summary: "Travelers comes in $3,500 below Chubb with the same limits/deductible — the best fit unless ACME wants Chubb's broader cyber endorsement. Hartford still pending; we'll follow up in 24 hours.",
  },
  confidence: 0.91,
  stepDelays: [500, 800, 1400, 1100, 900],
};

// ─────────────────────────── POLICY COMPARISON ───────────────────────────

const policyCompareSample: SampleCase = {
  input: {
    kind: "sample",
    label: "Renewal vs. expiring — Riverside Logistics",
    sublabel: "Auto · Progressive · clause-by-clause",
    payload: { account: "riverside-logistics", lob: "Auto" },
  },
  steps: [
    { id: "s1", title: "Loaded expiring + renewal policy PDFs", status: "pending" },
    { id: "s2", title: "Extracted coverage clauses (38 from each)", status: "pending" },
    { id: "s3", title: "Aligned clauses across both policies", status: "pending" },
    { id: "s4", title: "Identified 4 material differences", status: "pending" },
    { id: "s5", title: "Drafted client summary in plain English", status: "pending" },
  ],
  output: {
    kind: "policy-compare",
    account: "Riverside Logistics",
    carrier: "Progressive",
    diffs: [
      { type: "premium",   label: "Premium",                       expiring: "$48,200",            renewal: "$54,800",         delta: "+13.7%", tone: "danger"  as const, note: "Above 5% threshold — surface to broker" },
      { type: "exclusion", label: "Hired/non-owned auto exclusion", expiring: "covered",            renewal: "excluded",         delta: "new",     tone: "danger"  as const },
      { type: "limit",     label: "Per-vehicle limit",             expiring: "$1,000,000",         renewal: "$1,000,000",       delta: "—",       tone: "neutral" as const },
      { type: "deductible",label: "Comprehensive deductible",      expiring: "$1,000",             renewal: "$2,500",            delta: "+$1,500",tone: "warning" as const },
      { type: "endorsement",label: "Drive-other-car endorsement", expiring: "—",                   renewal: "added",             delta: "new",    tone: "success" as const },
    ],
    summary: "Renewal premium up 13.7% (above the 5% threshold for client notification). Hired/non-owned auto coverage is now excluded — that's a coverage loss to flag. Comp deductible up $1,500. One coverage gain: drive-other-car endorsement added.",
  },
  confidence: 0.95,
  stepDelays: [600, 900, 800, 1100, 1000],
};

// ─────────────────────────── RENEWAL REVIEW ───────────────────────────

const renewalSample: SampleCase = {
  input: {
    kind: "sample",
    label: "ACME Manufacturing — 60-day renewal prep",
    sublabel: "Policy expires 2025-04-01",
    payload: { account: "acme-manufacturing", expiry: "2025-04-01" },
  },
  steps: [
    { id: "s1", title: "Pulled expiring policy from AMS",         status: "pending" },
    { id: "s2", title: "Fetched renewal proposal from Travelers",  status: "pending" },
    { id: "s3", title: "Pulled loss runs (Workers' Comp · GL)",   status: "pending" },
    { id: "s4", title: "Ran policy comparison",                    status: "pending" },
    { id: "s5", title: "Drafted client-facing renewal package",   status: "pending" },
    { id: "s6", title: "Attached to AMS account record",           status: "pending" },
  ],
  output: {
    kind: "renewal-package",
    account: "ACME Manufacturing",
    expiry: "2025-04-01",
    daysOut: 60,
    headline: "Renewal terms: premium +5.2% · two coverage changes worth surfacing · loss-run-supported.",
    changes: [
      { label: "Premium",                        before: "$48,400", after: "$50,920",      delta: "+5.2%",  tone: "warning" as const },
      { label: "Workers' Comp limits",            before: "$1M",     after: "$1M",          delta: "—",       tone: "neutral" as const },
      { label: "Auto coverage exclusion",        before: "covered", after: "excluded",     delta: "new",     tone: "danger"  as const },
      { label: "Cyber endorsement (sublimit)",   before: "—",        after: "$100k added", delta: "new",     tone: "success" as const },
    ],
    clientEmailDraft: "Hi John — quick heads-up on the April 1 renewal for ACME. The renewal premium comes in at $50,920 (+5.2% vs last year), supported by your loss-run history. Two changes worth flagging: hired-auto coverage is now excluded (worth discussing if you have rented vehicles), and Travelers added a $100k cyber sublimit at no extra cost. Want to set up a quick call this week to review?",
  },
  confidence: 0.93,
  stepDelays: [600, 900, 800, 700, 1100, 600],
};

// ─────────────────────────── DOCUMENT RETRIEVAL ───────────────────────────

const documentRetrievalSample: SampleCase = {
  input: {
    kind: "sample",
    label: "Pull all docs for Pinecrest Restaurants",
    sublabel: "AMS + carrier portals · last 12 months",
    payload: { account: "pinecrest-restaurants", window: 365 },
  },
  steps: [
    { id: "s1", title: "Queried AMS for attachments",        detail: "found 28 documents", status: "pending" },
    { id: "s2", title: "Hit 4 carrier portals",              detail: "Liberty, Travelers, Hartford, Chubb", status: "pending" },
    { id: "s3", title: "Pulled 17 additional documents",     status: "pending" },
    { id: "s4", title: "OCR'd 6 scanned PDFs",                status: "pending" },
    { id: "s5", title: "Classified + tagged all 45 documents", status: "pending" },
  ],
  output: {
    kind: "document-retrieval",
    account: "Pinecrest Restaurants",
    documentsFound: 45,
    breakdown: [
      { type: "Renewals",        count: 12 },
      { type: "Endorsements",    count: 9 },
      { type: "Loss Runs",       count: 7 },
      { type: "Invoices",        count: 8 },
      { type: "Certificates",    count: 6 },
      { type: "Correspondence",  count: 3 },
    ],
    recent: [
      { name: "PoliReny_Liberty_2024.pdf",         carrier: "Liberty",   date: "2024-11-12", type: "Renewal" },
      { name: "EndorseChange_Travelers_2024.pdf",  carrier: "Travelers", date: "2024-10-04", type: "Endorsement" },
      { name: "LossRun_GL_Liberty_2024.pdf",       carrier: "Liberty",   date: "2024-09-22", type: "Loss Run" },
      { name: "Invoice_Hartford_Q3_2024.pdf",      carrier: "Hartford",  date: "2024-08-15", type: "Invoice" },
    ],
  },
  confidence: 0.98,
  stepDelays: [700, 1200, 1000, 900, 800],
};

// ─────────────────────────── registry ───────────────────────────

export const SAMPLES_BY_POD: Record<string, SampleCase> = {
  "loss-run-reporting": lossRunSample,
  "acord-parser":       acordSample,
  "quote-generation":   quoteSample,
  "policy-comparison":  policyCompareSample,
  "renewal-review":     renewalSample,
  "document-retrieval": documentRetrievalSample,
};

export function getSampleForPod(podId: string): SampleCase | null {
  return SAMPLES_BY_POD[podId] ?? null;
}
