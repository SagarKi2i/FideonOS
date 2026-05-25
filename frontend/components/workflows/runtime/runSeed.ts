'use client';
import { getCurrentUser } from '@/lib/currentUser';
// Shared seeding logic used by both the simple RunWorkflowDialog and
// the rich WorkflowRunDialog. After a workflow run completes, this
// writes one decision_reviews row per step so the Approvals queue
// picks them up — tagged with source_workflow_id +
// source_workflow_run_id + source_step_index for full provenance.
//
// Each per-agent template produces a realistic broker-judgment item:
//   • specific field-level extractions or decisions with confidence
//   • structured input_data showing what the model saw
//   • structured output_data the broker can verify field-by-field
//   • needs_review flags on the specific fields below threshold
//
// When the broker approves or overrides, the (input_data, output_data
// or corrected_output_data) pair becomes a training example. Field-level
// confidence + needs_review let the model learn exactly where its
// judgment is unreliable.

import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────── demo accounts ───────────────────────────

interface DemoAccount {
  name: string;
  fein: string;
  industry: string;
  hq: string;
  carriers: string[];      // outgoing carriers
  primaryLob: string;
}

const ACCOUNTS: DemoAccount[] = [
  { name: "Apex Manufacturing Co.", fein: "84-2719033", industry: "Precision Metal Fabrication",   hq: "Riverside, CA",  carriers: ["Travelers", "The Hartford", "Liberty Mutual", "Chubb"], primaryLob: "Workers' Comp" },
  { name: "River Glen Apartments",  fein: "47-3092841", industry: "Multifamily Real Estate",       hq: "Asheville, NC",  carriers: ["Lloyd's (Inigo)", "Travelers", "AIG"],                  primaryLob: "Property" },
  { name: "Leah's Pantry, Inc.",    fein: "82-4419027", industry: "Specialty Food Manufacturing",  hq: "Oakland, CA",    carriers: ["The Hartford", "Hanover"],                              primaryLob: "Workers' Comp" },
  { name: "Stillwater Logistics",   fein: "31-7748192", industry: "Long-haul Freight",             hq: "Memphis, TN",    carriers: ["Northland", "Liberty Mutual", "Progressive"],           primaryLob: "Commercial Auto" },
  { name: "Pinecrest Hospitality",  fein: "55-9912844", industry: "Restaurant Operations",         hq: "Charleston, SC", carriers: ["Liberty Mutual", "Hanover"],                            primaryLob: "GL + Liquor" },
];

function pickAccount(): DemoAccount {
  return ACCOUNTS[Math.floor(Math.random() * ACCOUNTS.length)];
}

function pickCarrier(acct: DemoAccount): string {
  return acct.carriers[Math.floor(Math.random() * acct.carriers.length)];
}

// ─────────────────────────── template type ───────────────────────────

export interface ExtractedField {
  key: string;
  label: string;
  value: string | number;
  confidence: number;     // 0-1
  needs_review?: boolean; // true when below threshold or flagged for human judgment
  source?: string;        // e.g. "Page 2, line 14" or "Carrier portal · Documents tab"
}

interface RunTemplate {
  title: string;
  summary: string;
  ai_recommendation: string;
  confidence: number;
  threshold: boolean;
  decision_type: string;
  account?: string;
  carrier?: string;
  input_data: Record<string, any>;
  output: Record<string, any>;
}

// ─────────────────────────── per-agent templates ───────────────────────────

