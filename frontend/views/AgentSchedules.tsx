'use client';
import { getCurrentUser } from '@/lib/currentUser';
import { useRouter } from 'next/navigation';
// Agent Schedules — recurring + one-time agent runs.
// Uses the same design-system primitives as Today / Marketplace / MyAgents:
// PageHeader, KpiCard, SectionHeader, EmptyState, Card, StatusPill, Button.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  CalendarClock, Plus, Trash2, Loader2, Repeat, Calendar, Clock,
  Pause, Activity, Timer, Sparkles, ArrowRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ───────────────────────── types ─────────────────────────

interface ActivatedModel {
  id: string;
  model_id: string;
  model_name: string;
  domain: string;
}

interface AgentSchedule {
  id: string;
  model_id: string;
  model_name: string;
  schedule_type: string;
  cron_expression: string | null;
  scheduled_at: string | null;
  prompt: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

const CRON_PRESETS = [
  { label: "Every hour",              value: "0 * * * *" },
  { label: "Every day at 9 AM",       value: "0 9 * * *" },
  { label: "Every Monday at 9 AM",    value: "0 9 * * 1" },
  { label: "Every weekday at 9 AM",   value: "0 9 * * 1-5" },
  { label: "Every 1st of the month",  value: "0 9 1 * *" },
  { label: "Custom",                  value: "custom" },
];

// ───────────────────────── component ─────────────────────────

export default function AgentSchedules() {
  const { toast } = useToast();
  const router = useRouter();

  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [models, setModels] = useState<ActivatedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [selectedModel, setSelectedModel] = useState("");
  const [scheduleType, setScheduleType] = useState<"one_time" | "recurring">("recurring");
  const [cronPreset, setCronPreset] = useState("0 9 * * *");
  const [customCron, setCustomCron] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [prompt, setPrompt] = useState("");

  useEffect(() => { void loadData(); }, []);

  const loadData = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const [modelsRes, schedulesRes] = await Promise.all([
        supabase.from("activated_models").select("*").eq("user_id", user.id),
        supabase.from("agent_schedules").select("*").order("created_at", { ascending: false }),
      ]);
      if (modelsRes.data) {
        setModels(modelsRes.data);
        if (modelsRes.data.length > 0) setSelectedModel(modelsRes.data[0].model_id);
      }
      if (schedulesRes.data) setSchedules(schedulesRes.data as unknown as AgentSchedule[]);
    } catch (e) {
      console.error("[AgentSchedules] load error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedModel || !prompt.trim()) {
      toast({ title: "Missing fields", description: "Pick an agent and enter a prompt.", variant: "destructive" });
      return;
    }
    const model = models.find((m) => m.model_id === selectedModel);
    if (!model) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const cronValue = cronPreset === "custom" ? customCron : cronPreset;
      let scheduledAt: string | null = null;
      let nextRunAt: string | null = null;
      if (scheduleType === "one_time" && scheduledDate && scheduledTime) {
        scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        nextRunAt = scheduledAt;
      }
      const { error } = await supabase.from("agent_schedules").insert({
        user_id: user.id,
        model_id: model.model_id,
        model_name: model.model_name,
        schedule_type: scheduleType,
        cron_expression: scheduleType === "recurring" ? cronValue : null,
        scheduled_at: scheduledAt,
        prompt: prompt.trim(),
        next_run_at: nextRunAt,
      } as any);
      if (error) throw error;
      toast({ title: "Schedule created", description: `${model.model_name} is now scheduled.` });
      setCreateOpen(false);
      resetForm();
      void loadData();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (id: string, currentState: boolean) => {
    // Optimistic
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !currentState } : s)));
    const { error } = await supabase
      .from("agent_schedules")
      .update({ is_active: !currentState } as any)
      .eq("id", id);
    if (error) {
      // Revert
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: currentState } : s)));
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    }
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from("agent_schedules").delete().eq("id", id);
    if (!error) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setDeletingId(null);
      toast({ title: "Schedule deleted" });
    } else {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setPrompt("");
    setScheduleType("recurring");
    setCronPreset("0 9 * * *");
    setCustomCron("");
    setScheduledDate("");
    setScheduledTime("09:00");
  };

  const getCronLabel = (cron: string | null) => {
    if (!cron) return "—";
    return CRON_PRESETS.find((p) => p.value === cron)?.label ?? cron;
  };

  // ───────────── derived ─────────────

  const stats = useMemo(() => {
    const active = schedules.filter((s) => s.is_active).length;
    const paused = schedules.length - active;
    const nextRun = schedules
      .filter((s) => s.is_active && s.next_run_at)
      .sort((a, b) => +new Date(a.next_run_at!) - +new Date(b.next_run_at!))[0];
    return { total: schedules.length, active, paused, nextRun };
  }, [schedules]);

  // ───────────── render ─────────────

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Automations · schedules"
        title="Run your agents on a clock."
        description="Recurring (daily, weekly, cron) or one-time. Pick an agent, write a prompt, set the cadence. Every run logs to your audit trail."
        icon={CalendarClock}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />New schedule
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : schedules.length === 0 ? (
        <>
          {/* KPI strip — even when empty, shows the shape */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total schedules" value={0} icon={CalendarClock} tone="default" hint="none yet" />
            <KpiCard label="Active" value={0} icon={Activity} tone="default" hint="nothing running" />
            <KpiCard label="Paused" value={0} icon={Pause} tone="default" />
            <KpiCard label="Next run" value="—" icon={Timer} tone="default" hint="no recurring jobs" />
          </div>

          <EmptyState
            icon={CalendarClock}
            title="No schedules yet"
            description="Schedule an agent to run on a recurring cadence — daily renewal sweeps, weekly compliance checks, monthly reports. The agent runs in the background and writes output straight to your AMS."
            action={
              <div className="flex items-center gap-2">
                {models.length === 0 ? (
                  <Button variant="primary" size="lg" onClick={() => router.push("/marketplace")}>
                    <Sparkles className="h-4 w-4" />Browse marketplace
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />Create your first schedule
                  </Button>
                )}
              </div>
            }
          />
        </>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total schedules" value={stats.total} icon={CalendarClock} tone="primary" />
            <KpiCard
              label="Active"
              value={stats.active}
              icon={Activity}
              tone={stats.active > 0 ? "success" : "default"}
              hint={stats.active > 0 ? "running on cadence" : "nothing active"}
            />
            <KpiCard
              label="Paused"
              value={stats.paused}
              icon={Pause}
              tone={stats.paused > 0 ? "warning" : "default"}
            />
            <KpiCard
              label="Next run"
              value={stats.nextRun?.next_run_at
                ? formatDistanceToNow(new Date(stats.nextRun.next_run_at), { addSuffix: false })
                : "—"}
              icon={Timer}
              tone="primary"
              hint={stats.nextRun ? stats.nextRun.model_name : "no recurring jobs"}
            />
          </div>

          <SectionHeader
            title="Schedules"
            description="Every active schedule logs to the audit trail."
            count={schedules.length}
            icon={CalendarClock}
          />

          <div className="space-y-3">
            {schedules.map((schedule) => {
              const isActive = schedule.is_active;
              const Icon = schedule.schedule_type === "recurring" ? Repeat : Calendar;
              return (
                <Card
                  key={schedule.id}
                  className={cn(
                    "group relative overflow-hidden transition-all duration-200",
                    isActive
                      ? "hover:border-border-strong hover:shadow-elevated hover:-translate-y-0.5"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {/* Active/paused accent stripe */}
                  <div
                    className={cn(
                      "absolute top-0 left-0 bottom-0 w-[3px]",
                      isActive ? "bg-gradient-primary" : "bg-warning/40",
                    )}
                    aria-hidden
                  />

                  <div className="p-5 pl-6 flex items-start gap-4">
                    <div
                      className={cn(
                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all",
                        isActive
                          ? "bg-gradient-primary text-primary-foreground shadow-glow"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-[14px] font-bold text-foreground tracking-tight leading-tight">
                          {schedule.model_name}
                        </h3>
                        {isActive ? (
                          <StatusPill tone="success" dot pulse size="sm">Active</StatusPill>
                        ) : (
                          <StatusPill tone="warning" dot size="sm">Paused</StatusPill>
                        )}
                        <StatusPill tone="neutral" size="sm">
                          {schedule.schedule_type === "recurring" ? "Recurring" : "One-time"}
                        </StatusPill>
                      </div>

                      <p className="text-[12.5px] text-muted-foreground line-clamp-2 mt-1.5 max-w-2xl">
                        {schedule.prompt}
                      </p>

                      <div className="flex items-center gap-3 mt-3 text-[11.5px] text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 font-medium">
                          <Timer className="h-3 w-3 text-primary" />
                          {schedule.schedule_type === "recurring"
                            ? getCronLabel(schedule.cron_expression)
                            : schedule.scheduled_at
                              ? format(new Date(schedule.scheduled_at), "MMM d, yyyy · h:mm a")
                              : "—"}
                        </span>
                        {schedule.next_run_at && isActive && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            Next run {formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })}
                          </span>
                        )}
                        {schedule.last_run_at && (
                          <span className="inline-flex items-center gap-1.5">
                            <Activity className="h-3 w-3" />
                            Last run {formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right rail: switch + delete */}
                    <div className="flex items-center gap-2 shrink-0 self-start">
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => toggleSchedule(schedule.id, isActive)}
                        aria-label={isActive ? "Pause schedule" : "Resume schedule"}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingId(schedule.id)}
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-tight flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Create a schedule
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Pick an activated agent, set a cadence, write the prompt that runs on each tick.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Agent</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.model_id}>{m.model_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {models.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                  No agents activated yet.{" "}
                  <button
                    onClick={() => { setCreateOpen(false); router.push("/marketplace"); }}
                    className="text-primary font-semibold hover:underline"
                  >
                    Browse marketplace
                  </button>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Schedule type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={scheduleType === "recurring" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setScheduleType("recurring")}
                >
                  <Repeat className="h-3.5 w-3.5" />Recurring
                </Button>
                <Button
                  variant={scheduleType === "one_time" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setScheduleType("one_time")}
                >
                  <Calendar className="h-3.5 w-3.5" />One-time
                </Button>
              </div>
            </div>

            {scheduleType === "recurring" && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Frequency</Label>
                <Select value={cronPreset} onValueChange={setCronPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cronPreset === "custom" && (
                  <Input
                    placeholder="e.g. 0 9 * * 1-5"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    className="font-mono text-[12.5px]"
                  />
                )}
              </div>
            )}

            {scheduleType === "one_time" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
                  <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Time</Label>
                  <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the agent do each time it runs?"
                rows={3}
                className="text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving || !selectedModel || !prompt.trim()}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Plus className="h-4 w-4" />Create schedule</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              The schedule will be removed and no further runs will fire. Past runs remain in your audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteSchedule(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
