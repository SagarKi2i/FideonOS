'use client';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Activity, 
  MessageSquare, 
  Clock, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileDown,
  FileText,
  Scale,
  ClipboardList,
  Search,
  Power,
  Building2,
  RefreshCw,
  XCircle,
  Inbox,
  Gavel,
  DollarSign,
  AlertTriangle,
  Sparkles,
  User
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PodAnalyticsDashboard from "@/components/pod-dashboards/PodAnalyticsDashboard";
import { getPodDataset, applyRealRuns, type PodRunLike } from "@/components/pod-dashboards/podDashboardData";
import LossRunReportingDashboard from "@/components/playground/LossRunReportingDashboard";
import { agentsApi, type AgentStatsSummary } from "@/lib/api";

interface ActivatedPod {
  id: string;
  agent_id: string;
  model_id: string;    // == agent keyword; drives pod-specific dataset lookup
  model_name: string;
  domain: string;
  activated_at: string;
  agents?: { keyword: string; name: string; domain: string };
}

const getPodIcon = (modelId: string) => {
  switch (modelId) {
    case "document-retrieval":
    case "document-search":
      return FileDown;
    case "quote-generation":
      return FileText;
    case "policy-comparison":
      return Scale;
    case "claims-fnol":
      return ClipboardList;
    case "multi-document":
      return Search;
    case "carrier-submission-intake":
      return Inbox;
    case "carrier-claims-adjudication":
      return Gavel;
    default:
      return Brain;
  }
};

// Derive the headline stat cards from real runs (no mock data).
const deriveStats = (runs: PodRunLike[]) => {
  const total = runs.length;
  const errors = runs.filter((r) => r.status === "failed").length;
  const success = runs.filter((r) => r.status === "complete" || r.status === "succeeded").length;
  return { total, success, errors, label: "Total Runs" };
};

