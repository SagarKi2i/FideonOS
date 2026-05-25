'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Request a Custom Pod — white-glove request flow.
//
// Brokers describe a workflow they want automated; Fideon engineering
// builds, tests, and ships it back as an install-ready agent. The user
// never writes code or wrangles selectors — they describe the outcome
// and we deliver.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { KpiCard } from "@/components/ui/kpi-card";

import {
  Wand2,
  Sparkles,
  Loader2,
  Upload,
  Paperclip,
  X,
  FileText,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Hammer,
  ClipboardCheck,
  Inbox,
  PlayCircle,
  Plus,
  AlertCircle,
  Building2,
  CalendarClock,
  Mail,
  Phone,
  Target,
  Download,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

// ───────────────────── types ─────────────────────

type PodStatus =
  | "submitted"
  | "in_review"
  | "building"
  | "ready_to_install"
  | "installed"
  | "rejected";

interface PodRequest {
  id: string;
  title: string;
  sop_text: string | null;
  sop_file_url: string | null;
  target_carriers: string[];
  priority: string;
  expected_outcome: string | null;
  desired_eta: string | null;
  status: PodStatus;
  status_notes: string | null;
  custom_agent_id: string | null;
  installed_activated_model_id: string | null;
  installed_at: string | null;
  requested_at: string;
  updated_at: string;
}

const STATUS_FLOW: { key: PodStatus; label: string; icon: LucideIcon }[] = [
  { key: "submitted",        label: "Submitted",       icon: Inbox },
  { key: "in_review",        label: "In review",       icon: ClipboardCheck },
  { key: "building",         label: "Building",        icon: Hammer },
  { key: "ready_to_install", label: "Ready to install",icon: CheckCircle2 },
  { key: "installed",        label: "Installed",       icon: PlayCircle },
];

const PRIORITY_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "low",     label: "Low",     hint: "Whenever you have bandwidth" },
  { id: "normal",  label: "Normal",  hint: "Default — 5–7 business days" },
  { id: "high",    label: "High",    hint: "Important — 3–5 business days" },
  { id: "urgent",  label: "Urgent",  hint: "Drop everything (will be triaged)" },
];

// ───────────────────── component ─────────────────────

