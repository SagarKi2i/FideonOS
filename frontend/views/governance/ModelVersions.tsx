'use client';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Box, Hash, Search, GitBranch, CheckCircle2, Archive,
  Sparkles, TrendingUp, Layers, Copy, Filter, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ModelVersion {
  id: string;
  model_id: string;
  model_name: string;
  version: string;
  prompt_hash: string | null;
  is_active: boolean;
  created_at: string;
}

type StatusFilter = "all" | "active" | "retired";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

export default function ModelVersions() {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [vRes, dRes] = await Promise.all([
      (supabase as any).from("model_versions").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("decision_records").select("model_version, pod_model_id"),
    ]);
    setVersions((vRes.data as unknown as ModelVersion[]) || []);
    const map: Record<string, number> = {};
    ((dRes.data as unknown as any[]) || []).forEach((d) => {
      const key = `${d.pod_model_id}:${d.model_version || "v—"}`;
      map[key] = (map[key] || 0) + 1;
    });
    setUsageMap(map);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let out = versions;
    if (statusFilter === "active") out = out.filter((v) => v.is_active);
    if (statusFilter === "retired") out = out.filter((v) => !v.is_active);
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((v) =>
        v.model_name.toLowerCase().includes(s) ||
        v.version.toLowerCase().includes(s) ||
        (v.prompt_hash || "").toLowerCase().includes(s)
      );
    }
    return out;
  }, [versions, search, statusFilter]);

  const stats = useMemo(() => {
    const active = versions.filter((v) => v.is_active).length;
    const totalDecisions = Object.values(usageMap).reduce((a, b) => a + b, 0);
    const uniqueModels = new Set(versions.map((v) => v.model_id)).size;
    return { active, retired: versions.length - active, totalDecisions, uniqueModels };
  }, [versions, usageMap]);

  // Group by model for hierarchy
  const grouped = useMemo(() => {
    const groups: Record<string, { name: string; versions: ModelVersion[] }> = {};
    filtered.forEach((v) => {
      if (!groups[v.model_id]) groups[v.model_id] = { name: v.model_name, versions: [] };
      groups[v.model_id].versions.push(v);
    });
    return groups;
  }, [filtered]);

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success("Prompt hash copied");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Box className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Model Registry</h1>
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-500/30 bg-emerald-500/5 text-emerald-700">
              <GitBranch className="h-2.5 w-2.5" />
              Versioned
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Every model + prompt revision that has produced a decision. Required for regulatory traceability.
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Versions", value: stats.active, icon: CheckCircle2, accent: "text-emerald-700 bg-emerald-500/10" },
          { label: "Retired", value: stats.retired, icon: Archive, accent: "text-slate-600 bg-slate-500/10" },
          { label: "Unique Models", value: stats.uniqueModels, icon: Layers, accent: "text-primary bg-primary/10" },
          { label: "Decisions Served", value: stats.totalDecisions, icon: Activity, accent: "text-violet-700 bg-violet-500/10" },
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
              placeholder="Search by model, version, or hash…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Status: <span className="capitalize font-medium">{statusFilter}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Lifecycle</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["all", "active", "retired"] as const).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setStatusFilter(k)} className="text-xs capitalize">
                  {k}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{filtered.length}</span> versions across <span className="font-medium text-foreground">{Object.keys(grouped).length}</span> models
          </div>
        </div>

        {/* Grouped table */}
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading registry…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No model versions match your filters.</p>
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-muted/30 border-b border-border/60 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              <div className="col-span-3">Model / Version</div>
              <div className="col-span-3">Prompt Hash</div>
              <div className="col-span-2">Decisions</div>
              <div className="col-span-2">Lifecycle</div>
              <div className="col-span-2">Registered</div>
            </div>

            {Object.entries(grouped).map(([modelId, group]) => {
              const totalForModel = group.versions.reduce(
                (acc, v) => acc + (usageMap[`${v.model_id}:${v.version}`] || 0), 0
              );
              return (
                <div key={modelId} className="border-b border-border/40 last:border-b-0">
                  {/* Model header */}
                  <div className="px-4 py-2 bg-muted/15 flex items-center justify-between border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-primary/10">
                        <Box className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs font-semibold">{group.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{modelId}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="tabular-nums">{group.versions.length} version{group.versions.length === 1 ? "" : "s"}</span>
                      <span className="text-border">·</span>
                      <span className="tabular-nums flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {totalForModel} decisions total
                      </span>
                    </div>
                  </div>

                  {/* Version rows */}
                  {group.versions.map((v, idx) => {
                    const decisions = usageMap[`${v.model_id}:${v.version}`] || 0;
                    const maxDecisionsInGroup = Math.max(
                      ...group.versions.map((vv) => usageMap[`${vv.model_id}:${vv.version}`] || 0), 1
                    );
                    const usagePct = (decisions / maxDecisionsInGroup) * 100;
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "grid grid-cols-12 gap-3 px-4 py-2.5 items-center text-xs hover:bg-accent/40 transition-colors",
                          idx !== group.versions.length - 1 && "border-b border-border/30"
                        )}
                      >
                        {/* Version */}
                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                          <div className={cn(
                            "h-6 w-6 rounded grid place-items-center shrink-0",
                            v.is_active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
                          )}>
                            <GitBranch className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-mono font-semibold tabular-nums">{v.version}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {v.is_active ? "Production" : "Archived"}
                            </div>
                          </div>
                        </div>

                        {/* Prompt hash */}
                        <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                          <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                          <code className="font-mono text-[11px] text-muted-foreground truncate">
                            {v.prompt_hash || "—"}
                          </code>
                          {v.prompt_hash && (
                            <button
                              onClick={() => copyHash(v.prompt_hash!)}
                              className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Copy hash"
                            >
                              <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>

                        {/* Decisions with sparkbar */}
                        <div className="col-span-2 flex items-center gap-2">
                          <span className="font-mono tabular-nums font-medium w-8 text-right">{decisions}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                v.is_active ? "bg-primary" : "bg-muted-foreground/40"
                              )}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                        </div>

                        {/* Status pill */}
                        <div className="col-span-2">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 h-5 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap w-fit",
                            v.is_active
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              : "bg-muted text-muted-foreground border-border"
                          )}>
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              v.is_active ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"
                            )} />
                            {v.is_active ? "Active" : "Retired"}
                          </span>
                        </div>

                        {/* Registered */}
                        <div className="col-span-2 text-[11px] text-muted-foreground">
                          <div className="tabular-nums">{new Date(v.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px] opacity-75">{relativeTime(v.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
