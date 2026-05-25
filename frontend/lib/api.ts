"use client";

import { ApiUnreachableError, getApiUrl, isNetworkFetchError } from "@/lib/apiBase";

export { ApiUnreachableError, isNetworkFetchError } from "@/lib/apiBase";

async function apiFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${getApiUrl()}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch (error) {
    if (isNetworkFetchError(error)) throw new ApiUnreachableError();
    throw error;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await apiFetchRaw(path, options);

  // Attempt silent token refresh on 401
  if (res.status === 401 && path !== "/api/auth/token/refresh") {
    const refreshRes = await apiFetchRaw("/api/auth/token/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (refreshRes.ok) {
      // Retry original request with new cookie
      const retry = await apiFetchRaw(path, options);
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ detail: retry.statusText }));
        throw new Error(err.detail || "API error");
      }
      return retry.json() as T;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json() as T;
}

function authPost(path: string, body?: object): Promise<unknown> {
  return apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me:             ()                                       => apiFetch("/api/auth/me"),
  role:           ()                                       => apiFetch<{ role: string | null }>("/api/auth/role"),
  sendInvite:     (email: string)                          => authPost("/api/auth/invite", { email }),
  validateToken:  (token: string)                          => authPost("/api/auth/invite/validate", { token }),
  signup:         (token: string, password: string)        => authPost("/api/auth/signup", { token, password }),
  login:          (email: string, password: string)        => authPost("/api/auth/login", { email, password }),
  verifyOtp:      (email: string, otp: string)             => authPost("/api/auth/otp/verify", { email, otp }),
  verifyStepUp:   (email: string, otp: string)             => authPost("/api/auth/otp/step-up/verify", { email, otp }),
  resendOtp:      (email: string)                          => authPost("/api/auth/otp/resend", { email }),
  refresh:        ()                                       => authPost("/api/auth/token/refresh"),
  logout:         ()                                       => authPost("/api/auth/logout"),
  forgotPassword: (email: string)                          => authPost("/api/auth/password/forgot", { email }),
  resetPassword:  (token: string, new_password: string)    => authPost("/api/auth/password/reset", { token, new_password }),
  listInvites:    ()                                       => apiFetch("/api/admin/invites"),
};

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatApi = {
  conversations: () => apiFetch<unknown[]>("/api/chat/conversations"),
  createConversation: (data: object) =>
    apiFetch("/api/chat/conversations", { method: "POST", body: JSON.stringify(data) }),
  messages: (convId: string) => apiFetch<unknown[]>(`/api/chat/conversations/${convId}/messages`),
};

// ── Agents / Marketplace ──────────────────────────────────────────────────────
export const agentsApi = {
  // Catalog
  marketplace:    ()                                => apiFetch<unknown[]>("/api/agents/marketplace"),
  myAgents:       ()                                => apiFetch<unknown[]>("/api/agents"),
  activate:       (data: object)                    => apiFetch("/api/agents", { method: "POST", body: JSON.stringify(data) }),
  deactivate:     (keyword: string)                 => apiFetch(`/api/agents/${keyword}`, { method: "DELETE" }),
  agent:          (keyword: string)                 => apiFetch(`/api/agents/${keyword}`),
  // Dashboard
  dashboard:      (keyword: string)                 => apiFetch(`/api/agents/${keyword}/dashboard`),
  stats:          (keyword: string)                 => apiFetch(`/api/agents/${keyword}/stats`),
  refreshStats:   (keyword: string)                 => apiFetch(`/api/agents/${keyword}/stats/refresh`, { method: "POST" }),
  // Lazy tabs
  runs:           (keyword: string, offset = 0, limit = 20) => apiFetch<unknown[]>(`/api/agents/${keyword}/runs?offset=${offset}&limit=${limit}`),
  triggerRun:     (keyword: string, input: object)  => apiFetch(`/api/agents/${keyword}/runs`, { method: "POST", body: JSON.stringify({ input }) }),
  breakdown:      (keyword: string)                 => apiFetch<unknown[]>(`/api/agents/${keyword}/breakdown`),
  narrative:      (keyword: string)                 => apiFetch(`/api/agents/${keyword}/narrative`),
  trends:         (keyword: string)                 => apiFetch<unknown[]>(`/api/agents/${keyword}/trends`),
  versions:       (keyword: string)                 => apiFetch<unknown[]>(`/api/agents/${keyword}/versions`),
  // Agent access requests
  agentRequests:        ()                          => apiFetch<unknown[]>("/api/agents/agent-requests"),
  createAgentRequest:   (data: object)              => apiFetch("/api/agents/agent-requests", { method: "POST", body: JSON.stringify(data) }),
  // Custom agent build requests
  customAgentRequests:  ()                          => apiFetch<unknown[]>("/api/agents/custom-agent-requests"),
  createCustomRequest:  (data: object)              => apiFetch("/api/agents/custom-agent-requests", { method: "POST", body: JSON.stringify(data) }),
  // Doc retrieval config (now backed by carrier_connections.extra)
  docRetrievalConfig: () => apiFetch<unknown[]>("/api/agents/doc-retrieval-config"),
  upsertDocRetrievalConfig: (carrierId: string, data: object) =>
    apiFetch(`/api/agents/doc-retrieval-config/${carrierId}`, { method: "PUT", body: JSON.stringify(data) }),
  // Run operations
  runDetail:    (runId: string)                     => apiFetch(`/api/runs/${runId}`),
  runStatus:    (runId: string)                     => apiFetch(`/api/runs/${runId}/status`),
  approveRun:   (runId: string, data: object)       => apiFetch(`/api/runs/${runId}/approve`, { method: "POST", body: JSON.stringify(data) }),
  cancelRun:    (runId: string)                     => apiFetch(`/api/runs/${runId}/cancel`, { method: "POST" }),
  retryRun:     (runId: string)                     => apiFetch(`/api/runs/${runId}/retry`, { method: "POST" }),
  runComments:  (runId: string)                     => apiFetch<unknown[]>(`/api/runs/${runId}/comments`),
  addComment:   (runId: string, notes: string)      => apiFetch(`/api/runs/${runId}/comments`, { method: "POST", body: JSON.stringify({ notes }) }),
};