export default function RequestPod() {
  const router = useRouter();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [sopText, setSopText] = useState("");
  const [sopFile, setSopFile] = useState<File | null>(null);
  const [targetCarriersInput, setTargetCarriersInput] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [desiredEta, setDesiredEta] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // Requests list
  const [requests, setRequests] = useState<PodRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    void loadRequests();
    void prefillContact();
  }, []);

  const prefillContact = async () => {
    const user = await getCurrentUser();
    if (user?.email) setContactEmail(user.email);
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    const user = await getCurrentUser();
    if (!user) { setLoadingRequests(false); return; }
    const { data } = await supabase
      .from("custom_pod_requests" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false });
    setRequests((data ?? []) as unknown as PodRequest[]);
    setLoadingRequests(false);
  };

  const submit = async () => {
    if (!title.trim() || !sopText.trim()) {
      toast({ title: "Title and SOP are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }

      // Optional file upload
      let sopFileUrl: string | null = null;
      if (sopFile) {
        const filePath = `${user.id}/${Date.now()}-${sopFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase
          .storage
          .from("pod-request-sops")
          .upload(filePath, sopFile);
        if (uploadError) {
          console.warn("[RequestPod] file upload failed:", uploadError);
          toast({ title: "File upload failed", description: uploadError.message, variant: "destructive" });
          // Continue without file — text-only submit still useful.
        } else {
          sopFileUrl = filePath;
        }
      }

      const targets = targetCarriersInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("custom_pod_requests" as any)
        .insert({
          user_id: user.id,
          title: title.trim(),
          sop_text: sopText.trim() || null,
          sop_file_url: sopFileUrl,
          target_carriers: targets,
          priority,
          expected_outcome: expectedOutcome.trim() || null,
          desired_eta: desiredEta || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          status: "submitted",
          status_history: [
            { status: "submitted", at: new Date().toISOString() },
          ] as any,
        } as any);

      if (error) throw error;

      toast({
        title: "Request submitted",
        description: "The Fideon team will be in touch shortly. You'll see updates on this page.",
      });

      // Reset form (keep contact details to make repeat submissions friction-free)
      setTitle("");
      setSopText("");
      setSopFile(null);
      setTargetCarriersInput("");
      setPriority("normal");
      setExpectedOutcome("");
      setDesiredEta("");
      void loadRequests();
    } catch (e: any) {
      toast({ title: "Couldn't submit", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const install = async (req: PodRequest) => {
    if (!req.custom_agent_id) {
      toast({ title: "Not yet linked", description: "Fideon team is still finalizing the build.", variant: "destructive" });
      return;
    }
    setInstallingId(req.id);
    try {
      const user = await getCurrentUser();
      if (!user) { router.push("/auth"); return; }

      // Mark the request installed.
      const { error: updateError } = await supabase
        .from("custom_pod_requests" as any)
        .update({
          status: "installed",
          installed_at: new Date().toISOString(),
        } as any)
        .eq("id", req.id);
      if (updateError) throw updateError;

      // Activate the custom agent into the user's workspace.
      // (custom_agents already lives under the user's id; we just flip
      // is_active=true so it shows up everywhere.)
      await supabase
        .from("custom_agents" as any)
        .update({ is_active: true })
        .eq("id", req.custom_agent_id);

      toast({ title: `${req.title} installed`, description: "Your new pod is live in My Agents." });
      void loadRequests();
    } catch (e: any) {
      toast({ title: "Install failed", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setInstallingId(null);
    }
  };

  // ───────────── derived ─────────────

  const stats = useMemo(() => {
    const inFlight = requests.filter((r) => r.status === "submitted" || r.status === "in_review" || r.status === "building").length;
    const ready    = requests.filter((r) => r.status === "ready_to_install").length;
    const installed= requests.filter((r) => r.status === "installed").length;
    return { inFlight, ready, installed, total: requests.length };
  }, [requests]);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Custom pods · engineered for you"
        title="Tell us the workflow. We'll build the pod."
        description="Upload an SOP, describe the carriers and outcome — Fideon engineering builds, tests, and signs off the pod. You install it when it's ready. Same governance, same audit trail, same review queue as catalog pods."
        icon={Wand2}
      />

      {/* Trust banner — what brokers actually get */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <TrustTile icon={ShieldCheck} label="Human-engineered"  hint="Built + QA'd by Fideon" />
        <TrustTile icon={Clock}       label="5–7 day turnaround" hint="Typical for normal priority" />
        <TrustTile icon={Building2}   label="Carrier-aware"     hint="Tested against your real portals" />
        <TrustTile icon={CheckCircle2}label="Install with one click" hint="Same shape as catalog pods" />
      </div>

      {/* User's requests history */}
      {requests.length > 0 && (
        <section className="mb-8">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiCard label="In flight" value={stats.inFlight} icon={Hammer} tone={stats.inFlight > 0 ? "primary" : "default"} hint={stats.inFlight > 0 ? "Fideon is working" : "no active builds"} />
            <KpiCard label="Ready to install" value={stats.ready} icon={CheckCircle2} tone={stats.ready > 0 ? "success" : "default"} hint={stats.ready > 0 ? "click Install →" : "nothing waiting"} />
            <KpiCard label="Installed" value={stats.installed} icon={PlayCircle} tone="primary" hint="live in My Agents" />
            <KpiCard label="Total" value={stats.total} icon={Inbox} tone="default" hint="all-time" />
          </div>

          <h2 className="font-display text-[16px] font-bold tracking-tight text-foreground mb-3">Your requests</h2>
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                installing={installingId === r.id}
                onInstall={() => install(r)}
              />
            ))}
          </div>
        </section>
      )}

      {/* The submission form */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-display text-[16px] font-bold tracking-tight text-foreground">
            {requests.length === 0 ? "Request your first custom pod" : "Request another pod"}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            The more specific you are, the faster we can ship.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              What should we call this pod?
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lloyd's surplus-lines submission packager"
              className="mt-1.5"
              disabled={submitting}
            />
          </div>

          {/* SOP textarea */}
          <div>
            <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
              <span>Standard Operating Procedure</span>
              <span className="text-[10.5px] font-normal text-muted-foreground/80 normal-case tracking-normal">
                Plain English · numbered steps · expected output
              </span>
            </Label>
            <Textarea
              value={sopText}
              onChange={(e) => setSopText(e.target.value)}
              placeholder={`Title: <what the pod does>\nTrigger: <when it should run>\n\nSteps:\n1. <action>\n2. <action>\n3. <action>\n\nOutput: <what the broker gets at the end>`}
              rows={12}
              className="mt-1.5 font-mono text-[13px] leading-[1.65] resize-y"
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {sopText.trim().split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          {/* File upload */}
          <div>
            <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Supporting documents (optional)
            </Label>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-1.5">
              Attach a PDF SOP, a screen recording, screenshots of the carrier portal — anything that helps engineering nail the build.
            </p>
            {sopFile ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
                <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[12.5px] text-foreground truncate flex-1">{sopFile.name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{(sopFile.size / 1024).toFixed(0)} KB</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setSopFile(null)} disabled={submitting}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-3 py-3.5 rounded-lg border border-dashed border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">Click to attach a file</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.mp4,.mov"
                  onChange={(e) => setSopFile(e.target.files?.[0] ?? null)}
                  disabled={submitting}
                />
              </label>
            )}
          </div>

          {/* Two-column row: carriers + priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />Target carriers / systems
              </Label>
              <Input
                value={targetCarriersInput}
                onChange={(e) => setTargetCarriersInput(e.target.value)}
                placeholder="e.g. Travelers, Chubb, AMS360"
                className="mt-1.5"
                disabled={submitting}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Comma-separated. Helps us scope portal access.
              </p>
            </div>

            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />Priority
              </Label>
              <Select value={priority} onValueChange={setPriority} disabled={submitting}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold">{opt.label}</span>
                        <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Outcome + deadline */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3 w-3" />Expected outcome
              </Label>
              <Textarea
                value={expectedOutcome}
                onChange={(e) => setExpectedOutcome(e.target.value)}
                placeholder="What does success look like? (e.g. ‘Renewal quotes from 3 carriers landed in my Inbox with policy summaries.')"
                rows={3}
                className="mt-1.5 text-[13px]"
                disabled={submitting}
              />
            </div>

            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" />Desired by (optional)
              </Label>
              <Input
                type="date"
                value={desiredEta}
                onChange={(e) => setDesiredEta(e.target.value)}
                className="mt-1.5"
                disabled={submitting}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                We'll let you know if it's not feasible in the timeframe.
              </p>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" />Email
              </Label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@brokerage.com"
                className="mt-1.5"
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" />Phone (optional)
              </Label>
              <Input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="For scoping calls"
                className="mt-1.5"
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {/* Footer with trust language + submit */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-success" />
            Your SOP is private. Files are scoped to your account.
          </p>
          <Button variant="primary" size="lg" onClick={submit} disabled={submitting || !title.trim() || sopText.trim().length < 20}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              <><Sparkles className="h-4 w-4" />Submit request</>
            )}
          </Button>
        </div>
      </Card>

      {/* What happens next — sets expectations */}
      <Card className="mt-6 px-6 py-5 bg-gradient-hero border-primary/15">
        <h3 className="font-display text-[14px] font-bold tracking-tight text-foreground mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          What happens after you submit
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-[12.5px]">
          <NextStep step={1} title="We triage"   body="A Fideon engineer reviews the SOP within one business day." />
          <NextStep step={2} title="We scope"    body="Quick call (or async) if anything is ambiguous — carrier access, edge cases." />
          <NextStep step={3} title="We build"    body="Pod is engineered, QA'd against your real workflow, and signed off." />
          <NextStep step={4} title="You install" body="One-click install. Same governance + review queue as every other pod." />
        </div>
      </Card>
    </div>
  );
}

// ───────────────────── helpers ─────────────────────

function TrustTile({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{hint}</p>
      </div>
    </div>
  );
}

function NextStep({ step, title, body }: { step: number; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="h-5 w-5 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shadow-glow">{step}</span>
        <span className="font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function RequestCard({
  req, installing, onInstall,
}: {
  req: PodRequest;
  installing: boolean;
  onInstall: () => void;
}) {
  const isInstallable = req.status === "ready_to_install" && req.custom_agent_id;
  const isInstalled   = req.status === "installed";
  const isRejected    = req.status === "rejected";

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      isInstallable && "border-success/30 ring-1 ring-success/10",
      isInstalled   && "bg-muted/30",
      isRejected    && "border-destructive/30 bg-destructive/5",
    )}>
      <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-[14.5px] font-bold tracking-tight text-foreground">{req.title}</h3>
            <PriorityPill priority={req.priority} />
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            Submitted {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
            {req.target_carriers.length > 0 && (
              <span className="ml-2">· Targets: {req.target_carriers.join(", ")}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isInstallable && (
            <Button variant="primary" size="sm" onClick={onInstall} disabled={installing}>
              {installing ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Installing…</>
              ) : (
                <><PlayCircle className="h-3.5 w-3.5" />Install</>
              )}
            </Button>
          )}
          {isInstalled && (
            <StatusPill tone="success" dot size="sm">Installed</StatusPill>
          )}
          {isRejected && (
            <StatusPill tone="danger" size="sm">Declined</StatusPill>
          )}
        </div>
      </div>

      {/* Status timeline */}
      {!isRejected && (
        <div className="px-5 py-4 border-t border-border bg-muted/20">
          <StatusTimeline status={req.status} />
        </div>
      )}

      {req.status_notes && (
        <div className="px-5 py-3 border-t border-border bg-card text-[12px] text-foreground/85 flex items-start gap-2">
          <ClipboardCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p>
            <strong className="text-foreground">From Fideon:</strong> {req.status_notes}
          </p>
        </div>
      )}

      {req.sop_file_url && (
        <div className="px-5 py-2.5 border-t border-border bg-card flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="font-mono truncate flex-1">{req.sop_file_url.split("/").pop()}</span>
          <Download className="h-3 w-3 opacity-50" />
        </div>
      )}
    </Card>
  );
}

function StatusTimeline({ status }: { status: PodStatus }) {
  const activeIndex = STATUS_FLOW.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STATUS_FLOW.map((s, i) => {
        const done = i < activeIndex || status === "installed";
        const active = i === activeIndex;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-colors shrink-0",
              done   ? "bg-success text-success-foreground"
            : active ? "bg-gradient-primary text-primary-foreground shadow-glow"
            :          "bg-muted text-muted-foreground/70",
            )}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className={cn(
              "text-[11.5px] font-semibold",
              active ? "text-foreground" : done ? "text-success" : "text-muted-foreground/70",
            )}>
              {s.label}
            </span>
            {i < STATUS_FLOW.length - 1 && (
              <span className={cn(
                "h-px w-5 mx-0.5",
                i < activeIndex || status === "installed" ? "bg-success/50" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const map: Record<string, { label: string; tone: "neutral" | "primary" | "warning" | "danger" }> = {
    low:    { label: "Low",    tone: "neutral" },
    normal: { label: "Normal", tone: "primary" },
    high:   { label: "High",   tone: "warning" },
    urgent: { label: "Urgent", tone: "danger" },
  };
  const p = map[priority] ?? map.normal;
  return <StatusPill tone={p.tone} size="sm">{p.label}</StatusPill>;
}
