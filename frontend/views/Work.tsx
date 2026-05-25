'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox as InboxIcon,
  Mail,
  ClipboardCheck,
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
  AlertTriangle,
  Loader2,
  ArrowRight,
  Building2,
  Brain,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { applyHumanDecision } from "@/lib/governance";
import { useAssistant } from "@/components/shell/AssistantSidecar";

// ───────────────────────────── types ─────────────────────────────

type FilterKind = "all" | "needs_you" | "approval" | "live" | "done";
type TypeKind = "all" | "quote" | "renewal" | "submission" | "claim" | "email";

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

interface ReviewRow {
  id: string;
  status: string;
  domain: string;
  decision_type: string;
  pod_model_id: string;
  pod_model_name: string;
  title: string;
  summary: string | null;
  ai_recommendation: string | null;
  confidence_score: number | null;
  threshold_exceeded: boolean;
  reviewer_notes: string | null;
  decision_record_id?: string | null;
  reviewed_at: string | null;
  created_at: string;
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

/** Unified row that wraps any underlying source. */
interface WorkRow {
  uniqueKey: string;
  source: "inbox" | "review" | "email";
  /** Bucket the row falls into for the side filter. */
  bucket: Exclude<FilterKind, "all">;
  /** Coarse type for the type filter. */
  typeKind: Exclude<TypeKind, "all">;
  /** Confidence band for the auto/1-click/full-review treatment. */
  band: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  agent: string;
  createdAt: string;
  priority: "low" | "normal" | "high";
  // Original payloads
  inbox?: InboxRow;
  review?: ReviewRow;
  email?: EmailRow;
}

// ───────────────────────────── meta ─────────────────────────────

const TYPE_ICON: Record<string, LucideIcon> = {
  quote_ready: FileCheck2,
  renewal_due: CalendarClock,
  submission_received: InboxIcon,
  claim_drafted: AlertCircle,
  loss_run_ready: FileSearch,
  policy_compare_ready: GitCompareArrows,
  workflow_run: WorkflowIcon,
  pipeline_triggered: Zap,
  // reviews
  quote_approval: FileCheck2,
  claim_decision: AlertCircle,
  submission_triage: InboxIcon,
  policy_review: ShieldCheck,
  risk_assessment: AlertTriangle,
  document_validation: FileCheck2,
  // email
  email: Mail,
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
  quote_approval: "Quote approval",
  claim_decision: "Claim decision",
  submission_triage: "Submission triage",
  policy_review: "Policy review",
  risk_assessment: "Risk assessment",
  document_validation: "Document validation",
  email: "Carrier email",
};

const TYPE_BUCKET: Record<string, Exclude<TypeKind, "all">> = {
  quote_ready: "quote",
  quote_approval: "quote",
  renewal_due: "renewal",
  policy_compare_ready: "renewal",
  policy_review: "renewal",
  submission_received: "submission",
  submission_triage: "submission",
  claim_drafted: "claim",
  claim_decision: "claim",
  loss_run_ready: "claim",
  risk_assessment: "claim",
  workflow_run: "submission",
  pipeline_triggered: "submission",
  document_validation: "submission",
  email: "email",
};

// ───────────────────────────── sample carrier emails ─────────────────────────────
// Mailbox is mocked in the source app — keep a few here so the email lens isn't empty.
const SAMPLE_EMAILS: EmailRow[] = [
  {
    id: "em-1",
    from: "Progressive Commercial",
    fromEmail: "underwriting@progressive.com",
    carrier: "Progressive",
    subject: "Policy Renewal — Commercial Auto #PA-2026-44821",
    preview: "Your commercial auto policy is up for renewal. Please review the attached documents…",
    body: `Your client's Commercial Auto policy #PA-2026-44821 is approaching its renewal date of March 15, 2026.

Key changes:
• Premium adjusted to $12,450/yr (3.2% increase)
• Fleet discount applied for 5+ vehicles
• Added hired/non-owned auto coverage
• Umbrella eligibility confirmed

Please review and confirm acceptance by March 1, 2026.`,
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    read: false,
    starred: true,
    attachments: [{ name: "PA-2026-44821_Renewal.pdf", type: "pdf", size: "2.4 MB" }],
    tags: ["Renewal", "Auto"],
  },
  {
    id: "em-2",
    from: "Travelers Insurance",
    fromEmail: "submissions@travelers.com",
    carrier: "Travelers",
    subject: "New Business Quote — BOP Package #TRV-BOP-88192",
    preview: "We're pleased to provide the following quote for your client's Business Owners Policy…",
    body: `BOP quote for ABC Hardware LLC.

• Annual Premium: $8,750
• Property Coverage: $500,000
• General Liability: $1,000,000 / $2,000,000
• Business Income: 12 months actual loss sustained
• Equipment Breakdown included

Quote valid for 30 days.`,
    date: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    read: false,
    starred: false,
    attachments: [{ name: "TRV-BOP-88192_Quote.pdf", type: "pdf", size: "1.8 MB" }],
    tags: ["New Business", "BOP"],
  },
];

// ───────────────────────────── component ─────────────────────────────

export default function Work() {
  const { toast } = useToast();
  const assistant = useAssistant();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const filterKind = (searchParams.get("filter") as FilterKind) || "all";
  const typeKind = (searchParams.get("type") as TypeKind) || "all";
  const focusedId = searchParams.get("focus");
  const [query, setQuery] = useState("");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const [inboxRes, reviewRes] = await Promise.all([
      supabase.from("inbox_items" as any).select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("decision_reviews").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setInbox(((inboxRes.data as unknown as InboxRow[]) ?? []));
    setReviews(((reviewRes.data as unknown as ReviewRow[]) ?? []));
    setLoading(false);
  };

  // Build the unified stream
  const allRows: WorkRow[] = useMemo(() => {
    const rows: WorkRow[] = [];

    for (const it of inbox) {
      const bucket: WorkRow["bucket"] =
        it.status === "ready"        ? "needs_you"
      : it.status === "in_progress"  ? "live"
      : "done";
      rows.push({
        uniqueKey: `inbox-${it.id}`,
        source: "inbox",
        bucket,
        typeKind: TYPE_BUCKET[it.type] ?? "submission",
        band: it.priority === "high" ? "low" : it.priority === "low" ? "high" : "medium",
        title: it.title,
        subtitle: it.subtitle ?? it.summary ?? "",
        agent: it.pod_name ?? it.source,
        createdAt: it.created_at,
        priority: it.priority,
        inbox: it,
      });
    }

    for (const r of reviews) {
      const bucket: WorkRow["bucket"] = r.status === "pending" ? "approval" : "done";
      const conf = r.confidence_score ?? null;
      const band: WorkRow["band"] =
        conf == null ? "medium" : conf >= 0.85 ? "high" : conf >= 0.6 ? "medium" : "low";
      rows.push({
        uniqueKey: `review-${r.id}`,
        source: "review",
        bucket,
        typeKind: TYPE_BUCKET[r.decision_type] ?? "submission",
        band,
        title: r.title,
        subtitle: r.summary ?? "",
        agent: r.pod_model_name,
        createdAt: r.created_at,
        priority: r.threshold_exceeded ? "high" : "normal",
        review: r,
      });
    }

    for (const e of SAMPLE_EMAILS) {
      rows.push({
        uniqueKey: `email-${e.id}`,
        source: "email",
        bucket: e.read ? "done" : "needs_you",
        typeKind: "email",
        band: "high",
        title: e.subject,
        subtitle: e.preview,
        agent: e.from,
        createdAt: e.date,
        priority: e.starred ? "high" : "normal",
        email: e,
      });
    }

    rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return rows;
  }, [inbox, reviews]);

  const counts = useMemo(() => ({
    all:        allRows.length,
    needs_you:  allRows.filter((r) => r.bucket === "needs_you").length,
    approval:   allRows.filter((r) => r.bucket === "approval").length,
    live:       allRows.filter((r) => r.bucket === "live").length,
    done:       allRows.filter((r) => r.bucket === "done").length,
    quote:      allRows.filter((r) => r.typeKind === "quote").length,
    renewal:    allRows.filter((r) => r.typeKind === "renewal").length,
    submission: allRows.filter((r) => r.typeKind === "submission").length,
    claim:      allRows.filter((r) => r.typeKind === "claim").length,
    email:      allRows.filter((r) => r.typeKind === "email").length,
    high:       allRows.filter((r) => r.priority === "high").length,
  }), [allRows]);

  const visible = useMemo(() => {
    let out = allRows;
    if (filterKind !== "all") out = out.filter((r) => r.bucket === filterKind);
    if (typeKind !== "all")   out = out.filter((r) => r.typeKind === typeKind);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q) || (r.agent ?? "").toLowerCase().includes(q));
    }
    return out;
  }, [allRows, filterKind, typeKind, query]);

  // Resolve selected row → fall back to first if focusedId not present
  const selected = useMemo(() => {
    const targetKey = selectedKey ??
      (focusedId ? visible.find((r) => r.uniqueKey === `inbox-${focusedId}` || r.uniqueKey === `review-${focusedId}`)?.uniqueKey : undefined) ??
      visible[0]?.uniqueKey;
    return visible.find((r) => r.uniqueKey === targetKey) ?? visible[0];
  }, [visible, selectedKey, focusedId]);

  // ─── filter helpers (write to URL so deep-links work) ───
  const setFilterParam = (next: FilterKind) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete("filter"); else sp.set("filter", next);
    sp.delete("focus");
    router.replace(`?${sp.toString()}`);
  };
  const setTypeParam = (next: TypeKind) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete("type"); else sp.set("type", next);
    sp.delete("focus");
    router.replace(`?${sp.toString()}`);
  };

  // ─── actions ───
  const updateInbox = async (id: string, patch: Partial<InboxRow>) => {
    setActingId(id);
    const { error } = await supabase.from("inbox_items" as any).update(patch as any).eq("id", id);
    setActingId(null);
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return false;
    }
    setInbox((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    return true;
  };

  const approveInbox = async (it: InboxRow) => {
    const status = it.type === "quote_ready" || it.type === "policy_compare_ready" ? "sent" : "approved";
    const ok = await updateInbox(it.id, {
      status,
      action_taken: `${it.primary_action_label ?? "Approved"} · by you`,
      acted_at: new Date().toISOString(),
    });
    if (ok) toast({ title: it.primary_action_label ?? "Done" });
  };
  const dismissInbox = async (it: InboxRow) =>
    updateInbox(it.id, { status: "dismissed", action_taken: "Dismissed", acted_at: new Date().toISOString() });

  const handleReviewAction = async (rev: ReviewRow, action: "approved" | "rejected") => {
    setActingId(rev.id);
    const user = await getCurrentUser();
    if (!user) return;
    const { error } = await supabase
      .from("decision_reviews")
      .update({
        status: action,
        reviewer_id: user.id,
        reviewer_notes: reviewerNotes[rev.id] || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", rev.id);
    setActingId(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    if (rev.decision_record_id) {
      await applyHumanDecision(rev.decision_record_id, action, undefined, reviewerNotes[rev.id] || undefined);
    }
    toast({
      title: action === "approved" ? "Decision approved" : "Decision rejected",
      description: `"${rev.title}" recorded in audit trail.`,
    });
    void load();
  };

  const askAssistantAbout = (row: WorkRow) => {
    const summary = row.subtitle ? ` — ${row.subtitle.slice(0, 200)}` : "";
    assistant.ask(`Help me with this work item: "${row.title}"${summary}. What should I do?`);
  };

  const initials = (s: string) => s.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  // ───────────────────────── render ─────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Work"
        title="One queue for everything"
        description="Agent outputs, AI decisions awaiting approval, and carrier mail — all in one stream. The confidence band tells you whether to skim, click, or review."
        icon={InboxIcon}
        actions={
          <>
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
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-muted/40 border border-border">
          <FilterTab label="All" count={counts.all} active={filterKind === "all"} onClick={() => setFilterParam("all")} />
          <FilterTab label="Needs you" count={counts.needs_you} active={filterKind === "needs_you"} icon={AlertCircle} onClick={() => setFilterParam("needs_you")} />
          <FilterTab label="Awaiting approval" count={counts.approval} active={filterKind === "approval"} icon={ClipboardCheck} onClick={() => setFilterParam("approval")} />
          <FilterTab label="In flight" count={counts.live} active={filterKind === "live"} icon={Activity} onClick={() => setFilterParam("live")} />
          <FilterTab label="Done" count={counts.done} active={filterKind === "done"} icon={CheckCircle2} onClick={() => setFilterParam("done")} />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>
      </div>

      {/* Type pills (sub-filter) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <TypePill label="Any type" count={counts.all} active={typeKind === "all"} onClick={() => setTypeParam("all")} />
        <TypePill icon={FileCheck2} label="Quotes" count={counts.quote} active={typeKind === "quote"} onClick={() => setTypeParam("quote")} />
        <TypePill icon={CalendarClock} label="Renewals" count={counts.renewal} active={typeKind === "renewal"} onClick={() => setTypeParam("renewal")} />
        <TypePill icon={InboxIcon} label="Submissions" count={counts.submission} active={typeKind === "submission"} onClick={() => setTypeParam("submission")} />
        <TypePill icon={AlertCircle} label="Claims" count={counts.claim} active={typeKind === "claim"} onClick={() => setTypeParam("claim")} />
        <TypePill icon={Mail} label="Carrier mail" count={counts.email} active={typeKind === "email"} onClick={() => setTypeParam("email")} />
      </div>

      {/* Two-pane: list + reading pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-4 min-h-[600px]">
        {/* List */}
        <Card className="overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold tracking-tight">{visible.length} items</span>
            {counts.high > 0 && filterKind === "all" && (
              <StatusPill tone="warning" dot size="sm">{counts.high} high priority</StatusPill>
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
                description="Try a different filter or search."
              />
            ) : (
              visible.map((row) => {
                const isSelected = selected?.uniqueKey === row.uniqueKey;
                const Icon = TYPE_ICON[row.source === "email" ? "email" : row.review?.decision_type ?? row.inbox?.type ?? "submission_received"] ?? InboxIcon;
                return (
                  <button
                    key={row.uniqueKey}
                    onClick={() => setSelectedKey(row.uniqueKey)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border transition-colors",
                      "border-l-[3px]",
                      isSelected
                        ? "bg-accent border-l-primary"
                        : row.bucket === "needs_you" || row.bucket === "approval"
                          ? "border-l-transparent hover:bg-muted/40 bg-primary/[0.02]"
                          : "border-l-transparent hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        row.source === "review" ? "bg-warning/10 text-warning-foreground/80"
                        : row.source === "email" ? "bg-info/10 text-info"
                        : "bg-accent text-primary",
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <SourcePill row={row} />
                          {row.priority === "high" && <StatusPill tone="warning" size="sm">high</StatusPill>}
                          {row.review?.confidence_score != null && (
                            <ConfidenceBand band={row.band} confidence={row.review.confidence_score} />
                          )}
                          <span className="ml-auto text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatDistanceToNow(new Date(row.createdAt), { addSuffix: false })}
                          </span>
                        </div>
                        <p className={cn(
                          "text-[13px] truncate",
                          row.bucket === "needs_you" || row.bucket === "approval"
                            ? "font-bold text-foreground"
                            : "font-semibold text-foreground/85",
                        )}>
                          {row.title}
                        </p>
                        {row.subtitle && (
                          <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{row.subtitle}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                          {row.agent && (
                            <>
                              <Building2 className="h-3 w-3" />
                              <span className="truncate">{row.agent}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </Card>

        {/* Reading pane */}
        <Card className="flex flex-col overflow-hidden">
          {!selected ? (
            <EmptyState
              variant="inline"
              icon={InboxIcon}
              title="Select an item"
              description="Choose from the list to read details and take action."
              className="flex-1 justify-center"
            />
          ) : (
            <ReadingPane
              row={selected}
              acting={actingId === (selected.inbox?.id ?? selected.review?.id)}
              reviewerNote={reviewerNotes[selected.review?.id ?? ""] ?? ""}
              setReviewerNote={(v) => selected.review && setReviewerNotes((p) => ({ ...p, [selected.review!.id]: v }))}
              onApproveInbox={approveInbox}
              onDismissInbox={dismissInbox}
              onReviewAction={handleReviewAction}
              onAskAssistant={() => askAssistantAbout(selected)}
              initials={initials(selected.agent ?? "")}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────────── reading pane ─────────────────────────────

function ReadingPane({
  row, acting, reviewerNote, setReviewerNote,
  onApproveInbox, onDismissInbox, onReviewAction, onAskAssistant, initials,
}: {
  row: WorkRow;
  acting: boolean;
  reviewerNote: string;
  setReviewerNote: (v: string) => void;
  onApproveInbox: (it: InboxRow) => void;
  onDismissInbox: (it: InboxRow) => void;
  onReviewAction: (r: ReviewRow, action: "approved" | "rejected") => void;
  onAskAssistant: () => void;
  initials: string;
}) {
  const isReview = row.source === "review" && row.review;
  const isEmail = row.source === "email" && row.email;
  const isInbox = row.source === "inbox" && row.inbox;

  return (
    <>
      {/* Reading-pane header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SourcePill row={row} />
            {row.review?.confidence_score != null && (
              <ConfidenceBand band={row.band} confidence={row.review.confidence_score} large />
            )}
            {row.priority === "high" && <StatusPill tone="warning" dot>high priority</StatusPill>}
            {row.bucket === "needs_you" && <StatusPill tone="primary" dot pulse>needs you</StatusPill>}
            {row.bucket === "approval" && <StatusPill tone="warning" dot pulse>awaiting approval</StatusPill>}
            {row.bucket === "live" && <StatusPill tone="live" dot pulse>in flight</StatusPill>}
          </div>
          <Button variant="ghost" size="xs" onClick={onAskAssistant}>
            <Sparkles className="h-3 w-3" />
            Ask Fideon
          </Button>
        </div>
        <h2 className="font-display text-[20px] font-bold text-foreground tracking-tight leading-tight">
          {row.title}
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent to-accent/60 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
            {initials || "·"}
          </div>
          <div className="min-w-0 text-[12.5px]">
            <div className="font-semibold text-foreground">{row.agent || "Fideon"}</div>
            <div className="text-muted-foreground">{formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}</div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-5 space-y-5">

          {/* INBOX content */}
          {isInbox && row.inbox && (
            <>
              {row.inbox.summary && (
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-1.5">Summary</p>
                  <p className="text-[14px] text-foreground/90 leading-[1.65] whitespace-pre-wrap">
                    {row.inbox.summary}
                  </p>
                </div>
              )}
              {row.inbox.subtitle && row.inbox.subtitle !== row.inbox.summary && (
                <p className="text-[13px] text-muted-foreground italic">{row.inbox.subtitle}</p>
              )}
              {row.inbox.payload && Object.keys(row.inbox.payload).length > 0 && (
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-1.5">Details</p>
                  <pre className="text-[12px] bg-muted/30 border border-border rounded-lg p-3 overflow-auto whitespace-pre-wrap font-mono">
                    {JSON.stringify(row.inbox.payload, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* REVIEW content */}
          {isReview && row.review && (
            <>
              {row.review.summary && (
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-1.5">Summary</p>
                  <p className="text-[14px] text-foreground/90 leading-[1.65]">{row.review.summary}</p>
                </div>
              )}
              {row.review.ai_recommendation && (
                <div className="p-4 rounded-xl bg-accent border border-primary/15">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <p className="text-eyebrow text-primary">AI recommendation</p>
                  </div>
                  <p className="text-[14px] text-foreground/90 leading-[1.65]">{row.review.ai_recommendation}</p>
                </div>
              )}
              {row.review.threshold_exceeded && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning-foreground/85">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="text-[12.5px]">
                    Confidence threshold exceeded — your manual approval is required for compliance.
                  </p>
                </div>
              )}
            </>
          )}

          {/* EMAIL content */}
          {isEmail && row.email && (
            <>
              <div>
                <p className="text-eyebrow text-muted-foreground mb-1.5">From</p>
                <p className="text-[13px] text-foreground/90">
                  {row.email.from} <span className="text-muted-foreground">&lt;{row.email.fromEmail}&gt;</span>
                </p>
              </div>
              <div>
                <p className="text-eyebrow text-muted-foreground mb-1.5">Body</p>
                <pre className="whitespace-pre-wrap text-[14px] text-foreground/90 font-sans leading-[1.65]">
                  {row.email.body}
                </pre>
              </div>
              {row.email.attachments.length > 0 && (
                <div>
                  <p className="text-eyebrow text-muted-foreground mb-2">Attachments</p>
                  <div className="space-y-1.5">
                    {row.email.attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 hover:border-border-strong transition-colors">
                        <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[13px] font-semibold text-foreground flex-1 truncate">{a.name}</span>
                        <span className="text-[11px] text-muted-foreground">{a.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Action footer — confidence-graded */}
      <div className="border-t border-border bg-muted/20 px-6 py-4">
        {/* INBOX actions */}
        {isInbox && row.inbox && row.inbox.status === "ready" && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-muted-foreground">
              {row.band === "high"
                ? "Confidence high — one click to send."
                : row.band === "low"
                  ? "Low confidence — review carefully before approving."
                  : "Review the agent's output, then approve."}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onDismissInbox(row.inbox!)} disabled={acting}>
                <XCircle className="h-3.5 w-3.5" />
                Dismiss
              </Button>
              {row.inbox.secondary_action_label && (
                <Button variant="outline" size="sm" disabled={acting}>
                  {row.inbox.secondary_action_label}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => onApproveInbox(row.inbox!)} disabled={acting}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {row.inbox.primary_action_label ?? "Approve"}
              </Button>
            </div>
          </div>
        )}
        {isInbox && row.inbox && row.inbox.status !== "ready" && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {row.inbox.action_taken ?? "Resolved"} ·{" "}
            {row.inbox.acted_at ? formatDistanceToNow(new Date(row.inbox.acted_at), { addSuffix: true }) : ""}
          </div>
        )}

        {/* REVIEW actions */}
        {isReview && row.review && row.review.status === "pending" && (
          <div className="space-y-3">
            <Textarea
              placeholder="Reviewer notes (optional, recorded in audit trail)…"
              value={reviewerNote}
              onChange={(e) => setReviewerNote(e.target.value)}
              rows={2}
              className="text-[13px] bg-background"
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12px] text-muted-foreground">
                {row.band === "low"
                  ? "Low confidence — full review required for compliance."
                  : "Confirm or override the AI's recommendation."}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" disabled={acting} onClick={() => onReviewAction(row.review!, "rejected")}>
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Reject
                </Button>
                <Button variant="primary" size="sm" disabled={acting} onClick={() => onReviewAction(row.review!, "approved")}>
                  {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </Button>
              </div>
            </div>
          </div>
        )}
        {isReview && row.review && row.review.status !== "pending" && (
          <div className="flex items-center gap-2 text-[12.5px]">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {row.review.status === "approved" ? "Approved" : "Rejected"} ·{" "}
              {row.review.reviewed_at && formatDistanceToNow(new Date(row.review.reviewed_at), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* EMAIL actions */}
        {isEmail && row.email && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-muted-foreground">Triage with an agent or reply.</div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onAskAssistant}>
                <Sparkles className="h-3.5 w-3.5" />
                Triage with AI
              </Button>
              <Button variant="primary" size="sm">
                <Send className="h-3.5 w-3.5" />
                Reply
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ───────────────────────────── small helpers ─────────────────────────────

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

function SourcePill({ row }: { row: WorkRow }) {
  if (row.source === "review") {
    return <StatusPill tone="warning" size="sm">{TYPE_LABEL[row.review!.decision_type] ?? "Approval"}</StatusPill>;
  }
  if (row.source === "email") {
    return <StatusPill tone="info" size="sm">Carrier email</StatusPill>;
  }
  return <StatusPill tone="primary" size="sm">{TYPE_LABEL[row.inbox!.type] ?? "Update"}</StatusPill>;
}

function ConfidenceBand({ band, confidence, large }: { band: "high" | "medium" | "low"; confidence: number; large?: boolean }) {
  const pct = Math.round(confidence * 100);
  const tone = band === "high" ? "success" : band === "medium" ? "warning" : "danger";
  return (
    <StatusPill tone={tone} size={large ? "md" : "sm"}>
      {band === "high" ? "✓ confident" : band === "medium" ? "review" : "low conf."}
      <span className="opacity-70 tabular-nums ml-0.5">{pct}%</span>
    </StatusPill>
  );
}
