'use client';
import { useSearchParams, useRouter } from 'next/navigation';
// ─────────────────────────────────────────────────────────────────────────
// Inbox — operational triage of agent outputs.
// MRM / decision-review items live separately under /review-queue.
//
// Design goals (the "great product nobody else built"):
//   1. Confidence-graded inline actions: high-conf items = one-click approve
//      from the list. Medium = quick check. Low = full detail required.
//   2. Smart batching banner: if 5+ items share an agent + carrier, offer a
//      one-click batch action.
//   3. Per-row Claude affordance: a tiny icon that opens the assistant with
//      the equivalent Claude prompt. Teaches brokers to delegate to Claude.
//   4. Auto-handle rules entry point: a top-bar link to a config modal that
//      defines policies like "auto-approve quotes < $X from carrier Y".
//   5. Optional reading pane (hidden by default → list takes full width).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox as InboxIcon,
  Mail,
  AlertCircle,
  Activity,
  CheckCircle2,
  XCircle,
  Search,
  Sparkles,
  Send,
  CalendarClock,
  RefreshCw,
  FileCheck2,
  GitCompareArrows,
  FileSearch,
  ShieldCheck,
  Workflow as WorkflowIcon,
  Zap,
  Loader2,
  Layers,
  Wand2,
  Settings2,
  PanelRight,
  PanelRightClose,
  X,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useAssistant } from "@/components/shell/AssistantSidecar";

// ───────────────────────────── types ─────────────────────────────

type FilterKind = "all" | "needs_you" | "live" | "done";
type TypeKind = "all" | "quote" | "renewal" | "submission" | "claim" | "email";
type Confidence = "high" | "medium" | "low";

interface InboxRow {
  id: string;
  type: string;
  status: string;
  priority: "low" | "normal" | "high";
  title: string;
  subtitle: string | null;
  summary: string | null;
  pod_name: string | null;
  source: string;
  primary_action_label: string | null;
  secondary_action_label: string | null;
  acted_at: string | null;
  action_taken: string | null;
  created_at: string;
  payload: Record<string, any>;
}

interface EmailRow {
  id: string;
  from: string;
  fromEmail: string;
  carrier: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  attachments: { name: string; type: string; size: string }[];
  tags: string[];
}

interface UnifiedRow {
  uniqueKey: string;
  source: "inbox" | "email";
  bucket: "needs_you" | "live" | "done";
  typeKind: Exclude<TypeKind, "all">;
  confidence: Confidence;
  title: string;
  subtitle: string;
  agent: string;
  carrier: string | null;
  createdAt: string;
  priority: "low" | "normal" | "high";
  inbox?: InboxRow;
  email?: EmailRow;
}

// ───────────────────────────── meta ─────────────────────────────

const TYPE_ICON: Record<string, LucideIcon> = {
  quote_ready:          FileCheck2,
  renewal_due:          CalendarClock,
  submission_received:  InboxIcon,
  claim_drafted:        AlertCircle,
  loss_run_ready:       FileSearch,
  policy_compare_ready: GitCompareArrows,
  workflow_run:         WorkflowIcon,
  pipeline_triggered:   Zap,
  email:                Mail,
};

const TYPE_LABEL: Record<string, string> = {
  quote_ready: "Quote ready",
  renewal_due: "Renewal due",
  submission_received: "New submission",
  claim_drafted: "Claim drafted",
  loss_run_ready: "Loss run ready",
  policy_compare_ready: "Comparison ready",
  workflow_run: "Workflow run",
  pipeline_triggered: "Pipeline triggered",
  email: "Carrier email",
};

const TYPE_BUCKET: Record<string, Exclude<TypeKind, "all">> = {
  quote_ready: "quote",
  renewal_due: "renewal",
  policy_compare_ready: "renewal",
  submission_received: "submission",
  claim_drafted: "claim",
  loss_run_ready: "claim",
  workflow_run: "submission",
  pipeline_triggered: "submission",
  email: "email",
};

// ───────────────────────────── seed carrier emails ─────────────────────────────

