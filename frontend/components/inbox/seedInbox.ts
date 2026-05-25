'use client';
import { supabase } from "@/integrations/supabase/client";
import type { InboxItemType } from "./inboxTypes";

interface SeedRow {
  type: InboxItemType;
  status?: "ready" | "in_progress";
  priority?: "low" | "normal" | "high";
  title: string;
  subtitle: string;
  summary: string;
  pod_id: string;
  pod_name: string;
  source: string;
  payload: Record<string, any>;
  primary_action_label: string;
  secondary_action_label?: string;
}

const ROWS: SeedRow[] = [
  {
    type: "quote_ready",
    priority: "high",
    title: "Acme Construction LLC — 3 quotes ready",
    subtitle: "General Liability · $1M/$2M · Effective Jul 1",
    summary: "Travelers came in best at $4,820/yr. Saved $1,140 vs current renewal. Hartford and Liberty Mutual also bound-ready.",
    pod_id: "quote-generation",
    pod_name: "Quote Generation Agent",
    source: "agent:quote-generation",
    payload: {
      insured: "Acme Construction LLC",
      lob: "General Liability",
      best_carrier: "Travelers",
      best_premium: 4820,
      savings: 1140,
      carriers: ["Travelers", "Hartford", "Liberty Mutual"],
    },
    primary_action_label: "Approve & send proposal",
    secondary_action_label: "Open comparison",
  },
  {
    type: "renewal_due",
    priority: "high",
    title: "Smith Bakery — Renewal in 14 days",
    subtitle: "BOP · Expires May 24, 2026",
    summary: "Loss run pulled automatically: 2 claims flagged in last 36 months ($18.2K total). Recommend re-marketing to 4 carriers before renewal.",
    pod_id: "loss-run-reporting",
    pod_name: "Loss Run Agent",
    source: "agent:renewal-scan",
    payload: {
      insured: "Smith Bakery",
      lob: "BOP",
      expires: "2026-05-24",
      claims_count: 2,
      claims_total: 18200,
    },
    primary_action_label: "Yes, re-market",
    secondary_action_label: "Renew as-is",
  },
  {
    type: "submission_received",
    status: "in_progress",
    priority: "normal",
    title: "Mike's Auto Repair — Jotform submission",
    subtitle: "Garage Liability · Auto-quoting in progress",
    summary: "Submission received 2 min ago. Agent is logging into Travelers, Progressive Commercial, and Nationwide. ETA 90 seconds.",
    pod_id: "carrier-submission-intake",
    pod_name: "Submission Intake Agent",
    source: "trigger:jotform",
    payload: {
      insured: "Mike's Auto Repair",
      lob: "Garage Liability",
      eta_seconds: 90,
      carriers_in_progress: ["Travelers", "Progressive Commercial", "Nationwide"],
    },
    primary_action_label: "Open live view",
  },
  {
    type: "policy_compare_ready",
    priority: "normal",
    title: "Riverside Property Mgmt — Comparison ready",
    subtitle: "Current vs Proposed · Commercial Property",
    summary: "Coverage Score 94/100. Proposed policy improves business income limit by $500K and adds equipment breakdown. Premium increases $312/yr.",
    pod_id: "policy-comparison",
    pod_name: "Policy Comparison Agent",
    source: "agent:policy-comparison",
    payload: {
      insured: "Riverside Property Mgmt",
      lob: "Commercial Property",
      coverage_score: 94,
      improvements: 4,
      premium_delta: 312,
    },
    primary_action_label: "Send to insured",
    secondary_action_label: "Open comparison",
  },
  {
    type: "loss_run_ready",
    priority: "normal",
    title: "Northstar Logistics — 5-year loss run pulled",
    subtitle: "Auto · Workers Comp · GL",
    summary: "All 3 lines of business consolidated. Total incurred: $84,300 across 7 claims. Frequency trending down YoY.",
    pod_id: "loss-run-reporting",
    pod_name: "Loss Run Agent",
    source: "agent:loss-run",
    payload: {
      insured: "Northstar Logistics",
      lobs: ["Auto", "WC", "GL"],
      total_incurred: 84300,
      claims_count: 7,
    },
    primary_action_label: "Open report",
    secondary_action_label: "Share with carrier",
  },
  {
    type: "claim_drafted",
    priority: "high",
    title: "Glass Door Bistro — FNOL drafted",
    subtitle: "Property damage · Reported by insured 12 min ago",
    summary: "Kitchen fire, partial loss. Agent extracted incident details from voicemail transcript and drafted ACORD 1 form. Ready for adjuster assignment.",
    pod_id: "claims-fnol",
    pod_name: "FNOL Agent",
    source: "trigger:mailbox",
    payload: {
      insured: "Glass Door Bistro",
      claim_type: "Property damage",
      severity: "Partial loss",
    },
    primary_action_label: "Approve FNOL",
    secondary_action_label: "Edit details",
  },
];

export async function seedInbox(userId: string) {
  const rows = ROWS.map((r) => ({
    user_id: userId,
    type: r.type,
    status: r.status ?? "ready",
    priority: r.priority ?? "normal",
    title: r.title,
    subtitle: r.subtitle,
    summary: r.summary,
    pod_id: r.pod_id,
    pod_name: r.pod_name,
    source: r.source,
    payload: r.payload,
    primary_action_label: r.primary_action_label,
    secondary_action_label: r.secondary_action_label ?? null,
  }));

  const { error } = await supabase.from("inbox_items" as any).insert(rows as any);
  if (error) throw error;
}
