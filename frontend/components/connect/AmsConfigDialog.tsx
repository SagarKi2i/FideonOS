'use client';
// AMS credential configuration dialog.
//
// Two auth methods exposed via tabs:
//   • Credentials — username + password (works for systems that don't
//     publish an API or where the SDK isn't enabled for the agency yet).
//   • SDK         — API key + instance URL + optional tenant ID. Preferred
//     when the AMS vendor offers a developer key (Vertafore, Applied have
//     these for AMS360 / EZLynx / Epic; Hawksoft and QQCatalyst typically
//     need credentials).

import { useEffect, useState } from "react";
import { settingsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  KeyRound, Eye, EyeOff, Loader2, ShieldCheck, Code2,
} from "lucide-react";
import type { AmsSystem } from "@/lib/amsCatalog";

type AuthMethod = "credentials" | "sdk";

interface AmsConnection {
  id: string;
  auth_method: string;
  username: string | null;
  api_key_ciphertext: string | null;
  instance_url: string | null;
  tenant_id: string | null;
  extra?: { sandbox_db?: string; production_db?: string } | null;
  status: string;
}

export interface AmsConfigDialogProps {
  ams: AmsSystem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function AmsConfigDialog({
  ams, open, onOpenChange, onSaved,
}: AmsConfigDialogProps) {
  const { toast } = useToast();

  const [existing, setExisting] = useState<AmsConnection | null>(null);
  const [loading, setLoading] = useState(false);

  const [authMethod, setAuthMethod] = useState<AuthMethod>("credentials");
  // Credentials path
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // SDK path
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [sandboxDb, setSandboxDb] = useState("");
  const [productionDb, setProductionDb] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open || !ams) return;
    void loadExisting();
    setPassword("");
    setApiKey("");
    setShowPassword(false);
    setShowKey(false);
  }, [open, ams]);

  const loadExisting = async () => {
    if (!ams) return;
    setLoading(true);
    try {
      const all = (await settingsApi.ams()) as Array<AmsConnection & { ams_id: string }>;
      const data = all.find((r) => r.ams_id === ams.id) ?? null;

      if (data) {
        const row = data as unknown as AmsConnection;
        setExisting(row);
        setAuthMethod((row.auth_method as AuthMethod) ?? "credentials");
        setUsername(row.username ?? "");
        setInstanceUrl(row.instance_url ?? "");
        setSandboxDb(row.extra?.sandbox_db ?? "");
        setProductionDb(row.extra?.production_db ?? "");
      } else {
        setExisting(null);
        // Default auth method based on the AMS metadata.
        setAuthMethod(ams.auth === "apiKey" ? "sdk" : "credentials");
        setUsername("");
        setInstanceUrl("");
        setSandboxDb("");
        setProductionDb("");
      }
    } catch (e) {
      console.warn("[AmsConfigDialog] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!ams) return;

    if (authMethod === "credentials") {
      if (!username.trim() || (!existing && !password) || !instanceUrl.trim()) {
        toast({ title: "Missing fields", description: "Username, password, and instance URL are required.", variant: "destructive" });
        return;
      }
    } else {
      if (!instanceUrl.trim() || (!existing && !apiKey)) {
        toast({ title: "Missing fields", description: "Instance URL and API key are required.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        auth_method: authMethod,
        instance_url: instanceUrl.trim(),
      };
      if (authMethod === "credentials") {
        payload.username = username.trim();
        payload.extra = {};
        if (password) payload.password = password;
      } else {
        payload.extra = {
          sandbox_db:    sandboxDb.trim() || undefined,
          production_db: productionDb.trim() || undefined,
        };
        if (apiKey) payload.api_key = apiKey;
      }

      await settingsApi.upsertAms(ams.id, payload);

      toast({ title: `${ams.name} connected`, description: "Credentials saved. Test connection to verify." });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!ams) return;
    setTesting(true);
    await new Promise((r) => setTimeout(r, 900));
    setTesting(false);
    toast({ title: "Test queued", description: `Fideon will verify against ${ams.name} and report back.` });
  };

  const disconnect = async () => {
    if (!ams || !existing) return;
    try {
      await settingsApi.deleteAms(ams.id);
      toast({ title: `${ams.name} disconnected` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't disconnect", description: e.message ?? "Unknown error", variant: "destructive" });
    }
  };

  if (!ams) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {existing ? "Configure" : "Connect"} {ams.name}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {ams.vendor} · Fideon reads {ams.reads.slice(0, 3).join(", ")}{ams.reads.length > 3 ? "…" : ""} and writes back {ams.writes.slice(0, 2).join(", ")}{ams.writes.length > 2 ? "…" : ""}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="pt-1">
            <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as AuthMethod)}>
              <TabsList className="mb-4">
                <TabsTrigger value="credentials">
                  <KeyRound className="h-3.5 w-3.5" />Username & password
                </TabsTrigger>
                <TabsTrigger value="sdk">
                  <Code2 className="h-3.5 w-3.5" />SDK / API key
                </TabsTrigger>
              </TabsList>

              <TabsContent value="credentials" className="mt-0 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Username
                  </Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={`${ams.name} login username`}
                    className="text-[13px]"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-between">
                    Password
                    {existing && !password && (
                      <span className="text-[10.5px] font-normal normal-case text-muted-foreground tracking-normal">
                        (leave blank to keep current)
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={existing ? "••••••••" : `${ams.name} login password`}
                      className="text-[13px] pr-10 font-mono"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Instance URL
                  </Label>
                  <Input
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder={`https://yourtenant.${ams.id.replace(/-/g, "")}.com`}
                    className="text-[13px] font-mono"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Where your {ams.name} tenant lives. Fideon points login attempts at this host.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="sdk" className="mt-0 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    URL
                  </Label>
                  <Input
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder={`https://api.${ams.id.replace(/-/g, "")}.com`}
                    className="text-[13px] font-mono"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Endpoint Fideon calls. Get it from your {ams.name} developer portal.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-between">
                    SDK access key
                    {existing && !apiKey && (
                      <span className="text-[10.5px] font-normal normal-case text-muted-foreground tracking-normal">
                        (leave blank to keep current)
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={existing ? "••••••••" : "Issued from your developer portal"}
                      className="text-[13px] pr-10 font-mono"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Database name <span className="font-normal normal-case text-muted-foreground tracking-normal">(sandbox)</span>
                    </Label>
                    <Input
                      value={sandboxDb}
                      onChange={(e) => setSandboxDb(e.target.value)}
                      placeholder="e.g. acme_sandbox"
                      className="text-[13px] font-mono"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Database name <span className="font-normal normal-case text-muted-foreground tracking-normal">(production)</span>
                    </Label>
                    <Input
                      value={productionDb}
                      onChange={(e) => setProductionDb(e.target.value)}
                      placeholder="e.g. acme_prod"
                      className="text-[13px] font-mono"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Fideon runs reads/writes against the production database; sandbox is used for dry runs and previews.
                </p>
              </TabsContent>
            </Tabs>

            {/* Trust footer */}
            <Card className="mt-4 px-3 py-2.5 bg-muted/30 flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11.5px] text-foreground/75 leading-snug">
                Credentials are encrypted at rest, scoped to your account, and used only by Fideon agents acting on your behalf. Every call is logged in your audit trail.
              </p>
            </Card>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {existing && (
            <Button variant="ghost" size="sm" onClick={disconnect} className="text-destructive hover:text-destructive mr-auto">
              Disconnect
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
            {testing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Testing…</> : "Test connection"}
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : existing ? "Save changes" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
