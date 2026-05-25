"use client";
// RuntimeShell — Electron-only workflow runner UI.
//
// Lists the signed-in user's agent workflows and runs each one locally
// through the embedded pod runtime, streaming a console log. Each step is
// persisted as a pod_run so the web app's dashboards stay in sync.
//
// Auth: uses FideonOS FastAPI session (cookies via /api/auth/me).
// Runtime: drives the local runtime via window.electron.runtime IPC.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import {
  Server, Play, Loader2, Workflow, LogOut, Cpu, ShieldCheck, CircleDot, ListChecks,
} from "lucide-react";

type RuntimeApi = {
  status: () => Promise<{ ok: boolean; pods?: string[]; error?: string }>;
  canRun: (slug: string) => Promise<{ canRun: boolean }>;
  run: (a: {
    slug: string;
    toolName: string;
    config: Record<string, unknown>;
    input: Record<string, unknown>;
  }) => Promise<{ ok: boolean; output?: Record<string, unknown>; confidence?: number; error?: string }>;
};

const rt = (): RuntimeApi =>
  (window as unknown as { electron: { runtime: RuntimeApi } }).electron.runtime;

interface Step {
  id?: string;
  agent_id: string;
  agent_name?: string;
  config?: Record<string, unknown>;
}
interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: Step[];
  is_active: boolean;
  last_run_at: string | null;
}
interface LogLine { t: string; level: "info" | "ok" | "warn" | "err"; text: string; }

