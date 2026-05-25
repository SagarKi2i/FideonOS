'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRecentRuns } from "@/lib/pods";
import {
  Sparkles,
  ClipboardCheck,
  Activity,
  ArrowRight,
  Loader2,
  RefreshCw,
  Zap,
  Compass,
  Wand2,
  // Agent-action icons
  FileSearch, FileText, ClipboardList, Calculator, Scale,
  AlertCircle, Inbox as InboxIcon, Filter as FilterIcon, Gavel,
  ShieldAlert, RotateCcw, Bot,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InboxRow {
  id: string;
  status: string;
  type: string;
  priority: string;
  title: string;
  pod_id: string | null;
  pod_name: string | null;
  created_at: string;
}

interface ActivatedPodRow {
  id: string;
  model_id: string;
  model_name: string;
  activated_at: string;
}

// Verb + noun + icon for each agent. The Today card reads "{Agent name}
// {verb} {count} {noun}" — broker-readable activity instead of vague metric
// breakdowns.
const AGENT_ACTIONS: Record<string, { verb: string; noun: string; icon: LucideIcon }> = {
  "document-retrieval":           { verb: "pulled",      noun: "documents",           icon: FileSearch },
  "loss-run-reporting":           { verb: "pulled",      noun: "loss runs",           icon: ClipboardList },
  "acord-parser":                 { verb: "parsed",      noun: "forms",               icon: FileText },
  "quote-generation":             { verb: "processed",   noun: "quotes",              icon: Calculator },
  "policy-comparison":            { verb: "compared",    noun: "policies",            icon: Scale },
  "renewal-review":               { verb: "prepared",    noun: "renewals",            icon: RefreshCw },
  "claims-fnol":                  { verb: "drafted",     noun: "FNOLs",               icon: AlertCircle },
  "carrier-submission-intake":    { verb: "intook",      noun: "submissions",         icon: InboxIcon },
  "carrier-submission-triage":    { verb: "triaged",     noun: "submissions",         icon: FilterIcon },
  "carrier-claims-intake":        { verb: "intook",      noun: "claims",              icon: AlertCircle },
  "carrier-claims-adjudication":  { verb: "adjudicated", noun: "claims",              icon: Gavel },
  "carrier-fraud-detection":      { verb: "flagged",     noun: "fraud cases",         icon: ShieldAlert },
  "carrier-subrogation":          { verb: "recovered",   noun: "subrogation claims",  icon: RotateCcw },
  "multi-document":               { verb: "synthesised", noun: "documents",           icon: FileText },
  "document-search":              { verb: "searched",    noun: "documents",           icon: FileSearch },
  "generic-prompt":               { verb: "ran",         noun: "prompts",             icon: Bot },
};

function actionFor(podId: string) {
  return AGENT_ACTIONS[podId] ?? { verb: "ran", noun: "items", icon: Bot };
}

interface ReviewRow {
  id: string;
  status: string;
  title: string;
  pod_model_name: string | null;
  decision_type: string;
  confidence_score: number | null;
}

const greetingFor = (h: number) => h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

const niceDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export default function Today() {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [inboxItems, setInboxItems] = useState<InboxRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [activatedPods, setActivatedPods] = useState<ActivatedPodRow[]>([]);
  const [realRuns, setRealRuns] = useState<Array<{ pod_slug: string | null; started_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) { setLoading(false); return; }
    setUserName((user.email ?? "").split("@")[0]);

    const [inboxRes, reviewRes, podRes] = await Promise.all([
      supabase.from("inbox_items" as any).select("id,status,type,priority,title,pod_id,pod_name,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("decision_reviews").select("id,status,title,pod_model_name,decision_type,confidence_score").order("created_at", { ascending: false }).limit(40),
      supabase
        .from("activated_models")
        .select("id, model_id, model_name, activated_at")
        .eq("user_id", user.id)
        .order("activated_at", { ascending: false }),
    ]);

    setInboxItems(((inboxRes.data as unknown as InboxRow[]) ?? []));
    setReviews((reviewRes.data as unknown as ReviewRow[]) ?? []);
    setActivatedPods((podRes.data ?? []) as unknown as ActivatedPodRow[]);

    // Real pod runs (best-effort; empty pre-deploy). Folds into agent activity + KPIs.
    setRealRuns(await fetchRecentRuns(500));
    setLoading(false);
  };

  const agentCount = activatedPods.length;

  const counts = useMemo(() => {
    const ready = inboxItems.filter((i) => i.status === "ready").length;
    const live = inboxItems.filter((i) => i.status === "in_progress").length;
    const pendingReviews = reviews.filter((r) => r.status === "pending").length;

    // Agent-completion metrics (what agents did, not what user must do)
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const runsToday = realRuns.filter((r) => +new Date(r.started_at) >= +startOfToday).length;
    const runsWeek = realRuns.filter((r) => now - +new Date(r.started_at) < 7 * day).length;
    const completedToday = inboxItems.filter((i) => +new Date(i.created_at) >= +startOfToday).length + runsToday;
    const completedWeek = inboxItems.filter((i) => now - +new Date(i.created_at) < 7 * day).length + runsWeek;
    return { ready, live, pendingReviews, completedToday, completedWeek };
  }, [inboxItems, reviews, realRuns]);

  // Per-agent activity for the "What your agents shipped" card. Walks
  // every activated pod (so even idle pods render with 0), counts the
  // inbox_items it produced today and over the past 7 days, and pairs
  // with the right action verb so the reader sees "{Agent} {verb} {N}
  // {noun}" — e.g. "Document Retrieval pulled 142 documents".
  const agentActivity = useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Count inbox items per pod_id, today + this week.
    const countsToday: Record<string, number> = {};
    const countsWeek:  Record<string, number> = {};
    for (const it of inboxItems) {
      if (!it.pod_id) continue;
      const t = +new Date(it.created_at);
      if (t >= +startOfToday) countsToday[it.pod_id] = (countsToday[it.pod_id] ?? 0) + 1;
      if (now - t < week)     countsWeek[it.pod_id]  = (countsWeek[it.pod_id]  ?? 0) + 1;
    }
    // Fold in real pod_runs by slug so activity reflects actual executions.
    for (const r of realRuns) {
      if (!r.pod_slug) continue;
      const t = +new Date(r.started_at);
      if (t >= +startOfToday) countsToday[r.pod_slug] = (countsToday[r.pod_slug] ?? 0) + 1;
      if (now - t < week)     countsWeek[r.pod_slug]  = (countsWeek[r.pod_slug]  ?? 0) + 1;
    }

    return activatedPods.map((p) => {
      const action = actionFor(p.model_id);
      return {
        podId: p.model_id,
        name: p.model_name,
        verb: action.verb,
        noun: action.noun,
        icon: action.icon,
        today: countsToday[p.model_id] ?? 0,
        week:  countsWeek[p.model_id]  ?? 0,
      };
    });
  }, [activatedPods, inboxItems, realRuns]);

  const greeting = greetingFor(new Date().getHours());

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow={niceDate(new Date())}
        title={`${greeting}${userName ? `, ${userName}` : ""}.`}
        description="Read-only mission control. Your agents work in the background and write outputs straight into your AMS. The only place to act in Fideon is the Approvals section — for decisions that need your sign-off."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            {counts.pendingReviews > 0 ? (
              <Button variant="primary" size="sm" onClick={() => router.push("/approvals")}>
                <ClipboardCheck className="h-3.5 w-3.5" />
                {counts.pendingReviews} need{counts.pendingReviews === 1 ? "s" : ""} your approval
              </Button>
            ) : null}
          </>
        }
      />

      {/* KPI strip — observability only. The only KPI that's clickable is the
          one that maps to action (Review Queue). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Active agents"
          value={loading ? "—" : agentCount}
          icon={Sparkles}
          tone="primary"
          hint={agentCount === 0 ? "browse marketplace" : "deployed in your workspace"}
        />
        <KpiCard
          label="Completed today"
          value={loading ? "—" : counts.completedToday}
          icon={ClipboardCheck}
          tone="success"
          hint={counts.completedToday > 0 ? "shipped to your AMS" : "nothing yet today"}
        />
        <KpiCard
          label="In flight"
          value={loading ? "—" : counts.live}
          icon={Activity}
          tone="success"
          hint={counts.live > 0 ? "agents working now" : "idle"}
        />
        <button
          onClick={() => router.push("/approvals")}
          className="text-left"
          aria-label="Open Approvals"
        >
          <KpiCard
            label="Needs your approval"
            value={loading ? "—" : counts.pendingReviews}
            icon={ClipboardCheck}
            tone={counts.pendingReviews > 0 ? "warning" : "default"}
            hint={counts.pendingReviews > 0 ? "open approvals →" : "all clear"}
          />
        </button>
      </div>

      {/* What your agents shipped — tile-grid per activated pod, each tile
          a clickable big-number summary with the agent's specific verb. */}
      <section className="mb-6">
        <div className="flex items-end justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground tracking-tight inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              What your agents shipped
            </h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              One tile per activated agent. Click to open its dashboard.
            </p>
          </div>
        </div>
        {loading ? (
          <Card className="px-4 py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </Card>
        ) : agentActivity.length === 0 ? (
          <Card className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No agents activated yet —{" "}
            <button onClick={() => router.push("/marketplace")} className="text-primary font-semibold hover:underline">
              browse the marketplace
            </button>{" "}
            to deploy your first.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentActivity.map((a) => {
              const isIdle = a.today === 0 && a.week === 0;
              return (
                <Card
                  key={a.podId}
                  onClick={() => router.push(`/pod/${a.podId}`)}
                  className={cn(
                    "group p-4 cursor-pointer transition-all",
                    "hover:border-border-strong hover:-translate-y-0.5",
                    isIdle && "opacity-70 hover:opacity-100",
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      "h-9 w-9 rounded flex items-center justify-center shrink-0",
                      isIdle ? "bg-muted text-muted-foreground" : "bg-accent text-primary",
                    )}>
                      <a.icon className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-[12px] font-semibold text-foreground truncate mb-2">{a.name}</p>

                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      "text-[28px] font-semibold tracking-tight tabular-nums leading-none",
                      a.today > 0 ? "text-foreground" : "text-muted-foreground/60",
                    )}>
                      {a.today}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {a.noun} {a.verb} today
                    </span>
                  </div>

                  <div className="mt-1.5 text-[11.5px] text-muted-foreground tabular-nums">
                    {a.week > 0 ? (
                      <>
                        <span className="font-semibold text-foreground/80">{a.week}</span> in the last 7 days
                      </>
                    ) : (
                      <span className="italic">no activity in the last 7 days</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Jump-off rail — slim full-width section below the per-agent grid. */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[14px] font-semibold tracking-tight text-foreground">Jump in</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          <JumpCard icon={ClipboardCheck}   label="Approvals"      hint={counts.pendingReviews > 0 ? `${counts.pendingReviews} awaiting` : "All clear"} onClick={() => router.push("/approvals")} />
          <JumpCard icon={Compass}          label="Marketplace"    hint="Browse agents"                                        onClick={() => router.push("/marketplace")} />
          <JumpCard icon={Zap}              label="Automations"    hint="Workflows"                                            onClick={() => router.push("/automations")} />
          <JumpCard icon={Wand2}            label="Request a pod"  hint="Engineered for you"                                    onClick={() => router.push("/request-pod")} />
        </div>
      </Card>

    </div>
  );
}

function JumpCard({
  icon: Icon, label, hint, onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 px-5 py-4 hover:bg-accent/40 transition-colors text-left"
    >
      <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 w-full">
        <p className="text-[13.5px] font-semibold text-foreground truncate">{label}</p>
        <p className="text-[11.5px] text-muted-foreground truncate">{hint}</p>
      </div>
    </button>
  );
}

