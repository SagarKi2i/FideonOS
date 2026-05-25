'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { agentsApi, ApiUnreachableError, isNetworkFetchError } from "@/lib/api";
import { clearUserCache } from "@/lib/currentUser";
import {
  Sparkles,
  Search,
  CheckCircle2,
  Clock as ClockIcon,
  Clock,
  Settings,
  ShieldCheck,
  Plus,
  X,
  Layers,
  Bot,
  Lock,
  Activity,
  type LucideIcon,
  Scale,
  FileText,
  FilePlus,
  AlertCircle,
  RefreshCw,
  ClipboardCheck,
  Target,
  UserCheck,
  Mail,
  Flag,
  Calculator,
  Inbox,
  Filter,
  ShieldAlert,
  RotateCcw,
  FileCheck,
  Repeat,
  Download,
  Wand2,
  Play,
  PauseCircle,
  Code2,
  Bell,
  Eye,
  ClipboardList,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  CATALOG,
  agentsBySector,
  sectorStats,
  type CatalogAgent,
} from "@/lib/agentCatalog";
import {
  SECTORS,
  JOB_LANES,
  STATUS_META,
  getSector,
  type SectorId,
} from "@/lib/sectors";
import { MyAgentsPanel } from "@/views/MyModels";

type MarketplaceView = "browse" | "my-agents";

interface CustomAgentRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string | null;
  job_lane: string;
  status: string;
  is_active: boolean;
  mcp_tool_name: string | null;
  last_run_at: string | null;
  created_at: string;
  automation_status?: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  scale: Scale, "shield-check": ShieldCheck, "file-plus": FilePlus,
  "alert-circle": AlertCircle, "file-text": FileText, search: Search,
  "refresh-cw": RefreshCw, "clipboard-check": ClipboardCheck, target: Target,
  "user-check": UserCheck, layers: Layers, mail: Mail, flag: Flag,
  calculator: Calculator, bot: Bot, inbox: Inbox, filter: Filter,
  activity: Activity, "shield-alert": ShieldAlert, "rotate-ccw": RotateCcw,
  "file-check": FileCheck, repeat: Repeat, download: Download,
  eye: Eye, "clipboard-list": ClipboardList,
};

