'use client';
// Install dialog — renders a pod's per-pod configuration form from its
// config_schema (a JSON-Schema subset), then provisions it via pod-provision
// and polls the deployment to running. Used from the marketplace.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, AlertCircle, Cloud, Plug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  installPod, refreshInstallation,
  type PodDefinition, type JsonSchemaProperty, type InstallationStatus,
} from "@/lib/pods";

interface Props {
  pod: PodDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}

type Phase = "config" | "provisioning" | "running" | "error";

export function InstallPodDialog({ pod, open, onOpenChange, onInstalled }: Props) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [phase, setPhase] = useState<Phase>("config");
  const [installStatus, setInstallStatus] = useState<InstallationStatus | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const properties = useMemo<[string, JsonSchemaProperty][]>(
    () => Object.entries(pod?.config_schema?.properties ?? {}),
    [pod],
  );
  const required = pod?.config_schema?.required ?? [];

  // Seed defaults whenever the dialog opens for a pod.
  useEffect(() => {
    if (!open || !pod) return;
    const seed: Record<string, unknown> = { ...pod.default_config };
    for (const [key, prop] of Object.entries(pod.config_schema?.properties ?? {})) {
      if (seed[key] === undefined && prop.default !== undefined) seed[key] = prop.default;
    }
    setValues(seed);
    setPhase("config");
    setInstallStatus(null);
    setEndpoint(null);
    setErrorMsg(null);
  }, [open, pod]);

  const setField = (key: string, val: unknown) => setValues((v) => ({ ...v, [key]: val }));

  const submit = async () => {
    if (!pod) return;
    // Minimal required validation.
    for (const key of required) {
      if (values[key] === undefined || values[key] === "") {
        toast({ title: "Missing field", description: `${key} is required.`, variant: "destructive" });
        return;
      }
    }
    setPhase("provisioning");
    const res = await installPod(pod.slug, values);
    if (res.error || !res.installation) {
      setPhase("error");
      setErrorMsg(res.error ?? "Install failed");
      return;
    }
    setInstallStatus(res.installation.status);
    setEndpoint(res.runtime?.runtime_endpoint_url ?? null);
    if (res.installation.status === "running") { setPhase("running"); onInstalled?.(); return; }
    if (res.installation.status === "failed") { setPhase("error"); setErrorMsg("Pod sync failed"); return; }

    // Poll until the pod is synced+running (stub completes immediately; real Azure
    // runtime provisioning takes longer, then the pod syncs).
    const installationId = res.installation.id;
    for (let i = 0; i < 40; i++) {
      const st = await refreshInstallation(installationId, pod.slug);
      const status = st.installation?.status ?? null;
      setInstallStatus(status);
      setEndpoint(st.runtime?.runtime_endpoint_url ?? null);
      if (status === "running") { setPhase("running"); onInstalled?.(); return; }
      if (status === "failed") { setPhase("error"); setErrorMsg("Pod sync failed"); return; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Still syncing after the polling window — manager page will continue tracking.
    setPhase("running");
    onInstalled?.();
  };

  if (!pod) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            Install {pod.name}
          </DialogTitle>
          <DialogDescription>
            {phase === "config"
              ? "Configure this pod, then we'll provision its runtime and expose it as an MCP tool."
              : phase === "provisioning"
                ? "Provisioning the pod runtime…"
                : phase === "running"
                  ? "Pod installed and running."
                  : "Something went wrong."}
          </DialogDescription>
        </DialogHeader>

        {phase === "config" && (
          <div className="space-y-4 py-2">
            {properties.length === 0 && (
              <p className="text-sm text-muted-foreground">This pod has no configurable options.</p>
            )}
            {properties.map(([key, prop]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key} className="text-[13px]">
                  {prop.title ?? key}{required.includes(key) && <span className="text-destructive"> *</span>}
                </Label>
                {prop.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Switch id={key} checked={!!values[key]} onCheckedChange={(v) => setField(key, v)} />
                    <span className="text-[12px] text-muted-foreground">{prop.description}</span>
                  </div>
                ) : prop.enum ? (
                  <select
                    id={key}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={String(values[key] ?? "")}
                    onChange={(e) => setField(key, e.target.value)}
                  >
                    {prop.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : prop.type === "array" ? (
                  <Input
                    id={key}
                    value={Array.isArray(values[key]) ? (values[key] as string[]).join(", ") : ""}
                    placeholder="comma-separated"
                    onChange={(e) => setField(key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                  />
                ) : (
                  <Input
                    id={key}
                    type={prop.type === "number" ? "number" : "text"}
                    value={String(values[key] ?? "")}
                    onChange={(e) => setField(key, prop.type === "number" ? Number(e.target.value) : e.target.value)}
                  />
                )}
                {prop.description && prop.type !== "boolean" && (
                  <p className="text-[11px] text-muted-foreground">{prop.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {(phase === "provisioning" || phase === "running") && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            {phase === "running"
              ? <CheckCircle2 className="h-10 w-10 text-success" />
              : <Loader2 className="h-10 w-10 text-primary animate-spin" />}
            <p className="text-sm font-medium">
              {phase === "running" ? "Running" : `Provisioning runtime & syncing pod (${installStatus ?? "pending"})`}
            </p>
            {endpoint && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Plug className="h-3 w-3" /> <code className="break-all">{endpoint}</code>
              </div>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        )}

        <DialogFooter>
          {phase === "config" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit}>
                <Cloud className="h-4 w-4" /> Install & provision
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>
          )}
          {phase === "error" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button variant="primary" onClick={() => setPhase("config")}>Try again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
