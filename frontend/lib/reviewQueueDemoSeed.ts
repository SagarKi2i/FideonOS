'use client';
import { getCurrentUser } from '@/lib/currentUser';
// Demo seed for the Decision Review Queue.
//
// Creates two realistic agent workflows (Renewal preparation + Quote
// generation pipeline) and ~10 decision_reviews linked back to them via
// source_workflow_id / source_step_index, so the Review Queue shows the
// full workflow → agent → items hierarchy populated.

import { supabase } from "@/integrations/supabase/client";

interface WorkflowStep {
  id: string;
  agent_id: string;
  agent_name: string;
  config: Record<string, any>;
  pass_output: boolean;
}

// ─── workflow shapes ───

const RENEWAL_STEPS: WorkflowStep[] = [
  { id: "ren-s1", agent_id: "document-retrieval", agent_name: "Document Retrieval",   config: {}, pass_output: true },
  { id: "ren-s2", agent_id: "loss-run-reporting", agent_name: "Loss Run Reporting",   config: {}, pass_output: true },
  { id: "ren-s3", agent_id: "policy-comparison",  agent_name: "Policy Comparison",    config: {}, pass_output: true },
  { id: "ren-s4", agent_id: "renewal-review",     agent_name: "Renewal Review",       config: {}, pass_output: false },
];

const QUOTE_STEPS: WorkflowStep[] = [
  { id: "q-s1", agent_id: "carrier-submission-intake", agent_name: "Submission Intake", config: {}, pass_output: true },
  { id: "q-s2", agent_id: "quote-generation",          agent_name: "Quote Generation",  config: {}, pass_output: true },
  { id: "q-s3", agent_id: "carrier-submission-triage", agent_name: "Submission Triage", config: {}, pass_output: false },
];

// ─── decision review templates ───
// Each review references its source workflow's slot (step index + agent_id).

interface ReviewSeed {
  step_index: number;
  agent_id: string;
  agent_name: string;
  decision_type: string;
  title: string;
  summary: string;
  ai_recommendation: string;
  confidence_score: number;
  threshold_exceeded: boolean;
  status: "pending" | "approved" | "overridden" | "rejected";
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  reviewer_notes?: string;
  age_hours: number;
}

