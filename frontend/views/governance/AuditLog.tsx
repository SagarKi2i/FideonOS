'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity, Search, Bot, User, Server, FileText, Shield,
  Download, Filter, Clock, ChevronRight, Sparkles,
} from "lucide-react";
import { DecisionEvent, EVENT_LABEL } from "@/lib/governance";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface EnrichedEvent extends DecisionEvent {
  record_title?: string;
  record_domain?: string;
}

type ActorFilter = "all" | "ai" | "human" | "system";

const ACTOR_META = {
  ai: { icon: Bot, label: "AI Agent", dot: "bg-primary", chip: "bg-primary/10 text-primary border-primary/20" },
  human: { icon: User, label: "Human", dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  system: { icon: Server, label: "System", dot: "bg-slate-400", chip: "bg-muted text-muted-foreground border-border" },
} as const;

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AuditLog() {
  const router = useRouter();
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("decision_events")
      .select("*, decision_records(title, domain)")
      .order("created_at", { ascending: false })
      .limit(500);

    const enriched: EnrichedEvent[] = (data || []).map((e: any) => ({
      ...e,
      record_title: e.decision_records?.title,
      record_domain: e.decision_records?.domain,
    }));
    setEvents(enriched);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let out = events;
    if (actorFilter !== "all") out = out.filter((e) => e.actor_type === actorFilter);
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((e) =>
        (e.record_title || "").toLowerCase().includes(s) ||
        (EVENT_LABEL[e.event_type] || "").toLowerCase().includes(s) ||
        (e.notes || "").toLowerCase().includes(s) ||
        (e.id || "").toLowerCase().includes(s)
      );
    }
    return out;
  }, [events, search, actorFilter]);

  const counts = useMemo(() => ({
    all: events.length,
    ai: events.filter((e) => e.actor_type === "ai").length,
    human: events.filter((e) => e.actor_type === "human").length,
    system: events.filter((e) => e.actor_type === "system").length,
  }), [events]);

  const last24h = useMemo(() =>
    events.filter((e) => Date.now() - new Date(e.created_at).getTime() < 86400000).length
  , [events]);

  // Group by date for visual section headers
  const grouped = useMemo(() => {
    const groups: Record<string, EnrichedEvent[]> = {};
    filtered.forEach((e) => {
      const d = new Date(e.created_at);
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      let label: string;
      if (d.toDateString() === today.toDateString()) label = "Today";
      else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
      else label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      if (!groups[label]) groups[label] = [];
      groups[label].push(e);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-500/30 bg-emerald-500/5 text-emerald-700">
              <Shield className="h-2.5 w-2.5" />
              Append-only · WORM
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Immutable event ledger. Every AI inference, human review, and system action — sorted newest first.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export Log
        </Button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: counts.all, icon: Activity, accent: "text-primary bg-primary/10" },
          { label: "Last 24 Hours", value: last24h, icon: Clock, accent: "text-blue-700 bg-blue-500/10" },
          { label: "AI Actions", value: counts.ai, icon: Bot, accent: "text-violet-700 bg-violet-500/10" },
          { label: "Human Reviews", value: counts.human, icon: User, accent: "text-emerald-700 bg-emerald-500/10" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card px-3.5 py-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{s.value}</p>
            </div>
            <div className={cn("p-2 rounded-md", s.accent)}>
              <s.icon className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-lg border border-border/60 bg-card">
        <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search events, records, actors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Actor: <span className="capitalize font-medium">{actorFilter === "all" ? "All" : ACTOR_META[actorFilter].label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Actor Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["all", "ai", "human", "system"] as const).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setActorFilter(k)} className="text-xs justify-between">
                  <span className="capitalize">{k === "all" ? "All actors" : ACTOR_META[k].label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{counts[k]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of {events.length}
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading audit log…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No events match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm px-4 py-1.5 border-b border-border/40 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{dateLabel}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{items.length} event{items.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="divide-y divide-border/40">
                  {items.map((e) => {
                    const meta = ACTOR_META[e.actor_type as keyof typeof ACTOR_META] || ACTOR_META.system;
                    const Icon = meta.icon;
                    const time = new Date(e.created_at);
                    return (
                      <li
                        key={e.id}
                        onClick={() => e.decision_record_id && router.push(`/governance/decisions/${e.decision_record_id}`)}
                        className="group relative flex items-stretch hover:bg-accent/40 transition-colors cursor-pointer"
                      >
                        {/* Time gutter */}
                        <div className="hidden sm:flex flex-col items-end justify-center w-[88px] shrink-0 px-3 py-2.5 border-r border-border/40 bg-muted/20">
                          <span className="text-[11px] font-mono tabular-nums text-foreground">
                            {time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{relativeTime(e.created_at)}</span>
                        </div>

                        {/* Actor rail */}
                        <div className="relative flex flex-col items-center w-9 shrink-0 py-2.5">
                          <div className={cn("h-7 w-7 rounded-full grid place-items-center border-2 border-background ring-1 ring-border", meta.chip)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0 py-2.5 pr-3 pl-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{EVENT_LABEL[e.event_type] || e.event_type}</span>
                            <span className={cn("inline-flex items-center gap-1 h-4 px-1.5 rounded border text-[10px] font-medium", meta.chip)}>
                              <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
                              {meta.label}
                            </span>
                            {e.record_domain && (
                              <Badge variant="outline" className="text-[10px] h-4 capitalize px-1.5 font-normal">
                                {e.record_domain}
                              </Badge>
                            )}
                          </div>
                          {e.record_title && (
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground min-w-0">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.record_title}</span>
                              <span className="text-border">·</span>
                              <span className="font-mono text-[10px]">DR-{e.decision_record_id?.slice(0, 6).toUpperCase()}</span>
                            </div>
                          )}
                          {e.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">"{e.notes}"</p>
                          )}
                        </div>

                        {/* Hash + chevron */}
                        <div className="hidden md:flex items-center gap-2 pr-3 shrink-0">
                          <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                            #{e.id.slice(0, 8)}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
