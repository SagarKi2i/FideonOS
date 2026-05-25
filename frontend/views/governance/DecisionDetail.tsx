'use client';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Brain, User, Shield, FileDown, FileJson, CheckCircle2, XCircle,
  Clock, AlertTriangle, GitCompare, Activity, Hash, Calendar, Box,
} from "lucide-react";
import {
  DecisionRecord, DecisionEvent, RISK_BADGE, STATUS_BADGE, EVENT_LABEL, logExport,
} from "@/lib/governance";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownRenderer from "@/components/playground/MarkdownRenderer";

export default function DecisionDetail() {
  const _p = useParams(); const id = Array.isArray(_p?.id) ? _p.id[0] : _p?.id;
  const router = useRouter();
  const { toast } = useToast();
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    const [recRes, evtRes] = await Promise.all([
      (supabase as any).from("decision_records").select("*").eq("id", id).single(),
      (supabase as any).from("decision_events").select("*").eq("decision_record_id", id).order("created_at", { ascending: true }),
    ]);
    setRecord(recRes.data as unknown as DecisionRecord);
    setEvents((evtRes.data as unknown as DecisionEvent[]) || []);
    setLoading(false);
  };

  const exportJson = async () => {
    if (!record) return;
    const payload = {
      decision_record: record,
      timeline: events,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decision-${record.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await logExport(record.id, "json");
    toast({ title: "Exported", description: "JSON audit record downloaded" });
    load();
  };

  const exportPdf = async () => {
    if (!record) return;
    // Minimal printable HTML approach
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPdfHtml(record, events));
    w.document.close();
    setTimeout(() => w.print(), 300);
    await logExport(record.id, "pdf");
    toast({ title: "Export ready", description: "Use the print dialog to save as PDF" });
    load();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Loading decision record…</div>;
  }
  if (!record) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Decision record not found.</div>;
  }

  const risk = RISK_BADGE[record.risk_level];
  const status = STATUS_BADGE[record.status];

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight truncate">{record.title}</h1>
              <Badge variant="outline" className={cn("text-[10px] h-5", risk.className)}>{risk.label} risk</Badge>
              <Badge variant="outline" className={cn("text-[10px] h-5", status.className)}>{status.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Hash className="h-3 w-3" />
              <span className="font-mono">{record.id.slice(0, 8)}</span>
              <span>·</span>
              <Calendar className="h-3 w-3" />
              {new Date(record.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}>
            <FileJson className="h-3.5 w-3.5 mr-1.5" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileDown className="h-3.5 w-3.5 mr-1.5" />
            PDF Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="evidence">
        <TabsList>
          <TabsTrigger value="evidence" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Evidence</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Timeline ({events.length})</TabsTrigger>
          <TabsTrigger value="delta" className="gap-1.5"><GitCompare className="h-3.5 w-3.5" /> AI vs Human</TabsTrigger>
          <TabsTrigger value="lineage" className="gap-1.5"><Box className="h-3.5 w-3.5" /> Lineage</TabsTrigger>
        </TabsList>

        {/* EVIDENCE */}
        <TabsContent value="evidence" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* AI Recommendation — wide */}
            <Card className="lg:col-span-2 border-primary/20 bg-primary/[0.02] overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-2 font-medium">
                  <Brain className="h-4 w-4 text-primary" /> AI Recommendation
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">{record.model_version || "v—"}</Badge>
                  {record.ai_confidence !== null && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {Math.round(record.ai_confidence * 100)}% confidence
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[420px]">
                  <div className="p-5">
                    {record.ai_recommendation ? (
                      <MarkdownRenderer content={record.ai_recommendation} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No AI recommendation captured.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Right rail: Human decision + Explainability */}
            <div className="space-y-4">
              <Card className={cn(
                "border-border/60",
                record.status === "approved" && "border-emerald-500/30 bg-emerald-500/[0.03]",
                record.status === "rejected" && "border-rose-500/30 bg-rose-500/[0.03]",
              )}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 font-medium">
                    <User className="h-4 w-4" /> Human Decision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {record.status === "pending" ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-amber-700">
                        <Clock className="h-4 w-4" />
                        Awaiting human review
                      </div>
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => router.push("/review-queue")}>
                        Open Review Queue
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {record.status === "approved" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        )}
                        <span className="text-sm font-medium capitalize">{record.final_decision}</span>
                      </div>
                      {record.final_decision_at && (
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(record.final_decision_at).toLocaleString()}
                        </p>
                      )}
                      {record.final_reason_code && (
                        <Badge variant="outline" className="text-[10px]">Reason: {record.final_reason_code}</Badge>
                      )}
                      {record.final_reason_notes && (
                        <div className="text-xs text-foreground/90 leading-relaxed bg-background rounded-md border border-border/50 p-2.5">
                          {record.final_reason_notes}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Explainability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {record.reason_summary && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                      <p className="text-xs leading-relaxed">{record.reason_summary}</p>
                    </div>
                  )}
                  {Array.isArray(record.key_factors) && record.key_factors.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Key factors</p>
                      <div className="flex flex-wrap gap-1">
                        {record.key_factors.map((f: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-[10px] h-5">
                            {typeof f === "string" ? f.replace(/_/g, " ") : (f.label || "").replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!record.reason_summary && (!record.key_factors || record.key_factors.length === 0)) && (
                    <p className="text-xs text-muted-foreground">No explainability captured.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom row: Input snapshot + Policy checks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Input Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[220px]">
                  <pre className="text-[11px] bg-muted/40 rounded-md p-3 font-mono">
                    {JSON.stringify(record.input_snapshot, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Policy Checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Array.isArray(record.policy_checks) && record.policy_checks.length > 0 ? (
                  <div className="space-y-2">
                    {record.policy_checks.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm border border-border/50 rounded-md px-3 py-2">
                        {p.outcome === "pass" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : p.outcome === "fail" ? (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        <span className="font-medium">{p.rule}</span>
                        <span className="text-xs text-muted-foreground ml-auto capitalize">{p.outcome}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Shield className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">No policy rules evaluated</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Policy engine not enabled in this version</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          <Card className="border-border/60">
            <CardContent className="p-6">
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No events recorded.</p>
              ) : (
                <ol className="relative border-l border-border/60 ml-2 space-y-4">
                  {events.map((e) => (
                    <li key={e.id} className="ml-4">
                      <span className={cn(
                        "absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background",
                        e.actor_type === "ai" ? "bg-primary" :
                        e.actor_type === "human" ? "bg-emerald-500" : "bg-muted-foreground"
                      )} />
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{EVENT_LABEL[e.event_type] || e.event_type}</p>
                            <Badge variant="outline" className="text-[10px] h-4 capitalize">{e.actor_type}</Badge>
                          </div>
                          {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                          {Object.keys(e.payload || {}).length > 0 && (
                            <pre className="text-[10px] mt-1.5 bg-muted/40 rounded p-2 overflow-x-auto font-mono max-w-2xl">
                              {JSON.stringify(e.payload, null, 0)}
                            </pre>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {new Date(e.created_at).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI VS HUMAN */}
        <TabsContent value="delta" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GitCompare className="h-4 w-4" /> Delta: AI vs Human
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {record.ai_human_agreement === null ? (
                <p className="text-sm text-muted-foreground">No human decision recorded yet.</p>
              ) : (
                <>
                  <div className={cn(
                    "rounded-md p-4 border",
                    record.ai_human_agreement
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800"
                      : "border-rose-500/30 bg-rose-500/5 text-rose-800"
                  )}>
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {record.ai_human_agreement
                        ? <><CheckCircle2 className="h-4 w-4" /> Human agreed with AI</>
                        : <><AlertTriangle className="h-4 w-4" /> Human overrode AI</>}
                    </div>
                    <p className="text-xs mt-1 opacity-90">{record.delta_summary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-border/60 rounded-md p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">AI said</p>
                      <p className="text-sm whitespace-pre-wrap">{record.ai_recommendation?.slice(0, 400)}…</p>
                    </div>
                    <div className="border border-border/60 rounded-md p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Human concluded</p>
                      <p className="text-sm capitalize font-medium">{record.final_decision}</p>
                      {record.final_reason_notes && <p className="text-sm mt-1.5 text-foreground/80">{record.final_reason_notes}</p>}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LINEAGE */}
        <TabsContent value="lineage" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Model & Version Lineage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetaRow label="Model ID" value={record.pod_model_id} mono />
                <MetaRow label="Model Name" value={record.pod_model_name} />
                <MetaRow label="Version" value={record.model_version || "—"} mono />
                <MetaRow label="Domain" value={record.domain} />
                <MetaRow label="Decision Type" value={record.decision_type} />
                <MetaRow label="Risk Level" value={record.risk_level} />
              </div>
              {record.prompt_snapshot && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Prompt Snapshot</p>
                  <pre className="text-[11px] bg-muted/40 rounded p-3 overflow-x-auto font-mono max-h-[200px]">{record.prompt_snapshot}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px]">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border border-border/50 rounded-md p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-sm mt-0.5 truncate", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function buildPdfHtml(record: DecisionRecord, events: DecisionEvent[]) {
  return `<!doctype html><html><head><title>Decision Report ${record.id}</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; color: #111; max-width: 780px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    h2 { font-size: 14px; margin-top: 24px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
    .muted { color: #666; font-size: 11px; }
    .row { display: flex; gap: 16px; margin: 6px 0; }
    .label { width: 140px; color: #666; font-size: 11px; text-transform: uppercase; }
    .val { flex: 1; font-size: 13px; }
    .box { border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px; margin: 8px 0; font-size: 13px; white-space: pre-wrap; }
    .evt { padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 12px; }
  </style></head><body>
  <h1>Decision Audit Report</h1>
  <p class="muted">${record.title} · ID ${record.id}</p>

  <h2>Summary</h2>
  <div class="row"><div class="label">Domain</div><div class="val">${record.domain}</div></div>
  <div class="row"><div class="label">Decision Type</div><div class="val">${record.decision_type}</div></div>
  <div class="row"><div class="label">Risk Level</div><div class="val">${record.risk_level}</div></div>
  <div class="row"><div class="label">Status</div><div class="val">${record.status}</div></div>
  <div class="row"><div class="label">Model</div><div class="val">${record.pod_model_name} (${record.model_version || "v—"})</div></div>
  <div class="row"><div class="label">Created</div><div class="val">${new Date(record.created_at).toLocaleString()}</div></div>

  <h2>AI Recommendation</h2>
  <div class="box">${(record.ai_recommendation || "—").replace(/</g, "&lt;")}</div>

  <h2>Human Decision</h2>
  <div class="row"><div class="label">Outcome</div><div class="val">${record.final_decision || "Pending"}</div></div>
  <div class="row"><div class="label">Decided At</div><div class="val">${record.final_decision_at ? new Date(record.final_decision_at).toLocaleString() : "—"}</div></div>
  <div class="row"><div class="label">Reason</div><div class="val">${(record.final_reason_notes || "—").replace(/</g, "&lt;")}</div></div>
  <div class="row"><div class="label">Agreement</div><div class="val">${record.ai_human_agreement === null ? "—" : record.ai_human_agreement ? "Agreed with AI" : "Overrode AI"}</div></div>

  <h2>Timeline</h2>
  ${events.map(e => `<div class="evt"><strong>${EVENT_LABEL[e.event_type] || e.event_type}</strong> · ${e.actor_type} · ${new Date(e.created_at).toLocaleString()}${e.notes ? `<br/><span class="muted">${e.notes.replace(/</g, "&lt;")}</span>` : ""}</div>`).join("")}

  <p class="muted" style="margin-top: 32px;">Generated ${new Date().toLocaleString()} · Fideon OS Governance</p>
  </body></html>`;
}
