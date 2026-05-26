'use client';

// Admin · Carrier registry (FNF-566)
//
// CRUD over the `carriers` table that drives the doc-retrieval orchestrator
// at runtime. Backend: `/api/admin/carriers` (GET/PUT/DELETE) gated by
// `require_admin`. Mirrors the AdminPodRequests pattern for layout + sheet
// drawer; uses adminApi (HTTP) rather than direct Supabase access because the
// table is service-role-only behind the FastAPI dependency.

import { useEffect, useMemo, useState } from "react";

import { adminApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/ui/status-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Building2, Inbox, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";


type AuthKind = "password" | "api_key";
type MfaKind =
  | "totp_rfc6238"
  | "captcha_bypass"
  | "email_link"
  | "email_otp"
  | "sms_otp"
  | "captcha_hil"
  | "none";

interface Carrier {
  carrier_id: string;
  display_name: string;
  login_url: string;
  auth_kind: AuthKind;
  mfa_kind: MfaKind;
  hil_timeout_seconds: number;
  listing_selector_spec: Record<string, unknown>;
  totp_secret_b32: string | null;
  is_mock: boolean;
  is_active: boolean;
}

const EMPTY_CARRIER: Carrier = {
  carrier_id: "",
  display_name: "",
  login_url: "",
  auth_kind: "password",
  mfa_kind: "totp_rfc6238",
  hil_timeout_seconds: 120,
  listing_selector_spec: {},
  totp_secret_b32: null,
  is_mock: false,
  is_active: true,
};

const MFA_KINDS: MfaKind[] = [
  "totp_rfc6238",
  "captcha_bypass",
  "email_link",
  "email_otp",
  "sms_otp",
  "captcha_hil",
  "none",
];

export default function AdminCarriers() {
  const { toast } = useToast();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Carrier | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [specText, setSpecText] = useState("{}");
  const [specError, setSpecError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await adminApi.carriers()) as Carrier[];
      setCarriers(data);
    } catch (err) {
      toast({ title: "Couldn't load carriers", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (c: Carrier) => {
    setIsNew(false);
    setActive({ ...c });
    setSpecText(JSON.stringify(c.listing_selector_spec ?? {}, null, 2));
    setSpecError(null);
  };

  const openNew = () => {
    setIsNew(true);
    setActive({ ...EMPTY_CARRIER });
    setSpecText("{}");
    setSpecError(null);
  };

  const close = () => {
    setActive(null);
    setIsNew(false);
    setSpecError(null);
  };

  const save = async () => {
    if (!active) return;
    if (!active.carrier_id.trim()) {
      toast({ title: "carrier_id is required", variant: "destructive" });
      return;
    }
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(specText);
      if (typeof spec !== "object" || Array.isArray(spec) || spec === null) {
        throw new Error("must be a JSON object");
      }
    } catch (err) {
      setSpecError(String((err as Error).message));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...active, listing_selector_spec: spec };
      await adminApi.upsertCarrier(active.carrier_id, payload);
      toast({ title: isNew ? "Carrier created" : "Carrier updated" });
      close();
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Carrier) => {
    if (!confirm(`Delete carrier "${c.carrier_id}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteCarrier(c.carrier_id);
      toast({ title: "Carrier deleted" });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: String((err as Error).message), variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return carriers;
    return carriers.filter(
      (c) =>
        c.carrier_id.toLowerCase().includes(q) ||
        c.display_name.toLowerCase().includes(q) ||
        c.login_url.toLowerCase().includes(q),
    );
  }, [carriers, search]);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Admin · Doc Retrieval"
        title="Carriers"
        description="Registry of carrier portals the orchestrator can drive. Editing a row updates the live runtime config."
        icon={Building2}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />New carrier
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id, name, login URL…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_220px_140px_120px_100px_120px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Carrier</span>
          <span>Login URL</span>
          <span>MFA</span>
          <span>HIL timeout</span>
          <span>Status</span>
          <span></span>
        </div>
        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            <Inbox className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
            No carriers match.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li
                key={c.carrier_id}
                className="grid grid-cols-[1fr_220px_140px_120px_100px_120px] gap-3 px-5 py-3 items-center hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{c.display_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">{c.carrier_id}{c.is_mock && " · mock"}</p>
                </div>
                <span className="text-[11.5px] text-muted-foreground truncate font-mono">{c.login_url}</span>
                <span className="text-[11.5px] tabular-nums">{c.mfa_kind}</span>
                <span className="text-[11.5px] tabular-nums">{c.hil_timeout_seconds}s</span>
                <StatusPill tone={c.is_active ? "success" : "neutral"} size="sm">
                  {c.is_active ? "active" : "inactive"}
                </StatusPill>
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="xs" onClick={() => openEdit(c)}>Edit</Button>
                  <Button variant="ghost" size="xs" onClick={() => remove(c)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={active !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          {active && (
            <>
              <SheetHeader className="px-6 py-4 pr-12 border-b border-border bg-gradient-hero">
                <SheetTitle className="font-display text-[18px] font-bold tracking-tight">
                  {isNew ? "New carrier" : active.display_name || active.carrier_id}
                </SheetTitle>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {isNew ? "Add a row to the carriers registry." : "Editing the registry updates the orchestrator's runtime config."}
                </p>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-5">
                  <SectionHeader title="Identity" />
                  <Labeled label="carrier_id" hint="immutable; cannot rename after creation">
                    <Input
                      value={active.carrier_id}
                      onChange={(e) => setActive({ ...active, carrier_id: e.target.value })}
                      placeholder="e.g. mock_travelers"
                      disabled={!isNew}
                      className="font-mono text-[12.5px]"
                    />
                  </Labeled>
                  <Labeled label="display_name">
                    <Input value={active.display_name} onChange={(e) => setActive({ ...active, display_name: e.target.value })} />
                  </Labeled>
                  <Labeled label="login_url">
                    <Input value={active.login_url} onChange={(e) => setActive({ ...active, login_url: e.target.value })} className="font-mono text-[12.5px]" />
                  </Labeled>

                  <SectionHeader title="Authentication" />
                  <Labeled label="auth_kind">
                    <Select value={active.auth_kind} onValueChange={(v) => setActive({ ...active, auth_kind: v as AuthKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="password">password</SelectItem>
                        <SelectItem value="api_key">api_key</SelectItem>
                      </SelectContent>
                    </Select>
                  </Labeled>
                  <Labeled label="mfa_kind">
                    <Select value={active.mfa_kind} onValueChange={(v) => setActive({ ...active, mfa_kind: v as MfaKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MFA_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Labeled>
                  <Labeled label="hil_timeout_seconds" hint="seconds before HIL prompts time out">
                    <Input
                      type="number" min={10} max={900}
                      value={active.hil_timeout_seconds}
                      onChange={(e) => setActive({ ...active, hil_timeout_seconds: Number(e.target.value) || 120 })}
                      className="font-mono w-32"
                    />
                  </Labeled>
                  <Labeled label="totp_secret_b32" hint="mock-seed only; encrypt via DEK in prod">
                    <Input
                      value={active.totp_secret_b32 ?? ""}
                      onChange={(e) => setActive({ ...active, totp_secret_b32: e.target.value || null })}
                      placeholder="(leave blank for non-TOTP carriers)"
                      className="font-mono text-[12.5px]"
                    />
                  </Labeled>

                  <SectionHeader title="Listing selector spec" />
                  <Labeled label="listing_selector_spec (JSON)" hint="drives the adapter's row scrape at runtime">
                    <Textarea
                      value={specText}
                      onChange={(e) => { setSpecText(e.target.value); setSpecError(null); }}
                      rows={12}
                      className="font-mono text-[11.5px]"
                    />
                    {specError && (
                      <p className="text-[11px] text-destructive mt-1">Invalid JSON: {specError}</p>
                    )}
                  </Labeled>

                  <SectionHeader title="Status" />
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-[12.5px]">
                      <Switch checked={active.is_active} onCheckedChange={(v) => setActive({ ...active, is_active: v })} />
                      <span>is_active</span>
                    </label>
                    <label className="flex items-center gap-2 text-[12.5px]">
                      <Switch checked={active.is_mock} onCheckedChange={(v) => setActive({ ...active, is_mock: v })} />
                      <span>is_mock</span>
                    </label>
                  </div>
                </div>
              </ScrollArea>

              <SheetFooter className="px-6 py-4 border-t border-border bg-muted/20">
                <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isNew ? "Create carrier" : "Save changes"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="text-[10.5px] text-muted-foreground/70 italic">{hint}</p>}
    </div>
  );
}
