'use client';
import { governanceApi } from "@/lib/api";

export type RiskLevel = "low" | "medium" | "high";
export type DecisionStatus = "pending" | "approved" | "rejected" | "overridden" | "escalated";
export type EventType =
  | "ai_recommendation_generated"
  | "policy_evaluated"
  | "risk_scored"
  | "human_opened"
  | "human_approved"
  | "human_rejected"
  | "human_overridden"
  | "override_reason_submitted"
  | "exported_pdf"
  | "exported_json";

export interface CreateDecisionRecordInput {
  domain: string;
  decisionType: string;
  title: string;
  podModelId: string;
  podModelName: string;
  modelVersion?: string;
  promptSnapshot?: string;
  inputSnapshot?: Record<string, any>;
  aiRecommendation: string;
  aiOutputSnapshot?: Record<string, any>;
  aiConfidence?: number | null;
  keyFactors?: Array<{ label: string; weight?: number; value?: any }>;
  reasonSummary?: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
  policyChecks?: Array<{ rule: string; outcome: "pass" | "fail" | "skipped"; details?: string }>;
  requiresReview?: boolean;
}

export interface DecisionRecord {
  id: string;
  user_id: string;
  domain: string;
  decision_type: string;
  title: string;
  pod_model_id: string;
  pod_model_name: string;
  model_version: string | null;
  prompt_snapshot: string | null;
  input_snapshot: Record<string, any>;
  ai_recommendation: string | null;
  ai_output_snapshot: Record<string, any>;
  ai_confidence: number | null;
  key_factors: any[];
  reason_summary: string | null;
  risk_level: RiskLevel;
  risk_score: number | null;
  policy_checks: any[];
  requires_review: boolean;
  final_decision: string | null;
  final_decision_by: string | null;
  final_decision_at: string | null;
  final_reason_code: string | null;
  final_reason_notes: string | null;
  ai_human_agreement: boolean | null;
  delta_summary: string | null;
  status: DecisionStatus;
  created_at: string;
  updated_at: string;
}

export interface DecisionEvent {
  id: string;
  decision_record_id: string;
  event_type: EventType;
  actor_id: string | null;
  actor_type: "system" | "ai" | "human";
  payload: Record<string, any>;
  notes: string | null;
  created_at: string;
}

/**
 * Compute risk level heuristically from confidence and explicit threshold.
 */
export function computeRisk(confidence?: number | null, exceeded?: boolean): RiskLevel {
  if (exceeded) return "high";
  if (confidence === null || confidence === undefined) return "medium";
  if (confidence >= 0.85) return "low";
  if (confidence >= 0.6) return "medium";
  return "high";
}

/**
 * Create the immutable Decision Record + initial AI event.
 */
export async function createDecisionRecord(input: CreateDecisionRecordInput): Promise<string | null> {
  const risk = input.riskLevel ?? computeRisk(input.aiConfidence);
  try {
    const result = await governanceApi.createDecision({
      domain: input.domain,
      decision_type: input.decisionType,
      title: input.title,
      pod_model_id: input.podModelId,
      pod_model_name: input.podModelName,
      model_version: input.modelVersion ?? null,
      prompt_snapshot: input.promptSnapshot ?? null,
      input_snapshot: input.inputSnapshot ?? {},
      ai_recommendation: input.aiRecommendation,
      ai_output_snapshot: input.aiOutputSnapshot ?? {},
      ai_confidence: input.aiConfidence ?? null,
      key_factors: input.keyFactors ?? [],
      reason_summary: input.reasonSummary ?? null,
      risk_level: risk,
      risk_score: input.riskScore ?? null,
      policy_checks: input.policyChecks ?? [],
      requires_review: input.requiresReview ?? true,
    });
    const id = (result as { id: string }).id;
    await logDecisionEvent(id, {
      eventType: "ai_recommendation_generated",
      actorType: "ai",
      payload: { model: input.podModelName, version: input.modelVersion, confidence: input.aiConfidence, risk },
    });
    return id;
  } catch (e) {
    console.error("createDecisionRecord error:", e);
    return null;
  }
}

export async function logDecisionEvent(
  recordId: string,
  opts: {
    eventType: EventType;
    actorType?: "system" | "ai" | "human";
    payload?: Record<string, any>;
    notes?: string;
  }
) {
  try {
    await governanceApi.logEvent(recordId, {
      event_type: opts.eventType,
      actor_type: opts.actorType ?? "system",
      payload: opts.payload ?? {},
      notes: opts.notes ?? null,
    });
  } catch (e) {
    console.error("logDecisionEvent error:", e);
  }
}

export async function applyHumanDecision(
  recordId: string,
  outcome: "approved" | "rejected",
  reasonCode?: string,
  notes?: string
) {
  try {
    await governanceApi.applyHumanDecision(recordId, { outcome, reason_code: reasonCode ?? null, notes: notes ?? null });
  } catch (e) {
    console.error("applyHumanDecision error:", e);
  }
}

export async function logExport(recordId: string, format: "pdf" | "json") {
  try {
    await governanceApi.logExport(recordId, { format });
    await logDecisionEvent(recordId, {
      eventType: format === "pdf" ? "exported_pdf" : "exported_json",
      actorType: "human",
    });
  } catch (e) {
    console.error("logExport error:", e);
  }
}

export const RISK_BADGE: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  medium: { label: "Medium", className: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  high: { label: "High", className: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
};

export const STATUS_BADGE: Record<DecisionStatus, { label: string; className: string }> = {
  pending: { label: "Pending Review", className: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  rejected: { label: "Rejected", className: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  overridden: { label: "Overridden", className: "bg-violet-500/10 text-violet-700 border-violet-500/20" },
  escalated: { label: "Escalated", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
};

export const EVENT_LABEL: Record<EventType, string> = {
  ai_recommendation_generated: "AI generated recommendation",
  policy_evaluated: "Policy evaluated",
  risk_scored: "Risk scored",
  human_opened: "Human opened review",
  human_approved: "Human approved",
  human_rejected: "Human rejected",
  human_overridden: "Human overrode",
  override_reason_submitted: "Override reason submitted",
  exported_pdf: "Exported PDF report",
  exported_json: "Exported JSON",
};
