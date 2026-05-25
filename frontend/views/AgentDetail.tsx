'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Plug,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Sparkles,
  Play,
  ShieldCheck,
  Lock,
  History,
  Copy,
  Check,
  Mail,
  TerminalSquare,
  Zap,
  Layers,
  ArrowRight,
  Building2,
  type LucideIcon,
  ShieldCheck as ShieldCheckIcon,
  FilePlus,
  AlertCircle,
  FileText,
  Search,
  RefreshCw,
  ClipboardCheck,
  Target,
  UserCheck,
  Flag,
  Calculator,
  Inbox,
  Filter,
  Activity,
  ShieldAlert,
  RotateCcw,
  FileCheck,
  Repeat,
  Download,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import { CATALOG, getAgent, type CatalogAgent } from "@/lib/agentCatalog";
import { STATUS_META, getJobLane, getSector } from "@/lib/sectors";
import { InstallPodDialog } from "@/components/pods/InstallPodDialog";
import {
  fetchPodBySlug, fetchMyInstallations, uninstallPod,
  type PodDefinition, type InstallationWithRuntime,
} from "@/lib/pods";

const ICONS: Record<string, LucideIcon> = {
  scale: Scale, "shield-check": ShieldCheckIcon, "file-plus": FilePlus,
  "alert-circle": AlertCircle, "file-text": FileText, search: Search,
  "refresh-cw": RefreshCw, "clipboard-check": ClipboardCheck, target: Target,
  "user-check": UserCheck, layers: Layers, mail: Mail, flag: Flag,
  calculator: Calculator, bot: Bot, inbox: Inbox, filter: Filter,
  activity: Activity, "shield-alert": ShieldAlert, "rotate-ccw": RotateCcw,
  "file-check": FileCheck, repeat: Repeat, download: Download,
};

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
const MCP_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/mcp-server`;

export default function AgentDetail() {
  const _p = useParams(); const agentId = Array.isArray(_p?.agentId) ? _p.agentId[0] : _p?.agentId;
  const agent = agentId ? getAgent(agentId) : undefined;
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [podDef, setPodDef] = useState<PodDefinition | null>(null);
  const [install, setInstall] = useState<InstallationWithRuntime | null>(null);
  const [installOpen, setInstallOpen] = useState(false);

  const installed = !!install && install.status !== "uninstalled";
  const installStatus = install?.status ?? null;

  useEffect(() => {
    if (!agentId) return;
    void load(agentId);
  }, [agentId]);

  const load = async (id: string) => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) { setLoading(false); return; }
    const [def, mine] = await Promise.all([fetchPodBySlug(id), fetchMyInstallations()]);
    setPodDef(def);
    setInstall(mine.find((m) => m.pod?.slug === id || m.pod_definition_id === def?.id) ?? null);
    setLoading(false);
  };

  const handleInstall = async () => {
    if (!agent) return;
    if (agent.status !== "live" && agent.status !== "beta") {
      toast({ title: "Not yet available", description: "We'll notify you when this agent goes live." });
      return;
    }
    const user = await getCurrentUser();
    if (!user) { router.push("/auth"); return; }
    setInstallOpen(true);
  };

  const handleUninstall = async () => {
    if (!install) return;
    const res = await uninstallPod(install.id);
    if (res.error) { toast({ title: "Uninstall failed", description: res.error, variant: "destructive" }); return; }
    toast({ title: "Uninstalled", description: `${agent?.name} was removed.` });
    if (agentId) void load(agentId);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
    toast({ title: "Copied" });
  };

  if (!agent) {
    return (
      <div className="max-w-3xl mx-auto">
        <EmptyState
          icon={Bot}
          title="Agent not found"
          description="The agent you're looking for doesn't exist or has been removed from the marketplace."
          action={
            <Button variant="primary" onClick={() => router.push("/marketplace")}>
              <ArrowLeft className="h-4 w-4" />Back to marketplace
            </Button>
          }
        />
      </div>
    );
  }

  const Icon = ICONS[agent.icon] ?? Bot;
  const statusMeta = STATUS_META[agent.status];
  const lane = getJobLane(agent.jobLane);
  const sector = getSector(agent.sector);
  const cantActivateYet = agent.status !== "live" && agent.status !== "beta";

  // Related agents — same lane in the same sector
  const related = CATALOG
    .filter((a) => a.id !== agent.id && a.sector === agent.sector && a.jobLane === agent.jobLane)
    .slice(0, 3);

  const claudePromptExample = agent.samplePrompt ?? `Run the ${agent.name.toLowerCase()} for ABC Hardware`;
  const mcpJson = JSON.stringify({
    mcpServers: { fideon: { url: MCP_URL, headers: { Authorization: "Bearer YOUR_TOKEN" } } },
  }, null, 2);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to marketplace
      </Link>

      <PageHeader
        eyebrow={`${sector.label} · ${lane.label}`}
        title={agent.name}
        description={agent.oneLiner ?? agent.description}
        actions={
          <>
            {!cantActivateYet && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/pod/${agent.id}?tab=run`)}>
                <Play className="h-3.5 w-3.5" />Try a sample run
              </Button>
            )}
            {installed ? (
              <Button variant="outline" size="lg" onClick={handleUninstall}>
                {installStatus === "running"
                  ? <><CheckCircle2 className="h-4 w-4 text-success" />Installed · Uninstall</>
                  : <><Clock className="h-4 w-4" />{installStatus ?? "Syncing"} · Uninstall</>}
              </Button>
            ) : (
              <Button variant="primary" size="lg" disabled={loading} onClick={handleInstall}>
                {cantActivateYet ? <>Notify me</> : <><Zap className="h-4 w-4" />Install agent</>}
              </Button>
            )}
          </>
        }
      />

      {/* Hero status row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="h-12 w-12 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
          <Icon className="h-6 w-6" />
        </div>
        <StatusPill tone={statusMeta.tone} dot={statusMeta.tone === "success"} pulse={agent.status === "live"} size="lg">
          {statusMeta.label}
        </StatusPill>
        {agent.mcpAvailable && (
          <StatusPill tone="info" size="lg">
            <Plug className="h-3 w-3" />
            MCP-callable
          </StatusPill>
        )}
        {agent.pricingHint && (
          <StatusPill tone="primary" size="lg">{agent.pricingHint}</StatusPill>
        )}
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Avg. time saved"
          value={agent.timeSavedMinutes ?? "—"}
          suffix={agent.timeSavedMinutes ? "min/run" : undefined}
          icon={Clock}
          tone="success"
        />
        <KpiCard
          label="Used by"
          value={agent.usedByCount ?? "—"}
          suffix={agent.usedByCount ? "tenants" : undefined}
          icon={Building2}
          tone="primary"
        />
        <KpiCard
          label="Connectors"
          value={agent.connectors?.length ?? 0}
          icon={Plug}
          tone="primary"
          hint={agent.connectors?.slice(0, 2).join(" · ")}
        />
        <KpiCard
          label="Status"
          value={statusMeta.label}
          icon={Activity}
          tone={statusMeta.tone === "success" ? "success" : statusMeta.tone === "primary" ? "primary" : "warning"}
          hint={statusMeta.description}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Left column — what it does, sample, MCP */}
        <div className="space-y-6">
          {/* Demo placeholder */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                <h3 className="font-display text-[15px] font-semibold tracking-tight">See it run</h3>
              </div>
              {!cantActivateYet && (
                <Button variant="ghost" size="xs" className="text-primary" onClick={() => router.push(`/pod/${agent.id}?tab=run`)}>
                  Try it now <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="aspect-video bg-gradient-hero relative flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow mb-3">
                  <Play className="h-6 w-6 fill-current" />
                </div>
                <p className="font-display text-[15px] font-semibold text-foreground">Demo recording</p>
                <p className="text-[12.5px] text-muted-foreground mt-1 max-w-xs mx-auto">
                  30-second walkthrough of {agent.name} in action — opens its Run workspace.
                </p>
              </div>
            </div>
          </Card>

          {/* Sample input/output */}
          {(agent.samplePrompt || agent.sampleOutput) && (
            <Card>
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2 mb-1">
                  <TerminalSquare className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-[15px] font-semibold tracking-tight">Sample run</h3>
                </div>
                <p className="text-[12px] text-muted-foreground">A real interaction — same response shape you'll get in production.</p>
              </div>
              <div className="p-5 space-y-4">
                {agent.samplePrompt && (
                  <div>
                    <p className="text-eyebrow text-muted-foreground mb-2">User input</p>
                    <div className="rounded-lg border border-border bg-accent/40 px-4 py-3">
                      <p className="text-[13.5px] text-foreground/90">{agent.samplePrompt}</p>
                    </div>
                  </div>
                )}
                {agent.sampleOutput && (
                  <div>
                    <p className="text-eyebrow text-muted-foreground mb-2">Agent output</p>
                    <pre className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-[12.5px] font-mono whitespace-pre-wrap leading-[1.6] text-foreground/90">
{agent.sampleOutput}
                    </pre>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* MCP usage — optional add-on */}
          {agent.mcpAvailable && (
            <Card>
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-display text-[15px] font-semibold tracking-tight">Optional: call this agent from your AI assistant</h3>
                </div>
                <p className="text-[12.5px] text-muted-foreground mt-1">
                  This agent is also available as an MCP tool. Power users can call it from Claude, ChatGPT, Copilot, or Cursor &mdash; same auth, same audit trail.
                </p>
              </div>
              <div className="p-5 space-y-4">
                {agent.mcpToolName && (
                  <div>
                    <p className="text-eyebrow text-muted-foreground mb-1.5">MCP tool name</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground/90">
                        {agent.mcpToolName}
                      </code>
                      <Button variant="outline" size="icon-sm" onClick={() => copy(agent.mcpToolName!, "tool")}>
                        {copied === "tool" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-1.5">Example prompt (Claude / ChatGPT / Copilot)</p>
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <p className="text-[13px] text-foreground/90 italic">"{claudePromptExample}"</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    The result lands in your assistant chat and in your review queue here.
                  </p>
                </div>
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-1.5">Claude config snippet</p>
                  <div className="relative">
                    <pre className="rounded-lg border border-border bg-card p-3 text-[11.5px] font-mono overflow-auto whitespace-pre">
{mcpJson}
                    </pre>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="absolute top-2 right-2"
                      onClick={() => copy(mcpJson, "json")}
                    >
                      {copied === "json" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <Button variant="primary" size="sm" className="w-full" onClick={() => router.push("/connect")}>
                  <Plug className="h-3.5 w-3.5" />Open Connect to set up
                </Button>
              </div>
            </Card>
          )}

          {/* What it does — extended */}
          <Card>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-display text-[15px] font-semibold tracking-tight">About this agent</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[14px] text-foreground/90 leading-[1.65]">
                {agent.description}
              </p>
              <div>
                <p className="text-eyebrow text-muted-foreground mb-2">Best for</p>
                <p className="text-[13.5px] text-foreground/85">{lane.brokerWords}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right rail — connectors, security, related */}
        <div className="space-y-4">
          {/* Connectors */}
          {agent.connectors && agent.connectors.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[13.5px] font-semibold tracking-tight flex items-center gap-2">
                  <Plug className="h-3.5 w-3.5 text-primary" />
                  Connects to
                </h3>
              </div>
              <div className="p-4 flex flex-wrap gap-1.5">
                {agent.connectors.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-[11.5px] font-medium text-foreground/85"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Security & audit */}
          <Card className="bg-success/5 border-success/20">
            <div className="px-4 py-3 border-b border-success/20">
              <h3 className="text-[13.5px] font-semibold tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Trust & audit
              </h3>
            </div>
            <div className="p-4 space-y-2.5">
              <TrustRow icon={Lock}    label="Tenant-isolated"    value="Your data, your tenant only" />
              <TrustRow icon={History} label="Every action logged" value="Immutable audit trail in Decisions" />
              <TrustRow icon={ShieldCheck} label="Human-in-loop"   value="Low-confidence runs go to Review Queue" />
              <TrustRow icon={Plug}    label="Reversible"          value="Approve, edit, or reject every output" />
            </div>
          </Card>

          {/* Related agents */}
          {related.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[13.5px] font-semibold tracking-tight flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  Pairs well with
                </h3>
              </div>
              <div className="divide-y divide-border">
                {related.map((other) => {
                  const OtherIcon = ICONS[other.icon] ?? Bot;
                  return (
                    <Link
                      key={other.id}
                      href={`/marketplace/${other.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
                        <OtherIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {other.name}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground line-clamp-1">{other.oneLiner ?? other.description}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      <InstallPodDialog
        pod={podDef}
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={() => agentId && load(agentId)}
      />
    </div>
  );
}

function TrustRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-foreground">{label}</p>
        <p className="text-[11.5px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
