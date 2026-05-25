'use client';
// Carriers tab — completely redesigned around the broker's real workflow.
//
// Top: a compact strip of carriers they've already connected. This is the
// working set they actually touch every day.
//
// Below: a search-led catalog with quick category chips and a clean card
// grid. Each card is connect-or-configure with a single primary action.

import { useEffect, useMemo, useState } from "react";
import { settingsApi, authApi } from "@/lib/api";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";

import {
  CARRIERS, LINE_LABELS, METHOD_LABELS, TOTAL_CARRIER_COUNT,
  type Carrier, type CarrierLine,
} from "@/lib/carriers";
import {
  Search, Building2, Plus, Settings, CheckCircle2, AlertCircle, ArrowRight,
} from "lucide-react";
import CarrierConfigDialog from "./CarrierConfigDialog";
import { cn } from "@/lib/utils";

// ─────────────────────── filter chips ───────────────────────

type FilterChipKey =
  | "all"
  | "configured"
  | "commercial"
  | "personal"
  | "specialty"
  | "life-health"
  | "reinsurance";

interface ChipDef { key: FilterChipKey; label: string; }

const CHIPS: ChipDef[] = [
  { key: "all",          label: "All carriers" },
  { key: "configured",   label: "Configured" },
  { key: "commercial",   label: "Commercial" },
  { key: "personal",     label: "Personal" },
  { key: "specialty",    label: "Specialty / E&S" },
  { key: "life-health",  label: "Life & Health" },
  { key: "reinsurance",  label: "Reinsurance" },
];

// ─────────────────────── component ───────────────────────