const TEMPLATES_BY_AGENT: Record<string, () => RunTemplate> = {

  /* ════════════════════════ Document Retrieval ════════════════════════
     Broker decision: verify low-confidence OCR extractions before the
     document gets filed in the AMS. Training signal: corrected values
     against raw OCR text. */
  "document-retrieval": () => {
    const acct = pickAccount();
    const carrier = pickCarrier(acct);
    const fields: ExtractedField[] = [
      { key: "policy_number",          label: "Policy number",       value: "B1001347",                 confidence: 0.98, source: "Page 1, header" },
      { key: "named_insured",          label: "Named insured",       value: acct.name,                  confidence: 0.96, source: "Page 1, ID block" },
      { key: "named_insured_alias",    label: "DBA / alias",         value: acct.name.split(" ")[0] + " Mfg.", confidence: 0.71, needs_review: true, source: "Page 1, ID block · handwritten" },
      { key: "effective_date",         label: "Effective date",      value: "06/01/2025",               confidence: 0.62, needs_review: true, source: "Page 1, term box · handwritten" },
      { key: "expiration_date",        label: "Expiration date",     value: "06/01/2026",               confidence: 0.91, source: "Page 1, term box" },
      { key: "lob",                    label: "Line of business",    value: acct.primaryLob,            confidence: 0.95 },
      { key: "limit_each_occurrence",  label: "Each-occurrence limit", value: "$1,000,000",             confidence: 0.99 },
      { key: "aggregate_limit",        label: "Aggregate limit",     value: "$2,000,000",               confidence: 0.99 },
      { key: "premium",                label: "Premium",             value: "$18,400",                  confidence: 0.93 },
    ];
    return {
      title: `Verify 2 low-confidence fields from ${carrier} certificate · ${acct.name}`,
      summary: `OCR extracted 9 fields. 7 are high-confidence and ready to file. The handwritten effective date (62%) and the DBA alias (71%) need your eyes before this goes into the AMS.`,
      ai_recommendation: `Confirm or correct the effective date and DBA — both handwritten and below 80% confidence. The rest of the fields are stable.`,
      confidence: 0.78,
      threshold: true,
      decision_type: "document_validation",
      account: acct.name,
      carrier,
      input_data: {
        source_url: `${carrier.toLowerCase().replace(/[^a-z]/g, "")}-agent-portal.com/documents`,
        document_type: "Certificate of Insurance",
        document_id: `${carrier.substring(0, 3).toUpperCase()}-COI-${Math.floor(Math.random() * 90000) + 10000}`,
        page_count: 2,
        ocr_provider: "internal",
      },
      output: {
        document_type: "Certificate of Insurance",
        carrier,
        extracted_fields: fields,
        fields_needing_review: fields.filter((f) => f.needs_review).map((f) => f.key),
        recommended_action: "file_to_ams",
      },
    };
  },

  /* ════════════════════════ Loss Run Reporting ════════════════════════
     Broker decision: confirm the renewal posture given the analysis,
     and verify any loss-ratio threshold breaches. */
  "loss-run-reporting": () => {
    const acct = pickAccount();
    const carrier = pickCarrier(acct);
    const lr = +(0.55 + Math.random() * 0.25).toFixed(3); // 55-80% range
    const aboveThreshold = lr > 0.60;
    return {
      title: `${acct.name} renewal posture · LR ${(lr * 100).toFixed(1)}% across 5 years`,
      summary: `Computed 5-yr loss ratio ${(lr * 100).toFixed(1)}% on ${acct.carriers.length} carriers. Largest exposure: one $173K open WC claim from 2024. Frequency trend: declining (9 → 2 claims over 3 years).`,
      ai_recommendation: aboveThreshold
        ? `Loss ratio is above the 60% review threshold. Recommend: shop the account to 2-3 alternative markets before renewal terms drop.`
        : `Recommend: retain at incumbent with rate concession ask. The improving frequency trend supports a 5-8% credit request.`,
      confidence: aboveThreshold ? 0.82 : 0.89,
      threshold: aboveThreshold,
      decision_type: "risk_assessment",
      account: acct.name,
      carrier,
      input_data: {
        analysis_window: "5 years",
        carriers_in_analysis: acct.carriers,
        primary_lob: acct.primaryLob,
        source_loss_runs: acct.carriers.map((c) => `${c}-LR-${Math.floor(Math.random() * 9000) + 1000}`),
      },
      output: {
        loss_ratio_5yr: lr,
        threshold_60pct_exceeded: aboveThreshold,
        total_claims: 18 + Math.floor(Math.random() * 10),
        total_incurred: 380_000 + Math.floor(Math.random() * 200_000),
        largest_open_exposure_usd: 173_000,
        frequency_trend: "declining",
        recommended_posture: aboveThreshold ? "shop_the_account" : "retain_and_re_price",
        rate_ask_pct: aboveThreshold ? 0 : -7,
        confidence_breakdown: {
          ratio_calc: 0.99,
          frequency_assessment: 0.91,
          posture_recommendation: aboveThreshold ? 0.82 : 0.89,
        },
        fields_needing_review: ["recommended_posture", "rate_ask_pct"],
      },
    };
  },

  /* ════════════════════════ Policy Comparison ════════════════════════
     Broker decision: confirm which year-over-year changes are MATERIAL
     vs minor. Material changes get surfaced to the client; minor ones
     get filed silently. */
  "policy-comparison": () => {
    const acct = pickAccount();
    const carrier = pickCarrier(acct);
    const premiumDelta = +(0.08 + Math.random() * 0.10).toFixed(3); // 8-18%
    const changes = [
      { key: "premium_change",       label: "Premium change",          value: `+${(premiumDelta * 100).toFixed(1)}% (vs prior term)`, classification: "material",  confidence: 0.97, needs_review: false },
      { key: "hired_auto_exclusion", label: "Hired-auto exclusion",    value: "Added in renewal",                                       classification: "material",  confidence: 0.92, needs_review: false },
      { key: "drive_other_car",      label: "Drive-other-car endorsement", value: "Added (coverage gain)",                              classification: "minor",     confidence: 0.78, needs_review: true },
      { key: "ded_change",           label: "Deductible change",       value: "$1,000 → $2,500 on Property",                            classification: "material",  confidence: 0.84, needs_review: true },
      { key: "form_edition",         label: "Policy form edition",     value: "CG 00 01 04 13 → CG 00 01 12 19",                        classification: "minor",     confidence: 0.95, needs_review: false },
    ];
    return {
      title: `${carrier} renewal · 3 material + 2 minor changes detected for ${acct.name}`,
      summary: `Premium up ${(premiumDelta * 100).toFixed(1)}% with a hired-auto exclusion added and Property deductible increase. Two changes need your judgment on materiality.`,
      ai_recommendation: `Confirm the deductible-change classification (currently flagged material) and the drive-other-car classification (currently minor). Premium and exclusion are clearly material — they go to the client.`,
      confidence: 0.84,
      threshold: true,
      decision_type: "policy_review",
      account: acct.name,
      carrier,
      input_data: {
        renewal_term: "06/01/2026 – 06/01/2027",
        prior_term: "06/01/2025 – 06/01/2026",
        prior_policy_id: `${carrier.substring(0, 3).toUpperCase()}-GL-660145`,
        renewal_policy_id: `${carrier.substring(0, 3).toUpperCase()}-GL-660146`,
        comparison_method: "form_by_form_diff",
      },
      output: {
        premium_delta_pct: premiumDelta,
        threshold_5pct_exceeded: true,
        changes,
        material_count: changes.filter((c) => c.classification === "material").length,
        minor_count: changes.filter((c) => c.classification === "minor").length,
        fields_needing_review: changes.filter((c) => c.needs_review).map((c) => c.key),
        recommended_action: "surface_material_to_client",
      },
    };
  },

  /* ════════════════════════ Renewal Review ════════════════════════
     Broker decision: approve the drafted client email (tone, content,
     call-to-action). The broker's edit becomes a training example for
     this agency's voice. */
  "renewal-review": () => {
    const acct = pickAccount();
    const carrier = pickCarrier(acct);
    const draftBody = `Hi {{first_name}},\n\nThe renewal terms for ${acct.name}'s ${carrier} policy just came in. Two material changes to flag:\n\n  • Premium up 13.7% YoY\n  • Hired/non-owned auto exclusion added\n\nI'd like to set up a 20-minute call this week to walk through both before we bind. Let me know what works.\n\n— {{producer_name}}`;
    return {
      title: `Approve renewal email draft for ${acct.name}`,
      summary: `Drafted from the policy-comparison output. Two material callouts, soft ask for a 20-minute call. Tone matches your prior emails to this client.`,
      ai_recommendation: `Send as-is or edit before sending. Your edits train the tone model — corrections compound over time on this account specifically.`,
      confidence: 0.79,
      threshold: true,
      decision_type: "policy_review",
      account: acct.name,
      carrier,
      input_data: {
        client_history: {
          prior_emails_analyzed: 4,
          dominant_tone: "warm-professional",
          producer_signoff: "— {{producer_name}}",
          uses_first_name: true,
        },
        source_decisions: ["policy-comparison output"],
        material_changes_referenced: 2,
      },
      output: {
        email_subject: `${acct.name} renewal — two changes to discuss`,
        email_body: draftBody,
        word_count: 78,
        material_callouts_count: 2,
        cta: "20-minute call this week",
        tone_classification: "warm-professional",
        confidence_breakdown: {
          factual_accuracy: 0.95,
          tone_match:       0.79,
          cta_appropriateness: 0.88,
        },
        fields_needing_review: ["email_body"],
        recommended_action: "send_after_review",
      },
    };
  },

  /* ════════════════════════ Quote Generation ════════════════════════
     Broker decision: confirm or override the recommended carrier given
     the cross-carrier quote returns and the account's known preferences. */
  "quote-generation": () => {
    const acct = pickAccount();
    const quotes = [
      { carrier: "Travelers",      premium: 38_400, limit_match: true,  appetite_score: 0.93, rank: 1, recommended: true },
      { carrier: "Chubb",          premium: 41_200, limit_match: true,  appetite_score: 0.88, rank: 2, recommended: false },
      { carrier: "Liberty Mutual", premium: 39_800, limit_match: false, appetite_score: 0.74, rank: 3, recommended: false },
      { carrier: "Hartford",       premium: null,                          appetite_score: 0.82, rank: 4, recommended: false, note: "Pending — quote in progress" },
    ];
    return {
      title: `Confirm carrier recommendation for ${acct.name} · Travelers @ $38,400`,
      summary: `3 of 4 markets returned. Travelers ranked #1 on premium + limit match + appetite. Hartford still pending. Cheapest is Chubb but with a lower limit match.`,
      ai_recommendation: `Confirm Travelers as the recommendation. If you'd lead with Chubb instead (relationship strength, prior tenure), override here — that judgment gets captured.`,
      confidence: 0.86,
      threshold: false,
      decision_type: "quote_approval",
      account: acct.name,
      carrier: "Travelers",
      input_data: {
        target_markets: ["Travelers", "Chubb", "Liberty Mutual", "Hartford"],
        account_profile: {
          industry: acct.industry,
          fein: acct.fein,
          primary_lob: acct.primaryLob,
        },
        quote_window: "10 business days",
        appetite_intelligence_source: "Bold Penguin Exchange",
      },
      output: {
        recommended_carrier: "Travelers",
        recommended_premium: 38_400,
        ranking_criteria: ["premium", "limit_match", "appetite_score"],
        quotes,
        confidence_breakdown: {
          ranking_logic: 0.94,
          recommendation_certainty: 0.86,
        },
        fields_needing_review: ["recommended_carrier"],
        recommended_action: "send_quote_to_client",
      },
    };
  },

  /* ════════════════════════ Carrier Submission Intake ════════════════════════
     Broker decision (carrier-side use): confirm submission classification
     + routing. Training signal: submission classification edits. */
  "carrier-submission-intake": () => {
    const acct = pickAccount();
    return {
      title: `Confirm submission classification + UW routing · ${acct.name}`,
      summary: `Inbound submission parsed from broker email. Classified as new-business commercial package. Routed to Sarah Chen (commercial mid-market book).`,
      ai_recommendation: `Approve the classification + routing, or reroute. Your overrides train the submission-triage model for this MGA's underwriter assignments.`,
      confidence: 0.91,
      threshold: false,
      decision_type: "submission_triage",
      account: acct.name,
      carrier: pickCarrier(acct),
      input_data: {
        source: "broker_email",
        broker_agency: "Adam Insurance Agency",
        broker_email_subject: `Submission — ${acct.name} (commercial package)`,
        attached_docs: ["acord_125.pdf", "acord_126.pdf", "5yr_loss_runs.pdf"],
        account_industry: acct.industry,
        account_fein: acct.fein,
      },
      output: {
        classification: "new_business",
        sub_classification: "commercial_package",
        recommended_underwriter: "Sarah Chen",
        underwriter_book: "Commercial mid-market",
        appetite_match: 0.87,
        risk_score: 4.1,
        priority_level: "standard",
        confidence_breakdown: {
          classification: 0.96,
          underwriter_routing: 0.91,
          appetite_match: 0.87,
        },
        fields_needing_review: ["recommended_underwriter"],
        recommended_action: "assign_to_underwriter",
      },
    };
  },

  /* ════════════════════════ Carrier Submission Triage ════════════════════════
     Broker decision: after a decline, confirm the next-best carrier. */
  "carrier-submission-triage": () => {
    const acct = pickAccount();
    const declined = pickCarrier(acct);
    return {
      title: `${declined} declined ${acct.name} — confirm next market`,
      summary: `${declined} declined citing loss-run trends. The model ranks Liberty Mutual next based on appetite match for ${acct.industry.toLowerCase()}.`,
      ai_recommendation: `Pivot to Liberty Mutual. If a relationship factor argues for a different carrier, override and that becomes the next-best ranking for similar declines.`,
      confidence: 0.74,
      threshold: false,
      decision_type: "submission_triage",
      account: acct.name,
      carrier: declined,
      input_data: {
        declining_carrier: declined,
        decline_reason: "loss-run trends",
        account_profile: {
          industry: acct.industry,
          primary_lob: acct.primaryLob,
        },
        already_attempted: [declined],
        remaining_target_markets: acct.carriers.filter((c) => c !== declined).slice(0, 3),
      },
      output: {
        recommended_next_carrier: "Liberty Mutual",
        appetite_match: 0.79,
        secondary_options: [
          { carrier: "Hanover",  appetite_match: 0.71 },
          { carrier: "Zurich",   appetite_match: 0.64 },
        ],
        confidence_breakdown: {
          appetite_logic: 0.79,
          next_carrier_recommendation: 0.74,
        },
        fields_needing_review: ["recommended_next_carrier"],
        recommended_action: "submit_to_recommended",
      },
    };
  },

  /* ════════════════════════ Claims FNOL ════════════════════════
     Broker decision: verify the drafted FNOL fields before submission.
     Training signal: corrected claimant info, date of loss, claim type,
     descriptions. */
  "claims-fnol": () => {
    const acct = pickAccount();
    const carrier = pickCarrier(acct);
    const fields: ExtractedField[] = [
      { key: "claim_type",         label: "Claim type",          value: "Auto Collision · Multi-vehicle",    confidence: 0.94 },
      { key: "date_of_loss",       label: "Date of loss",        value: "05/03/2026",                         confidence: 0.97, source: "Client email · paragraph 1" },
      { key: "time_of_loss",       label: "Time of loss",        value: "approx. 14:30 PT",                  confidence: 0.62, needs_review: true, source: "Client email · paragraph 2 · approximate" },
      { key: "claimant_name",      label: "Claimant name",       value: "Maria Sanchez",                      confidence: 0.91, source: "Client email · signature" },
      { key: "claimant_phone",     label: "Claimant phone",      value: "(555) 312-9081",                     confidence: 0.96, source: "Client email · signature" },
      { key: "vehicle_involved",   label: "Vehicle involved",    value: "Box truck · VIN ending 1H4N",        confidence: 0.78, needs_review: true, source: "Client email · paragraph 3 · partial VIN" },
      { key: "estimated_amount",   label: "Estimated amount",    value: "$14,200",                            confidence: 0.71, needs_review: true, source: "Peer-claim avg + severity score" },
      { key: "loss_description",   label: "Loss description",    value: "Driver rear-ended at signalized intersection in light rain; deployed airbags, vehicle towed.", confidence: 0.85 },
    ];
    return {
      title: `Verify FNOL fields before submission to ${carrier} · ${acct.name}`,
      summary: `Drafted from the client email. 5 of 8 fields high-confidence. Time of loss, vehicle VIN (partial), and the estimated amount need your verification — these go directly to the adjuster.`,
      ai_recommendation: `Confirm or correct the 3 flagged fields, then submit to ${carrier} claims. The corrections become training data for similar incident types.`,
      confidence: 0.81,
      threshold: true,
      decision_type: "claim_decision",
      account: acct.name,
      carrier,
      input_data: {
        source: "client_email",
        client_email_subject: `URGENT - accident this afternoon`,
        client_email_received: "2026-05-03T15:18:00Z",
        ams_account_record: `${acct.name} · FEIN ${acct.fein}`,
        policy_referenced: `${carrier.substring(0, 3).toUpperCase()}-AUTO-44021`,
      },
      output: {
        fnol_fields: fields,
        target_carrier: carrier,
        adjuster_recommendation: "TPA (complexity score 3/10)",
        urgency: "high",
        fields_needing_review: fields.filter((f) => f.needs_review).map((f) => f.key),
        recommended_action: "submit_fnol_after_review",
      },
    };
  },

  /* ════════════════════════ ACORD Parser ════════════════════════
     Broker decision: verify form fields, especially handwritten or
     low-confidence ones. Training signal: corrected field extractions
     against form image. */
  "acord-parser": () => {
    const acct = pickAccount();
    const fields: ExtractedField[] = [
      { key: "form_type",                label: "Form type",              value: "ACORD 125 (Commercial Insurance Application)", confidence: 0.99 },
      { key: "named_insured",            label: "Named insured",          value: acct.name,                                       confidence: 0.97 },
      { key: "fein",                     label: "FEIN",                   value: acct.fein,                                       confidence: 0.95 },
      { key: "naics_code",               label: "NAICS code",             value: "332710",                                         confidence: 0.82 },
      { key: "annual_revenue",           label: "Annual revenue",         value: "$4,200,000",                                     confidence: 0.94 },
      { key: "employee_count",           label: "Employee count",         value: "187",                                            confidence: 0.99 },
      { key: "primary_address",          label: "Primary address",        value: "2240 Industrial Ave, Riverside, CA 92505",      confidence: 0.93 },
      { key: "secondary_address",        label: "Secondary location",     value: "1100 Commerce Dr, Mira Loma, CA 91752",         confidence: 0.66, needs_review: true, source: "Page 2 · handwritten address block" },
      { key: "effective_date_requested", label: "Effective date requested", value: "06/15/2026",                                  confidence: 0.59, needs_review: true, source: "Page 1, term box · handwritten" },
      { key: "business_description",     label: "Business description",   value: "Precision metal fabrication for aerospace and medical device OEMs", confidence: 0.88 },
      { key: "current_carrier",          label: "Current carrier",        value: "The Hartford",                                   confidence: 0.91 },
      { key: "current_premium",          label: "Current premium",        value: "$42,500",                                         confidence: 0.74, needs_review: true, source: "Page 3 · handwritten in margin" },
    ];
    return {
      title: `Verify 3 handwritten fields in ACORD 125 · ${acct.name}`,
      summary: `12 fields extracted from a 3-page ACORD 125. 9 fields are high-confidence. Effective date requested, secondary location, and current premium are handwritten and below 75% confidence.`,
      ai_recommendation: `Confirm or correct the 3 handwritten fields. The rest map cleanly into your AMS account record.`,
      confidence: 0.79,
      threshold: true,
      decision_type: "document_validation",
      account: acct.name,
      input_data: {
        source: "broker_email_attachment",
        document_type: "ACORD 125",
        page_count: 3,
        ocr_provider: "internal",
        form_year: "2016",
      },
      output: {
        form_type: "ACORD 125",
        fields_total: fields.length,
        fields_high_confidence: fields.filter((f) => f.confidence >= 0.85 && !f.needs_review).length,
        fields_low_confidence: fields.filter((f) => f.needs_review).length,
        extracted_fields: fields,
        fields_needing_review: fields.filter((f) => f.needs_review).map((f) => f.key),
        recommended_action: "map_to_ams_after_review",
      },
    };
  },
};