// ── Approvals ─────────────────────────────────────────────────────────────────
export const approvalsApi = {
  list: () => apiFetch<unknown[]>("/api/approvals"),
  get: (id: string) => apiFetch(`/api/approvals/${id}`),
  create: (data: object) =>
    apiFetch("/api/approvals", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    apiFetch(`/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createTrainingExample: (data: object) =>
    apiFetch("/api/approvals/training-examples", { method: "POST", body: JSON.stringify(data) }),
};

// ── Workflows ─────────────────────────────────────────────────────────────────
export const workflowsApi = {
  list: () => apiFetch<unknown[]>("/api/workflows"),
  get: (id: string) => apiFetch(`/api/workflows/${id}`),
  create: (data: object) =>
    apiFetch("/api/workflows", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    apiFetch(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/workflows/${id}`, { method: "DELETE" }),
  runs: (id: string) => apiFetch<unknown[]>(`/api/workflows/${id}/runs`),
  createRun: (id: string, inputs: object) =>
    apiFetch(`/api/workflows/${id}/runs`, { method: "POST", body: JSON.stringify({ inputs }) }),
};

// ── Governance ────────────────────────────────────────────────────────────────
export const governanceApi = {
  decisions: () => apiFetch<unknown[]>("/api/governance/decisions"),
  decision: (id: string) => apiFetch(`/api/governance/decisions/${id}`),
  createDecision: (data: object) =>
    apiFetch<{ id: string }>("/api/governance/decisions", { method: "POST", body: JSON.stringify(data) }),
  updateDecision: (id: string, data: object) =>
    apiFetch(`/api/governance/decisions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  logEvent: (decisionId: string, data: object) =>
    apiFetch(`/api/governance/decisions/${decisionId}/events`, { method: "POST", body: JSON.stringify(data) }),
  applyHumanDecision: (recordId: string, data: object) =>
    apiFetch(`/api/governance/decisions/${recordId}/apply`, { method: "POST", body: JSON.stringify(data) }),
  logExport: (recordId: string, data: object) =>
    apiFetch(`/api/governance/decisions/${recordId}/exports`, { method: "POST", body: JSON.stringify(data) }),
  auditLog: () => apiFetch<unknown[]>("/api/governance/audit-log"),
  modelVersions: () => apiFetch<unknown[]>("/api/governance/model-versions"),
  export: (table: string) => apiFetch(`/api/governance/exports?table=${table}`),
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsApi = {
  carriers: () => apiFetch<unknown[]>("/api/settings/carriers"),
  upsertCarrier: (carrierId: string, data: object) =>
    apiFetch(`/api/settings/carriers/${carrierId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCarrier: (carrierId: string) =>
    apiFetch(`/api/settings/carriers/${carrierId}`, { method: "DELETE" }),
  ams: () => apiFetch<unknown[]>("/api/settings/ams"),
  upsertAms: (amsId: string, data: object) =>
    apiFetch(`/api/settings/ams/${amsId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAms: (amsId: string) =>
    apiFetch(`/api/settings/ams/${amsId}`, { method: "DELETE" }),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  users: () => apiFetch("/api/admin/users"),
  createUser: (data: object) =>
    apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  agentRequests: () => apiFetch<unknown[]>("/api/admin/agent-requests"),
  updateAgentRequest: (id: string, data: object) =>
    apiFetch(`/api/admin/agent-requests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  customAgentRequests: () => apiFetch<unknown[]>("/api/admin/custom-agent-requests"),
  updateCustomAgentRequest: (id: string, data: object) =>
    apiFetch(`/api/admin/custom-agent-requests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  stats: () => apiFetch("/api/admin/stats"),
  allocatedModels: (userId: string) => apiFetch<unknown[]>(`/api/admin/users/${userId}/models`),
  allocateModel: (userId: string, data: object) =>
    apiFetch(`/api/admin/users/${userId}/models`, { method: "POST", body: JSON.stringify(data) }),
  deallocateModel: (userId: string, allocationId: string) =>
    apiFetch(`/api/admin/users/${userId}/models/${allocationId}`, { method: "DELETE" }),
};

// ── Dashboard (user mission control) ────────────────────────────────────────────
export interface AgentStatsSummary {
  total_runs: number;
  succeeded: number;
  failed: number;
  needs_review: number;
  running: number;
  success_rate: number;
  avg_confidence: number | null;
  avg_latency_seconds: number | null;
  completed_today: number;
  last_activity_at: string | null;
}

export interface DashboardOverview {
  kpis: {
    active_agents: number;
    runs_today: number;
    runs_week: number;
    success_rate: number;
    avg_latency_seconds: number;
  };
  agents: Array<{
    id: string;
    agent_id: string;
    keyword: string | null;
    name: string | null;
    domain: string | null;
    tagline: string | null;
    icon_asset_file_name: string | null;
    activated_at: string | null;
    stats: Record<string, unknown>;
    summary: AgentStatsSummary;
  }>;
  recent_runs: Array<{
    id: string;
    agent_keyword: string | null;
    agent_name: string | null;
    status: "running" | "succeeded" | "failed";
    started_at: string | null;
    finished_at: string | null;
    duration_seconds: number | null;
    confidence: number | null;
  }>;
  run_counts: { all: number; running: number; succeeded: number; failed: number };
  activity: Array<{
    run_id: string;
    agent_keyword: string | null;
    agent_name: string | null;
    text: string;
    status: "success" | "error";
    at: string | null;
  }>;
}

export const dashboardApi = {
  overview: () => apiFetch<DashboardOverview>("/api/dashboard/overview"),
};

// ── Devices (admin) ───────────────────────────────────────────────────────────
export const devicesApi = {
  list: () => apiFetch<unknown[]>("/api/devices"),
  pending: () => apiFetch<unknown[]>("/api/devices/pending"),
  get: (id: string) => apiFetch<{ device: unknown; logs: unknown[] }>(`/api/devices/${id}`),
  updateStatus: (id: string, status: string) =>
    apiFetch(`/api/devices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resetToken: (id: string) =>
    apiFetch<{ device: unknown; token: string }>(`/api/devices/${id}/reset-token`, { method: "POST" }),
  // Device model allocations
  allocations: (id: string) => apiFetch<unknown[]>(`/api/devices/${id}/allocations`),
  allocate: (id: string, data: { agent_id: string; model_name: string; notes?: string }) =>
    apiFetch(`/api/devices/${id}/allocations`, { method: "POST", body: JSON.stringify(data) }),
  deallocate: (id: string, allocationId: string) =>
    apiFetch(`/api/devices/${id}/allocations/${allocationId}`, { method: "DELETE" }),
  analytics: (id: string) => apiFetch<unknown[]>(`/api/devices/${id}/analytics`),
};

// ── MCP ───────────────────────────────────────────────────────────────────────
export const mcpApi = {
  tokens: () => apiFetch<unknown[]>("/api/mcp/tokens"),
  createToken: (scopes: string[]) =>
    apiFetch("/api/mcp/tokens", { method: "POST", body: JSON.stringify({ scopes }) }),
  revokeToken: (id: string) => apiFetch(`/api/mcp/tokens/${id}`, { method: "DELETE" }),
  tools: () => apiFetch("/api/mcp/tools"),
};

// ── Workflow AI ───────────────────────────────────────────────────────────────
export const workflowAiApi = {
  parseSop: (sopText: string) =>
    apiFetch("/api/workflow-ai/parse-sop", { method: "POST", body: JSON.stringify({ sop_text: sopText }) }),
  assistStep: (step: object, context?: string) =>
    apiFetch("/api/workflow-ai/assist-step", { method: "POST", body: JSON.stringify({ step, context }) }),
  compile: (sopText: string, steps: unknown[]) =>
    apiFetch("/api/workflow-ai/compile", {
      method: "POST",
      body: JSON.stringify({ sop_text: sopText, steps }),
    }),
};

// ── Demo ──────────────────────────────────────────────────────────────────────
export const demoApi = {
  seedReviewQueue: (opts: { wipe_first?: boolean }) =>
    apiFetch<{ workflows_created: number; reviews_created: number; wiped: number }>(
      "/api/demo/seed-review-queue",
      { method: "POST", body: JSON.stringify(opts) },
    ),
};

// ── Streaming helper ──────────────────────────────────────────────────────────
export async function getStreamHeaders(): Promise<Record<string, string>> {
  // Cookies are sent automatically via credentials: "include" — no extra header needed
  return {};
}