export default function CarriersPanel() {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<FilterChipKey>("all");
  const [configured, setConfigured] = useState<Set<string>>(new Set());
  const [configCarrier, setConfigCarrier] = useState<Carrier | null>(null);
  // Carrier credentials are admin-managed & global. Non-admins see read-only status.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void loadConfigured();
    void authApi.role().then(({ role }) => setIsAdmin(role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  // Non-admins cannot open the credential dialog (the backend rejects writes anyway).
  const openConfig = (c: Carrier) => { if (isAdmin) setConfigCarrier(c); };

  const loadConfigured = async () => {
    try {
      const data = (await settingsApi.carriers()) as Array<{ carrier_id: string }>;
      setConfigured(new Set(data.map((r) => r.carrier_id)));
    } catch (e) {
      console.error("Failed to load carrier connections:", e);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CARRIERS.filter((c) => {
      // Chip filters
      if (chip === "configured" && !configured.has(c.id)) return false;
      if (chip !== "all" && chip !== "configured" && !c.lines.includes(chip as CarrierLine)) return false;
      // Search
      if (q && !c.name.toLowerCase().includes(q) && !(c.segment ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, chip, configured]);

  const connectedCarriers = useMemo(
    () => CARRIERS.filter((c) => configured.has(c.id)),
    [configured],
  );

  const longTail = TOTAL_CARRIER_COUNT - CARRIERS.length;

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Card className="px-4 py-2.5 bg-muted/30 text-[12.5px] text-muted-foreground">
          Carrier connections are managed by your administrator and apply to everyone automatically.
        </Card>
      )}

      {/* ─── Connected carriers strip (visible whenever anything is configured) ─── */}
      {connectedCarriers.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Connected</h3>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                {connectedCarriers.length} carrier{connectedCarriers.length !== 1 ? "s" : ""} sending data to Fideon.
              </p>
            </div>
            <Button variant="ghost" size="xs" className="text-primary" onClick={() => setChip("configured")}>
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectedCarriers.slice(0, 6).map((c) => (
              <ConnectedCarrierCard
                key={c.id}
                c={c}
                onConfigure={() => openConfig(c)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Browse catalog ─── */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Browse {TOTAL_CARRIER_COUNT}+ carriers</h3>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {CARRIERS.length} named in the catalog · +{longTail.toLocaleString()} more provisioned on request.
            </p>
          </div>
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />Request a carrier
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search carriers, segments, programs…"
            className="pl-9 h-9 text-[13px]"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {CHIPS.map((c) => {
            const active = chip === c.key;
            const count =
              c.key === "all"        ? CARRIERS.length :
              c.key === "configured" ? configured.size :
              CARRIERS.filter((x) => x.lines.includes(c.key as CarrierLine)).length;
            return (
              <button
                key={c.key}
                onClick={() => setChip(c.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70",
                )}
              >
                {c.label}
                <span className={cn(
                  "tabular-nums text-[10.5px] font-bold",
                  active ? "text-primary-foreground/85" : "text-muted-foreground/70",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Card grid */}
        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-[13px] text-muted-foreground">
            No carriers match. Try clearing filters or request the one you need.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <CarrierCard
                key={c.id}
                c={c}
                isConfigured={configured.has(c.id)}
                isAdmin={isAdmin}
                onConfigure={() => openConfig(c)}
              />
            ))}
          </div>
        )}

        {/* Long-tail footer */}
        {longTail > 0 && (
          <Card className="mt-4 px-4 py-3 flex items-center gap-3 bg-muted/30">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-[12.5px] text-muted-foreground flex-1">
              <span className="font-semibold text-foreground">+{longTail.toLocaleString()}</span> additional regional, MGA, and program carriers —
              provisioned on request, typically live within 2 weeks.
            </p>
            <Button variant="ghost" size="xs" className="text-primary">
              Request carrier <ArrowRight className="h-3 w-3" />
            </Button>
          </Card>
        )}
      </section>

      <CarrierConfigDialog
        carrier={configCarrier}
        open={configCarrier !== null}
        onOpenChange={(o) => { if (!o) setConfigCarrier(null); }}
        onSaved={loadConfigured}
      />
    </div>
  );
}

// ─────────────────────── connected carrier strip card ───────────────────────

function ConnectedCarrierCard({ c, onConfigure }: { c: Carrier; onConfigure: () => void }) {
  return (
    <Card className="p-3.5 hover:border-border-strong transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded bg-success/15 text-success flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{c.shortName ?? c.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {c.segment ?? c.lines.map((l) => LINE_LABELS[l].split(" ")[0]).join(" · ")} · {METHOD_LABELS[c.method]}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onConfigure} className="text-muted-foreground hover:text-foreground shrink-0">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────── catalog card ───────────────────────

function CarrierCard({
  c, isConfigured, isAdmin, onConfigure,
}: {
  c: Carrier;
  isConfigured: boolean;
  isAdmin: boolean;
  onConfigure: () => void;
}) {
  return (
    <Card className={cn(
      "p-4 transition-colors flex flex-col",
      isConfigured ? "border-success/30 bg-success/[0.03]" : "hover:border-border-strong",
    )}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground truncate">{c.shortName ?? c.name}</p>
          {c.segment && <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{c.segment}</p>}
        </div>
        {isConfigured && (
          <StatusPill tone="success" size="sm">
            <CheckCircle2 className="h-2.5 w-2.5" />Configured
          </StatusPill>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-4 mt-1">
        {c.lines.slice(0, 3).map((l) => (
          <StatusPill key={l} tone="neutral" size="sm">{LINE_LABELS[l].split(" ")[0]}</StatusPill>
        ))}
        <span className="text-[11px] text-muted-foreground font-mono ml-1">{METHOD_LABELS[c.method]}</span>
      </div>

      <div className="mt-auto">
        {!isAdmin ? (
          <Button variant="outline" size="sm" className="w-full" disabled>
            {isConfigured ? "Connected" : "Not connected"}
          </Button>
        ) : isConfigured ? (
          <Button variant="outline" size="sm" className="w-full" onClick={onConfigure}>
            <Settings className="h-3.5 w-3.5" />Configure
          </Button>
        ) : (
          <Button variant="primary" size="sm" className="w-full" onClick={onConfigure}>
            Connect
          </Button>
        )}
      </div>
    </Card>
  );
}
