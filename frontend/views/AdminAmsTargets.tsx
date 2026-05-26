'use client';

// Admin · AMS targets (FNF-567)
//
// CRUD over the `ams_targets` table — the destination registry the
// orchestrator picks from when filing a downloaded document into the AMS.
// Backend: `/api/admin/ams-targets` (GET/PUT/DELETE), `require_admin`-gated.
// `connector_config` is a free-form JSONB blob; specific connectors interpret
// their own shape (e.g. applied_epic expects {base_url, client_id}).

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

import { Database, Inbox, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";


type ConnectorKind = "stub" | "applied_epic" | "hawksoft" | "ams360" | "qq_catalyst" | "ezlynx";

interface AmsTarget {
  ams_target_id: string;
  display_name: string;
  connector_kind: ConnectorKind;
  connector_config: Record<string, unknown>;
  is_active: boolean;
}

const EMPTY: AmsTarget = {
  ams_target_id: "",
  display_name: "",
  connector_kind: "stub",
  connector_config: {},
  is_active: true,
};

const CONNECTOR_KINDS: ConnectorKind[] = ["stub", "applied_epic", "hawksoft", "ams360", "qq_catalyst", "ezlynx"];

// Per-connector hint blobs. The connector_config JSON is free-form but each
// connector reads a specific shape; the hints help admins start with valid
// keys when picking a non-stub kind.
const CONNECTOR_HINT: Record<ConnectorKind, Record<string, unknown>> = {
  stub:        {},
  applied_epic:{ base_url: "https://your-tenant.appliedepic.com", client_id: "", client_secret: "" },
  hawksoft:    { api_url: "https://api.hawksoft.com/v1", api_key: "" },
  ams360:      { tenant: "", username: "", password: "" },
  qq_catalyst: { account_id: "", api_token: "" },
  ezlynx:      { realm: "", username: "", password: "" },
};

export default function AdminAmsTargets() {
  const { toast } = useToast();
  const [targets, setTargets] = useState<AmsTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<AmsTarget | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await adminApi.amsTargets()) as AmsTarget[];
      setTargets(data);
    } catch (err) {
      toast({ title: "Couldn't load AMS targets", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (a: AmsTarget) => {
    setIsNew(false);
    setActive({ ...a });
    setConfigText(JSON.stringify(a.connector_config ?? {}, null, 2));
    setConfigError(null);
  };

  const openNew = () => {
    setIsNew(true);
    setActive({ ...EMPTY });
    setConfigText("{}");
    setConfigError(null);
  };

  const close = () => {
    setActive(null);
    setIsNew(false);
    setConfigError(null);
  };

  // Swap in a connector-kind-specific scaffold ONLY when the config is empty
  // or matches the previous kind's hint — never clobber custom edits.
  const onConnectorKindChange = (kind: ConnectorKind) => {
    if (!active) return;
    const current = active.connector_config ?? {};
    const previousHints = Object.values(CONNECTOR_HINT).map((h) => JSON.stringify(h));
    const isEmpty = Object.keys(current).length === 0;
    const isHint = previousHints.includes(JSON.stringify(current));
    if (isEmpty || isHint) {
      const hint = CONNECTOR_HINT[kind];
      setActive({ ...active, connector_kind: kind, connector_config: hint });
      setConfigText(JSON.stringify(hint, null, 2));
    } else {
      setActive({ ...active, connector_kind: kind });
    }
  };

  const save = async () => {
    if (!active) return;
    if (!active.ams_target_id.trim()) {
      toast({ title: "ams_target_id is required", variant: "destructive" });
      return;
    }
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configText);
      if (typeof config !== "object" || Array.isArray(config) || config === null) {
        throw new Error("must be a JSON object");
      }
    } catch (err) {
      setConfigError(String((err as Error).message));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...active, connector_config: config };
      await adminApi.upsertAmsTarget(active.ams_target_id, payload);
      toast({ title: isNew ? "AMS target created" : "AMS target updated" });
      close();
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: AmsTarget) => {
    if (!confirm(`Delete AMS target "${a.ams_target_id}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteAmsTarget(a.ams_target_id);
      toast({ title: "AMS target deleted" });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: String((err as Error).message), variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (a) =>
        a.ams_target_id.toLowerCase().includes(q) ||
        a.display_name.toLowerCase().includes(q) ||
        a.connector_kind.toLowerCase().includes(q),
    );
  }, [targets, search]);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Admin · Doc Retrieval"
        title="AMS targets"
        description="Where retrieved documents are filed. Add a target per AMS your brokers use."
        icon={Database}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />New AMS target
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
            placeholder="Search id, name, connector…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_180px_140px_100px_120px] gap-3 px-5 py-3 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Target</span>
          <span>Connector</span>
          <span>Config keys</span>
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
            No AMS targets yet. Seed the registry or create one above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((a) => (
              <li
                key={a.ams_target_id}
                className="grid grid-cols-[1fr_180px_140px_100px_120px] gap-3 px-5 py-3 items-center hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => openEdit(a)}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{a.display_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">{a.ams_target_id}</p>
                </div>
                <span className="text-[11.5px] tabular-nums">{a.connector_kind}</span>
                <span className="text-[11.5px] text-muted-foreground tabular-nums">
                  {Object.keys(a.connector_config ?? {}).length} key{Object.keys(a.connector_config ?? {}).length === 1 ? "" : "s"}
                </span>
                <StatusPill tone={a.is_active ? "success" : "neutral"} size="sm">
                  {a.is_active ? "active" : "inactive"}
                </StatusPill>
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="xs" onClick={() => openEdit(a)}>Edit</Button>
                  <Button variant="ghost" size="xs" onClick={() => remove(a)} className="text-destructive hover:text-destructive">
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
                  {isNew ? "New AMS target" : active.display_name || active.ams_target_id}
                </SheetTitle>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {isNew ? "Add a row to the AMS target registry." : "Editing this updates the orchestrator's filing destination."}
                </p>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-5">
                  <SectionHeader title="Identity" />
                  <Labeled label="ams_target_id" hint="immutable; cannot rename after creation">
                    <Input
                      value={active.ams_target_id}
                      onChange={(e) => setActive({ ...active, ams_target_id: e.target.value })}
                      placeholder="e.g. applied-epic"
                      disabled={!isNew}
                      className="font-mono text-[12.5px]"
                    />
                  </Labeled>
                  <Labeled label="display_name">
                    <Input value={active.display_name} onChange={(e) => setActive({ ...active, display_name: e.target.value })} />
                  </Labeled>

                  <SectionHeader title="Connector" />
                  <Labeled label="connector_kind" hint="picking a non-stub kind scaffolds the config below">
                    <Select value={active.connector_kind} onValueChange={(v) => onConnectorKindChange(v as ConnectorKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONNECTOR_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Labeled>
                  <Labeled label="connector_config (JSON)" hint="shape varies by connector; see hint scaffold">
                    <Textarea
                      value={configText}
                      onChange={(e) => { setConfigText(e.target.value); setConfigError(null); }}
                      rows={10}
                      className="font-mono text-[11.5px]"
                    />
                    {configError && (
                      <p className="text-[11px] text-destructive mt-1">Invalid JSON: {configError}</p>
                    )}
                  </Labeled>

                  <SectionHeader title="Status" />
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <Switch checked={active.is_active} onCheckedChange={(v) => setActive({ ...active, is_active: v })} />
                    <span>is_active</span>
                  </label>
                </div>
              </ScrollArea>

              <SheetFooter className="px-6 py-4 border-t border-border bg-muted/20">
                <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isNew ? "Create AMS target" : "Save changes"}
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