const RENEWAL_REVIEWS: ReviewSeed[] = [
  {
    step_index: 0,
    agent_id: "document-retrieval", agent_name: "Document Retrieval",
    decision_type: "document_validation",
    title: "Verify 2 low-confidence fields from Travelers certificate · ACME Manufacturing",
    summary: "OCR extracted 9 fields from the Travelers certificate of insurance. 7 are high-confidence and ready to file. The handwritten effective date and the DBA alias need your eyes before this goes into the AMS.",
    ai_recommendation: "Confirm or correct the effective date and DBA alias — both handwritten and below 80% confidence. The other 7 fields are stable.",
    confidence_score: 0.78,
    threshold_exceeded: true,
    status: "pending",
    input_data: { account: "ACME Manufacturing", carrier: "Travelers", source_url: "agent.travelers.com/documents", document_type: "Certificate of Insurance", document_id: "TRV-COI-44182", page_count: 2 },
    output_data: {
      document_type: "Certificate of Insurance",
      carrier: "Travelers",
      extracted_fields: [
        { key: "policy_number",         label: "Policy number",         value: "B1001347",         confidence: 0.98, source: "Page 1, header" },
        { key: "named_insured",         label: "Named insured",         value: "ACME Manufacturing Co.", confidence: 0.96, source: "Page 1, ID block" },
        { key: "named_insured_alias",   label: "DBA / alias",           value: "ACME Mfg.",        confidence: 0.71, needs_review: true, source: "Page 1, ID block · handwritten" },
        { key: "effective_date",        label: "Effective date",        value: "06/01/2025",       confidence: 0.62, needs_review: true, source: "Page 1, term box · handwritten" },
        { key: "expiration_date",       label: "Expiration date",       value: "06/01/2026",       confidence: 0.91, source: "Page 1, term box" },
        { key: "lob",                   label: "Line of business",      value: "General Liability", confidence: 0.95 },
        { key: "limit_each_occurrence", label: "Each-occurrence limit", value: "$1,000,000",       confidence: 0.99 },
        { key: "aggregate_limit",       label: "Aggregate limit",       value: "$2,000,000",       confidence: 0.99 },
        { key: "premium",               label: "Premium",               value: "$18,400",          confidence: 0.93 },
      ],
      fields_needing_review: ["named_insured_alias", "effective_date"],
      recommended_action: "file_to_ams",
    },
    age_hours: 2,
  },
  {
    step_index: 1,
    agent_id: "loss-run-reporting", agent_name: "Loss Run Reporting",
    decision_type: "risk_assessment",
    title: "ACME renewal posture · 5-yr LR 71% — above threshold",
    summary: "Computed 5-yr loss ratio at 71%, above the 60% review threshold. Four high-severity claims drive the spike. Frequency trend declining; severity from one 2023 forklift incident.",
    ai_recommendation: "Loss ratio above threshold. Recommend: shop the account to 2-3 alternative markets before incumbent sends preliminary terms.",
    confidence_score: 0.82,
    threshold_exceeded: true,
    status: "overridden",
    input_data: { account: "ACME Manufacturing", line_of_business: "Workers' Comp", years: [2020, 2021, 2022, 2023, 2024], analysis_window: "5 years" },
    output_data: {
      loss_ratio_5yr: 0.71,
      threshold_60pct_exceeded: true,
      total_claims: 22,
      total_incurred: 458_000,
      largest_open_exposure_usd: 173_000,
      frequency_trend: "declining",
      recommended_posture: "shop_the_account",
      rate_ask_pct: 0,
      confidence_breakdown: { ratio_calc: 0.99, frequency_assessment: 0.91, posture_recommendation: 0.82 },
      fields_needing_review: ["recommended_posture", "rate_ask_pct"],
    },
    reviewer_notes: "Override: keep at incumbent with rate concession ask. Carson plant has improved since the 2024 safety program — we can pitch the trajectory.",
    age_hours: 5,
  },
  {
    step_index: 2,
    agent_id: "policy-comparison", agent_name: "Policy Comparison",
    decision_type: "policy_review",
    title: "Travelers renewal · 3 material + 2 minor changes detected for ACME",
    summary: "Premium up 13.7% with a hired-auto exclusion added and a Property deductible increase. Two changes need your judgment on materiality.",
    ai_recommendation: "Confirm the deductible classification (currently material) and the drive-other-car classification (currently minor). Premium and exclusion are unambiguously material — they go to the client.",
    confidence_score: 0.84,
    threshold_exceeded: true,
    status: "pending",
    input_data: { expiring_policy: "POL-2023-4421", renewal_quote: "QT-2024-9912", carrier: "Travelers", prior_term: "04/01/2024 – 04/01/2025", renewal_term: "04/01/2025 – 04/01/2026" },
    output_data: {
      premium_delta_pct: 0.137,
      threshold_5pct_exceeded: true,
      changes: [
        { key: "premium_change",       label: "Premium change",          value: "+13.7% (vs prior term)",      classification: "material", confidence: 0.97 },
        { key: "hired_auto_exclusion", label: "Hired-auto exclusion",    value: "Added in renewal",            classification: "material", confidence: 0.92 },
        { key: "drive_other_car",      label: "Drive-other-car endorsement", value: "Added (coverage gain)",   classification: "minor",    confidence: 0.78, needs_review: true },
        { key: "ded_change",           label: "Deductible change",       value: "$1,000 → $2,500 on Property", classification: "material", confidence: 0.84, needs_review: true },
        { key: "form_edition",         label: "Policy form edition",     value: "CG 00 01 04 13 → CG 00 01 12 19", classification: "minor", confidence: 0.95 },
      ],
      material_count: 3,
      minor_count: 2,
      fields_needing_review: ["drive_other_car", "ded_change"],
      recommended_action: "surface_material_to_client",
    },
    age_hours: 1,
  },
  {
    step_index: 2,
    agent_id: "policy-comparison", agent_name: "Policy Comparison",
    decision_type: "policy_review",
    title: "Riverside Logistics renewal · clean — 1.2% premium delta, no material changes",
    summary: "Renewal looks clean. Premium up 1.2% (within 5% tolerance), no exclusions added, deductibles unchanged.",
    ai_recommendation: "Auto-approve and file. No material changes worth surfacing to broker.",
    confidence_score: 0.97,
    threshold_exceeded: false,
    status: "approved",
    input_data: { expiring_policy: "POL-2023-1188", renewal_quote: "QT-2024-2240", carrier: "Progressive" },
    output_data: {
      premium_delta_pct: 0.012,
      threshold_5pct_exceeded: false,
      changes: [
        { key: "premium_change", label: "Premium change", value: "+1.2% (within tolerance)", classification: "minor", confidence: 0.98 },
      ],
      material_count: 0,
      minor_count: 1,
      recommended_action: "auto_approve",
    },
    reviewer_notes: "Looks good. Sent client the auto-confirmation email.",
    age_hours: 18,
  },
  {
    step_index: 3,
    agent_id: "renewal-review", agent_name: "Renewal Review",
    decision_type: "policy_review",
    title: "Approve renewal email draft for ACME Manufacturing",
    summary: "Client-facing email drafted from the policy-comparison output. Two material callouts, soft 20-minute call ask. Tone matches your prior emails to ACME.",
    ai_recommendation: "Send as-is or edit before sending. Your edits train the tone model — corrections compound over time on this account.",
    confidence_score: 0.78,
    threshold_exceeded: true,
    status: "pending",
    input_data: {
      account: "ACME Manufacturing",
      changes_to_surface: 2,
      send_window: "Mon 9-11 AM PT",
      client_history: { prior_emails_analyzed: 4, dominant_tone: "warm-professional", uses_first_name: true },
    },
    output_data: {
      email_subject: "ACME renewal — two changes to discuss",
      email_body: "Hi John,\n\nThe Travelers renewal terms for ACME just came in. Two material changes to flag:\n\n  • Premium up 13.7% YoY\n  • Hired/non-owned auto exclusion added\n\nI'd like a 20-minute call this week to walk through both before we bind. Let me know what works.\n\n— Producer",
      word_count: 78,
      material_callouts_count: 2,
      cta: "20-minute call this week",
      tone_classification: "warm-professional",
      confidence_breakdown: { factual_accuracy: 0.95, tone_match: 0.79, cta_appropriateness: 0.88 },
      fields_needing_review: ["email_body"],
      recommended_action: "send_after_review",
    },
    age_hours: 4,
  },
];

