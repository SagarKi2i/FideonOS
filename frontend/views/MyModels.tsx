'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// My Agents — clean view of activated pods.
// Shows: activation date, active/paused toggle, last-run timestamp.

import { useEffect, useMemo, useState } from "react";
import { agentsApi } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionHeader } from "@/components/ui/page-header";
import {
  Trash2, ArrowRight, Sparkles, Loader2, ChevronRight,
  Clock, Activity, Play, Box,
  FileSearch, FileText, Scale, RefreshCw,
  ClipboardList, MessageSquare, AlertCircle, Wand2,
  Mail, Search, Shield, ClipboardCheck, Bot, Briefcase,
  CalendarClock, Building2, Send, Layers, Code2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { CATALOG } from "@/lib/agentCatalog";
import { Cloud, Plug, Server } from "lucide-react";
import {
  fetchMyInstallations, fetchMyRuntime, uninstallPod, runPod,
  type InstallationWithRuntime, type PodRuntime,
} from "@/lib/pods";

interface ActivatedModel {
  id: string;            // user_agents.id
  agent_id: string;      // agents.id (uuid) — needed to re-activate
  model_id: string;      // agents.keyword — used for icons, catalog lookup, /pod/:id route
  model_name: string;
  domain: string;
  activated_at: string;
  is_active?: boolean | null;
}

// Shape of one row from GET /api/agents (agentsApi.myAgents).
interface MyAgentRow {
  id: string;
  agent_id: string;
  is_active: boolean | null;
  activated_at: string;
  agents?: { keyword?: string; name?: string; domain?: string } | null;
}

interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string | null;
  job_lane: string;
  is_active: boolean;
  status: string;
  last_run_at: string | null;
  created_at: string;
  automation_status?: string | null;
}

// Minimal icon map by agent id — keeps the page self-contained.
const AGENT_ICONS: Record<string, LucideIcon> = {
  "document-retrieval": FileSearch,
  "quote-generation": FileText,
  "policy-comparison": Scale,
  "renewal-review": RefreshCw,
  "loss-run-reporting": ClipboardList,
  "claims-fnol": AlertCircle,
  "acord-parser": FileText,
  "generic-prompt": MessageSquare,
};

// Icon map for custom agents (matches AgentBuilder's icon picker)
const CUSTOM_ICONS: Record<string, LucideIcon> = {
  "bot": Bot,
  "file-text": FileText,
  "mail": Mail,
  "search": Search,
  "scale": Scale,
  "shield-check": Shield,
  "clipboard-check": ClipboardCheck,
  "refresh-cw": RefreshCw,
  "briefcase": Briefcase,
  "calendar-clock": CalendarClock,
  "building-2": Building2,
  "alert-circle": AlertCircle,
  "send": Send,
  "layers": Layers,
};