const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return "â€”";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "â€”";
  const mins = Math.floor(Math.max(0, Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const runStatusTone = (status: string) =>
  status === "complete" || status === "succeeded"
    ? "text-green-600 border-green-600"
    : status === "failed"
    ? "text-destructive border-destructive"
    : status === "needs_review"
    ? "text-amber-600 border-amber-600"
    : "text-blue-600 border-blue-600";

// Generic activity table backed by real agent_runs (GET /api/agents/{kw}/runs).
function RealRunsTable({ runs }: { runs: PodRunLike[] }) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No runs recorded for this agent yet</p>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run ID</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell>
              <code className="bg-muted px-2 py-1 rounded text-sm">{run.id.slice(0, 8)}</code>
            </TableCell>
            <TableCell className="font-medium">{relativeTime(run.started_at)}</TableCell>
            <TableCell>
              {typeof run.confidence === "number" ? `${Math.round(run.confidence * 100)}%` : "â€”"}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={runStatusTone(run.status)}>
                {run.status === "complete" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {run.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                {run.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PodDashboard() {
  const _p = useParams(); const podId = Array.isArray(_p?.podId) ? _p.podId[0] : _p?.podId;
  const router = useRouter();
  const { toast } = useToast();
  const [pod, setPod] = useState<ActivatedPod | null>(null);
  const [loading, setLoading] = useState(true);
  const [deactivating, setDeactivating] = useState(false);
  const [realRuns, setRealRuns] = useState<PodRunLike[]>([]);
  const [summary, setSummary] = useState<AgentStatsSummary | null>(null);

  useEffect(() => {
    loadPodData();
  }, [podId]);

  const loadPodData = async () => {
    if (!podId) return;
    try {
      // Fetch dashboard data from FastAPI using the agent keyword (podId == keyword)
      const data = await agentsApi.dashboard(podId) as ActivatedPod & {
        agents: { keyword: string; name: string; domain: string };
        user_agent_stats: { stats: { summary?: AgentStatsSummary } } | { stats: { summary?: AgentStatsSummary } }[];
      };

      // Normalise: map agent keyword to the model_id field used for dataset lookup
      setPod({
        ...data,
        model_id: data.agents?.keyword ?? podId,
        model_name: data.agents?.name ?? podId,
        domain: data.agents?.domain ?? "insurance",
      });

      // Canonical structured summary (real numbers across full run history).
      const uas = Array.isArray(data.user_agent_stats) ? data.user_agent_stats[0] : data.user_agent_stats;
      setSummary(uas?.stats?.summary ?? null);

      // Fetch real runs (cast: AgentRun is compatible with PodRunLike)
      const runsData = (await agentsApi.runs(podId).catch(() => [])) as unknown as PodRunLike[];
      setRealRuns(runsData);
    } catch {
      toast({
        title: "Agent not found",
        description: "This agent may have been deactivated or you don't have access.",
        variant: "destructive",
      });
      router.push("/my-models");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!pod) return;
    setDeactivating(true);
    try {
      await agentsApi.deactivate(pod.agents?.keyword ?? pod.model_id);
      toast({
        title: "Agent deactivated",
        description: `${pod.model_name} has been deactivated successfully`,
      });
      router.push("/my-models");
    } catch {
      toast({
        title: "Error",
        description: "Failed to deactivate agent",
        variant: "destructive",
      });
    } finally {
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Brain className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (!pod) {
    return null;
  }

  const PodIcon = getPodIcon(pod.model_id);
  // Prefer the canonical server-computed summary (full history); fall back to the
  // recent-runs sample only if the summary hasn't been provisioned yet.
  const stats = summary && summary.total_runs > 0
    ? { total: summary.total_runs, success: summary.succeeded, errors: summary.failed, label: "Total Runs" }
    : deriveStats(realRuns);
  const lastActivity = summary?.last_activity_at
    ? relativeTime(summary.last_activity_at)
    : realRuns.length ? relativeTime(realRuns[0].started_at) : "—";
  const successRate = summary && summary.total_runs > 0
    ? summary.success_rate
    : stats.total ? (stats.success / stats.total) * 100 : 0;

  // Loss Run Reporting has a richer, broker-shaped dashboard that includes
  // the per-customer book view + per-account loss-run detail. Route the
  // pod-specific dashboard route there instead of the generic analytics one.
  if (pod.model_id === "loss-run-reporting") {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/my-models")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">My Agents / {pod.model_name}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive hover:bg-destructive/10">
                <Power className="h-4 w-4 mr-2" /> Deactivate
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate Pod?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will deactivate {pod.model_name}. You can reactivate it from the Marketplace at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeactivate} disabled={deactivating} className="bg-destructive hover:bg-destructive/90">
                  {deactivating ? "Deactivating..." : "Deactivate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <LossRunReportingDashboard />
      </div>
    );
  }

  // Rich analytics dashboard for any pod with a registered dataset
  const richDataset = applyRealRuns(getPodDataset(pod.model_id), realRuns);
  if (richDataset) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/my-models")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">My Agents / {pod.model_name}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive hover:bg-destructive/10">
                <Power className="h-4 w-4 mr-2" /> Deactivate
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate Pod?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will deactivate {pod.model_name}. You can reactivate it from the Marketplace at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeactivate} disabled={deactivating} className="bg-destructive hover:bg-destructive/90">
                  {deactivating ? "Deactivating..." : "Deactivate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <PodAnalyticsDashboard dataset={richDataset} />
      </div>
    );
  }


  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/my-models")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <PodIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {pod.model_name}
              </h1>
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {pod.domain.charAt(0).toUpperCase() + pod.domain.slice(1)} â€¢ Activated {new Date(pod.activated_at || "").toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10">
                <Power className="h-4 w-4 mr-2" />
                Deactivate
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate Pod?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will deactivate {pod.model_name}. You can reactivate it from the Marketplace at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {deactivating ? "Deactivating..." : "Deactivate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stats.label}</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <PodIcon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-foreground">
                  {successRate.toFixed(1)}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-2xl font-bold text-foreground">{stats.errors}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Activity</p>
                <p className="text-2xl font-bold text-foreground">{lastActivity}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pod-Specific Activity Log */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
          <CardDescription>Recent operations for this pod</CardDescription>
        </CardHeader>
        <CardContent>
          <RealRunsTable runs={realRuns} />
        </CardContent>
      </Card>
    </div>
  );
}