const QUOTE_REVIEWS: ReviewSeed[] = [
  {
    step_index: 0,
    agent_id: "carrier-submission-intake", agent_name: "Submission Intake",
    decision_type: "submission_triage",
    title: "Confirm classification + UW routing · Riverside Logistics fleet expansion",
    summary: "Inbound submission parsed from broker email. Classified as renewal-expansion (was 9 vehicles, now 14). Routed to Mike Johnson (commercial fleet book).",
    ai_recommendation: "Approve the classification + routing, or reroute. Your overrides train the submission-triage model for this MGA's underwriter assignments.",
    confidence_score: 0.96,
    threshold_exceeded: false,
    status: "approved",
    input_data: { account: "Riverside Logistics", line_of_business: "Commercial Auto", broker_agency: "Adam Insurance Agency", attached_docs: ["acord_125.pdf", "fleet_schedule.pdf"] },
    output_data: {
      extracted_fields: [
        { key: "classification",         label: "Classification",         value: "renewal_expansion", confidence: 0.96 },
        { key: "sub_classification",     label: "Sub-classification",     value: "fleet_expansion",   confidence: 0.92 },
        { key: "recommended_underwriter", label: "Recommended underwriter", value: "Mike Johnson",     confidence: 0.91, needs_review: true },
        { key: "underwriter_book",       label: "UW book",                value: "Commercial fleet", confidence: 0.94 },
        { key: "appetite_match",         label: "Appetite match",         value: "87%",               confidence: 0.87 },
        { key: "risk_score",             label: "Risk score",             value: "3.4 / 10",          confidence: 0.83 },
        { key: "priority_level",         label: "Priority",               value: "standard",          confidence: 0.95 },
      ],
      fields_needing_review: ["recommended_underwriter"],
      recommended_action: "assign_to_underwriter",
    },
    reviewer_notes: "Approved. Mike has bandwidth this week.",
    age_hours: 24,
  },
  {
    step_index: 1,
    agent_id: "quote-generation", agent_name: "Quote Generation",
    decision_type: "quote_approval",
    title: "Confirm carrier recommendation for ACME GL · Travelers @ $38,400",
    summary: "3 of 4 markets returned. Travelers ranked #1 on premium + limit match + appetite. Hartford still pending.",
    ai_recommendation: "Confirm Travelers as the recommendation. If you'd lead with Chubb (relationship strength, prior tenure), override here.",
    confidence_score: 0.86,
    threshold_exceeded: false,
    status: "pending",
    input_data: { account: "ACME Manufacturing", line_of_business: "GL", limits: "$1M / $2M", target_markets: ["Travelers", "Chubb", "Liberty Mutual", "Hartford"] },
    output_data: {
      recommended_carrier: "Travelers",
      recommended_premium: 38_400,
      quotes: [
        { key: "trv", label: "Travelers",      value: "$38,400 · limits match · appetite 93%", confidence: 0.93, classification: "material", needs_review: true },
        { key: "chb", label: "Chubb",          value: "$41,200 · limits match · appetite 88%", confidence: 0.88 },
        { key: "lbm", label: "Liberty Mutual", value: "$39,800 · partial limit match",         confidence: 0.74 },
        { key: "hfd", label: "Hartford",       value: "Pending — quote in progress",            confidence: 0.50 },
      ],
      confidence_breakdown: { ranking_logic: 0.94, recommendation_certainty: 0.86 },
      fields_needing_review: ["recommended_carrier"],
      recommended_action: "send_quote_to_client",
    },
    age_hours: 6,
  },
  {
    step_index: 1,
    agent_id: "quote-generation", agent_name: "Quote Generation",
    decision_type: "quote_approval",
    title: "Coalition cyber quote for Vouch Tech · unusual sublimit format detected",
    summary: "Coalition returned a quote shape with a sublimit field that doesn't match their usual format. AI mapping confidence is below threshold on 2 of 9 fields.",
    ai_recommendation: "Review the unmapped sublimit field manually before quoting the client. Could be a new product variant — your decision sets the mapping rule going forward.",
    confidence_score: 0.48,
    threshold_exceeded: true,
    status: "pending",
    input_data: { account: "Vouch Tech", line_of_business: "Cyber", carrier: "Coalition" },
    output_data: {
      recommended_carrier: "Coalition",
      recommended_premium: 12_800,
      extracted_fields: [
        { key: "premium",         label: "Premium",                 value: "$12,800",        confidence: 0.94 },
        { key: "agg_limit",       label: "Aggregate limit",         value: "$3,000,000",     confidence: 0.92 },
        { key: "retention",       label: "Retention",               value: "$10,000",        confidence: 0.91 },
        { key: "sublimit_extortion", label: "Cyber extortion sublimit", value: "$500K · NEW FORMAT", confidence: 0.41, needs_review: true, source: "Field 'CL-EXT-Sub' not in mapping table" },
        { key: "sublimit_notif",  label: "Notification expense sublimit", value: "$250,000", confidence: 0.83 },
        { key: "ransomware",      label: "Ransomware coverage",     value: "included",       confidence: 0.96 },
        { key: "biz_interruption", label: "BI waiting period",     value: "8 hours · NEW FORMAT", confidence: 0.52, needs_review: true, source: "Field 'BI-WP-Std' not in mapping table" },
      ],
      fields_needing_review: ["sublimit_extortion", "biz_interruption"],
      recommended_action: "manual_review_before_quoting",
    },
    age_hours: 0.5,
  },
  {
    step_index: 2,
    agent_id: "carrier-submission-triage", agent_name: "Submission Triage",
    decision_type: "submission_triage",
    title: "Hartford declined Pinecrest Restaurants · confirm next market",
    summary: "Hartford declined citing loss-run trends. The model ranks Liberty Mutual next based on appetite match for restaurant risks.",
    ai_recommendation: "Pivot to Liberty Mutual. If a relationship factor argues differently, override and that becomes the next-best ranking for similar declines.",
    confidence_score: 0.71,
    threshold_exceeded: false,
    status: "rejected",
    input_data: { account: "Pinecrest Restaurants", declining_carrier: "Hartford", decline_reason: "Loss runs > 75% for 2 of 3 years", remaining_target_markets: ["Liberty Mutual", "Hanover", "Berkshire Hathaway Direct"] },
    output_data: {
      recommended_next_carrier: "Liberty Mutual",
      quotes: [
        { key: "lbm",  label: "Liberty Mutual",          value: "Appetite match 79% · restaurant program", confidence: 0.79, classification: "material", needs_review: true },
        { key: "han",  label: "Hanover",                 value: "Appetite match 71%",                       confidence: 0.71 },
        { key: "bhd",  label: "Berkshire Hathaway Direct", value: "Appetite match 64% · niche",            confidence: 0.64 },
      ],
      confidence_breakdown: { appetite_logic: 0.79, next_carrier_recommendation: 0.71 },
      fields_needing_review: ["recommended_next_carrier"],
      recommended_action: "submit_to_recommended",
    },
    reviewer_notes: "Override: going to Berkshire Hathaway Direct instead — they've been writing this restaurant class aggressively this quarter.",
    age_hours: 48,
  },
];