export default function MyModels() {
  const router = useRouter();
  const { toast } = useToast();
  const [models, setModels] = useState<ActivatedModel[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [installs, setInstalls] = useState<InstallationWithRuntime[]>([]);
  const [runtime, setRuntime] = useState<PodRuntime | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [customDeletingId, setCustomDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Load activated models on mount.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        // Aligned source of truth: FastAPI /api/agents (user_agents + agents join).
        const raw = (await agentsApi.myAgents()) as MyAgentRow[];
        if (cancelled) return;
        setModels(
          raw.map((ua) => ({
            id: ua.id,
            agent_id: ua.agent_id,
            model_id: ua.agents?.keyword ?? "",
            model_name: ua.agents?.name ?? ua.agents?.keyword ?? "Agent",
            domain: ua.agents?.domain ?? "",
            activated_at: ua.activated_at,
            is_active: ua.is_active,
          })),
        );
        // Custom agents (custom_agents is a stub — §4.6) and installed pods /
        // base runtime (legacy pods.ts module — §4.7) have no tables yet, so
        // they stay empty until those domains are migrated to the API.
      } catch (e: any) {
        console.error("[MyAgents] load error:", e);
        if (!cancelled) {
          toast({
            title: "Couldn't load your agents",
            description: e?.message ?? "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [toast]);

  // Once models are loaded, derive last_run from inbox_items per pod (best-effort, non-blocking).
  useEffect(() => {
    if (models.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const podIds = models.map((m) => m.model_id).filter(Boolean);
        if (podIds.length === 0) return;

        const { data } = await supabase
          .from("inbox_items" as any)
          .select("pod_id, created_at")
          .in("pod_id", podIds)
          .order("created_at", { ascending: false })
          .limit(200);

        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as unknown as Array<{ pod_id: string | null; created_at: string }>) {
          if (row.pod_id && !map[row.pod_id]) map[row.pod_id] = row.created_at;
        }
        setLastRun(map);
      } catch (e) {
        console.warn("[MyAgents] last-run lookup failed:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [models]);

  const toggleActive = async (model: ActivatedModel) => {
    setBusyId(model.id);
    const nextActive = !(model.is_active ?? true);
    // Optimistic update.
    setModels((p) => p.map((m) => (m.id === model.id ? { ...m, is_active: nextActive } : m)));
    try {
      if (nextActive) {
        await agentsApi.activate({ agent_id: model.agent_id, model_name: model.model_name, domain: model.domain });
      } else {
        await agentsApi.deactivate(model.model_id);
      }
      toast({ title: nextActive ? `${model.model_name} resumed` : `${model.model_name} paused` });
    } catch (e: any) {
      // Revert
      setModels((p) => p.map((m) => (m.id === model.id ? { ...m, is_active: !nextActive } : m)));
      toast({ title: "Couldn't save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleCustomActive = async (agent: CustomAgent) => {
    setBusyId(agent.id);
    const nextActive = !agent.is_active;
    setCustomAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, is_active: nextActive } : a)));
    const { error } = await supabase
      .from("custom_agents" as any)
      .update({ is_active: nextActive })
      .eq("id", agent.id);
    setBusyId(null);
    if (error) {
      setCustomAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, is_active: !nextActive } : a)));
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: nextActive ? `${agent.name} resumed` : `${agent.name} paused` });
  };

  const handleCustomDelete = async (agentId: string) => {
    try {
      const { error } = await supabase.from("custom_agents" as any).delete().eq("id", agentId);
      if (error) throw error;
      setCustomAgents((p) => p.filter((a) => a.id !== agentId));
      setCustomDeletingId(null);
      toast({ title: "Custom agent removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to remove", variant: "destructive" });
    }
  };

  const reloadInstalls = async () => { setInstalls(await fetchMyInstallations()); setRuntime(await fetchMyRuntime()); };

  const handleUninstall = async (inst: InstallationWithRuntime) => {
    const res = await uninstallPod(inst.id);
    if (res.error) { toast({ title: "Uninstall failed", description: res.error, variant: "destructive" }); return; }
    toast({ title: "Pod uninstalled", description: inst.pod?.name ?? "" });
    void reloadInstalls();
  };

  const handleRunInstalled = async (inst: InstallationWithRuntime) => {
    const slug = inst.pod?.slug;
    if (!slug) return;
    setRunningId(inst.id);
    const res = await runPod(slug, { invokedFrom: "my-pods" }, "ui");
    setRunningId(null);
    if (res.error) { toast({ title: "Run failed", description: res.error, variant: "destructive" }); return; }
    toast({
      title: res.needsReview ? "Ran — sent to Review Queue" : "Pod ran",
      description: res.needsReview ? "Output was below the confidence threshold." : "Output saved.",
    });
  };

  const handleDeactivate = async (uaId: string) => {
    const model = models.find((m) => m.id === uaId);
    if (!model) return;
    try {
      await agentsApi.deactivate(model.model_id);
      setModels((p) => p.filter((m) => m.id !== uaId));
      setDeactivatingId(null);
      toast({ title: "Agent removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to remove agent", variant: "destructive" });
    }
  };

  const activeCount = useMemo(
    () => models.filter((m) => (m.is_active ?? true)).length,
    [models],
  );
  const pausedCount = models.length - activeCount;
  const mostRecentRun = useMemo(() => {
    const vs = Object.values(lastRun);
    if (vs.length === 0) return null;
    return vs.sort((a, b) => +new Date(b) - +new Date(a))[0];
  }, [lastRun]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="My agents"
        title="Your activated pods"
        description="The agents working for you. Pause one to stop it picking up new work — full audit trail in Trust."
        icon={Box}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/request-pod")}>
              <Wand2 className="h-4 w-4" />
              Request a custom pod
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push("/marketplace")}>
              <Sparkles className="h-4 w-4" />
              Browse marketplace
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : models.length === 0 && customAgents.length === 0 && installs.length === 0 && !runtime ? (
        <EmptyState
          icon={Box}
          title="No agents yet"
          description="Activate ready-made agents from the Marketplace, or request a custom pod and Fideon engineering will build it for you. Every action is auditable."
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="lg" onClick={() => router.push("/request-pod")}>
                <Wand2 className="h-4 w-4" />
                Request a custom pod
              </Button>
              <Button variant="primary" size="lg" onClick={() => router.push("/marketplace")}>
                <Sparkles className="h-4 w-4" />
                Explore Marketplace
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label="Active"
              value={activeCount}
              icon={Activity}
              tone="success"
              hint={pausedCount > 0 ? `${pausedCount} paused` : "all running"}
            />
            <KpiCard
              label="Paused"
              value={pausedCount}
              icon={Clock}
              tone={pausedCount > 0 ? "warning" : "default"}
              hint={pausedCount > 0 ? "not picking up work" : "none paused"}
            />
            <KpiCard
              label="Last run"
              value={mostRecentRun ? formatDistanceToNow(new Date(mostRecentRun), { addSuffix: false }) : "—"}
              icon={Play}
              tone="primary"
              hint={mostRecentRun ? "across all pods" : "no runs yet"}
            />
            <KpiCard
              label="Total pods"
              value={models.length}
              icon={Box}
              tone="primary"
              hint={`${Object.keys(lastRun).length} have run`}
            />
          </div>

          {/* Base runtime — the per-tenant host that runs your installed pods */}
          {runtime && (
            <Card className="mb-6 border-primary/30 bg-gradient-to-br from-accent/30 to-transparent">
              <div className="p-5 flex flex-wrap items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <Server className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-[15px] font-semibold text-foreground">Your base runtime</h3>
                    <StatusPill
                      tone={runtime.status === "running" ? "success" : runtime.status === "error" ? "danger" : "warning"}
                      dot pulse={runtime.status === "running"} size="sm"
                    >
                      {runtime.status}
                    </StatusPill>
                    <StatusPill tone="info" size="sm">{runtime.provider}</StatusPill>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    One runtime per workspace runs all your installed pods and exposes them over MCP.
                    {runtime.region ? ` · ${runtime.region}` : ""}{runtime.compute_size ? ` · ${runtime.compute_size}` : ""}
                  </p>
                  {runtime.runtime_endpoint_url && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1.5">
                      <Plug className="h-3 w-3 shrink-0" />
                      <code className="truncate">{runtime.runtime_endpoint_url}</code>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-display font-bold text-foreground leading-none">{installs.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">pods synced</p>
                </div>
              </div>
            </Card>
          )}

          {/* Installed pods — synced onto the tenant's base runtime, exposed as MCP */}
          {installs.length > 0 && (
            <section className="mb-8">
              <SectionHeader
                title="Installed pods"
                description="Pods synced onto your base runtime — each runs as a container there and is exposed as an MCP tool."
                count={installs.length}
                icon={Cloud}
              />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {installs.map((inst) => {
                  const running = inst.status === "running";
                  const tone = running ? "success" : inst.status === "failed" ? "danger" : "warning";
                  const Icon = AGENT_ICONS[inst.pod?.slug ?? ""] ?? Box;
                  return (
                    <Card key={inst.id} className="group relative flex flex-col overflow-hidden border-primary/30 bg-accent/20">
                      <div className="absolute top-3 right-3 z-10">
                        <StatusPill tone={tone as never} dot pulse={running} size="sm">
                          {inst.status}
                        </StatusPill>
                      </div>
                      <div className="p-5 pb-3 flex-1">
                        <div className="flex items-start gap-3 mb-3 pr-20">
                          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[14px] font-semibold text-foreground leading-tight line-clamp-2">
                              {inst.pod?.name ?? inst.pod?.slug}
                            </h3>
                            <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                              {inst.pod?.mcp_tool_name ?? "pod"}
                            </p>
                          </div>
                        </div>
                        {inst.runtime?.runtime_endpoint_url && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Plug className="h-3 w-3 shrink-0" />
                            <code className="truncate">runtime: {inst.runtime.runtime_endpoint_url}</code>
                          </div>
                        )}
                      </div>
                      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
                        <Button
                          variant="outline" size="xs"
                          disabled={!running || runningId === inst.id}
                          onClick={() => handleRunInstalled(inst)}
                        >
                          {runningId === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Run
                        </Button>
                        <div className="flex-1" />
                        <Button
                          variant="ghost" size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleUninstall(inst)}
                          aria-label="Uninstall pod"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Built for you by Fideon — engineered custom pods */}
          {customAgents.length > 0 && (
            <section className="mb-8">
              <SectionHeader
                title="Built for you by Fideon"
                description="Custom pods engineered by Fideon — same governance, same review queue, same audit trail."
                count={customAgents.length}
                icon={Wand2}
                actions={
                  <Button variant="ghost" size="xs" className="text-primary" onClick={() => router.push("/request-pod")}>
                    <Wand2 className="h-3 w-3" />Request another
                  </Button>
                }
              />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customAgents.map((agent) => {
                  const Icon = CUSTOM_ICONS[agent.icon] ?? Bot;
                  const isActive = agent.is_active;
                  return (
                    <Card
                      key={agent.id}
                      className={cn(
                        "group relative flex flex-col overflow-hidden transition-all duration-200",
                        isActive
                          ? "border-primary/40 bg-gradient-to-br from-accent/40 to-transparent hover:border-primary/60 hover:shadow-elevated hover:-translate-y-0.5"
                          : "opacity-80 hover:opacity-100 hover:border-border-strong",
                      )}
                    >
                      {/* Status ribbon — Marketplace pattern */}
                      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
                        <StatusPill tone="info" size="sm">
                          <Wand2 className="h-2.5 w-2.5" />Engineered
                        </StatusPill>
                        {agent.automation_status === "ready" && (
                          <StatusPill tone="primary" size="sm">
                            <Code2 className="h-2.5 w-2.5" />Browser-automated
                          </StatusPill>
                        )}
                        {isActive ? (
                          <StatusPill tone="success" dot size="sm">Active</StatusPill>
                        ) : (
                          <StatusPill tone="warning" dot size="sm">Paused</StatusPill>
                        )}
                      </div>

                      <div className="text-left p-5 pb-3 flex-1">
                        <div className="flex items-start gap-3 mb-3 pr-24">
                          <div
                            className={cn(
                              "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-primary",
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[14px] font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                              {agent.name}
                            </h3>
                            {agent.category && (
                              <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                                {agent.category}
                              </p>
                            )}
                          </div>
                        </div>

                        <p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3 min-h-[60px]">
                          {agent.description || "Custom agent engineered by Fideon."}
                        </p>
                      </div>

                      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        <Switch
                          checked={isActive}
                          disabled={busyId === agent.id}
                          onCheckedChange={() => toggleCustomActive(agent)}
                          aria-label={isActive ? "Pause agent" : "Resume agent"}
                        />
                        <span className="truncate">
                          {agent.last_run_at
                            ? `Last run · ${formatDistanceToNow(new Date(agent.last_run_at), { addSuffix: true })}`
                            : `Built ${format(new Date(agent.created_at), "MMM d")}`}
                        </span>
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setCustomDeletingId(agent.id)}
                          aria-label="Remove custom agent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Activated pods header (only show if we have BOTH custom + activated) */}
          {customAgents.length > 0 && models.length > 0 && (
            <SectionHeader
              title="From the marketplace"
              description="Pods you activated from the catalog."
              count={models.length}
              icon={Box}
            />
          )}

          {/* Agent grid — Marketplace-style cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {models.map((model) => {
              const Icon = AGENT_ICONS[model.model_id] ?? Box;
              const isActive = model.is_active ?? true;
              const lastRunIso = lastRun[model.model_id];
              const catalogEntry = CATALOG.find((c) => c.id === model.model_id);
              const category = catalogEntry?.category ?? "Insurance";
              const oneLiner = catalogEntry?.oneLiner ?? catalogEntry?.description ?? "Activated agent.";

              return (
                <Card
                  key={model.id}
                  className={cn(
                    "group relative flex flex-col overflow-hidden transition-all duration-200",
                    isActive
                      ? "border-primary/30 bg-accent/20 hover:border-primary/50 hover:shadow-elevated hover:-translate-y-0.5"
                      : "opacity-80 hover:opacity-100 hover:border-border-strong",
                  )}
                >
                  {/* Status ribbon top-right (Marketplace pattern) */}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
                    {isActive ? (
                      <StatusPill tone="success" dot pulse size="sm">Active</StatusPill>
                    ) : (
                      <StatusPill tone="warning" dot size="sm">Paused</StatusPill>
                    )}
                  </div>

                  {/* Body */}
                  <button
                    type="button"
                    onClick={() => router.push(`/pod/${model.model_id}`)}
                    className="text-left p-5 pb-3 flex-1"
                  >
                    <div className="flex items-start gap-3 mb-3 pr-20">
                      <div
                        className={cn(
                          "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-primary",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-[14px] font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {model.model_name}
                        </h3>
                        <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                          {category}
                        </p>
                      </div>
                    </div>

                    <p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3 min-h-[60px]">
                      {oneLiner}
                    </p>
                  </button>

                  {/* Footer — matches Marketplace shape: left affordance + right action */}
                  <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <Switch
                      checked={isActive}
                      disabled={busyId === model.id}
                      onCheckedChange={() => toggleActive(model)}
                      aria-label={isActive ? "Pause agent" : "Resume agent"}
                    />
                    <span className="truncate">
                      {lastRunIso
                        ? `Last run · ${formatDistanceToNow(new Date(lastRunIso), { addSuffix: true })}`
                        : `Activated ${format(new Date(model.activated_at), "MMM d")}`}
                    </span>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeactivatingId(model.id)}
                      aria-label="Remove agent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => router.push(`/pod/${model.model_id}`)}
                    >
                      Open
                    </Button>
                  </div>
                </Card>
              );
            })}

            {/* Add another agent */}
            <Card
              className="border-dashed cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-all group min-h-[240px]"
              onClick={() => router.push("/marketplace")}
            >
              <div className="p-5 h-full flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 rounded-xl bg-accent text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-[14px] font-semibold text-foreground">Add another agent</p>
                <p className="text-[11.5px] text-muted-foreground mt-1">Browse the marketplace</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Card>
          </div>
        </>
      )}

      <AlertDialog open={deactivatingId !== null} onOpenChange={(open) => !open && setDeactivatingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent will stop and disappear from your workspace. You can re-activate it from the Marketplace anytime.
              If you just want to stop it temporarily, use the <strong className="text-foreground">Pause</strong> toggle instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivatingId && handleDeactivate(deactivatingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={customDeletingId !== null} onOpenChange={(open) => !open && setCustomDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this custom agent?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent and its compiled workflow will be permanently removed. The original SOP text is also deleted.
              If you just want to stop it temporarily, use the <strong className="text-foreground">Pause</strong> toggle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => customDeletingId && handleCustomDelete(customDeletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
