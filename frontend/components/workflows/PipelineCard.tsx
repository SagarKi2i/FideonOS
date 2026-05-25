import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Settings2, Zap, ArrowRight, Play } from "lucide-react";
import { format } from "date-fns";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface PipelineStep {
  id: string;
  agent_id: string;
  agent_name: string;
  config: Record<string, any>;
  pass_output: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
}

const AGENT_TONE: Record<string, "primary" | "warning" | "success" | "neutral"> = {
  Broker:  "primary",
  Carrier: "warning",
  Custom:  "success",
};

interface PipelineCardProps {
  pipeline: Pipeline;
  index: number;
  onToggle: (id: string, current: boolean) => void;
  onEdit: (pipeline: Pipeline) => void;
  onDelete: (id: string) => void;
  onRun: (pipeline: Pipeline) => void;
  agentRegistry: { id: string; name: string; category: string }[];
}

export default function PipelineCard({
  pipeline,
  index,
  onToggle,
  onEdit,
  onDelete,
  onRun,
  agentRegistry,
}: PipelineCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <Card
        className={cn(
          "group relative overflow-hidden transition-all duration-200",
          "hover:shadow-elevated hover:border-border-strong hover:-translate-y-0.5",
          pipeline.is_active && "ring-1 ring-primary/15 border-primary/30",
        )}
      >
        {pipeline.is_active && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-primary" />
        )}

        <div className="p-5">
          {/* Top row: title + actions */}
          <div className="flex items-start justify-between mb-4 gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={cn(
                  "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                  pipeline.is_active
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-[15px] font-semibold text-foreground truncate tracking-tight">
                  {pipeline.name}
                </h3>
                {pipeline.description && (
                  <p className="text-[12.5px] text-muted-foreground mt-0.5 line-clamp-1">{pipeline.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => { e.stopPropagation(); onRun(pipeline); }}
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Run
              </Button>
              <Switch
                checked={pipeline.is_active}
                onCheckedChange={() => onToggle(pipeline.id, pipeline.is_active)}
              />
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(pipeline)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                onClick={() => onDelete(pipeline.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Visual Pipeline Flow */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {pipeline.steps.map((step, i) => {
                const agent = agentRegistry.find((a) => a.id === step.agent_id);
                const tone = agent ? AGENT_TONE[agent.category] ?? "neutral" : "neutral";
                return (
                  <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                    <StatusPill tone={tone}>
                      <span className="text-[10px] opacity-60 font-mono">{i + 1}</span>
                      {step.agent_name}
                    </StatusPill>
                    {i < pipeline.steps.length - 1 && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              {pipeline.is_active && <StatusPill tone="success" dot pulse size="sm">Active</StatusPill>}
              <span>{pipeline.steps.length} agent{pipeline.steps.length !== 1 ? "s" : ""}</span>
            </div>
            <span className="text-[11.5px] text-muted-foreground">
              {format(new Date(pipeline.created_at), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