// ─── public seeder ───

export interface SeedOptions {
  /** When true, deletes the user's existing demo workflows and any
   *  decision_reviews tied to them before inserting fresh data. Used
   *  to refresh the demo with the latest review template shape. */
  wipeFirst?: boolean;
}

export async function seedReviewQueueDemo(opts: SeedOptions = {}): Promise<{ workflowsCreated: number; reviewsCreated: number; migrationApplied: boolean; wiped: number }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  let wiped = 0;

  // 0. (Optional) Wipe existing demo data so we don't duplicate rows.
  if (opts.wipeFirst) {
    // Find existing demo workflows by name.
    const { data: existingWf } = await supabase
      .from("agent_pipelines")
      .select("id")
      .eq("user_id", user.id)
      .in("name", ["Renewal Preparation", "Quote Generation Pipeline"]);

    const wfIds = (existingWf ?? []).map((w: any) => w.id);

    // Delete any decision_reviews tied to those workflows, then the
    // workflows themselves. We attempt the workflow-source filter
    // first; if the column doesn't exist (pre-migration), we fall
    // back to deleting by pod_model_id + status to clear the demo.
    if (wfIds.length > 0) {
      let delErr = (await (supabase as any).from("decision_reviews").delete().in("source_workflow_id", wfIds)).error;
      if (delErr && isSchemaCacheError(delErr)) {
        // Pre-migration fallback: drop all pending reviews for this user.
        await supabase
          .from("decision_reviews")
          .delete()
          .eq("user_id", user.id)
          .eq("status", "pending");
      }
      await supabase.from("agent_pipelines").delete().in("id", wfIds);
      wiped = wfIds.length;
    } else {
      // No matching workflows — still wipe any pending reviews for this
      // user just to be safe, so the queue starts clean.
      await supabase
        .from("decision_reviews")
        .delete()
        .eq("user_id", user.id)
        .eq("status", "pending");
    }
  }

  // 1. Insert the two workflows.
  const wfPayload = [
    {
      user_id: user.id,
      name: "Renewal Preparation",
      description: "60-day renewal prep: pull docs, run loss-run analysis, compare to expiring policy, draft client summary.",
      steps: RENEWAL_STEPS as any,
      is_active: true,
      last_run_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
    {
      user_id: user.id,
      name: "Quote Generation Pipeline",
      description: "Inbound submission → triage → multi-carrier quote → recommendation.",
      steps: QUOTE_STEPS as any,
      is_active: true,
      last_run_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
    },
  ];

  const { data: wfRows, error: wfErr } = await supabase
    .from("agent_pipelines")
    .insert(wfPayload as any)
    .select("id, name");
  if (wfErr) throw wfErr;
  if (!wfRows || wfRows.length !== 2) throw new Error("Workflow seed failed");

  const [renewalWf, quoteWf] = wfRows;

  // 2. Build review rows. We try with the workflow-source columns first;
  //    if the migration that added those columns hasn't been applied yet,
  //    Supabase returns a schema-cache error — we fall back to inserting
  //    without them so the demo data still loads (the queue will simply
  //    group items by agent instead of by workflow until the migration runs).
  const fullRows = [
    ...RENEWAL_REVIEWS.map((r) => buildReviewRow(user.id, renewalWf.id, renewalWf.name, r, true)),
    ...QUOTE_REVIEWS.map((r)   => buildReviewRow(user.id, quoteWf.id,   quoteWf.name,   r, true)),
  ];

  let migrationApplied = true;
  let revErr = (await supabase.from("decision_reviews").insert(fullRows as any)).error;

  if (revErr && isSchemaCacheError(revErr)) {
    migrationApplied = false;
    const baseRows = [
      ...RENEWAL_REVIEWS.map((r) => buildReviewRow(user.id, renewalWf.id, renewalWf.name, r, false)),
      ...QUOTE_REVIEWS.map((r)   => buildReviewRow(user.id, quoteWf.id,   quoteWf.name,   r, false)),
    ];
    const fallback = await supabase.from("decision_reviews").insert(baseRows as any);
    revErr = fallback.error;
  }

  if (revErr) throw revErr;

  return {
    workflowsCreated: wfRows.length,
    reviewsCreated: fullRows.length,
    migrationApplied,
    wiped,
  };
}