export default function Marketplace() {
  const { toast } = useToast();
  const router = useRouter();

  const [marketplaceView, setMarketplaceView] = useState<MarketplaceView>("browse");
  const [sectorId, setSectorId] = useState<SectorId>("insurance");
  const [query, setQuery] = useState("");
  const [activatedIds, setActivatedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [keywordToId, setKeywordToId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [customAgents, setCustomAgents] = useState<CustomAgentRow[]>([]);

  // Compare drawer
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Dialogs
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestText, setRequestText] = useState("");

  useEffect(() => { loadActivations(); }, []);

  const loadActivations = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }
      const [activated, requests, marketplace] = await Promise.all([
        agentsApi.myAgents() as Promise<Array<{ agents?: { keyword?: string } }>>,
        agentsApi.agentRequests() as Promise<Array<{ status: string; agents?: { keyword?: string } }>>,
        agentsApi.marketplace() as Promise<Array<{ id: string; keyword: string }>>,
      ]);

      const kwToId: Record<string, string> = {};
      for (const a of marketplace) kwToId[a.keyword] = a.id;
      setKeywordToId(kwToId);

      setActivatedIds(new Set(
        activated.map((m) => m.agents?.keyword).filter((k): k is string => !!k),
      ));
      setPendingIds(new Set(
        requests
          .filter((r) => r.status === "submitted")
          .map((r) => r.agents?.keyword)
          .filter((k): k is string => !!k),
      ));
      setCustomAgents([]);
    } catch (e) {
      if (e instanceof ApiUnreachableError || isNetworkFetchError(e)) {
        clearUserCache();
        setActivatedIds(new Set());
        setPendingIds(new Set());
        setKeywordToId({});
      } else {
        console.warn("Marketplace: could not load activations", e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (agent: CatalogAgent) => {
    if (agent.status !== "live" && agent.status !== "beta") {
      toast({ title: "Not yet available", description: "We'll notify you when this agent goes live." });
      return;
    }
    const user = await getCurrentUser();
    if (!user) { router.push("/auth"); return; }

    const agentId = keywordToId[agent.id];
    if (!agentId) {
      toast({ title: "Not yet available", description: "This agent isn't in the catalog yet." });
      return;
    }

    try {
      await agentsApi.createAgentRequest({ agent_id: agentId, model_name: agent.name });
      toast({ title: "Activation requested", description: `${agent.name} is queued for admin approval.` });
      loadActivations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      const already = /already|duplicate/i.test(msg);
      toast({
        title: already ? "Already requested" : "Request failed",
        description: already ? "Pending admin approval." : msg,
        variant: "destructive",
      });
    }
  };

  const sector = getSector(sectorId);
  const isSectorLive = sector.status === "live";
  const sectorAgents = useMemo(() => agentsBySector(sectorId), [sectorId]);
  const activatedCount = sectorAgents.filter((a) => activatedIds.has(a.id)).length;

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) { toast({ title: "Compare up to 3 agents", variant: "destructive" }); return prev; }
      return [...prev, id];
    });
  };

  const matchesQuery = (a: CatalogAgent) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      (a.oneLiner ?? "").toLowerCase().includes(q) ||
      (a.connectors ?? []).some((c) => c.toLowerCase().includes(q))
    );
  };

  const liveAgents = sectorAgents.filter((a) => a.status === "live" && matchesQuery(a));
  const comingAgents = sectorAgents.filter((a) => a.status !== "live" && matchesQuery(a));

  return (
    <div className="max-w-[1400px] mx-auto">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Agent Marketplace
          </p>
          <h1 className="text-[26px] font-bold text-foreground tracking-tight leading-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            AI agents purpose-built for insurance.
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Real agents that connect to your AMS, your carriers, your inbox — and produce auditable, reviewable work.
            Optionally callable from Claude, ChatGPT, Copilot via MCP for power users.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          {compareIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
              <Layers className="h-3.5 w-3.5" />Compare {compareIds.length}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => router.push("/request-pod")}>
            <Wand2 className="h-3.5 w-3.5" />Request a custom pod
          </Button>
        </div>
      </div>

      {/* ── Sector tabs + search row ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {/* Sector chips */}
        {SECTORS.map((s) => {
          const active = sectorId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => { setMarketplaceView("browse"); setSectorId(s.id as SectorId); setQuery(""); }}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap",
                marketplaceView === "browse" && active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong",
              )}
            >
              <s.icon className="h-3 w-3" />
              {s.shortLabel}
              {s.status === "live" ? (
                <span className={cn(
                  "inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums min-w-[16px] h-4 px-1",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {s.liveAgentCount}
                </span>
              ) : (
                <span className="text-[9.5px] uppercase tracking-wider opacity-50">soon</span>
              )}
            </button>
          );
        })}

        {/* My Agents tab — in-page panel, no route change */}
        <button
          type="button"
          onClick={() => { setMarketplaceView("my-agents"); setQuery(""); }}
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap",
            marketplaceView === "my-agents"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong",
          )}
        >
          My Agents
          {activatedCount > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums min-w-[16px] h-4 px-1",
              marketplaceView === "my-agents"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}>
              {activatedCount}
            </span>
          )}
        </button>

      </div>

      {marketplaceView === "my-agents" ? (
        <MyAgentsPanel
          embedded
          onBrowseMarketplace={() => setMarketplaceView("browse")}
          onAgentsChange={loadActivations}
        />
      ) : (
        <>
      {/* Search bar — own row, right-aligned */}
      <div className="flex justify-end mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="pl-8 h-8 text-[12.5px] w-52"
          />
        </div>
      </div>

      {/* ── Sector not live → waitlist ───────────────────────────── */}
      {!isSectorLive ? (
        <SectorWaitlist sector={sector} onJoinWaitlist={() => setWaitlistOpen(true)} />
      ) : (
        <>
          {/* No results */}
          {!loading && liveAgents.length === 0 && comingAgents.length === 0 && (
            <EmptyState
              icon={Search}
              title="No agents match"
              description="Try a different search term."
              action={<Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>}
            />
          )}

          {/* ── Live agents grouped by job lane ─────────────────── */}
          {loading ? (
            <section className="mb-8">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)}
              </div>
            </section>
          ) : liveAgents.length > 0 && (
            <div className="space-y-7 mb-8">
              {JOB_LANES.filter((l) => l.id !== "explore").map((lane) => {
                const items = liveAgents.filter((a) => a.jobLane === lane.id);
                if (items.length === 0) return null;
                return (
                  <section key={lane.id}>
                    {/* Lane header */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2">
                        <lane.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <h2 className="text-[14px] font-bold text-foreground tracking-tight">
                          {lane.label}
                        </h2>
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-[11px] font-bold text-muted-foreground tabular-nums">
                          {items.length}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5 pl-[22px]">{lane.description}</p>
                    </div>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          activated={activatedIds.has(agent.id)}
                          pending={pendingIds.has(agent.id)}
                          loading={loading}
                          compared={compareIds.includes(agent.id)}
                          onToggleCompare={() => toggleCompare(agent.id)}
                          onActivate={() => handleActivate(agent)}
                          onView={() => router.push(`/marketplace/${agent.id}`)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* ── Coming soon ──────────────────────────────────────── */}
          {comingAgents.length > 0 && (
            <section>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <h2 className="text-[13px] font-bold text-foreground tracking-tight">Coming soon</h2>
                    <span className="inline-flex items-center justify-center min-w-[1.375rem] h-[18px] px-1.5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {comingAgents.length}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground pl-[22px]">
                    On the roadmap. Tell us what you want first.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setRequestText(""); setRequestOpen(true); }}
                  className="shrink-0 text-[12px] text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />Request an agent
                </button>
              </div>
              <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {comingAgents.map((agent, index) => (
                  <ComingSoonCard
                    key={agent.id}
                    agent={agent}
                    emphasizeNotify={index === 0}
                    onView={() => router.push(`/marketplace/${agent.id}`)}
                    onNotify={() => handleActivate(agent)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
        </>
      )}

      {/* ── Compare drawer ───────────────────────────────────────── */}
      <CompareDrawer
        open={compareOpen}
        onOpenChange={setCompareOpen}
        ids={compareIds}
        onClear={() => setCompareIds([])}
        onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
        onActivate={handleActivate}
        activatedIds={activatedIds}
        pendingIds={pendingIds}
      />

      {/* ── Sector waitlist dialog ───────────────────────────────── */}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <sector.icon className="h-5 w-5 text-primary" />
              Join the {sector.label} waitlist
            </DialogTitle>
            <DialogDescription>
              We're shipping agents sector-by-sector with deep integrations. Join the waitlist to influence the roadmap and get early access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Your work email" />
            <Textarea placeholder="What's the #1 workflow you'd want automated first?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitlistOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setWaitlistOpen(false); toast({ title: "On the list", description: "We'll be in touch as soon as the first agent goes live." }); }}>
              Join waitlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request-an-agent dialog ──────────────────────────────── */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />Request an agent
            </DialogTitle>
            <DialogDescription>
              Tell us what you'd want automated. We prioritize agents brokers actually ask for.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="e.g. An agent that handles surplus lines submission to Lloyd's…"
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setRequestOpen(false); setRequestText(""); toast({ title: "Request received", description: "Logged for the roadmap. We'll follow up if we have questions." }); }}>
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Agent card (live) — matches screenshot: small square icon, category
// tag, description, Live dot top-right, settings icon + status footer
// ─────────────────────────────────────────────────────────────────────

function AgentCard({
  agent, activated, pending, loading,
  compared, onToggleCompare, onActivate, onView,
}: {
  agent: CatalogAgent;
  activated: boolean;
  pending: boolean;
  loading: boolean;
  compared: boolean;
  onToggleCompare: () => void;
  onActivate: () => void;
  onView: () => void;
}) {
  const Icon = ICONS[agent.icon] ?? Bot;
  const cantActivateYet = agent.status !== "live" && agent.status !== "beta";

  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden transition-all duration-150",
        activated
          ? "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10"
          : pending
            ? "border-amber-300/50"
            : compared
              ? "border-primary ring-1 ring-primary/20"
              : "hover:border-border-strong hover:shadow-sm hover:-translate-y-px",
      )}
    >
      {/* Live dot — top right: always shows the agent's catalog status, never activation state */}
      <div className="absolute top-3 right-3 z-10">
        {agent.status === "live" ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            LIVE
          </span>
        ) : agent.status === "beta" ? (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">BETA</span>
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">SOON</span>
        )}
      </div>

      {/* Card body */}
      <button onClick={onView} className="text-left p-4 pb-3 flex-1">
        {/* Icon + name + category */}
        <div className="flex items-start gap-3 pr-14 mb-3">
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            activated
              ? "bg-primary text-primary-foreground"
              : "bg-indigo-600 text-white dark:bg-indigo-500",
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[14px] font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            {(agent.category || agent.segment) && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                {agent.category ?? agent.segment}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-[12.5px] text-muted-foreground leading-relaxed line-clamp-3 min-h-[54px]">
          {agent.oneLiner ?? agent.description}
        </p>
      </button>

      {/* Footer — gear icon left, activate/status right */}
      <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
        <button
          onClick={onToggleCompare}
          aria-label={compared ? "Remove from compare" : "Compare"}
          className={cn(
            "h-7 w-7 rounded flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground hover:bg-muted",
            compared && "text-primary bg-primary/10",
          )}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        {activated ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ACTIVE
          </span>
        ) : pending ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            PENDING
          </span>
        ) : (
          <Button
            size="sm"
            variant={cantActivateYet ? "outline" : "primary"}
            onClick={onActivate}
            disabled={loading}
            className="shrink-0 h-7 text-[12px] px-4"
          >
            {cantActivateYet ? "Notify me" : "Activate"}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Agent card skeleton
// ─────────────────────────────────────────────────────────────────────

function AgentCardSkeleton() {
  return (
    <Card className="relative flex flex-col overflow-hidden">
      <div className="absolute top-3 right-3">
        <Skeleton className="h-3.5 w-8 rounded" />
      </div>
      <div className="p-4 pb-3 flex-1 space-y-3">
        <div className="flex items-start gap-3 pr-14">
          <Skeleton className="h-11 w-11 rounded-xl shrink-0 bg-indigo-200/60 dark:bg-indigo-950/40" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <SkeletonLine className="w-3/4 h-3.5" />
            <SkeletonLine className="w-1/3 h-2" />
          </div>
        </div>
        <div className="space-y-1.5 min-h-[54px]">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-5/6" />
          <SkeletonLine className="w-2/3" />
        </div>
      </div>
      <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
        <Skeleton className="h-7 w-7 rounded shrink-0" />
        <Skeleton className="h-7 w-16 rounded" />
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coming soon card — compact horizontal row style matching screenshot
// ─────────────────────────────────────────────────────────────────────

function ComingSoonCard({
  agent,
  emphasizeNotify,
  onView,
  onNotify,
}: {
  agent: CatalogAgent;
  /** First card uses a filled “Notify me” control per marketplace mock. */
  emphasizeNotify?: boolean;
  onView: () => void;
  onNotify: () => void;
}) {
  const Icon = ICONS[agent.icon] ?? Bot;
  return (
    <Card className="group p-3.5 border-border hover:border-border-strong transition-all flex flex-col gap-2">
      <button type="button" onClick={onView} className="text-left flex-1">
        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[12.5px] font-semibold text-foreground leading-tight truncate group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
              {agent.category ?? agent.segment ?? "Agent"}
            </p>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug mt-2">
          {agent.oneLiner ?? agent.description}
        </p>
      </button>
      <div className="flex items-center justify-between pt-0.5 gap-2">
        <StatusPill tone="warning" size="sm">
          Coming soon
        </StatusPill>
        <button
          type="button"
          onClick={onNotify}
          className={cn(
            "shrink-0 flex items-center gap-1 text-[11.5px] font-medium transition-colors",
            emphasizeNotify
              ? "rounded-md bg-muted px-2.5 py-1 text-foreground hover:bg-muted/80"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Bell className="h-3 w-3" />
          Notify me
        </button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sector waitlist
// ─────────────────────────────────────────────────────────────────────

function SectorWaitlist({ sector, onJoinWaitlist }: { sector: ReturnType<typeof getSector>; onJoinWaitlist: () => void }) {
  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-accent/20 to-transparent">
      <div className="p-8 md:p-10">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground border border-border rounded px-2 py-0.5 mb-3">
              {sector.status === "preview" ? "Preview — limited beta" : "On the waitlist"}
            </span>
            <h2 className="text-[28px] md:text-[32px] font-bold text-foreground tracking-tight leading-tight mt-3 mb-2">
              {sector.label}, coming soon.
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl mb-5">
              {sector.tagline} We're shipping sector-by-sector with deep integrations — same MCP layer, same audit trail, same review queue.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary" size="sm" onClick={onJoinWaitlist}>
                <Sparkles className="h-3.5 w-3.5" />Join waitlist
              </Button>
              <Button variant="outline" size="sm" onClick={onJoinWaitlist}>
                <Plus className="h-3.5 w-3.5" />Request an agent
              </Button>
            </div>
          </div>
          {sector.comingSoon && sector.comingSoon.length > 0 && (
            <div className="md:w-[280px] shrink-0 space-y-1.5">
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-2">On the roadmap</p>
              {sector.comingSoon.map((item) => (
                <div key={item} className="flex items-start gap-2 text-[12.5px]">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span className="text-foreground/80">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Compare drawer
// ─────────────────────────────────────────────────────────────────────

function CompareDrawer({
  open, onOpenChange, ids, onClear, onRemove, onActivate, activatedIds, pendingIds,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ids: string[];
  onClear: () => void;
  onRemove: (id: string) => void;
  onActivate: (a: CatalogAgent) => void;
  activatedIds: Set<string>;
  pendingIds: Set<string>;
}) {
  const agents = ids.map((id) => CATALOG.find((a) => a.id === id)).filter(Boolean) as CatalogAgent[];
  if (agents.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col gap-0 p-0 bg-card">
        <SheetHeader className="px-6 py-4 pr-12 border-b border-border">
          <SheetTitle className="text-[17px] font-bold tracking-tight">
            Compare {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            <div className={cn("grid gap-4", agents.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {agents.map((agent) => {
                const Icon = ICONS[agent.icon] ?? Bot;
                const statusMeta = STATUS_META[agent.status];
                return (
                  <div key={agent.id} className="rounded-xl border border-border p-4 relative bg-card">
                    <button
                      className="absolute top-2 right-2 h-6 w-6 rounded hover:bg-muted text-muted-foreground"
                      onClick={() => onRemove(agent.id)}
                      aria-label="Remove from compare"
                    >
                      <X className="h-3.5 w-3.5 mx-auto" />
                    </button>
                    <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center mb-3">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-[13.5px] font-bold tracking-tight leading-tight">{agent.name}</h3>
                    <div className="my-2.5 flex flex-wrap gap-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
                        statusMeta.tone === "success" ? "text-emerald-600 border-emerald-200 bg-emerald-50" : "text-muted-foreground border-border bg-muted",
                      )}>
                        {statusMeta.label}
                      </span>
                      {agent.mcpAvailable && (
                        <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border text-blue-600 border-blue-200 bg-blue-50">MCP</span>
                      )}
                    </div>
                    <CompareRow label="What it does"   value={agent.oneLiner ?? agent.description} />
                    <CompareRow label="Time saved"     value={agent.timeSavedMinutes ? `~${agent.timeSavedMinutes} min/run` : "—"} />
                    <CompareRow label="Used by"        value={agent.usedByCount ? `${agent.usedByCount} tenants` : "—"} />
                    <CompareRow label="Connectors"     value={(agent.connectors ?? []).join(" · ") || "—"} />
                    <CompareRow label="MCP tool"       value={agent.mcpToolName ?? (agent.mcpAvailable ? "Yes" : "No")} mono />
                    <Button
                      variant={activatedIds.has(agent.id) ? "outline" : pendingIds.has(agent.id) ? "secondary" : "primary"}
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => onActivate(agent)}
                      disabled={activatedIds.has(agent.id) || pendingIds.has(agent.id)}
                    >
                      {activatedIds.has(agent.id) ? "Activated" : pendingIds.has(agent.id) ? "Pending" : "Activate"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
        <div className="border-t border-border px-6 py-3 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={onClear}>Clear compare</Button>
          <span className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" />Same audit trail · same review queue
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CompareRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-1.5 border-t border-border/60">
      <p className="text-[9.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-[12px] text-foreground/90", mono && "font-mono text-[11px] break-all")}>{value}</p>
    </div>
  );
}
