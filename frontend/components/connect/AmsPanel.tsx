'use client';
// AMS tab inside Connect.
// Card-per-AMS layout for the 5 systems Fideon supports directly.

import { useEffect, useMemo, useState } from "react";
import { settingsApi, authApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AMS_SYSTEMS, type AmsSystem } from "@/lib/amsCatalog";
import { ArrowDown, ArrowUp, Plug, Clock, KeyRound, Settings, CheckCircle2, Lock } from "lucide-react";
import AmsConfigDialog from "./AmsConfigDialog";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  live:          { label: "Connected",   tone: "success" as const },
  beta:          { label: "Beta",        tone: "primary" as const },
  available:     { label: "Available",   tone: "neutral" as const },
  "coming-soon": { label: "Coming soon", tone: "warning" as const },
};

const AUTH_LABEL: Record<AmsSystem["auth"], string> = {
  oauth:  "OAuth (delegated access)",
  apiKey: "API key (per tenant)",
  sftp:   "SFTP drop",
};

export default function AmsPanel() {
  const { toast } = useToast();
  const [configured, setConfigured] = useState<Set<string>>(new Set());
  const [configAms, setConfigAms] = useState<AmsSystem | null>(null);
  // AMS credentials are admin-managed & global. Non-admins see read-only status.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void loadConfigured();
    void authApi.role().then(({ role }) => setIsAdmin(role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  const loadConfigured = async () => {
    try {
      const data = (await settingsApi.ams()) as Array<{ ams_id: string }>;
      setConfigured(new Set(data.map((r) => r.ams_id)));
    } catch (e) {
      console.error("Failed to load AMS connections:", e);
    }
  };

  // Only one AMS may be active at a time. If something is configured, lock
  // the others and explain why.
  const activeAmsId = useMemo(() => Array.from(configured)[0] ?? null, [configured]);
  const activeAmsName = useMemo(
    () => AMS_SYSTEMS.find((a) => a.id === activeAmsId)?.name ?? null,
    [activeAmsId],
  );

  const handleConfigure = (ams: AmsSystem) => {
    // Only admins manage AMS credentials (backend enforces this too).
    if (!isAdmin) return;
    // Always allow opening the dialog for the currently-configured AMS.
    if (configured.has(ams.id)) {
      setConfigAms(ams);
      return;
    }
    // Block adding a second AMS — surface the constraint, don't open the dialog.
    if (activeAmsId) {
      toast({
        title: "Only one AMS at a time",
        description: `Disconnect ${activeAmsName} first, then you can connect ${ams.name}.`,
        variant: "destructive",
      });
      return;
    }
    setConfigAms(ams);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Agency management system</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            Fideon connects to one AMS at a time — your single source of truth for accounts, policies, and outputs. Disconnect the current one to switch.
          </p>
        </div>
        {activeAmsName && (
          <StatusPill tone="success" size="md">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {activeAmsName} active
          </StatusPill>
        )}
      </div>

      {!isAdmin && (
        <Card className="px-4 py-2.5 bg-muted/30 text-[12.5px] text-muted-foreground">
          AMS connection is managed by your administrator and applies to everyone automatically.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AMS_SYSTEMS.map((ams) => (
          <AmsCard
            key={ams.id}
            ams={ams}
            isConfigured={configured.has(ams.id)}
            isLocked={activeAmsId !== null && !configured.has(ams.id)}
            lockedByName={activeAmsName}
            isAdmin={isAdmin}
            onConfigure={() => handleConfigure(ams)}
          />
        ))}
      </div>

      <AmsConfigDialog
        ams={configAms}
        open={configAms !== null}
        onOpenChange={(o) => { if (!o) setConfigAms(null); }}
        onSaved={loadConfigured}
      />
    </div>
  );
}

function AmsCard({
  ams, isConfigured, isLocked, lockedByName, isAdmin, onConfigure,
}: {
  ams: AmsSystem;
  isConfigured: boolean;
  isLocked: boolean;
  lockedByName: string | null;
  isAdmin: boolean;
  onConfigure: () => void;
}) {
  const status = STATUS_TONE[ams.status];

  return (
    <Card className={cn(
      "p-4 transition-colors",
      isLocked ? "opacity-60" : "hover:border-border-strong",
    )}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{ams.name}</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{ams.vendor}</p>
        </div>
        {isConfigured ? (
          <StatusPill tone="success" size="sm">
            <CheckCircle2 className="h-2.5 w-2.5" />Configured
          </StatusPill>
        ) : isLocked ? (
          <StatusPill tone="neutral" size="sm">
            <Lock className="h-2.5 w-2.5" />Locked
          </StatusPill>
        ) : (
          <StatusPill tone={status.tone} size="sm">{status.label}</StatusPill>
        )}
      </div>

      <p className="text-[12.5px] text-foreground/85 leading-snug mb-4">{ams.tagline}</p>

      <dl className="space-y-2 text-[12px] mb-4">
        <div className="flex items-start gap-2">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <dt className="text-muted-foreground w-16 shrink-0">Auth</dt>
          <dd className="text-foreground/85 font-medium">{AUTH_LABEL[ams.auth]}</dd>
        </div>
        <div className="flex items-start gap-2">
          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <dt className="text-muted-foreground w-16 shrink-0">Reads</dt>
          <dd className="text-foreground/85 truncate">{ams.reads.slice(0, 4).join(", ")}{ams.reads.length > 4 ? "…" : ""}</dd>
        </div>
        <div className="flex items-start gap-2">
          <ArrowUp className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <dt className="text-muted-foreground w-16 shrink-0">Writes</dt>
          <dd className="text-foreground/85 truncate">{ams.writes.join(", ")}</dd>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <dt className="text-muted-foreground w-16 shrink-0">Setup</dt>
          <dd className="text-foreground/85">~{ams.setupMinutes} min</dd>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        {!isAdmin ? (
          <Button variant="outline" size="sm" className="w-full" disabled>
            {isConfigured ? "Connected" : "Not connected"}
          </Button>
        ) : isConfigured ? (
          <Button variant="outline" size="sm" className="flex-1" onClick={onConfigure}>
            <Settings className="h-3.5 w-3.5" />Configure
          </Button>
        ) : isLocked ? (
          <div className="w-full">
            <Button variant="outline" size="sm" className="w-full" disabled>
              <Lock className="h-3.5 w-3.5" />Locked
            </Button>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Disconnect {lockedByName} first
            </p>
          </div>
        ) : (
          <Button variant="primary" size="sm" className="w-full" onClick={onConfigure}>
            <Plug className="h-3.5 w-3.5" />Connect {ams.name}
          </Button>
        )}
      </div>
    </Card>
  );
}
