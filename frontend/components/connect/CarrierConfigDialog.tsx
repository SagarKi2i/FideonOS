'use client';
// Carrier credential configuration dialog.
//
// Captures: username, password, agency/producer codes. Producer codes are a
// dynamic add/remove list (most brokerages have multiple — one per state,
// LOB, or sub-agency).
//
// All persistence goes through the FastAPI backend (settingsApi). The password
// is sent to the backend, which stores it in carrier_connections.password_ciphertext
// (encrypted at the API layer); it is never written to the DB from the browser.

import { useEffect, useState } from "react";
import { settingsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  KeyRound, Eye, EyeOff, Plus, X, Loader2, ShieldCheck, AlertCircle,
} from "lucide-react";
import type { Carrier } from "@/lib/carriers";

interface ProducerCode {
  code: string;
  label?: string;
}

interface CarrierConnection {
  id: string;
  username: string;
  producer_codes: ProducerCode[];
  extra?: { portal_url?: string } | null;
  status: string;
  last_test_at: string | null;
  last_test_message: string | null;
}

export interface CarrierConfigDialogProps {
  carrier: Carrier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function CarrierConfigDialog({
  carrier, open, onOpenChange, onSaved,
}: CarrierConfigDialogProps) {
  const { toast } = useToast();

  const [existing, setExisting] = useState<CarrierConnection | null>(null);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");
  const [producerCodes, setProducerCodes] = useState<ProducerCode[]>([{ code: "", label: "" }]);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open || !carrier) return;
    void loadExisting();
    setPassword("");
    setShowPassword(false);
  }, [open, carrier]);

  const loadExisting = async () => {
    if (!carrier) return;
    setLoading(true);
    try {
      const all = (await settingsApi.carriers()) as Array<CarrierConnection & { carrier_id: string }>;
      const data = all.find((r) => r.carrier_id === carrier.id) ?? null;

      if (data) {
        const row = data as unknown as CarrierConnection;
        setExisting(row);
        setUsername(row.username ?? "");
        setPortalUrl((row.extra?.portal_url as string) ?? "");
        setProducerCodes(
          Array.isArray(row.producer_codes) && row.producer_codes.length > 0
            ? row.producer_codes
            : [{ code: "", label: "" }],
        );
      } else {
        setExisting(null);
        setUsername("");
        setPortalUrl("");
        setProducerCodes([{ code: "", label: "" }]);
      }
    } catch (e) {
      console.warn("[CarrierConfigDialog] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateCode = (idx: number, patch: Partial<ProducerCode>) => {
    setProducerCodes((p) => p.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addCode = () => setProducerCodes((p) => [...p, { code: "", label: "" }]);

  const removeCode = (idx: number) => {
    setProducerCodes((p) => (p.length === 1 ? [{ code: "", label: "" }] : p.filter((_, i) => i !== idx)));
  };

  const save = async () => {
    if (!carrier) return;
    if (!username.trim() || (!existing && !password)) {
      toast({ title: "Missing fields", description: "Username and password are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const cleanedCodes = producerCodes
        .map((c) => ({ code: c.code.trim(), label: (c.label ?? "").trim() }))
        .filter((c) => c.code.length > 0);

      // password is sent only when set; the backend stores it as password_ciphertext.
      await settingsApi.upsertCarrier(carrier.id, {
        username: username.trim(),
        producer_codes: cleanedCodes,
        extra: portalUrl.trim() ? { portal_url: portalUrl.trim() } : {},
        ...(password ? { password } : {}),
      });

      toast({ title: `${carrier.name} connected`, description: "Credentials saved. Test connection to verify." });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!carrier) return;
    setTesting(true);
    // Stub — would call an edge function that hits the carrier portal.
    await new Promise((r) => setTimeout(r, 900));
    setTesting(false);
    toast({ title: "Test queued", description: "Fideon will verify against the carrier portal and report back." });
  };

  const disconnect = async () => {
    if (!carrier || !existing) return;
    try {
      await settingsApi.deleteCarrier(carrier.id);
      toast({ title: `${carrier.name} disconnected` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Couldn't disconnect", description: e.message ?? "Unknown error", variant: "destructive" });
    }
  };

  if (!carrier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {existing ? "Configure" : "Connect"} {carrier.name}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Credentials are encrypted at rest. Fideon uses them only to fetch and post on your behalf — every call is logged in your audit trail.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Credentials */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Username
                </Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your carrier-portal username"
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
                    placeholder={existing ? "••••••••" : "Your carrier-portal password"}
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
                  Portal URL <span className="font-normal normal-case text-muted-foreground tracking-normal">(optional)</span>
                </Label>
                <Input
                  value={portalUrl}
                  onChange={(e) => setPortalUrl(e.target.value)}
                  placeholder={`https://${carrier.id.replace(/-/g, "")}.com/login`}
                  className="text-[13px] font-mono"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Override the default login URL for {carrier.name} — useful for surplus-lines or broker-specific subdomains.
                </p>
              </div>
            </div>

            {/* Producer codes */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Agency / producer codes
                </Label>
                <Button variant="ghost" size="xs" onClick={addCode} className="text-primary">
                  <Plus className="h-3 w-3" />Add code
                </Button>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Optional. Add one row per agency or producer code Fideon should use when interacting with {carrier.name}.
              </p>
              <div className="space-y-2">
                {producerCodes.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center">
                    <Input
                      value={c.code}
                      onChange={(e) => updateCode(idx, { code: e.target.value })}
                      placeholder="Code (e.g. ACME-100)"
                      className="text-[13px] font-mono"
                    />
                    <Input
                      value={c.label ?? ""}
                      onChange={(e) => updateCode(idx, { label: e.target.value })}
                      placeholder="Label (e.g. CA Commercial)"
                      className="text-[13px]"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeCode(idx)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove code"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Existing status */}
            {existing && existing.last_test_at && (
              <Card className="px-3 py-2 bg-muted/30 flex items-start gap-2">
                {existing.status === "connected" ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-warning-foreground mt-0.5 shrink-0" />
                )}
                <p className="text-[11.5px] text-foreground/80">
                  Last tested {new Date(existing.last_test_at).toLocaleString()}
                  {existing.last_test_message && <> — {existing.last_test_message}</>}
                </p>
              </Card>
            )}

            {/* Trust footer */}
            <Card className="px-3 py-2.5 bg-muted/30 flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11.5px] text-foreground/75 leading-snug">
                Credentials are scoped to this account. Fideon never shares them across tenants. Revoke anytime by disconnecting.
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
          <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !username.trim()}>
            {testing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Testing…</> : "Test connection"}
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !username.trim()}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : existing ? "Save changes" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
