'use client';
import { useRouter } from 'next/navigation';
// Admin · Custom Pod Requests
//
// Fideon ops dashboard for incoming custom-pod requests.
// Engineering moves rows through the lifecycle (in_review → building →
// ready_to_install). When the pod is built, the admin links the
// resulting custom_agents row; the user then sees Install in their
// /request-pod page.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Shield, Hammer, ClipboardCheck, Inbox, CheckCircle2, PlayCircle, XCircle,
  Loader2, Search, ArrowRight, ExternalLink, Calendar, Building2, Mail, FileText, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

type PodStatus =
  | "submitted"
  | "in_review"
  | "building"
  | "ready_to_install"
  | "installed"
  | "rejected";

interface PodRequest {
  id: string;
  user_id: string;
  title: string;
  sop_text: string | null;
  sop_file_url: string | null;
  target_carriers: string[];
  priority: string;
  expected_outcome: string | null;
  desired_eta: string | null;
  status: PodStatus;
  status_notes: string | null;
  contact_email: string | null;
  custom_agent_id: string | null;
  requested_at: string;
  updated_at: string;
}

interface CustomAgentOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS: { id: PodStatus; label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" }[] = [
  { id: "submitted",        label: "Submitted",        tone: "neutral" },
  { id: "in_review",        label: "In review",        tone: "primary" },
  { id: "building",         label: "Building",         tone: "warning" },
  { id: "ready_to_install", label: "Ready to install", tone: "success" },
  { id: "installed",        label: "Installed",        tone: "success" },
  { id: "rejected",         label: "Rejected",         tone: "danger"  },
];

