// Run Workspace types
//
// Pod Run Workspace is the per-pod surface that replaces the old Playground.
// You push a real case (an account, a document, or a sample) into a pod and
// watch it execute step-by-step against your data. Outputs are structured —
// each pod has its own RunOutputRenderer.

export type RunStepStatus = "pending" | "running" | "done" | "warning" | "error";

export interface RunStep {
  id: string;
  /** Short title shown in the timeline (5–8 words). */
  title: string;
  /** Optional one-line subtitle / description. */
  detail?: string;
  /** Optional data the step produced — table, key/value pairs, etc. */
  data?: Record<string, any>;
  status: RunStepStatus;
  /** When did this step start (ISO). Used for elapsed-time display. */
  startedAt?: string;
  /** When did this step finish (ISO). */
  finishedAt?: string;
}

export type RunInputKind = "sample" | "document" | "account";

export interface RunInput {
  kind: RunInputKind;
  /** Display label — e.g. "ACME Manufacturing renewal" or "loss_run_2024.pdf". */
  label: string;
  /** Sub-label — e.g. "Travelers · 2024 policy" or "284 KB · PDF". */
  sublabel?: string;
  /** Arbitrary input payload the renderer/sample knows how to interpret. */
  payload?: Record<string, any>;
}

export type RunStatus = "idle" | "streaming" | "complete" | "failed";

export interface RunRecord {
  id: string;
  podId: string;
  input: RunInput;
  steps: RunStep[];
  output: any | null;        // pod-specific, dispatched via OUTPUT_RENDERERS
  confidence?: number;        // 0–1
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
}

export interface PodOutputRendererProps {
  output: any;
  confidence?: number;
  onFileToAms?: () => void;
  onSendToReview?: () => void;
  onDiscard?: () => void;
}
