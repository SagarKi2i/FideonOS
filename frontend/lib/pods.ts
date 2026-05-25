'use client';
import { getCurrentUser } from '@/lib/currentUser';
// ─────────────────────────────────────────────────────────────────────────
// Pod foundation — client-side domain types + helpers.
//
// Backs the DB-first marketplace: pods are rows in `pod_definitions`, installs
// in `pod_installations`, the Azure VM/MCP record in `pod_deployments`, and
// every execution in `pod_runs`. The legacy hardcoded CATALOG (agentCatalog.ts)
// remains the seed source and a read fallback while the tables roll out.
//
// NOTE: the new tables are intentionally queried with a loosely-typed client
// (`db()` below) because src/integrations/supabase/types.ts is generated and
// does not yet include them — the same pattern this repo already uses for
// `custom_agents`. Regenerate types via `supabase gen types` to tighten later.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { CATALOG, type CatalogAgent } from "@/lib/agentCatalog";

// Loosely-typed handle for tables not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export type InstallationStatus =
  | "pending" | "syncing" | "running" | "failed" | "stopped" | "uninstalled";

export type RuntimeStatus =
  | "queued" | "provisioning" | "running" | "error" | "stopped";

export interface PodDefinition {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  icon: string | null;
  sector: string;
  segment: string | null;
  job_lane: string | null;
  status: "draft" | "published" | "coming_soon";
  container_image: string;
  mcp_tool_name: string | null;
  arm_template_ref: string;
  compute_size: string;
  config_schema: JsonSchema;
  default_config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface PodInstallation {
  id: string;
  user_id: string;
  pod_definition_id: string;
  runtime_id: string | null;
  config: Record<string, unknown>;
  status: InstallationStatus;
  created_at: string;
  updated_at: string;
}

/** One base runtime per tenant; pods are synced onto it. */
export interface PodRuntime {
  id: string;
  user_id: string;
  provider: string;
  arm_deployment_id: string | null;
  region: string | null;
  vm_resource_id: string | null;
  runtime_endpoint_url: string | null;
  compute_size: string | null;
  status: RuntimeStatus;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface PodRun {
  id: string;
  user_id: string;
  installation_id: string | null;
  pod_definition_id: string | null;
  pod_slug: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: "queued" | "running" | "succeeded" | "failed" | "needs_review";
  confidence: number | null;
  source: "ui" | "mcp" | "workflow";
  started_at: string;
  completed_at: string | null;
}

// Minimal JSON-Schema subset the marketplace config form understands.
export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean" | "array";
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
}
export interface JsonSchema {
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Catalog → pod_definition mapping (seed shape) + a sensible default config
// schema for pods that don't yet ship a hand-authored one.
// ─────────────────────────────────────────────────────────────────────────

export function defaultConfigSchema(agent: CatalogAgent): JsonSchema {
  const props: Record<string, JsonSchemaProperty> = {
    display_name: {
      type: "string",
      title: "Display name",
      description: "Name this installed pod for your workspace.",
      default: agent.name,
    },
    confidence_threshold: {
      type: "number",
      title: "Auto-approve confidence threshold",
      description: "Runs below this confidence are sent to the Review Queue.",
      default: 0.85,
    },
  };
  if (agent.connectors?.length) {
    props.connectors = {
      type: "array",
      title: "Connected systems",
      description: "Carriers / AMS this pod should use.",
      items: { type: "string" },
      default: agent.connectors,
    };
  }
  return { type: "object", properties: props, required: ["display_name"] };
}

export function podDefinitionSeed(agent: CatalogAgent) {
  return {
    slug: agent.id,
    name: agent.name,
    description: agent.description,
    icon: agent.icon,
    sector: agent.sector,
    segment: agent.segment ?? null,
    job_lane: agent.jobLane,
    status: agent.status === "live" ? "published" : agent.status === "beta" ? "published" : "coming_soon",
    mcp_tool_name: agent.mcpToolName ?? null,
    config_schema: defaultConfigSchema(agent),
    default_config: { display_name: agent.name, confidence_threshold: 0.85 },
    metadata: {
      oneLiner: agent.oneLiner,
      connectors: agent.connectors ?? [],
      timeSavedMinutes: agent.timeSavedMinutes,
      usedByCount: agent.usedByCount,
      samplePrompt: agent.samplePrompt,
      sampleOutput: agent.sampleOutput,
      pricingHint: agent.pricingHint,
    },
  };
}

// A read-time fallback: synthesize PodDefinition rows from the hardcoded CATALOG
// so the marketplace still renders before pod_definitions is seeded/deployed.
export function catalogFallbackDefinitions(): PodDefinition[] {
  return CATALOG.map((a) => ({
    id: `catalog:${a.id}`,
    version: "1.0.0",
    arm_template_ref: "infra/arm/pod-vm.json",
    compute_size: "Standard_B1s",
    container_image: "fideon/placeholder-pod:latest",
    ...podDefinitionSeed(a),
  })) as PodDefinition[];
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

/** Published pods, DB-first with a CATALOG fallback if the table is empty/absent. */
export async function fetchPublishedPods(): Promise<PodDefinition[]> {
  try {
    const { data, error } = await db
      .from("pod_definitions" as any)
      .select("*")
      .eq("status", "published");
    if (error || !data || data.length === 0) return catalogFallbackDefinitions().filter((p) => p.status === "published");
    return data as unknown as PodDefinition[];
  } catch {
    return catalogFallbackDefinitions().filter((p) => p.status === "published");
  }
}

export async function fetchPodBySlug(slug: string): Promise<PodDefinition | null> {
  try {
    const { data } = await db.from("pod_definitions" as any).select("*").eq("slug", slug).maybeSingle();
    if (data) return data as unknown as PodDefinition;
  } catch { /* fall through */ }
  return catalogFallbackDefinitions().find((p) => p.slug === slug) ?? null;
}

export interface InstallationWithRuntime extends PodInstallation {
  runtime?: PodRuntime | null;
  pod?: PodDefinition | null;
}

/** The current user's installs joined with their tenant runtime + pod definition. */
export async function fetchMyInstallations(): Promise<InstallationWithRuntime[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const { data, error } = await db
      .from("pod_installations" as any)
      .select("*, pod:pod_definitions(*), runtime:pod_runtimes(*)")
      .eq("user_id", user.id)
      .neq("status", "uninstalled")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data as unknown as InstallationWithRuntime[];
  } catch {
    return [];
  }
}

/** The tenant's single base runtime (or null if not provisioned yet). */
export async function fetchMyRuntime(): Promise<PodRuntime | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const { data } = await db.from("pod_runtimes").select("*").eq("user_id", user.id).maybeSingle();
    return (data as unknown as PodRuntime) ?? null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// Mutations via the pod-provision edge function
// ─────────────────────────────────────────────────────────────────────────

export interface ProvisionResult {
  installation?: PodInstallation;
  runtime?: PodRuntime;
  error?: string;
}

async function invokeProvision(body: Record<string, unknown>): Promise<ProvisionResult> {
  const { data, error } = await supabase.functions.invoke("pod-provision", { body });
  if (error) return { error: error.message };
  return data as unknown as ProvisionResult;
}

export const installPod = (slug: string, config: Record<string, unknown>) =>
  invokeProvision({ action: "install", slug, config });

export const refreshInstallation = (installationId: string, slug?: string) =>
  invokeProvision({ action: "status", installation_id: installationId, slug });

export const uninstallPod = (installationId: string) =>
  invokeProvision({ action: "uninstall", installation_id: installationId });

export interface RunResult { run?: PodRun; needsReview?: boolean; error?: string; installed?: boolean; }

/** Execute an installed pod from the app and persist a pod_run. */
export async function runPod(slug: string, input: Record<string, unknown>, source: "ui" | "workflow" = "ui"): Promise<RunResult> {
  const { data, error } = await supabase.functions.invoke("pod-provision", {
    body: { action: "run", slug, input, source },
  });
  if (error) return { error: error.message };
  return data as unknown as RunResult;
}

export interface WorkflowStepResult { step: number; slug: string; status: string; confidence?: number; run_id?: string; reason?: string; }

/** Run a workflow by chaining its installed pods through the tenant runtime. */
export async function runWorkflow(
  steps: Array<{ agent_id: string; agent_name?: string }>,
  input: Record<string, unknown> = {},
  pipelineId?: string,
): Promise<{ steps?: WorkflowStepResult[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("pod-provision", {
    body: { action: "workflow_run", steps, input, pipeline_id: pipelineId },
  });
  if (error) return { error: error.message };
  return data as { steps: WorkflowStepResult[] };
}

/** Persist a run that executed LOCALLY (desktop runtime) into Supabase, so it
 *  flows into dashboards / Today / the review queue just like a cloud run. */
export async function recordLocalRun(opts: {
  installation: InstallationWithRuntime;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: number;
}): Promise<{ needsReview: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { needsReview: false };
  const threshold = Number((opts.installation.config as Record<string, unknown>)?.confidence_threshold ?? 0.85);
  const needsReview = opts.confidence < threshold;
  const pod = opts.installation.pod;
  await db.from("pod_runs" as any).insert({
    user_id: user.id, installation_id: opts.installation.id, pod_definition_id: opts.installation.pod_definition_id,
    pod_slug: pod?.slug ?? null, input: opts.input, output: opts.output,
    status: needsReview ? "needs_review" : "succeeded", confidence: opts.confidence,
    source: "ui", completed_at: new Date().toISOString(),
  });
  if (needsReview) {
    try {
      await db.from("decision_reviews").insert({
        user_id: user.id, domain: pod?.sector ?? "insurance", decision_type: "pod_run",
        pod_model_id: pod?.slug, pod_model_name: pod?.name, title: `${pod?.name} — output needs review`,
        confidence_score: opts.confidence, threshold_exceeded: true,
        input_data: opts.input, output_data: opts.output, status: "pending",
      });
    } catch { /* review insert is best-effort */ }
  }
  return { needsReview };
}

/** Recent runs for a pod slug (dashboards / activity). */
export async function fetchPodRuns(slug: string, limit = 50): Promise<PodRun[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const { data } = await db
      .from("pod_runs" as any).select("*")
      .eq("user_id", user.id).eq("pod_slug", slug)
      .order("started_at", { ascending: false }).limit(limit);
    return (data ?? []) as unknown as PodRun[];
  } catch { return []; }
}

/** All recent runs across pods (Today / global dashboards). */
export async function fetchRecentRuns(limit = 100): Promise<PodRun[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const { data } = await db
      .from("pod_runs" as any).select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false }).limit(limit);
    return (data ?? []) as unknown as PodRun[];
  } catch { return []; }
}

/** Idempotently upsert the hardcoded CATALOG into pod_definitions (admin/service-role). */
export const ensureCatalogSeeded = () =>
  invokeProvision({ action: "ensure_catalog", catalog: CATALOG.map(podDefinitionSeed) });