const SAMPLE_EMAILS: EmailRow[] = [
  {
    id: "em-1",
    from: "Travelers Insurance",
    fromEmail: "underwriting@travelers.com",
    carrier: "Travelers",
    subject: "Renewal proposal — ABC Hardware (PA-2026-44821)",
    preview: "Renewal proposal attached for your review. Premium up 3.2% from prior term…",
    body: "Renewal proposal attached for ABC Hardware Commercial Auto policy.\n\n• Premium: $12,450/yr (up 3.2%)\n• Fleet discount: applied\n• Hired/non-owned auto: now included\n\nValid until March 1.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    read: false,
    starred: true,
    attachments: [{ name: "PA-2026-44821_Renewal.pdf", type: "pdf", size: "2.4 MB" }],
    tags: ["Renewal"],
  },
  {
    id: "em-2",
    from: "Hartford",
    fromEmail: "submissions@thehartford.com",
    carrier: "Hartford",
    subject: "BOP quote ready — Smith & Co. Manufacturing",
    preview: "We're pleased to provide a competitive quote for the Business Owners Policy…",
    body: "BOP quote for Smith & Co. Manufacturing.\n\n• Annual: $8,750\n• Property: $500k\n• GL: $1M / $2M\n• BI: 12 months ALS\n\nValid 30 days.",
    date: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    read: false,
    starred: false,
    attachments: [{ name: "Hartford_BOP_Quote.pdf", type: "pdf", size: "1.8 MB" }],
    tags: ["New Business"],
  },
];

// ───────────────────────────── helpers ─────────────────────────────

const carrierFromTitle = (title: string): string | null => {
  // Tiny heuristic: pulls a carrier name out of common phrases like "from Travelers" / "to Hartford".
  const m = title.match(/\b(?:from|to|via|with)\s+([A-Z][A-Za-z& ]{2,30})/);
  return m?.[1]?.trim() ?? null;
};

const computeConfidence = (priority: "low" | "normal" | "high"): Confidence => {
  // Priority is our proxy for confidence on operational items today.
  // High priority = needs careful look (low confidence in auto-handle).
  // Low priority = routine, high confidence.
  if (priority === "high") return "low";
  if (priority === "low")  return "high";
  return "medium";
};

const claudePromptFor = (row: UnifiedRow): string => {
  if (row.source === "email" && row.email) {
    return `In Fideon, triage this carrier email and surface the next action: "${row.email.subject}"`;
  }
  if (row.inbox) {
    const action = row.inbox.primary_action_label ?? "process";
    return `In Fideon, ${action.toLowerCase()} the item: "${row.inbox.title}"`;
  }
  return `In Fideon, take the next step on "${row.title}"`;
};

// ───────────────────────────── component ─────────────────────────────

