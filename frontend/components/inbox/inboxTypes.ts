import {
  FileCheck2, CalendarClock, Inbox as InboxIcon, AlertTriangle,
  GitCompareArrows, FileSearch, ShieldCheck, Workflow, Zap, type LucideIcon
} from "lucide-react";

export type InboxItemType =
  | "quote_ready"
  | "renewal_due"
  | "submission_received"
  | "claim_drafted"
  | "loss_run_ready"
  | "policy_compare_ready"
  | "workflow_run"
  | "pipeline_triggered";

export type InboxStatus = "ready" | "in_progress" | "approved" | "dismissed" | "sent";

export interface InboxItem {
  id: string;
  user_id: string;
  type: InboxItemType;
  status: InboxStatus;
  priority: "low" | "normal" | "high";
  title: string;
  subtitle: string | null;
  summary: string | null;
  pod_id: string | null;
  pod_name: string | null;
  source: string;
  payload: Record<string, any>;
  primary_action_label: string | null;
  secondary_action_label: string | null;
  acted_at: string | null;
  acted_by: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
}

export type InboxDepartment =
  | "new_business"
  | "quoting"
  | "renewals"
  | "claims"
  | "operations";

export interface InboxDepartmentMeta {
  id: InboxDepartment;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind for chip
}

export const INBOX_DEPARTMENTS: InboxDepartmentMeta[] = [
  { id: "new_business", label: "New Business",  description: "Incoming submissions from carriers and prospects",
    icon: InboxIcon,         accent: "bg-primary/10 text-primary border-primary/20" },
  { id: "quoting",      label: "Quoting",       description: "Quotes ready for broker review and binding",
    icon: FileCheck2,        accent: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "renewals",     label: "Renewals",      description: "Upcoming renewals and policy comparisons",
    icon: CalendarClock,     accent: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "claims",       label: "Claims",        description: "FNOL drafts, loss runs, claim updates",
    icon: ShieldCheck,       accent: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "operations",   label: "Operations",    description: "Workflows, pipelines and automation activity",
    icon: Workflow,          accent: "bg-indigo-50 text-indigo-700 border-indigo-200" },
];

export const TYPE_TO_DEPARTMENT: Record<InboxItemType, InboxDepartment> = {
  submission_received:  "new_business",
  quote_ready:          "quoting",
  renewal_due:          "renewals",
  policy_compare_ready: "renewals",
  claim_drafted:        "claims",
  loss_run_ready:       "claims",
  workflow_run:         "operations",
  pipeline_triggered:   "operations",
};

export interface InboxTypeMeta {
  label: string;
  icon: LucideIcon;
  accent: string; // tailwind classes for icon chip
  podId?: string;
}

export const INBOX_TYPE_META: Record<InboxItemType, InboxTypeMeta> = {
  quote_ready: {
    label: "Quote ready",
    icon: FileCheck2,
    accent: "bg-emerald-50 text-emerald-700",
    podId: "quote-generation",
  },
  renewal_due: {
    label: "Renewal due",
    icon: CalendarClock,
    accent: "bg-amber-50 text-amber-700",
    podId: "policy-comparison",
  },
  submission_received: {
    label: "New submission",
    icon: InboxIcon,
    accent: "bg-primary/10 text-primary",
    podId: "carrier-submission-intake",
  },
  claim_drafted: {
    label: "Claim drafted",
    icon: AlertTriangle,
    accent: "bg-rose-50 text-rose-700",
    podId: "claims-fnol",
  },
  loss_run_ready: {
    label: "Loss run ready",
    icon: FileSearch,
    accent: "bg-violet-50 text-violet-700",
    podId: "loss-run-reporting",
  },
  policy_compare_ready: {
    label: "Comparison ready",
    icon: GitCompareArrows,
    accent: "bg-sky-50 text-sky-700",
    podId: "policy-comparison",
  },
  workflow_run: {
    label: "Workflow run",
    icon: Workflow,
    accent: "bg-indigo-50 text-indigo-700",
    podId: "agent-workflows",
  },
  pipeline_triggered: {
    label: "Pipeline triggered",
    icon: Zap,
    accent: "bg-fuchsia-50 text-fuchsia-700",
    podId: "agent-pipelines",
  },
};

export const STATUS_META: Record<InboxStatus, { label: string; cls: string }> = {
  ready:       { label: "Ready",       cls: "bg-primary/10 text-primary" },
  in_progress: { label: "Working",     cls: "bg-amber-50 text-amber-700" },
  approved:    { label: "Approved",    cls: "bg-emerald-50 text-emerald-700" },
  sent:        { label: "Sent",        cls: "bg-emerald-50 text-emerald-700" },
  dismissed:   { label: "Dismissed",   cls: "bg-muted text-muted-foreground" },
};