export default function RuntimeShell() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [online, setOnline] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [canRun, setCanRun] = useState<Record<string, boolean>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (level: LogLine["level"], text: string) =>
    setLog((p) => [...p, { t: new Date().toLocaleTimeString(), level, text }]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      addLog("info", "Runtime starting…");
      let st = await rt().status();
      for (let i = 0; i < 12 && !st.ok; i++) {
        if (i === 0) addLog("info", "  waiting for runtime to come up…");
        await new Promise((r) => setTimeout(r, 1000));
        st = await rt().status();
      }
      setOnline(st.ok);
      addLog(st.ok ? "ok" : "err", st.ok ? "Runtime online" : `Runtime offline: ${st.error ?? "no response"}`);

      // Load pipelines from the FastAPI backend.
      const res = await fetch(`${getApiUrl()}/api/pipelines`, { credentials: "include" }).catch(() => null);
      const data = res?.ok ? await res.json() : null;
      const pls: Pipeline[] = ((data?.pipelines ?? data ?? []) as Pipeline[]).map((p) => ({
        ...p, steps: Array.isArray(p.steps) ? p.steps : [],
      }));
      setPipelines(pls);
      addLog("info", `${pls.length} workflow(s) found.`);

      // Check which step agents can run locally.
      const slugs = [...new Set(pls.flatMap((p) => p.steps.map((s) => s.agent_id)))];
      const cr: Record<string, boolean> = {};
      for (const slug of slugs) cr[slug] = (await rt().canRun(slug)).canRun;
      setCanRun(cr);
    })();
  }, [user]);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  const runPipeline = async (p: Pipeline) => {
    setRunningId(p.id);
    addLog("info", `━━ Running workflow: ${p.name} (${p.steps.length} steps) ━━`);
    let carry: Record<string, unknown> = { workflow: p.name };
    for (let i = 0; i < p.steps.length; i++) {
      const step = p.steps[i];
      const slug = step.agent_id;
      const label = step.agent_name ?? slug;
      if (!canRun[slug]) {
        addLog("warn", `↷ step ${i + 1}/${p.steps.length} ${label} — skipped (no local build on this device)`);
        continue;
      }
      const toolName = slug.replace(/-/g, "_");
      addLog("info", `▶ step ${i + 1}/${p.steps.length} ${label} — running…`);
      const res = await rt().run({
        slug, toolName, config: step.config ?? {},
        input: { config: step.config ?? {}, context: carry },
      });
      if (!res.ok || !res.output) { addLog("err", `✗ ${label}: ${res.error ?? "failed"}`); break; }
      const conf = res.confidence ?? 0.9;
      const podLog = Array.isArray((res.output as { log?: string[] }).log)
        ? (res.output as { log: string[] }).log : [];
      for (const line of podLog) addLog("info", `   ${line}`);
      const docs =
        (res.output.recent as Array<{ name: string }> | undefined) ??
        (res.output.documents as Array<{ name: string }> | undefined);
      const needsReview = conf < 0.85;
      // Persist via backend API.
      await fetch(`${getApiUrl()}/api/pods/runs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pod_slug: slug, input: carry, output: res.output,
          status: needsReview ? "needs_review" : "succeeded",
          confidence: conf, source: "workflow", completed_at: new Date().toISOString(),
        }),
      }).catch(() => { /* best-effort persistence */ });
      if (docs?.length) addLog("ok", `  ↓ ${docs.length} doc(s): ${docs.map((d) => d.name).join(", ")}`);
      addLog(needsReview ? "warn" : "ok",
        `${needsReview ? "⚠" : "✓"} ${label} done (conf ${conf.toFixed(2)})${needsReview ? " — flagged for review" : ""}`);
      carry = { ...carry, [`${slug}_output`]: res.output };
    }
    await fetch(`${getApiUrl()}/api/pipelines/${p.id}/ran`, {
      method: "POST", credentials: "include",
    }).catch(() => { /* best-effort */ });
    addLog("ok", `━━ ${p.name} complete ━━`);
    setRunningId(null);
  };

  // ── auth gate ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0b0d14] text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0b0d14] text-white">
        <div className="text-center space-y-3">
          <Server className="h-8 w-8 text-indigo-400 mx-auto" />
          <p className="text-sm text-white/60">Sign in to use Fideon Runtime.</p>
          <Button variant="outline" onClick={() => { window.location.href = "/auth"; }}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  // ── runner ────────────────────────────────────────────────────────────────
  const logColor: Record<LogLine["level"], string> = {
    info: "text-white/60",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    err: "text-rose-400",
  };

  return (
    <div className="h-screen flex flex-col bg-[#0b0d14] text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Server className="h-5 w-5 text-indigo-400" />
        <span className="font-semibold">Fideon Runtime</span>
        <span className="flex items-center gap-1.5 text-[12px] text-white/60 ml-2">
          <CircleDot className={`h-3 w-3 ${online ? "text-emerald-400" : "text-rose-400"}`} />
          {online ? "online" : "offline"}
        </span>
        <div className="flex-1" />
        <span className="text-[12px] text-white/50">{user.email}</span>
        <Button
          variant="ghost"
          size="icon"
          className="text-white/60 hover:text-white h-7 w-7"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-[1fr_1fr] min-h-0">
        {/* Workflows panel */}
        <div className="overflow-auto p-4 space-y-3 border-r border-white/10">
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-white/40">
            <Workflow className="h-3.5 w-3.5" /> Agent workflows · {pipelines.length}
          </div>
          {pipelines.length === 0 && (
            <p className="text-[13px] text-white/40">
              No workflows yet. Build one in the Fideon web app (Agent Workflows) — it will appear here to run.
            </p>
          )}
          {pipelines.map((p) => {
            const runnableSteps = p.steps.filter((s) => canRun[s.agent_id]).length;
            const busy = runningId === p.id;
            return (
              <div key={p.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                    <Workflow className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-white/40 truncate flex items-center gap-1">
                      <ListChecks className="h-3 w-3" /> {p.steps.length} steps · {runnableSteps} runnable here
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy || !online || runnableSteps === 0}
                    onClick={() => runPipeline(p)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] h-7 px-3 gap-1.5"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {busy ? "Running" : "Run"}
                  </Button>
                </div>
                {/* step chips */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 pl-12">
                  {p.steps.map((s, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] ${
                        canRun[s.agent_id] ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/40"
                      }`}
                    >
                      {canRun[s.agent_id] ? <ShieldCheck className="h-2.5 w-2.5" /> : <Cpu className="h-2.5 w-2.5" />}
                      {s.agent_name ?? s.agent_id}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Execution console */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 text-[12px] uppercase tracking-wider text-white/40 border-b border-white/10">
            Execution console
          </div>
          <div ref={logRef} className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed">
            {log.length === 0 && <p className="text-white/30">Run a workflow to see it execute…</p>}
            {log.map((l, i) => (
              <div key={i} className={logColor[l.level]}>
                <span className="text-white/25">{l.t} </span>{l.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