function defaultTemplate(agentName: string, input: string): RunTemplate {
  return {
    title: `${agentName} produced output for review`,
    summary: `Output ready for human verification.`,
    ai_recommendation: "Reviewer judgment — output didn't match a known confidence threshold.",
    confidence: 0.6,
    threshold: true,
    decision_type: "policy_review",
    input_data: { input_excerpt: input.slice(0, 120) },
    output: { input_excerpt: input.slice(0, 120) },
  };
}

function isSchemaError(err: { message?: string; code?: string }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("schema cache")
      || msg.includes("source_workflow")
      || msg.includes("source_step_index")
      || err.code === "PGRST204";
}

export interface SeedStep {
  agent_id: string;
  agent_name: string;
}

export interface SeedWorkflowRunArgs {
  workflowId: string;
  workflowName: string;
  steps: SeedStep[];
  input?: string;
}

export interface SeedResult {
  runId: string;
  rowsInserted: number;
}

export async function seedWorkflowRunReviews(
  args: SeedWorkflowRunArgs,
): Promise<SeedResult> {
  const { workflowId, workflowName, steps, input = "" } = args;

  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (steps.length === 0) return { runId: "", rowsInserted: 0 };

  const runId = crypto.randomUUID();
  const baseTime = Date.now();

  const fullRows = steps.map((step, idx) => {
    const tpl = (TEMPLATES_BY_AGENT[step.agent_id]?.()) ?? defaultTemplate(step.agent_name, input);
    const createdAt = new Date(baseTime - (steps.length - idx) * 60_000).toISOString();
    // Merge workflow context + template-specific input data so the
    // review row carries both the run provenance and the specific data
    // the model saw on this step.
    const inputData: Record<string, any> = {
      workflow: workflowName,
      instructions: input,
      ...tpl.input_data,
    };
    if (tpl.account) inputData.account = tpl.account;
    if (tpl.carrier) inputData.carrier = tpl.carrier;
    return {
      user_id: user.id,
      pod_model_id: step.agent_id,
      pod_model_name: step.agent_name,
      domain: "insurance",
      decision_type: tpl.decision_type,
      title: tpl.title,
      summary: tpl.summary,
      ai_recommendation: tpl.ai_recommendation,
      confidence_score: tpl.confidence,
      threshold_exceeded: tpl.threshold,
      input_data: inputData,
      output_data: tpl.output,
      status: "pending",
      source_workflow_id: workflowId,
      source_workflow_name: workflowName,
      source_workflow_run_id: runId,
      source_step_index: idx,
      created_at: createdAt,
    };
  });

  let err = (await supabase.from("decision_reviews").insert(fullRows as any)).error;
  if (err && isSchemaError(err)) {
    const baseRows = fullRows.map(({ source_workflow_id, source_workflow_name, source_workflow_run_id, source_step_index, ...rest }) => rest);
    err = (await supabase.from("decision_reviews").insert(baseRows as any)).error;
  }
  if (err) throw err;

  try {
    await supabase
      .from("agent_pipelines")
      .update({ last_run_at: new Date().toISOString() } as any)
      .eq("id", workflowId);
  } catch (e) {
    console.warn("[seedWorkflowRunReviews] last_run_at update failed:", e);
  }

  return { runId, rowsInserted: fullRows.length };
}
