'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { agentsApi } from "@/lib/api";
import {
  Sparkles,
  Search,
  CheckCircle2,
  Clock as ClockIcon,
  Clock,
  SendHorizontal,
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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
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

// Custom agent shape from custom_agents table
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

// Icon name → component
const ICONS: Record<string, LucideIcon> = {
  scale: Scale, "shield-check": ShieldCheck, "file-plus": FilePlus,
  "alert-circle": AlertCircle, "file-text": FileText, search: Search,
  "refresh-cw": RefreshCw, "clipboard-check": ClipboardCheck, target: Target,
  "user-check": UserCheck, layers: Layers, mail: Mail, flag: Flag,
  calculator: Calculator, bot: Bot, inbox: Inbox, filter: Filter,
  activity: Activity, "shield-alert": ShieldAlert, "rotate-ccw": RotateCcw,
  "file-check": FileCheck, repeat: Repeat, download: Download,
};


export default function Marketplace() {
  const { toast } = useToast();
  const router = useRouter();

  // Sector + search
  const [sectorId, setSectorId] = useState<SectorId>("insurance");
  const [query, setQuery] = useState("");

  // Activation / pending state from the FastAPI backend.
  // Sets are keyed by agent keyword (catalog agent.id === agents.keyword for live agents).
  const [activatedIds, setActivatedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // catalog keyword → real agents.id (UUID), needed to create access requests.
  const [keywordToId, setKeywordToId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Custom agents ("Built for you by Fideon"). The full custom_agents table is a
  // separate workstream (currently a stub) — see ALIGNMENT_AND_REMAINING_WORK.md §4.6.
  // Until that ships, this section stays empty rather than querying missing columns.
  const [customAgents, setCustomAgents] = useState<CustomAgentRow[]>([]);

  // Compare drawer
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Waitlist + request-an-agent
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
      // custom_agents full schema not yet implemented — intentionally left empty.
      setCustomAgents([]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleActivate = async (agent: CatalogAgent) => {
    if (agent.status !== "live" && agent.status !== "beta") {
      toast({ title: "Not yet available", description: "We'll notify you when this agent goes live.", variant: "default" });
      return;
    }
    const user = await getCurrentUser();
    if (!user) { router.push("/auth"); return; }

    // catalog agent.id === agents.keyword for live agents; resolve to the real UUID.
    const agentId = keywordToId[agent.id];
    if (!agentId) {
      toast({ title: "Not yet available", description: "This agent isn't in the catalog yet.", variant: "default" });
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
  const stats = useMemo(() => sectorStats(sectorId), [sectorId]);
  const activatedCount = sectorAgents.filter((a) => activatedIds.has(a.id)).length;

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast({ title: "Compare up to 3 agents", variant: "destructive" });
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <div className="max-w-[1500px] mx-auto">
      {/* Hero / unique selling point */}
      <PageHeader
        eyebrow="Agent marketplace"
        title="AI agents purpose-built for insurance."
        description={
          <>
            Real agents that connect to your AMS, your carriers, your inbox &mdash; and produce auditable, reviewable work.
            Optionally callable from Claude, ChatGPT, Copilot via MCP for power users.
          </>
        }
        icon={Sparkles}
        actions={
          <div className="flex items-center gap-2">
            {compareIds.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
                <Layers className="h-3.5 w-3.5" />Compare {compareIds.length}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => router.push("/request-pod")}>
              <Wand2 className="h-3.5 w-3.5" />Request a custom pod
            </Button>
          </div>
        }
      />

      {/* Sector chips — compact, single row */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {SECTORS.map((s) => {
          const active = sectorId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { setSectorId(s.id); setQuery(""); }}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-semibold transition-colors whitespace-nowrap",
                active
                  ? "border-primary bg-accent text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong",
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.shortLabel}
              {s.status === "live" && (
                <span className="text-[10.5px] font-bold tabular-nums opacity-80">{s.liveAgentCount}</span>
              )}
              {s.status !== "live" && (
                <span className="text-[10px] uppercase tracking-wider opacity-60">soon</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sector NOT live → waitlist hero */}
      {!isSectorLive ? (
        <SectorWaitlist sector={sector} onJoinWaitlist={() => setWaitlistOpen(true)} />
      ) : (
        <>
          {/* Lone search — no other filters */}
          {(stats.total > 6 || query) && (
            <div className="relative max-w-md mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents…"
                className="pl-9 h-9 text-[13px]"
              />
            </div>
          )}

          {/* Split into two clean sections */}
          {(() => {
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
            const live = sectorAgents.filter((a) => a.status === "live" && matchesQuery(a));
            const coming = sectorAgents.filter((a) => a.status !== "live" && matchesQuery(a));

            if (live.length === 0 && coming.length === 0) {
              return (
                <EmptyState
                  icon={Search}
                  title="No agents match"
                  description="Try a different search term."
                  action={<Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>}
                />
              );
            }

            return (
              <>
                {/* BUILT FOR YOU BY FIDEON — engineered custom pods */}
                {customAgents.length > 0 && sectorId === "insurance" && (
                  <section className="mb-10">
                    <SectionHeader
                      title="Built for you by Fideon"
                      description="Engineered + QA'd by the Fideon team. Same governance as catalog pods."
                      count={customAgents.length}
                      icon={Wand2}
                      actions={
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-primary"
                          onClick={() => router.push("/request-pod")}
                        >
                          <Plus className="h-3 w-3" />Request another
                        </Button>
                      }
                    />
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {customAgents.map((ca) => (
                        <CustomAgentCard
                          key={ca.id}
                          agent={ca}
                          onOpen={() => router.push(`/my-models`)}
                          onManage={() => router.push("/my-models")}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* LIVE pods — grouped by job-to-be-done */}
                {live.length > 0 && (
                  <section className="mb-10 space-y-8">
                    {JOB_LANES.filter((l) => l.id !== "explore").map((lane) => {
                      const items = live.filter((a) => a.jobLane === lane.id);
                      if (items.length === 0) return null;
                      return (
                        <div key={lane.id}>
                          <SectionHeader
                            title={lane.label}
                            description={lane.description}
                            count={items.length}
                            icon={lane.icon}
                          />
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* COMING SOON — compact cards, lighter weight */}
                {coming.length > 0 && (
                  <section>
                    <SectionHeader
                      title="Coming soon"
                      description="On the roadmap. Tell us what you want first."
                      count={coming.length}
                      icon={Clock}
                      actions={
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-primary"
                          onClick={() => { setRequestText(""); setRequestOpen(true); }}
                        >
                          <Plus className="h-3 w-3" />Request an agent
                        </Button>
                      }
                    />
                    <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {coming.map((agent) => (
                        <ComingSoonCard
                          key={agent.id}
                          agent={agent}
                          onView={() => router.push(`/marketplace/${agent.id}`)}
                          onNotify={() => handleActivate(agent)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Compare drawer */}
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

      {/* Sector waitlist dialog */}
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

      {/* Request-an-agent dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Request an agent
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
// Custom agent card — user-compiled from an SOP
// ─────────────────────────────────────────────────────────────────────

function CustomAgentCard({
  agent,
  onOpen,
  onManage,
}: {
  agent: CustomAgentRow;
  onOpen: () => void;
  onManage: () => void;
}) {
  const Icon = ICONS[agent.icon] ?? Bot;
  const lastRun = agent.last_run_at
    ? new Date(agent.last_run_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-all duration-200 border-primary/30 bg-gradient-to-br from-accent/30 to-transparent hover:border-primary/50 hover:shadow-elevated hover:-translate-y-0.5">
      {/* Status ribbon */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
        <StatusPill tone="info" size="sm">
          <Wand2 className="h-2.5 w-2.5" />
          Engineered by Fideon
        </StatusPill>
        {agent.automation_status === "ready" && (
          <StatusPill tone="primary" size="sm">
            <Code2 className="h-2.5 w-2.5" />
            Browser-automated
          </StatusPill>
        )}
        {agent.is_active ? (
          <StatusPill tone="success" dot size="sm">Active</StatusPill>
        ) : (
          <StatusPill tone="warning" size="sm">
            <PauseCircle className="h-2.5 w-2.5" />Paused
          </StatusPill>
        )}
      </div>

      <button onClick={onOpen} className="text-left p-5 pb-3 flex-1">
        <div className="flex items-start gap-3 mb-3 pr-24">
          <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
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
          {agent.description || "Custom agent compiled from your SOP."}
        </p>
      </button>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span>{lastRun ? `Last run · ${lastRun}` : "Never run yet"}</span>
        <div className="flex-1" />
        <Button size="xs" variant="outline" onClick={onManage}>Manage</Button>
        <Button size="xs" variant="primary" onClick={onOpen}>
          <Play className="h-3 w-3" />Run
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coming soon card — compact, no proof points (we don't have any yet)
// ─────────────────────────────────────────────────────────────────────

function ComingSoonCard({
  agent,
  onView,
  onNotify,
}: {
  agent: CatalogAgent;
  onView: () => void;
  onNotify: () => void;
}) {
  const Icon = ICONS[agent.icon] ?? Bot;
  return (
    <Card className="group p-4 hover:border-border-strong hover:shadow-card transition-all flex flex-col">
      <button onClick={onView} className="text-left flex-1">
        <div className="flex items-start gap-2.5 mb-2">
          <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-foreground leading-tight truncate group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5 truncate">
              {agent.category ?? agent.segment ?? "Agent"}
            </p>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug min-h-[28px]">
          {agent.oneLiner ?? agent.description}
        </p>
      </button>
      <div className="mt-3 flex items-center justify-between">
        <StatusPill tone="warning" size="sm">Coming soon</StatusPill>
        <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-foreground -mr-1.5" onClick={onNotify}>
          Notify me
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Agent card (live)
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
  const statusMeta = STATUS_META[agent.status];

  const cantActivateYet = agent.status !== "live" && agent.status !== "beta";

  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden transition-all duration-200",
        activated
          ? "border-primary/40 bg-accent/30 ring-1 ring-primary/10"
          : pending
            ? "border-warning/40"
            : compared
              ? "border-primary ring-1 ring-primary/30"
              : "hover:border-border-strong hover:shadow-elevated hover:-translate-y-0.5",
      )}
    >
      {/* Status ribbon */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
        <StatusPill tone={statusMeta.tone} dot={statusMeta.tone === "success"} pulse={agent.status === "live" && !activated} size="sm">
          {statusMeta.label}
        </StatusPill>
        {activated && (
          <StatusPill tone="success" dot size="sm">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Active
          </StatusPill>
        )}
        {pending && !activated && (
          <StatusPill tone="warning" dot size="sm">
            <ClockIcon className="h-2.5 w-2.5" />
            Pending
          </StatusPill>
        )}
      </div>

      <button onClick={onView} className="text-left p-5 pb-3 flex-1">
        <div className="flex items-start gap-3 mb-3 pr-24">
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            activated
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground",
          )}>
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
          {agent.oneLiner ?? agent.description}
        </p>
      </button>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
        <button
          onClick={onToggleCompare}
          aria-label={compared ? "Remove from compare" : "Add to compare"}
          className={cn(
            "h-7 w-7 rounded-md border flex items-center justify-center transition-colors shrink-0",
            compared
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border-strong",
          )}
        >
          <Layers className="h-3 w-3" />
        </button>
        <div className="flex-1" />
        <Button
          size="xs"
          variant={activated ? "outline" : pending ? "secondary" : cantActivateYet ? "soft" : "primary"}
          onClick={onActivate}
          disabled={loading || activated}
          className="shrink-0"
        >
          {activated ? (
            <><CheckCircle2 className="h-3 w-3" />Activated</>
          ) : pending ? (
            <><ClockIcon className="h-3 w-3" />Pending</>
          ) : cantActivateYet ? (
            <>Notify me</>
          ) : (
            <><SendHorizontal className="h-3 w-3" />Activate</>
          )}
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sector waitlist (for not-yet-live sectors)
// ─────────────────────────────────────────────────────────────────────

function SectorWaitlist({ sector, onJoinWaitlist }: { sector: ReturnType<typeof getSector>; onJoinWaitlist: () => void }) {
  return (
    <Card className="overflow-hidden bg-gradient-hero border-primary/15">
      <div className="p-8 md:p-10">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-1">
            <StatusPill tone={sector.status === "preview" ? "warning" : "neutral"} dot>
              {sector.status === "preview" ? "Preview — limited beta" : "On the waitlist"}
            </StatusPill>
            <h2 className="font-display text-[28px] md:text-[32px] font-bold text-foreground tracking-tight leading-tight mt-3 mb-2">
              {sector.label}, coming soon.
            </h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-xl mb-5">
              {sector.tagline} We're shipping sector-by-sector with deep integrations — same MCP layer, same audit trail, same review queue. Join the waitlist to influence what we build first.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary" size="lg" onClick={onJoinWaitlist}>
                <Sparkles className="h-4 w-4" />Join waitlist
              </Button>
              <Button variant="outline" size="lg" onClick={onJoinWaitlist}>
                <Plus className="h-4 w-4" />Request an agent
              </Button>
            </div>
          </div>
          {sector.comingSoon && sector.comingSoon.length > 0 && (
            <div className="md:w-[300px] shrink-0 space-y-1.5">
              <p className="text-eyebrow text-muted-foreground mb-1">On the roadmap</p>
              {sector.comingSoon.map((item) => (
                <div key={item} className="flex items-start gap-2 text-[13px]">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span className="text-foreground/85">{item}</span>
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
        <SheetHeader className="px-6 py-4 pr-12 border-b border-border bg-gradient-hero">
          <SheetTitle className="font-display text-[18px] font-bold tracking-tight">
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
                    <div className={cn("h-10 w-10 rounded-xl bg-accent text-primary flex items-center justify-center mb-3")}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-[14px] font-bold tracking-tight leading-tight">
                      {agent.name}
                    </h3>
                    <div className="my-3 flex flex-wrap gap-1">
                      <StatusPill tone={statusMeta.tone} size="sm">{statusMeta.label}</StatusPill>
                      {agent.mcpAvailable && <StatusPill tone="info" size="sm">MCP</StatusPill>}
                    </div>
                    <CompareRow label="What it does"   value={agent.oneLiner ?? agent.description} />
                    <CompareRow label="Time saved"     value={agent.timeSavedMinutes ? `~${agent.timeSavedMinutes} min/run` : "—"} />
                    <CompareRow label="Used by"        value={agent.usedByCount ? `${agent.usedByCount} tenants` : "—"} />
                    <CompareRow label="Connectors"     value={(agent.connectors ?? []).join(" · ") || "—"} />
                    <CompareRow label="MCP tool"       value={agent.mcpToolName ?? (agent.mcpAvailable ? "Yes" : "No")} mono />
                    <CompareRow label="Pricing"        value={agent.pricingHint ?? "—"} />
                    <Button
                      variant={activatedIds.has(agent.id) ? "outline" : pendingIds.has(agent.id) ? "secondary" : "primary"}
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => onActivate(agent)}
                      disabled={activatedIds.has(agent.id) || pendingIds.has(agent.id)}
                    >
                      {activatedIds.has(agent.id)
                        ? <><CheckCircle2 className="h-3.5 w-3.5" />Activated</>
                        : pendingIds.has(agent.id)
                          ? <><ClockIcon className="h-3.5 w-3.5" />Pending</>
                          : <><SendHorizontal className="h-3.5 w-3.5" />Activate</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
        <div className="border-t border-border px-6 py-3 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={onClear}>Clear compare</Button>
          <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Same audit trail · same review queue · same confidence band
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CompareRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-2 border-t border-border/60">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-[12.5px] text-foreground/90", mono && "font-mono text-[11.5px] break-all")}>{value}</p>
    </div>
  );
}