export default function InboxPage() {
  const { toast } = useToast();
  const assistant = useAssistant();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const filterKind = (searchParams.get("filter") as FilterKind) || "needs_you";
  const typeKind = (searchParams.get("type") as TypeKind) || "all";
  const focusedId = searchParams.get("focus");

  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkChecked, setBulkChecked] = useState<Set<string>>(new Set());
  const [rulesOpen, setRulesOpen] = useState(false);

  // ── data load ──
  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inbox_items" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(120);
    setInbox(((data as unknown as InboxRow[]) ?? []));
    setLoading(false);
  };

  // ── unify inbox + email ──
  const allRows: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    for (const it of inbox) {
      const bucket: UnifiedRow["bucket"] =
        it.status === "ready"        ? "needs_you"
      : it.status === "in_progress"  ? "live"
      : "done";
      rows.push({
        uniqueKey: `inbox-${it.id}`,
        source: "inbox",
        bucket,
        typeKind: TYPE_BUCKET[it.type] ?? "submission",
        confidence: computeConfidence(it.priority),
        title: it.title,
        subtitle: it.subtitle ?? it.summary ?? "",
        agent: it.pod_name ?? it.source,
        carrier: carrierFromTitle(it.title),
        createdAt: it.created_at,
        priority: it.priority,
        inbox: it,
      });
    }
    for (const e of SAMPLE_EMAILS) {
      rows.push({
        uniqueKey: `email-${e.id}`,
        source: "email",
        bucket: e.read ? "done" : "needs_you",
        typeKind: "email",
        confidence: "medium",
        title: e.subject,
        subtitle: e.preview,
        agent: e.from,
        carrier: e.carrier,
        createdAt: e.date,
        priority: e.starred ? "high" : "normal",
        email: e,
      });
    }
    rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return rows;
  }, [inbox]);

  // ── counts ──
  const counts = useMemo(() => ({
    all:       allRows.length,
    needs_you: allRows.filter((r) => r.bucket === "needs_you").length,
    live:      allRows.filter((r) => r.bucket === "live").length,
    done:      allRows.filter((r) => r.bucket === "done").length,
    quote:     allRows.filter((r) => r.typeKind === "quote").length,
    renewal:   allRows.filter((r) => r.typeKind === "renewal").length,
    submission:allRows.filter((r) => r.typeKind === "submission").length,
    claim:     allRows.filter((r) => r.typeKind === "claim").length,
    email:     allRows.filter((r) => r.typeKind === "email").length,
    autoableHigh: allRows.filter((r) => r.bucket === "needs_you" && r.confidence === "high").length,
  }), [allRows]);

  // ── visible (filtered) ──
  const visible = useMemo(() => {
    let out = allRows;
    if (filterKind !== "all") out = out.filter((r) => r.bucket === filterKind);
    if (typeKind !== "all")   out = out.filter((r) => r.typeKind === typeKind);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        (r.agent ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [allRows, filterKind, typeKind, query]);

  // ── batching opportunity detection ──
  const batchOpportunity = useMemo(() => {
    // Count needs_you items per (agent, carrier) pair; flag the largest group ≥ 4.
    const needsYou = visible.filter((r) => r.bucket === "needs_you");
    const byKey: Record<string, UnifiedRow[]> = {};
    for (const r of needsYou) {
      const carrier = r.carrier ?? r.email?.carrier ?? "various carriers";
      const key = `${r.agent}|${carrier}|${r.typeKind}`;
      (byKey[key] = byKey[key] || []).push(r);
    }
    const entries = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length);
    if (entries.length === 0) return null;
    const [topKey, items] = entries[0];
    if (items.length < 4) return null;
    const [agent, carrier, typeKind] = topKey.split("|");
    const typeLabel = typeKind === "quote" ? "quotes" : typeKind === "renewal" ? "renewals" : typeKind === "claim" ? "claims" : typeKind === "email" ? "emails" : "items";
    return {
      count: items.length,
      agent,
      carrier,
      typeLabel,
      ids: items.map((r) => r.uniqueKey),
    };
  }, [visible]);

  // ── selected row resolution ──
  const selected = useMemo(() => {
    if (!paneOpen) return null;
    const k = selectedKey ?? (focusedId ? visible.find((r) => r.uniqueKey === `inbox-${focusedId}`)?.uniqueKey : undefined);
    return visible.find((r) => r.uniqueKey === k) ?? visible[0] ?? null;
  }, [paneOpen, selectedKey, focusedId, visible]);

  // Open pane automatically if a focus param was passed in the URL
  useEffect(() => {
    if (focusedId && !paneOpen) {
      setPaneOpen(true);
      setSelectedKey(`inbox-${focusedId}`);
    }
  }, [focusedId]); // eslint-disable-line

  // ── filter/type writers ──
  const setFilterParam = (next: FilterKind) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "needs_you") sp.delete("filter");
    else sp.set("filter", next);
    sp.delete("focus");
    router.replace(`?${sp.toString()}`);
    setBulkChecked(new Set());
  };
  const setTypeParam = (next: TypeKind) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete("type");
    else sp.set("type", next);
    sp.delete("focus");
    router.replace(`?${sp.toString()}`);
    setBulkChecked(new Set());
  };

  // ── actions ──
  const updateInbox = async (id: string, patch: Partial<InboxRow>) => {
    const { error } = await supabase.from("inbox_items" as any).update(patch as any).eq("id", id);
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return false;
    }
    setInbox((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    return true;
  };

  const approveInbox = async (it: InboxRow) => {
    setActingId(it.id);
    const status = it.type === "quote_ready" || it.type === "policy_compare_ready" ? "sent" : "approved";
    const ok = await updateInbox(it.id, {
      status,
      action_taken: `${it.primary_action_label ?? "Approved"} · by you`,
      acted_at: new Date().toISOString(),
    });
    setActingId(null);
    if (ok) toast({ title: it.primary_action_label ?? "Done" });
  };

  const dismissInbox = async (it: InboxRow) => {
    setActingId(it.id);
    await updateInbox(it.id, { status: "dismissed", action_taken: "Dismissed", acted_at: new Date().toISOString() });
    setActingId(null);
  };

  const approveBatch = async (ids: string[]) => {
    const items = visible.filter((r) => ids.includes(r.uniqueKey) && r.inbox);
    let count = 0;
    for (const r of items) {
      if (r.inbox) {
        const status = r.inbox.type === "quote_ready" || r.inbox.type === "policy_compare_ready" ? "sent" : "approved";
        await updateInbox(r.inbox.id, {
          status,
          action_taken: `Batch approved · by you`,
          acted_at: new Date().toISOString(),
        });
        count++;
      }
    }
    toast({ title: `${count} items processed`, description: "All approved in one batch." });
    setBulkChecked(new Set());
  };

  const askClaude = (row: UnifiedRow) => {
    assistant.ask(claudePromptFor(row));
  };

  const openRow = (row: UnifiedRow) => {
    setSelectedKey(row.uniqueKey);
    setPaneOpen(true);
  };

  const toggleBulk = (key: string) => {
    setBulkChecked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ───────────────────────── render ─────────────────────────
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Inbox · operational triage"
        title="What your agents finished"
        description="Quotes ready, renewals to send, carrier emails to action — everything your agents queued for you. Decisions that need a compliance review live in the Trust queue separately."
        icon={InboxIcon}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
              <Wand2 className="h-3.5 w-3.5" />
              Auto-handle rules
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => assistant.setOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Ask Fideon
            </Button>
          </>
        }
      />

      {/* Filter rail (top) */}
      <div className="flex flex-col md:flex-row gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-muted/40 border border-border">
          <FilterTab label="Needs you" count={counts.needs_you} active={filterKind === "needs_you"} icon={AlertCircle} onClick={() => setFilterParam("needs_you")} />
          <FilterTab label="In flight" count={counts.live}      active={filterKind === "live"}      icon={Activity}    onClick={() => setFilterParam("live")} />
          <FilterTab label="Done"      count={counts.done}      active={filterKind === "done"}      icon={CheckCircle2} onClick={() => setFilterParam("done")} />
          <FilterTab label="All"       count={counts.all}       active={filterKind === "all"}       icon={InboxIcon}   onClick={() => setFilterParam("all")} />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={selectionMode ? "primary" : "outline"}
            size="sm"
            onClick={() => { setSelectionMode((s) => !s); if (selectionMode) setBulkChecked(new Set()); }}
          >
            <Layers className="h-3.5 w-3.5" />
            {selectionMode ? `${bulkChecked.size} selected` : "Select"}
          </Button>
          <Button
            variant={paneOpen ? "outline" : "ghost"}
            size="icon-sm"
            onClick={() => setPaneOpen((o) => !o)}
            aria-label={paneOpen ? "Close reading pane" : "Open reading pane"}
            className="hidden lg:inline-flex"
          >
            {paneOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Type pills (sub-filter) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <TypePill label="Any type"     count={counts.all}        active={typeKind === "all"}        onClick={() => setTypeParam("all")} />
        <TypePill icon={FileCheck2}    label="Quotes"            count={counts.quote}      active={typeKind === "quote"}      onClick={() => setTypeParam("quote")} />
        <TypePill icon={CalendarClock} label="Renewals"          count={counts.renewal}    active={typeKind === "renewal"}    onClick={() => setTypeParam("renewal")} />
        <TypePill icon={InboxIcon}     label="Submissions"       count={counts.submission} active={typeKind === "submission"} onClick={() => setTypeParam("submission")} />
        <TypePill icon={AlertCircle}   label="Claims"            count={counts.claim}      active={typeKind === "claim"}      onClick={() => setTypeParam("claim")} />
        <TypePill icon={Mail}          label="Carrier mail"      count={counts.email}      active={typeKind === "email"}      onClick={() => setTypeParam("email")} />
      </div>

      {/* Smart batching banner */}
      {batchOpportunity && filterKind === "needs_you" && (
        <Card className="mb-4 px-4 py-3 bg-gradient-hero border-primary/20 flex items-center gap-3 flex-wrap">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow shrink-0">
            <Layers className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <p className="text-[13.5px] font-bold text-foreground tracking-tight leading-tight">
              {batchOpportunity.count} {batchOpportunity.typeLabel} from <span className="text-primary">{batchOpportunity.carrier}</span> ready
            </p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Same carrier, same agent ({batchOpportunity.agent}). Approve them all in one click — full audit trail still applies.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => approveBatch(batchOpportunity.ids)}>
            <Zap className="h-3.5 w-3.5" />
            Approve all {batchOpportunity.count}
          </Button>
        </Card>
      )}

      {/* Bulk action bar */}
      {selectionMode && bulkChecked.size > 0 && (
        <Card className="mb-4 px-4 py-2.5 bg-primary/5 border-primary/30 flex items-center gap-3 flex-wrap">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-[13px] font-semibold text-foreground flex-1">
            {bulkChecked.size} selected
          </p>
          <Button variant="outline" size="xs" onClick={() => setBulkChecked(new Set())}>
            <X className="h-3 w-3" />Clear
          </Button>
          <Button variant="primary" size="xs" onClick={() => approveBatch(Array.from(bulkChecked))}>
            <CheckCircle2 className="h-3 w-3" />Approve selected
          </Button>
        </Card>
      )}

      {/* Two-pane: list (full-width if pane closed) + reading pane */}
      <div className={cn("grid gap-4 min-h-[600px]", paneOpen ? "grid-cols-1 lg:grid-cols-[1fr_440px]" : "grid-cols-1")}>
        {/* List */}
        <Card className="overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold tracking-tight">{visible.length} items</span>
            {counts.autoableHigh > 0 && filterKind === "needs_you" && (
              <StatusPill tone="success" dot size="sm">
                {counts.autoableHigh} could auto-handle
              </StatusPill>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                variant="inline"
                title="Nothing here"
                description="Try a different filter, or wait — your agents are working."
              />
            ) : (
              <ul>
                {visible.map((row) => (
                  <RowCard
                    key={row.uniqueKey}
                    row={row}
                    selected={selected?.uniqueKey === row.uniqueKey && paneOpen}
                    selectionMode={selectionMode}
                    checked={bulkChecked.has(row.uniqueKey)}
                    acting={actingId === (row.inbox?.id ?? "")}
                    onToggle={() => toggleBulk(row.uniqueKey)}
                    onOpen={() => openRow(row)}
                    onApprove={() => row.inbox && approveInbox(row.inbox)}
                    onDismiss={() => row.inbox && dismissInbox(row.inbox)}
                    onAskClaude={() => askClaude(row)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </Card>

        {/* Reading pane */}
        {paneOpen && (
          <Card className="flex flex-col overflow-hidden">
            {!selected ? (
              <EmptyState
                variant="inline"
                icon={InboxIcon}
                title="Select an item"
                description="Pick from the list to read details."
                className="flex-1 justify-center"
              />
            ) : (
              <ReadingPane
                row={selected}
                acting={actingId === (selected.inbox?.id ?? "")}
                onClose={() => setPaneOpen(false)}
                onApprove={() => selected.inbox && approveInbox(selected.inbox)}
                onDismiss={() => selected.inbox && dismissInbox(selected.inbox)}
                onAskClaude={() => askClaude(selected)}
              />
            )}
          </Card>
        )}
      </div>

      {/* Auto-handle rules dialog */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
                <Wand2 className="h-4 w-4" />
              </div>
              Auto-handle rules
            </DialogTitle>
            <DialogDescription>
              Let agents process routine items silently. Anything that doesn't match a rule still lands in your Inbox for review. Every auto-action is logged in <strong className="text-foreground">Trust → Audit log</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <RuleToggle
              label="Auto-send quotes from preferred carriers under $10k premium"
              hint="Travelers, Hartford, Chubb, Liberty Mutual"
            />
            <RuleToggle
              label="Auto-pull renewal docs 60 days before expiration"
              hint="Document Retrieval agent runs nightly"
              defaultOn
            />
            <RuleToggle
              label="Auto-attach carrier emails to matching AMS account"
              hint="Match by policy number when present"
              defaultOn
            />
            <RuleToggle
              label="Auto-approve loss-run requests for renewals in flight"
              hint="Skip approval queue for routine loss-run pulls"
            />
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-muted-foreground">
              These are policies — every action stays auditable.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setRulesOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => { setRulesOpen(false); toast({ title: "Rules saved", description: "Auto-handle policies are active." }); }}>
                Save rules
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────────────────────── row ─────────────────────────────

function RowCard({
  row, selected, selectionMode, checked, acting,
  onToggle, onOpen, onApprove, onDismiss, onAskClaude,
}: {
  row: UnifiedRow;
  selected: boolean;
  selectionMode: boolean;
  checked: boolean;
  acting: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onAskClaude: () => void;
}) {
  const Icon = TYPE_ICON[row.source === "email" ? "email" : row.inbox?.type ?? "submission_received"] ?? InboxIcon;
  const isInboxItem = row.source === "inbox" && !!row.inbox;
  const isActionable = isInboxItem && row.bucket === "needs_you";

  return (
    <li
      className={cn(
        "group relative border-b border-border transition-colors",
        "border-l-[3px]",
        selected ? "bg-accent" : "hover:bg-muted/40",
        // Confidence stripe — only on actionable items
        isActionable && row.confidence === "high"   && "border-l-success",
        isActionable && row.confidence === "medium" && "border-l-warning",
        isActionable && row.confidence === "low"    && "border-l-destructive",
        !isActionable && "border-l-transparent",
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Selection checkbox (when in selection mode) */}
        {selectionMode && isInboxItem && (
          <button
            onClick={onToggle}
            aria-label={checked ? "Deselect" : "Select"}
            className={cn(
              "mt-1 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
              checked
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border bg-background hover:border-border-strong",
            )}
          >
            {checked && <CheckCircle2 className="h-3 w-3" />}
          </button>
        )}

        {/* Icon */}
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
          row.source === "email" ? "bg-info/10 text-info" : "bg-accent text-primary",
        )}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Body */}
        <button onClick={onOpen} className="text-left min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <SourcePill row={row} />
            {isActionable && <ConfidencePill confidence={row.confidence} />}
            {row.priority === "high" && <StatusPill tone="warning" size="sm">high</StatusPill>}
            {row.bucket === "live" && <StatusPill tone="live" dot pulse size="sm">live</StatusPill>}
            {row.bucket === "done" && <StatusPill tone="success" dot size="sm">done</StatusPill>}
            <span className="ml-auto text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0">
              {formatDistanceToNow(new Date(row.createdAt), { addSuffix: false })}
            </span>
          </div>
          <p className={cn(
            "text-[13.5px] truncate",
            isActionable ? "font-bold text-foreground" : "font-semibold text-foreground/85",
          )}>
            {row.title}
          </p>
          {row.subtitle && (
            <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{row.subtitle}</p>
          )}
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{row.agent}</span>
            {row.carrier && <span className="text-muted-foreground/60">· {row.carrier}</span>}
          </div>
        </button>

        {/* Inline actions */}
        <div className="flex items-center gap-1 shrink-0 self-start mt-0.5">
          {/* Per-row "ask Fideon" affordance — opens AI sidecar with context */}
          <button
            onClick={onAskClaude}
            aria-label="Ask Fideon about this"
            title="Ask Fideon"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>

          {isActionable && row.confidence === "high" && row.inbox && (
            <Button
              variant="primary"
              size="xs"
              disabled={acting}
              onClick={onApprove}
              className="ml-1"
            >
              {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {row.inbox.primary_action_label?.split(" ")[0] ?? "Approve"}
            </Button>
          )}
          {isActionable && row.confidence === "medium" && row.inbox && (
            <Button
              variant="outline"
              size="xs"
              disabled={acting}
              onClick={onApprove}
              className="ml-1"
            >
              {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Quick check
            </Button>
          )}
          {isActionable && row.confidence === "low" && (
            <Button variant="secondary" size="xs" onClick={onOpen} className="ml-1">
              Review
            </Button>
          )}
          {/* Dismiss — only on hover */}
          {isActionable && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              title="Dismiss"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ───────────────────────────── reading pane ─────────────────────────────

function ReadingPane({
  row, acting, onClose, onApprove, onDismiss, onAskClaude,
}: {
  row: UnifiedRow;
  acting: boolean;
  onClose: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onAskClaude: () => void;
}) {
  const isInbox = row.source === "inbox" && row.inbox;
  const isEmail = row.source === "email" && row.email;
  const isActionable = isInbox && row.bucket === "needs_you";

  return (
    <>
      <div className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <SourcePill row={row} />
          {isActionable && <ConfidencePill confidence={row.confidence} large />}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close pane">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-5 py-4 space-y-4">
          <h2 className="font-display text-[18px] font-bold text-foreground tracking-tight leading-tight">
            {row.title}
          </h2>
          <div className="text-[12px] text-muted-foreground">
            {row.agent}
            {row.carrier && <> · {row.carrier}</>}
            <> · {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}</>
          </div>

          {isInbox && row.inbox?.summary && (
            <div>
              <p className="text-eyebrow text-muted-foreground mb-1.5">Summary</p>
              <p className="text-[13.5px] text-foreground/90 leading-[1.65] whitespace-pre-wrap">
                {row.inbox.summary}
              </p>
            </div>
          )}
          {isInbox && row.inbox?.subtitle && row.inbox.subtitle !== row.inbox.summary && (
            <p className="text-[13px] text-muted-foreground italic">{row.inbox.subtitle}</p>
          )}
          {isEmail && row.email && (
            <div>
              <p className="text-eyebrow text-muted-foreground mb-1.5">From</p>
              <p className="text-[13px] text-foreground/90 mb-3">
                {row.email.from} <span className="text-muted-foreground">&lt;{row.email.fromEmail}&gt;</span>
              </p>
              <p className="text-eyebrow text-muted-foreground mb-1.5">Body</p>
              <pre className="whitespace-pre-wrap text-[13.5px] text-foreground/90 font-sans leading-[1.6]">
                {row.email.body}
              </pre>
            </div>
          )}

          {/* Power-user hint: same item callable from external assistant */}
          <div className="flex items-start gap-2 pt-2 border-t border-border/50">
            <Plug className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">
                Power user? Same agent runs from your AI assistant via MCP.{" "}
                <button onClick={onAskClaude} className="text-primary font-semibold hover:underline">
                  Ask Fideon
                </button>
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {isActionable && row.inbox && (
        <div className="border-t border-border bg-muted/20 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted-foreground">
            {row.confidence === "high"
              ? "High confidence — safe to send."
              : row.confidence === "low"
                ? "Low confidence — review carefully."
                : "Quick check before sending."}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDismiss} disabled={acting}>
              <XCircle className="h-3.5 w-3.5" />Dismiss
            </Button>
            <Button variant="primary" size="sm" onClick={onApprove} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {row.inbox.primary_action_label ?? "Approve"}
            </Button>
          </div>
        </div>
      )}
      {!isActionable && (
        <div className="border-t border-border bg-muted/20 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted-foreground">
            {row.bucket === "done" ? `Resolved ${row.inbox?.action_taken ?? ""}` : "In progress…"}
          </span>
        </div>
      )}
    </>
  );
}

// ───────────────────────────── small bits ─────────────────────────────

function FilterTab({
  label, count, active, icon: Icon, onClick,
}: { label: string; count: number; active: boolean; icon?: LucideIcon; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors whitespace-nowrap",
        active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      <span className={cn("text-[10.5px] font-bold tabular-nums px-1 rounded", active ? "bg-primary text-primary-foreground" : "bg-muted")}>
        {count}
      </span>
    </button>
  );
}

function TypePill({
  label, count, active, icon: Icon, onClick,
}: { label: string; count: number; active: boolean; icon?: LucideIcon; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors whitespace-nowrap",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong",
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
      <span className="text-[10.5px] tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function SourcePill({ row }: { row: UnifiedRow }) {
  if (row.source === "email") {
    return <StatusPill tone="info" size="sm">Carrier email</StatusPill>;
  }
  return <StatusPill tone="primary" size="sm">{TYPE_LABEL[row.inbox!.type] ?? "Update"}</StatusPill>;
}

function ConfidencePill({ confidence, large }: { confidence: Confidence; large?: boolean }) {
  const tone = confidence === "high" ? "success" : confidence === "medium" ? "warning" : "danger";
  const label =
    confidence === "high" ? "high conf." :
    confidence === "medium" ? "review" :
    "low conf.";
  return (
    <StatusPill tone={tone} size={large ? "md" : "sm"}>
      {confidence === "high" && <CheckCircle2 className="h-2.5 w-2.5" />}
      {label}
    </StatusPill>
  );
}

function RuleToggle({ label, hint, defaultOn }: { label: string; hint?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
      on ? "border-primary/30 bg-accent/40" : "border-border bg-card",
    )}>
      <Switch checked={on} onCheckedChange={setOn} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Label className="text-[13px] font-semibold text-foreground cursor-pointer" onClick={() => setOn((v) => !v)}>
          {label}
        </Label>
        {hint && <p className="text-[11.5px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {on && <Settings2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" aria-label="configure" />}
    </div>
  );
}
