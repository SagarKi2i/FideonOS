'use client';
// Desktop Runtime — the attended pod runner.
//
// This screen is the face of the embedded base runtime when the app runs in
// Electron: it lists the user's installed pods and runs them LOCALLY (a visible
// Chromium opens for browser pods). Each run is persisted to Supabase so it
// flows into dashboards / Today / the review queue. In the browser (non-Electron)
// it explains how to get the desktop app.

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Server, Play, Loader2, Monitor, Plug, CheckCircle2, AlertCircle, Box } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchMyInstallations, recordLocalRun, type InstallationWithRuntime } from "@/lib/pods";

// The runtime API exposed by Electron preload (undefined in a plain browser).
type RuntimeApi = {
  status: () => Promise<{ ok: boolean; pods?: string[]; error?: string }>;
  canRun: (slug: string) => Promise<{ canRun: boolean }>;
  run: (args: { slug: string; toolName: string; config: Record<string, unknown>; input: Record<string, unknown> }) =>
    Promise<{ ok: boolean; output?: Record<string, unknown>; confidence?: number; error?: string }>;
};
const runtimeApi = (): RuntimeApi | null => (window as unknown as { electron?: { runtime?: RuntimeApi } }).electron?.runtime ?? null;

export default function DesktopRuntime() {
  const { toast } = useToast();
  const [installs, setInstalls] = useState<InstallationWithRuntime[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<Record<string, { output: unknown; needsReview: boolean }>>({});

  const api = runtimeApi();

  useEffect(() => {
    (async () => {
      setInstalls(await fetchMyInstallations());
      if (api) setHealth(await api.status());
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (inst: InstallationWithRuntime) => {
    const slug = inst.pod?.slug;
    const toolName = inst.pod?.mcp_tool_name ?? slug?.replace(/-/g, "_") ?? "";
    if (!api || !slug) return;
    setRunningId(inst.id);
    const res = await api.run({ slug, toolName, config: inst.config ?? {}, input: { invokedFrom: "desktop-runtime" } });
    setRunningId(null);
    if (!res.ok || !res.output) {
      toast({ title: "Run failed", description: res.error ?? "Unknown error", variant: "destructive" });
      return;
    }
    // Persist the local run to Supabase so it shows up everywhere else.
    const { needsReview } = await recordLocalRun({
      installation: inst, input: { invokedFrom: "desktop-runtime" },
      output: res.output, confidence: res.confidence ?? 0.9,
    });
    setLastOutput((p) => ({ ...p, [inst.id]: { output: res.output, needsReview } }));
    toast({
      title: needsReview ? "Ran — flagged for review" : "Run complete",
      description: needsReview ? "Output was below the confidence threshold." : "Saved to your runs.",
    });
  };

  if (!api) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader eyebrow="Desktop runtime" title="Run pods on your machine" icon={Monitor} />
        <EmptyState
          icon={Monitor}
          title="Open the Fideon desktop app"
          description="The base runtime runs your pods locally with a visible browser. Launch the desktop app (npm run electron:dev) and sign in to run installed pods here."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Desktop runtime"
        title="Your base runtime"
        description="This desktop is your pod runtime. Run an installed pod and watch it work — a browser window opens for browser pods."
        icon={Monitor}
        actions={
          <StatusPill tone={health?.ok ? "success" : "danger"} dot pulse={!!health?.ok} size="lg">
            <Server className="h-3 w-3" />{health?.ok ? "Runtime online" : "Runtime offline"}
          </StatusPill>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : installs.length === 0 ? (
        <EmptyState icon={Box} title="No installed pods" description="Install a pod from the Marketplace, then run it here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {installs.map((inst) => {
            const out = lastOutput[inst.id];
            const busy = runningId === inst.id;
            return (
              <Card key={inst.id} className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[14px] font-semibold truncate">{inst.pod?.name ?? inst.pod?.slug}</h3>
                    <p className="text-[11.5px] text-muted-foreground truncate">{inst.pod?.mcp_tool_name}</p>
                  </div>
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => run(inst)}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {busy ? "Running…" : "Run"}
                  </Button>
                </div>
                {out && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {out.needsReview
                        ? <><AlertCircle className="h-3.5 w-3.5 text-warning" /><span className="text-[12px] font-medium text-warning">Flagged for review</span></>
                        : <><CheckCircle2 className="h-3.5 w-3.5 text-success" /><span className="text-[12px] font-medium text-success">Completed</span></>}
                    </div>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-[1.5] text-foreground/80 max-h-48 overflow-auto">
{JSON.stringify(out.output, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
