import { Button } from "@/components/ui/button";
import { Plus, Zap, GitBranch, Activity, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusPill } from "@/components/ui/status-pill";

interface WorkflowHeaderProps {
  pipelineCount: number;
  activeCount: number;
  onCreateNew: () => void;
}

export default function WorkflowHeader({
  pipelineCount,
  activeCount,
  onCreateNew,
}: WorkflowHeaderProps) {
  const automationRate = pipelineCount > 0 ? Math.round((activeCount / pipelineCount) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Agent orchestration"
        title="Agent workflows"
        description="Chain agents into automated pipelines that handle end-to-end insurance operations on demand or on event."
        icon={Zap}
        actions={
          <>
            {activeCount > 0 && (
              <StatusPill tone="success" dot pulse>
                {activeCount} active
              </StatusPill>
            )}
            <Button variant="primary" size="lg" onClick={onCreateNew}>
              <Plus className="h-4 w-4" />
              New workflow
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Total workflows"
          value={pipelineCount}
          icon={GitBranch}
          tone="primary"
        />
        <KpiCard
          label="Active now"
          value={activeCount}
          icon={Activity}
          tone="success"
          hint={activeCount > 0 ? "Running" : "None active"}
        />
        <KpiCard
          label="Automation rate"
          value={`${automationRate}%`}
          icon={TrendingUp}
          tone="primary"
          hint="of workflows live"
        />
      </div>
    </>
  );
}