export default function AdminPodRequests() {
  const router = useRouter();
  const { toast } = useToast();
  const [requests, setRequests] = useState<PodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PodStatus>("all");
  const [active, setActive] = useState<PodRequest | null>(null);

  // For linking custom_agents to requests
  const [customAgents, setCustomAgents] = useState<CustomAgentOption[]>([]);

  useEffect(() => {
    void load();
    void loadCustomAgents();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_pod_requests" as any)
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load", description: error.message, variant: "destructive" });
    }
    setRequests((data ?? []) as unknown as PodRequest[]);
    setLoading(false);
  };

  const loadCustomAgents = async () => {
    const { data } = await supabase
      .from("custom_agents" as any)
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(200);
    setCustomAgents((data ?? []) as unknown as CustomAgentOption[]);
  };

  const updateRequest = async (id: string, patch: Partial<PodRequest>) => {
    const { error } = await supabase
      .from("custom_pod_requests" as any)
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (active && active.id === id) setActive({ ...active, ...patch });
    return true;
  };

  // ───────────── derived ─────────────

  const stats = useMemo(() => {
    const s = { submitted: 0, in_review: 0, building: 0, ready: 0, installed: 0, rejected: 0 };
    for (const r of requests) {
      if (r.status === "submitted")          s.submitted++;
      else if (r.status === "in_review")     s.in_review++;
      else if (r.status === "building")      s.building++;
      else if (r.status === "ready_to_install") s.ready++;
      else if (r.status === "installed")     s.installed++;
      else if (r.status === "rejected")      s.rejected++;
    }
    return s;
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.expected_outcome ?? "").toLowerCase().includes(q) ||
        (r.contact_email ?? "").toLowerCase().includes(q) ||
        (r.target_carriers ?? []).some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [requests, search, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Admin · Fideon ops"
        title="Custom pod requests"
        description="Incoming workflow requests from brokers. Triage, scope, build, ship."
        icon={Shield}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Submitted" value={stats.submitted} icon={Inbox}           tone={stats.submitted > 0 ? "warning" : "default"} />
        <KpiCard label="In review" value={stats.in_review} icon={ClipboardCheck}  tone="primary" />
        <KpiCard label="Building"  value={stats.building}  icon={Hammer}          tone="primary" />
        <KpiCard label="Ready"     value={stats.ready}     icon={CheckCircle2}    tone="success" />
        <KpiCard label="Installed" value={stats.installed} icon={PlayCircle}      tone="success" />
        <KpiCard label="Rejected"  value={stats.rejected}  icon={XCircle}         tone={stats.rejected > 0 ? "danger" : "default"} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, outcome, carrier, email…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_140px_160px_120px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Title / carriers</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Linked agent</span>
          <span>Submitted</span>
          <span></span>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No requests match.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const statusMeta = STATUS_OPTIONS.find((s) => s.id === r.status);
              const linkedAgentName = customAgents.find((c) => c.id === r.custom_agent_id)?.name;
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[1fr_120px_120px_140px_160px_120px] gap-3 px-5 py-3 items-center hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setActive(r)}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.target_carriers.length > 0 ? r.target_carriers.join(", ") : "no carriers specified"}
                      {r.contact_email && ` · ${r.contact_email}`}
                    </p>
                  </div>
                  <span className="text-[11.5px] font-medium capitalize">{r.priority}</span>
                  <StatusPill tone={statusMeta?.tone ?? "neutral"} size="sm">{statusMeta?.label ?? r.status}</StatusPill>
                  <span className="text-[11.5px] truncate text-muted-foreground">
                    {linkedAgentName ?? <em className="text-muted-foreground/60">none</em>}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground tabular-nums">
                    {formatDistanceToNow(new Date(r.requested_at), { addSuffix: true })}
                  </span>
                  <Button variant="ghost" size="xs" className="justify-self-end">
                    Open <ArrowRight className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Drawer */}
      <Sheet open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          {active && (
            <>
              <SheetHeader className="px-6 py-4 pr-12 border-b border-border bg-gradient-hero">
                <SheetTitle className="font-display text-[18px] font-bold tracking-tight">
                  {active.title}
                </SheetTitle>
                <p className="text-[12px] text-muted-foreground mt-1">
                  From {active.contact_email ?? "—"} · submitted {format(new Date(active.requested_at), "MMM d, yyyy")}
                </p>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-5">
                  {/* Status + linking */}
                  <Card className="p-4 space-y-3 bg-muted/30 border-primary/15">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Status</p>
                        <Select
                          value={active.status}
                          onValueChange={(v) => updateRequest(active.id, { status: v as PodStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Linked agent</p>
                        <Select
                          value={active.custom_agent_id ?? "none"}
                          onValueChange={(v) => updateRequest(active.id, { custom_agent_id: v === "none" ? null : v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a custom agent…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><em>None</em></SelectItem>
                            {customAgents.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Notes back to user</p>
                      <Textarea
                        value={active.status_notes ?? ""}
                        onChange={(e) => setActive({ ...active, status_notes: e.target.value })}
                        onBlur={() => updateRequest(active.id, { status_notes: active.status_notes })}
                        rows={2}
                        placeholder="e.g. ‘Need carrier credentials before we can build — replied via email.'"
                        className="text-[13px]"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/agent-builder?requestId=${active.id}`)}
                      >
                        <Hammer className="h-3.5 w-3.5" />Build in wizard
                      </Button>
                      <a
                        href={`mailto:${active.contact_email ?? ""}`}
                        className={cn("text-[12px] font-semibold inline-flex items-center gap-1 ml-auto text-primary hover:underline", !active.contact_email && "pointer-events-none opacity-50")}
                      >
                        <Mail className="h-3.5 w-3.5" />Email broker
                      </a>
                    </div>
                  </Card>

                  {/* Submission detail */}
                  <SectionHeader title="Submission" icon={FileText} />
                  <Field label="Priority" value={active.priority} />
                  <Field label="Target carriers" value={active.target_carriers.join(", ") || "—"} icon={Building2} />
                  <Field
                    label="Desired by"
                    value={active.desired_eta ? format(new Date(active.desired_eta), "MMM d, yyyy") : "Not specified"}
                    icon={Calendar}
                  />
                  <Field label="Expected outcome" value={active.expected_outcome ?? "—"} multiline />
                  <Field label="SOP" value={active.sop_text ?? "(no SOP text)"} multiline mono />
                  {active.sop_file_url && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Link2 className="h-3 w-3 text-primary" />
                      <span className="font-mono truncate">{active.sop_file_url}</span>
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value, multiline, mono, icon: Icon }: { label: string; value: string; multiline?: boolean; mono?: boolean; icon?: any }) {
  return (
    <div className="py-1">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      {multiline ? (
        <pre className={cn(
          "text-[12.5px] text-foreground/90 whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-md p-3 border border-border max-h-[300px] overflow-auto",
          mono && "font-mono text-[11.5px]",
        )}>{value}</pre>
      ) : (
        <p className="text-[12.5px] text-foreground/90">{value}</p>
      )}
    </div>
  );
}
