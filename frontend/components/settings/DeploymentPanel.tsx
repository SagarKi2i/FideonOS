'use client';
// Deployment panel — shows where this Fideon instance is running, its
// version + license state, and a plain-English data-residency boundary.
//
// This is the surface a procurement / CISO opens during a security
// review. It exists because Fideon ships as customer-tenanted software:
// the data plane runs in the customer's Azure / AWS / GCP subscription;
// only a thin control plane (license, releases, anonymous telemetry)
// lives in Fideon's cloud.
//
// The cloud picker is for the demo — in a real installation the value
// is read from the deployment manifest, not selected by the user.

import { useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Cloud, Server, ShieldCheck, Database, Wifi, ArrowRightLeft,
  Lock, CheckCircle2, AlertCircle, Copy, ExternalLink, History,
  Package, BadgeCheck, FileCheck2, type LucideIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─────────────────────────── data ───────────────────────────

type CloudId = "azure" | "aws" | "gcp";

interface CloudOption {
  id: CloudId;
  name: string;
  tenantLabel: string;
  defaultTenant: string;
  defaultRegion: string;
  regions: string[];
  resourcePath: string;
  marketplaceUrl: string;
}

const CLOUDS: Record<CloudId, CloudOption> = {
  azure: {
    id: "azure",
    name: "Microsoft Azure",
    tenantLabel: "Subscription",
    defaultTenant: "a3f1e9c7-2c5b-4f8d-9e2a-1234567890ab",
    defaultRegion: "East US 2",
    regions: ["East US 2", "Central US", "West Europe", "UK South", "Australia East"],
    resourcePath: "rg-fideon-prod / aks-fideon-prod",
    marketplaceUrl: "https://azuremarketplace.microsoft.com/",
  },
  aws: {
    id: "aws",
    name: "Amazon Web Services",
    tenantLabel: "Account",
    defaultTenant: "417823690012",
    defaultRegion: "us-east-1",
    regions: ["us-east-1", "us-east-2", "us-west-2", "eu-west-1", "ap-southeast-2"],
    resourcePath: "fideon-prod-eks / fideon-prod-rds",
    marketplaceUrl: "https://aws.amazon.com/marketplace/",
  },
  gcp: {
    id: "gcp",
    name: "Google Cloud",
    tenantLabel: "Project",
    defaultTenant: "fideon-prod-417823",
    defaultRegion: "us-central1",
    regions: ["us-central1", "us-east4", "europe-west2", "asia-southeast1"],
    resourcePath: "fideon-prod-gke / fideon-prod-sql",
    marketplaceUrl: "https://console.cloud.google.com/marketplace",
  },
};

const STORAGE_KEY = "fideon.deployment.cloud";

// ─────────────────────────── component ───────────────────────────

export default function DeploymentPanel() {
  const { toast } = useToast();
  const [cloud, setCloud] = useState<CloudId>("azure");
  const [region, setRegion] = useState(CLOUDS.azure.defaultRegion);

  // Hydrate selected cloud from localStorage so the demo persists.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY) as CloudId | null;
    if (saved && CLOUDS[saved]) {
      setCloud(saved);
      setRegion(CLOUDS[saved].defaultRegion);
    }
  }, []);

  const pickCloud = (id: CloudId) => {
    setCloud(id);
    setRegion(CLOUDS[id].defaultRegion);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const active = CLOUDS[cloud];

  const copy = (label: string, value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Where this instance runs ─────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Cloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Where Fideon runs</CardTitle>
                <CardDescription>
                  Fideon is deployed inside <strong className="text-foreground">your own cloud tenant</strong>.
                  Your data never leaves this perimeter.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 text-[10.5px] font-medium px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Healthy
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-6 space-y-5">
          {/* Cloud picker */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-2.5">
              Deployment target
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(Object.keys(CLOUDS) as CloudId[]).map((id) => (
                <CloudCard
                  key={id}
                  cloud={CLOUDS[id]}
                  selected={cloud === id}
                  onSelect={() => pickCloud(id)}
                />
              ))}
            </div>
          </div>

          {/* Deployment metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MetaTile
              icon={Server}
              label={active.tenantLabel + " ID"}
              value={active.defaultTenant}
              onCopy={() => copy(active.tenantLabel + " ID", active.defaultTenant)}
              mono
            />
            <MetaTile
              icon={Cloud}
              label="Region"
              value={region}
              hint={active.regions.length > 1 ? `${active.regions.length} regions configurable` : undefined}
            />
            <MetaTile
              icon={Database}
              label="Resource path"
              value={active.resourcePath}
              mono
            />
            <MetaTile
              icon={Lock}
              label="Network"
              value="Private VNet"
              hint="Egress restricted to control-plane allowlist"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Version + license ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Version & license</CardTitle>
              <CardDescription>
                What you're running, and your contractual entitlement.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FactTile
              icon={Package}
              label="Current version"
              value="2.4.1"
              sub="Released May 8, 2026"
            />
            <FactTile
              icon={History}
              label="Last update"
              value="3 days ago"
              sub="Auto-applied with consent"
            />
            <FactTile
              icon={BadgeCheck}
              label="License"
              value="Enterprise"
              sub="Valid through May 2027"
              tone="success"
            />
            <FactTile
              icon={FileCheck2}
              label="SOC 2 Type II"
              value="In place"
              sub="Last attestation Mar 2026"
              tone="success"
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <History className="h-3.5 w-3.5" />
              Changelog
            </Button>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" />
              Open in {active.name.split(" ")[0]} marketplace
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground">
              Check for updates
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Data residency boundary ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle className="text-lg">Data residency boundary</CardTitle>
              <CardDescription>
                Exactly what stays in your tenant, and what (if anything) crosses
                back to Fideon's control plane.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Stays in customer cloud */}
            <div className="rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-4 w-4 text-success" />
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-success">
                  Stays in your {active.name.split(" ")[0]} tenant
                </p>
              </div>
              <ul className="space-y-2">
                <BoundaryRow label="Carrier credentials & MFA tokens" />
                <BoundaryRow label="AMS connection (Applied Epic, AMS360, etc.)" />
                <BoundaryRow label="Account / insured / claimant PII" />
                <BoundaryRow label="Documents pulled from carrier portals" />
                <BoundaryRow label="Decision reviews & approval history" />
                <BoundaryRow label="Training examples (your overrides train your Fideon)" emphasized />
                <BoundaryRow label="Audit log & decision records" />
              </ul>
            </div>

            {/* Flows to control plane */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Flows to Fideon's control plane
                </p>
              </div>
              <ul className="space-y-2">
                <BoundaryRow label="License heartbeat (instance ID + version)" muted />
                <BoundaryRow label="Anonymous infra telemetry (CPU, errors, uptime)" muted />
                <BoundaryRow label="Signed release artifacts (you pull, we don't push)" muted direction="in" />
                <BoundaryRow label="Aggregate counters (approvals/day, opt-in only)" muted opt />
              </ul>
              <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed border-t border-border pt-3">
                No customer data, no PII, no decision content, no document bodies.
                Every byte that crosses this boundary is logged and auditable below.
              </p>
            </div>
          </div>

          {/* Training data callout */}
          <div className="rounded-xl border border-primary/20 bg-accent/30 p-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground mb-1">
                  Your data trains your Fideon. Not anyone else's.
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Every time a broker approves, overrides, or rejects a decision, the
                  resulting training example is written to <span className="font-mono text-foreground">training_examples</span> in
                  this tenant's database. Fideon's control plane never sees the content
                  of these rows. Pod template improvements are shipped to you as signed
                  releases — your in-tenant fine-tunes stay yours.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Egress audit (preview) ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Egress audit (last 7 days)</CardTitle>
                <CardDescription>
                  Every byte that crossed the boundary. Drop this report into your
                  next security review.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" />
              Full report
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-6">
          <ul className="divide-y divide-border">
            {[
              { label: "License heartbeat", count: "168 pings", size: "≈ 32 KB",  ts: "every hour" },
              { label: "Anonymous infra telemetry", count: "1,344 events", size: "≈ 1.1 MB", ts: "rolling" },
              { label: "Release manifest pull", count: "3 checks", size: "≈ 4 KB",  ts: "daily" },
              { label: "Aggregate counters (opt-in)", count: "Off", size: "0 B",    ts: "—",        muted: true },
            ].map((row) => (
              <li key={row.label} className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-3 py-2.5">
                <span className={cn(
                  "text-[13px] font-medium",
                  row.muted ? "text-muted-foreground" : "text-foreground",
                )}>{row.label}</span>
                <span className="text-[12px] text-muted-foreground tabular-nums">{row.count}</span>
                <span className="text-[12px] text-muted-foreground tabular-nums">{row.size}</span>
                <span className="text-[12px] text-muted-foreground text-right">{row.ts}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-success" />
            No PII, decision content, or document data crossed the boundary.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── building blocks ───────────────────────────

function CloudCard({
  cloud, selected, onSelect,
}: {
  cloud: CloudOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-3.5 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
          : "border-border bg-card hover:border-primary/30",
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between mb-2">
        <Cloud className={cn(
          "h-4 w-4",
          selected ? "text-primary" : "text-muted-foreground",
        )} />
        {selected && (
          <Badge className="text-[10px] h-5 bg-primary text-primary-foreground border-transparent">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Active
          </Badge>
        )}
      </div>
      <p className={cn(
        "text-[13.5px] font-semibold leading-tight",
        selected ? "text-foreground" : "text-foreground/90",
      )}>
        {cloud.name}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {cloud.tenantLabel} · {cloud.defaultRegion}
      </p>
    </button>
  );
}

function MetaTile({
  icon: Icon, label, value, hint, mono, onCopy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <p className={cn(
          "text-[13px] font-semibold text-foreground truncate min-w-0 flex-1",
          mono && "font-mono text-[12px]",
        )}>
          {value}
        </p>
        {onCopy && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCopy}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            aria-label="Copy"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
      {hint && <p className="text-[10.5px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function FactTile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn(
        "text-[18px] font-bold tracking-tight tabular-nums",
        tone === "success" ? "text-success" : "text-foreground",
      )}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function BoundaryRow({
  label, emphasized, muted, direction = "out", opt,
}: {
  label: string;
  emphasized?: boolean;
  muted?: boolean;
  direction?: "in" | "out";
  opt?: boolean;
}) {
  return (
    <li className="flex items-start gap-2 text-[12.5px]">
      {muted ? (
        direction === "in"
          ? <ArrowRightLeft className="h-3 w-3 text-muted-foreground mt-1 shrink-0 rotate-180" />
          : <ArrowRightLeft className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
      ) : (
        <CheckCircle2 className="h-3 w-3 text-success mt-1 shrink-0" />
      )}
      <span className={cn(
        "leading-snug",
        muted ? "text-muted-foreground" : "text-foreground/90",
        emphasized && "font-semibold text-foreground",
      )}>
        {label}
        {opt && <span className="text-[10.5px] text-muted-foreground ml-1.5">(opt-in)</span>}
      </span>
    </li>
  );
}
