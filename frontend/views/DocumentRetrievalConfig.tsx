'use client';
import { useRouter } from 'next/navigation';
// Document Retrieval pod configuration.
//
// Brokers configure, per carrier they've connected in /connect, how the
// Document Retrieval agent should behave: which sources to pull from
// (email, carrier portal), which document categories to retrieve, and the
// AMS activity code that each category should be filed under.
//
// All persistence goes through FastAPI (agentsApi). The config is stored in
// carrier_connections.extra; GET /doc-retrieval-config returns one row per
// connected carrier (so it doubles as the connected-carrier list).

import { useEffect, useMemo, useState } from "react";
import { agentsApi, authApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

import {
  ArrowLeft, FileSearch, Mail, Globe, FileText, ChevronDown, ChevronRight,
  Loader2, ShieldCheck, AlertCircle, Building2, Plus, Save,
  type LucideIcon,
} from "lucide-react";

import { CARRIERS, METHOD_LABELS, type Carrier } from "@/lib/carriers";
import { cn } from "@/lib/utils";

// ─────────────────────── document types catalog ───────────────────────

interface DocType {
  key: string;
  label: string;
  description: string;
  defaultActivity: string;
}

const DOC_TYPES: DocType[] = [
  { key: "policy_renewal",    label: "Policy renewal",       description: "Renewal proposals, term-to-term policy updates.",  defaultActivity: "REN"  },
  { key: "endorsement",       label: "Endorsements",         description: "Mid-term changes — drivers, vehicles, locations.", defaultActivity: "ENDO" },
  { key: "loss_run",          label: "Loss runs",            description: "Claim history reports across lines of business.",   defaultActivity: "LR"   },
  { key: "invoice",           label: "Invoices",             description: "Premium invoices, statements, billing notices.",   defaultActivity: "INV"  },
  { key: "memo",              label: "Memos",                description: "Carrier underwriting notes and broker memos.",      defaultActivity: "MEMO" },
  { key: "declaration",       label: "Declaration pages",    description: "Issued declaration / dec pages.",                   defaultActivity: "DEC"  },
  { key: "cancellation",      label: "Cancellation notices", description: "Non-renewals, mid-term cancellation notices.",      defaultActivity: "CXL" },
];

// ─────────────────────── types ───────────────────────

interface DocTypeSetting {
  enabled: boolean;
  activity_code: string;
}

type DocTypeSettings = Record<string, DocTypeSetting>;

type Source = "email" | "portal" | "sftp";

interface CarrierConfig {
  carrier_id: string;
  sources: Source[];
  doc_types: DocTypeSettings;
  email_alias: string;
  is_enabled: boolean;
  expanded: boolean;
  hasChanges: boolean;
}

const SOURCE_META: Record<Source, { label: string; icon: LucideIcon; description: string }> = {
  email:  { label: "Email",         icon: Mail,   description: "Pull attachments from a forwarding inbox or shared mailbox." },
  portal: { label: "Carrier portal", icon: Globe, description: "Log into the carrier's portal on a schedule and download new files." },
  sftp:   { label: "SFTP drop",     icon: FileText, description: "Watch an SFTP folder the carrier drops files into." },
};

// ─────────────────────── page ───────────────────────

export default function DocumentRetrievalConfig() {
  const router = useRouter();
  const { toast } = useToast();

  const [connectedCarrierIds, setConnectedCarrierIds] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, CarrierConfig>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Doc-retrieval config is global/admin-managed (lives in carrier_connections.extra).
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void load();
    void authApi.role().then(({ role }) => setIsAdmin(role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // One call: each connected carrier row carries its doc-retrieval config in `extra`.
      const rows = (await agentsApi.docRetrievalConfig()) as Array<{
        carrier_id: string;
        extra?: { sources?: Source[]; doc_types?: any; email_alias?: string; is_enabled?: boolean } | null;
      }>;

      const connIds = rows.map((r) => r.carrier_id);
      setConnectedCarrierIds(connIds);

      const map: Record<string, CarrierConfig> = {};
      for (const row of rows) {
        const e = row.extra ?? {};
        map[row.carrier_id] = {
          carrier_id: row.carrier_id,
          sources: e.sources ?? ["email", "portal"],
          doc_types: hydrateDocTypes(e.doc_types),
          email_alias: e.email_alias ?? "",
          is_enabled: e.is_enabled ?? true,
          expanded: false,
          hasChanges: false,
        };
      }
      setConfigs(map);
    } catch (e) {
      console.warn("[DocumentRetrievalConfig] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const update = (carrierId: string, patch: Partial<CarrierConfig>) => {
    setConfigs((prev) => ({
      ...prev,
      [carrierId]: { ...prev[carrierId], ...patch, hasChanges: true },
    }));
  };

  const updateDocType = (carrierId: string, docKey: string, patch: Partial<DocTypeSetting>) => {
    setConfigs((prev) => {
      const cfg = prev[carrierId];
      const nextDocTypes: DocTypeSettings = {
        ...cfg.doc_types,
        [docKey]: { ...cfg.doc_types[docKey], ...patch },
      };
      return {
        ...prev,
        [carrierId]: { ...cfg, doc_types: nextDocTypes, hasChanges: true },
      };
    });
  };

  const toggleSource = (carrierId: string, src: Source) => {
    const cfg = configs[carrierId];
    const has = cfg.sources.includes(src);
    update(carrierId, {
      sources: has ? cfg.sources.filter((s) => s !== src) : [...cfg.sources, src],
    });
  };

  const save = async (carrierId: string) => {
    setSavingId(carrierId);
    try {
      const cfg = configs[carrierId];
      await agentsApi.upsertDocRetrievalConfig(carrierId, {
        sources: cfg.sources,
        doc_types: cfg.doc_types,
        email_alias: cfg.email_alias || null,
        is_enabled: cfg.is_enabled,
      });
      setConfigs((p) => ({ ...p, [carrierId]: { ...p[carrierId], hasChanges: false } }));
      toast({ title: "Configuration saved" });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const connectedCarriers = useMemo(
    () => CARRIERS.filter((c) => connectedCarrierIds.includes(c.id)),
    [connectedCarrierIds],
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/pod/document-retrieval")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="text-[11.5px] text-muted-foreground">Document Retrieval / Configuration</p>
      </div>

      <PageHeader
        eyebrow="Pod configuration"
        title="Document Retrieval"
        description="Choose where Fideon pulls documents from per carrier, which document categories to retrieve, and the AMS activity code each category should be filed under."
        icon={FileSearch}
      />

      {!isAdmin && (
        <Card className="px-4 py-2.5 mb-3 bg-muted/30 text-[12.5px] text-muted-foreground">
          Document-retrieval configuration is managed by your administrator and applies to everyone.
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : connectedCarriers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No carriers connected yet"
          description="The Document Retrieval pod works on carriers you've connected in /connect. Add at least one carrier before configuring the pod."
          action={
            <Button variant="primary" size="lg" onClick={() => router.push("/connect?tab=carriers")}>
              <Plus className="h-4 w-4" />Connect a carrier
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Helper banner */}
          <Card className="px-4 py-3 bg-accent/30 flex items-start gap-3">
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[12.5px] text-foreground/85 leading-relaxed">
              Showing the <strong className="text-foreground">{connectedCarriers.length} carrier{connectedCarriers.length !== 1 ? "s" : ""}</strong> you've connected.
              Connect more under <button onClick={() => router.push("/connect?tab=carriers")} className="text-primary font-semibold hover:underline">Connect → Carriers</button> to add them here.
            </p>
          </Card>

          {/* Per-carrier config rows */}
          {connectedCarriers.map((c) => (
            <CarrierConfigRow
              key={c.id}
              carrier={c}
              cfg={configs[c.id]}
              saving={savingId === c.id}
              isAdmin={isAdmin}
              onToggleEnabled={(v) => update(c.id, { is_enabled: v })}
              onToggleExpanded={() => update(c.id, { expanded: !configs[c.id].expanded })}
              onToggleSource={(src) => toggleSource(c.id, src)}
              onUpdateDocType={(docKey, patch) => updateDocType(c.id, docKey, patch)}
              onEmailAliasChange={(v) => update(c.id, { email_alias: v })}
              onSave={() => save(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────── helpers ───────────────────────

function hydrateDocTypes(stored: any): DocTypeSettings {
  const out: DocTypeSettings = {};
  for (const t of DOC_TYPES) {
    const s = stored?.[t.key];
    out[t.key] = {
      enabled: typeof s?.enabled === "boolean" ? s.enabled : true,
      activity_code: typeof s?.activity_code === "string" && s.activity_code.length > 0
        ? s.activity_code
        : t.defaultActivity,
    };
  }
  return out;
}

// ─────────────────────── carrier config row ───────────────────────

function CarrierConfigRow({
  carrier, cfg, saving, isAdmin,
  onToggleEnabled, onToggleExpanded, onToggleSource, onUpdateDocType, onEmailAliasChange, onSave,
}: {
  carrier: Carrier;
  cfg: CarrierConfig;
  saving: boolean;
  isAdmin: boolean;
  onToggleEnabled: (v: boolean) => void;
  onToggleExpanded: () => void;
  onToggleSource: (src: Source) => void;
  onUpdateDocType: (docKey: string, patch: Partial<DocTypeSetting>) => void;
  onEmailAliasChange: (v: string) => void;
  onSave: () => void;
}) {
  if (!cfg) return null;

  const enabledDocTypes = DOC_TYPES.filter((t) => cfg.doc_types[t.key]?.enabled).length;
  const Chevron = cfg.expanded ? ChevronDown : ChevronRight;

  return (
    <Card className={cn("overflow-hidden", !cfg.is_enabled && "opacity-75")}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <Chevron className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground truncate">{carrier.shortName ?? carrier.name}</p>
          <p className="text-[11.5px] text-muted-foreground truncate">
            {cfg.sources.length === 0
              ? "No sources selected"
              : cfg.sources.map((s) => SOURCE_META[s].label).join(" · ")}
            {" · "}
            {enabledDocTypes} document type{enabledDocTypes !== 1 ? "s" : ""} enabled
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {cfg.hasChanges && <StatusPill tone="warning" size="sm">Unsaved</StatusPill>}
          <span className="text-[11.5px] text-muted-foreground">{cfg.is_enabled ? "Enabled" : "Paused"}</span>
          <Switch checked={cfg.is_enabled} onCheckedChange={onToggleEnabled} aria-label="Toggle config" />
        </div>
      </button>

      {/* Body — only when expanded */}
      {cfg.expanded && (
        <div className="border-t border-border px-4 py-4 space-y-5 bg-muted/10">
          {/* Sources */}
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
              Sources
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["email", "portal", "sftp"] as Source[]).map((src) => {
                const meta = SOURCE_META[src];
                const active = cfg.sources.includes(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => onToggleSource(src)}
                    className={cn(
                      "text-left rounded border px-3 py-2.5 transition-colors flex items-start gap-2.5",
                      active
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:border-border-strong",
                    )}
                  >
                    <meta.icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <p className={cn("text-[13px] font-semibold leading-tight", active ? "text-primary" : "text-foreground")}>
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {cfg.sources.includes("email") && (
              <div className="mt-3 max-w-md">
                <label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground block mb-1.5">
                  Forwarding inbox / email alias
                </label>
                <Input
                  value={cfg.email_alias}
                  onChange={(e) => onEmailAliasChange(e.target.value)}
                  placeholder={`docs+${carrier.id}@yourbrokerage.com`}
                  className="text-[13px] font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Auto-forward {carrier.name} messages here. Fideon pulls attachments + files them.
                </p>
              </div>
            )}
          </div>

          {/* Document types */}
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
              Document categories &amp; AMS activity codes
            </p>
            <div className="rounded border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_140px] gap-3 px-3 py-2 bg-muted/30 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">
                <span className="w-9 text-center">On</span>
                <span>Category</span>
                <span>Activity code</span>
              </div>
              <ul className="divide-y divide-border">
                {DOC_TYPES.map((t) => {
                  const setting = cfg.doc_types[t.key];
                  if (!setting) return null;
                  return (
                    <li key={t.key} className="grid grid-cols-[auto_1fr_140px] gap-3 px-3 py-2.5 items-center">
                      <div className="w-9 flex justify-center">
                        <Switch
                          checked={setting.enabled}
                          onCheckedChange={(v) => onUpdateDocType(t.key, { enabled: v })}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{t.label}</p>
                        <p className="text-[11.5px] text-muted-foreground leading-snug truncate">{t.description}</p>
                      </div>
                      <Input
                        value={setting.activity_code}
                        onChange={(e) => onUpdateDocType(t.key, { activity_code: e.target.value })}
                        placeholder={t.defaultActivity}
                        className="font-mono text-[12.5px] h-8"
                        disabled={!setting.enabled}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              Activity codes must exist in your AMS. Fideon files each retrieved document under the matching activity.
            </p>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={onSave} disabled={saving || !cfg.hasChanges || !isAdmin}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5" />Save changes</>}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
