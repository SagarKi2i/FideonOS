'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Overview — your automation footprint.
//
// The single page that answers: "Beyond the catalog pods, what work have I
// automated, and what's Fideon building for me?"
//
// Two surfaces in one:
//   1. Workflows — agent chains you assembled yourself (agent_pipelines).
//   2. Custom pods — engineered for you by Fideon (custom_pod_requests +
//      the resulting custom_agents).
//
// Read-only summary + entry points. Actions live in the dedicated pages.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

import {
  Zap, Wand2, Plus, ArrowRight, Loader2, Activity,
  Inbox, ClipboardCheck, Hammer, CheckCircle2, PlayCircle, XCircle,
  Workflow, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────── types ───────────────────────────

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: any[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

type PodRequestStatus =
  | "submitted"
  | "in_review"
  | "building"
  | "ready_to_install"
  | "installed"
  | "rejected";

interface PodRequest {
  id: string;
  title: string;
  status: PodRequestStatus;
  priority: string;
  custom_agent_id: string | null;
  requested_at: string;
  updated_at: string;
}

interface CustomAgent {
  id: string;
  name: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

interface ActivityEvent {
  kind: "workflow_created" | "pod_request" | "pod_request_update" | "custom_agent_built";
  label: string;
  detail: string;
  at: string;
  status?: PodRequestStatus | "active" | "paused" | "draft";
}

// ─────────────────────────── status meta ───────────────────────────

const POD_STATUS_META: Record<PodRequestStatus, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "danger"; icon: typeof Inbox }> = {
  submitted:        { label: "Submitted",        tone: "neutral",  icon: Inbox          },
  in_review:        { label: "In review",        tone: "primary",  icon: ClipboardCheck },
  building:         { label: "Building",         tone: "primary",  icon: Hammer         },
  ready_to_install: { label: "Ready to install", tone: "success",  icon: CheckCircle2   },
  installed:        { label: "Installed",        tone: "success",  icon: PlayCircle     },
  rejected:         { label: "Declined",         tone: "danger",   icon: XCircle        },
};

// ─────────────────────────── page ───────────────────────────

export default function Overview() {
  const router = useRouter();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [requests, setRequests] = useState<PodRequest[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }

      const [pipeRes, reqRes, custRes] = await Promise.all([
        supabase
          .from("agent_pipelines")
          .select("id, name, description, steps, is_active, last_run_at, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("custom_pod_requests" as any)
          .select("id, title, status, priority, custom_agent_id, requested_at, updated_at")
          .eq("user_id", user.id)
          .order("requested_at", { ascending: false })
          .limit(20),
        supabase
          .from("custom_agents" as any)
          .select("id, name, is_active, last_run_at, created_at")
          .eq("user_id", user.id)
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      setPipelines(((pipeRes.data ?? []) as any[]).map((p) => ({
        ...p,
        steps: Array.isArray(p.steps) ? p.steps : [],
      })) as Pipeline[]);
      setRequests((reqRes.data ?? []) as unknown as PodRequest[]);
      setCustomAgents((custRes.data ?? []) as unknown as CustomAgent[]);
    } catch (e) {
      console.warn("[Overview] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // ─── derived KPIs ───
  const activeWorkflows = pipelines.filter((p) => p.is_active).length;
  const totalWorkflows = pipelines.length;
  const inFlightRequests = requests.filter((r) => ["submitted", "in_review", "building"].includes(r.status)).length;
  const readyToInstall = requests.filter((r) => r.status === "ready_to_install").length;
  const installedCustom = customAgents.length;

  // ─── recent activity feed ───
  const recentActivity = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = [];
    for (const p of pipelines.slice(0, 5)) {
      events.push({
        kind: "workflow_created",
        label: p.name,
        detail: `${p.steps.length} step${p.steps.length !== 1 ? "s" : ""} · ${p.is_active ? "active" : "paused"}`,
        at: p.last_run_at ?? p.created_at,
        status: p.is_active ? "active" : "paused",
      });
    }
    for (const r of requests.slice(0, 5)) {
      events.push({
        kind: r.status === "ready_to_install" ? "pod_request_update" : "pod_request",
        label: r.title,
        detail: `Custom pod · ${POD_STATUS_META[r.status]?.label ?? r.status}`,
        at: r.updated_at ?? r.requested_at,
        status: r.status,
      });
    }
    for (const a of customAgents.slice(0, 5)) {
      events.push({
        kind: "custom_agent_built",
        label: a.name,
        detail: `Custom pod installed${a.last_run_at ? " · ran " + formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true }) : ""}`,
        at: a.created_at,
        status: a.is_active ? "active" : "paused",
      });
    }
    return events
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 10);
  }, [pipelines, requests, customAgents]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Automation footprint"
        title="Your workflows and custom pods"
        description="What you've assembled, and what Fideon's engineering for you. Catalog pod activations live under My Agents."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard
              label="Active workflows"
              value={activeWorkflows}
              icon={Zap}
              tone={activeWorkflows > 0 ? "success" : "default"}
              hint={`of ${totalWorkflows} total`}
            />
            <KpiCard
              label="Custom pods in flight"
              value={inFlightRequests}
              icon={Hammer}
              tone={inFlightRequests > 0 ? "primary" : "default"}
              hint={inFlightRequests > 0 ? "Fideon building" : "none in progress"}
            />
            <KpiCard
              label="Ready to install"
              value={readyToInstall}
              icon={CheckCircle2}
              tone={readyToInstall > 0 ? "success" : "default"}
              hint={readyToInstall > 0 ? "open Request-a-Pod →" : "all clear"}
            />
            <KpiCard
              label="Custom pods installed"
              value={installedCustom}
              icon={PlayCircle}
              tone="primary"
              hint="engineered by Fideon"
            />
          </div>

          {/* Two-column: workflows + custom pods */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
            {/* Workflows */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                    Workflows
                  </h2>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">Drag-and-drop agent chains you've built.</p>
                </div>
                <Button variant="primary" size="xs" onClick={() => router.push("/agent-workflows")}>
                  <Plus className="h-3 w-3" />New workflow
                </Button>
              </div>

              {pipelines.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={Workflow}
                  title="No workflows yet"
                  description="Chain agents together to automate a multi-step task. Each step's output flows to the next."
                  action={
                    <Button variant="primary" size="sm" onClick={() => router.push("/agent-workflows")}>
                      <Plus className="h-3.5 w-3.5" />Build a workflow
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {pipelines.slice(0, 6).map((p) => (
                    <li
                      key={p.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push("/agent-workflows")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground truncate">{p.name}</p>
                        <p className="text-[11.5px] text-muted-foreground truncate">
                          {p.steps.length} step{p.steps.length !== 1 ? "s" : ""}
                          {p.last_run_at && (
                            <> · ran {formatDistanceToNow(new Date(p.last_run_at), { addSuffix: true })}</>
                          )}
                        </p>
                      </div>
                      {p.is_active ? (
                        <StatusPill tone="success" size="sm">Active</StatusPill>
                      ) : (
                        <StatusPill tone="neutral" size="sm">Paused</StatusPill>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </li>
                  ))}
                  {pipelines.length > 6 && (
                    <li className="px-4 py-2.5 bg-muted/20">
                      <button
                        onClick={() => router.push("/agent-workflows")}
                        className="text-[12px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View all {pipelines.length} workflows <ArrowRight className="h-3 w-3" />
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </Card>

            {/* Custom pods */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
                    <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Custom pods
                  </h2>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">Engineered for you by Fideon.</p>
                </div>
                <Button variant="primary" size="xs" onClick={() => router.push("/request-pod")}>
                  <Plus className="h-3 w-3" />Request
                </Button>
              </div>

              {requests.length === 0 && customAgents.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={Wand2}
                  title="No custom pods yet"
                  description="Submit a workflow we don't already have. Fideon engineers it and ships back an install-ready pod."
                  action={
                    <Button variant="primary" size="sm" onClick={() => router.push("/request-pod")}>
                      <Plus className="h-3.5 w-3.5" />Request a custom pod
                    </Button>
                  }
                />
              ) : (
                <>
                  {/* Status counts strip */}
                  {requests.length > 0 && (
                    <div className="px-4 py-3 border-b border-border bg-muted/20">
                      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">In progress</p>
                      <div className="flex items-center gap-3 flex-wrap text-[12px]">
                        {(["submitted", "in_review", "building", "ready_to_install"] as PodRequestStatus[]).map((s) => {
                          const count = requests.filter((r) => r.status === s).length;
                          if (count === 0) return null;
                          const meta = POD_STATUS_META[s];
                          return (
                            <span key={s} className="inline-flex items-center gap-1.5">
                              <meta.icon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-foreground/85 font-medium">{count}</span>
                              <span className="text-muted-foreground">{meta.label}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <ul className="divide-y divide-border">
                    {requests.slice(0, 5).map((r) => {
                      const meta = POD_STATUS_META[r.status];
                      return (
                        <li
                          key={r.id}
                          className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => router.push("/request-pod")}
                        >
                          <meta.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate">{r.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Updated {formatDistanceToNow(new Date(r.updated_at ?? r.requested_at), { addSuffix: true })}
                            </p>
                          </div>
                          <StatusPill tone={meta.tone} size="sm">{meta.label}</StatusPill>
                        </li>
                      );
                    })}
                  </ul>

                  {(requests.length > 0 || customAgents.length > 0) && (
                    <div className="px-4 py-2.5 bg-muted/20 flex items-center justify-between gap-2 text-[12px]">
                      <button onClick={() => router.push("/request-pod")} className="text-primary font-semibold hover:underline inline-flex items-center gap-1">
                        View all requests <ArrowRight className="h-3 w-3" />
                      </button>
                      {customAgents.length > 0 && (
                        <button onClick={() => router.push("/my-models")} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                          {customAgents.length} installed · open My Agents
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          {/* Recent activity feed */}
          {recentActivity.length > 0 && (
            <section className="mt-6">
              <SectionHeader
                title="Recent activity"
                description="Latest changes across your workflows and custom pods."
                icon={Activity}
              />
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {recentActivity.map((ev, idx) => (
                    <li key={idx} className="px-4 py-2.5 flex items-center gap-3">
                      <div className={cn(
                        "h-7 w-7 rounded flex items-center justify-center shrink-0",
                        ev.kind === "workflow_created"   && "bg-accent text-primary",
                        ev.kind === "pod_request"        && "bg-warning/10 text-warning-foreground",
                        ev.kind === "pod_request_update" && "bg-success/15 text-success",
                        ev.kind === "custom_agent_built" && "bg-success/15 text-success",
                      )}>
                        {ev.kind === "workflow_created"   && <Workflow className="h-3.5 w-3.5" />}
                        {ev.kind === "pod_request"        && <Wand2 className="h-3.5 w-3.5" />}
                        {ev.kind === "pod_request_update" && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {ev.kind === "custom_agent_built" && <PlayCircle className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground truncate">{ev.label}</p>
                        <p className="text-[11.5px] text-muted-foreground truncate">{ev.detail}</p>
                      </div>
                      <span className="text-[11.5px] text-muted-foreground tabular-nums shrink-0">
                        {formatDistanceToNow(new Date(ev.at), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