function isSchemaCacheError(err: { message?: string; code?: string }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("schema cache")
      || msg.includes("source_workflow")
      || msg.includes("source_step_index")
      || err.code === "PGRST204";
}

function buildReviewRow(
  userId: string,
  workflowId: string,
  workflowName: string,
  seed: ReviewSeed,
  includeWorkflowSource: boolean,
): Record<string, any> {
  const created = new Date(Date.now() - seed.age_hours * 3600_000).toISOString();
  const reviewed = seed.status === "pending" ? null : new Date(Date.now() - Math.max(seed.age_hours - 0.5, 0) * 3600_000).toISOString();
  const base: Record<string, any> = {
    user_id: userId,
    pod_model_id: seed.agent_id,
    pod_model_name: seed.agent_name,
    domain: "insurance",
    decision_type: seed.decision_type,
    title: seed.title,
    summary: seed.summary,
    ai_recommendation: seed.ai_recommendation,
    confidence_score: seed.confidence_score,
    threshold_exceeded: seed.threshold_exceeded,
    input_data: seed.input_data,
    output_data: seed.output_data,
    status: seed.status,
    reviewer_id: seed.status === "pending" ? null : userId,
    reviewer_notes: seed.reviewer_notes ?? null,
    reviewed_at: reviewed,
    created_at: created,
  };
  if (includeWorkflowSource) {
    base.source_workflow_id = workflowId;
    base.source_workflow_name = workflowName;
    base.source_workflow_run_id = crypto.randomUUID();
    base.source_step_index = seed.step_index;
  }
  return base;
}
