'use client';
import { useRouter } from 'next/navigation';
// RunWorkflowDialog — lightweight kickoff dialog (kept as a compact
// fallback for surfaces that don't need the full live-run animation).
//
// Behaviour: the broker types an instruction and presses Start. We
// then seed decision_reviews via the shared `seedWorkflowRunReviews`
// helper and navigate to Today. The richer Run experience used by the
// AgentWorkflows page lives in WorkflowRunDialog.

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { Loader2, Play, Sparkles, GitBranch, ArrowDown } from "lucide-react";
import { seedWorkflowRunReviews } from "@/components/workflows/runtime/runSeed";

// ─────────────────────────── types ───────────────────────────

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
}

export interface RunWorkflowDialogProps {
  open: boolean;
  workflow: Pipeline | null;
  onOpenChange: (open: boolean) => void;
  onLaunched?: () => void;
}

// ─────────────────────────── component ───────────────────────────

export default function RunWorkflowDialog({
  open, workflow, onOpenChange, onLaunched,
}: RunWorkflowDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [input, setInput]     = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open && workflow) {
      setInput(`Run ${workflow.name} on the next eligible account.`);
    }
  }, [open, workflow]);

  if (!workflow) return null;

  const launch = async () => {
    setRunning(true);
    try {
      const { rowsInserted } = await seedWorkflowRunReviews({
        workflowId: workflow.id,
        workflowName: workflow.name,
        steps: workflow.steps.map((s) => ({ agent_id: s.agent_id, agent_name: s.agent_name })),
        input,
      });

      toast({
        title: `${workflow.name} started`,
        description: `${rowsInserted} step${rowsInserted !== 1 ? "s" : ""} flagged for review — open Approvals to act.`,
      });

      onLaunched?.();
      onOpenChange(false);
      router.push("/approvals");
    } catch (e: any) {
      toast({ title: "Couldn't start the run", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold tracking-tight inline-flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Run {workflow.name}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Kicks off all {workflow.steps.length} agents in sequence. Items needing your approval will land in Today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Input / instructions
            </Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="What should this run do?"
              className="text-[13px]"
              disabled={running}
            />
            <p className="text-[11px] text-muted-foreground">
              Plain English. The first agent receives this; subsequent agents receive the prior step's output.
            </p>
          </div>

          {/* Step preview */}
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              Run sequence
            </p>
            <ol className="space-y-1.5">
              {workflow.steps.map((step, idx) => (
                <li key={step.id} className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded bg-muted text-foreground/80 flex items-center justify-center text-[10.5px] font-bold tabular-nums shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-foreground">{step.agent_name}</p>
                    {idx < workflow.steps.length - 1 && step.pass_output && (
                      <p className="text-[10.5px] text-primary mt-0.5 inline-flex items-center gap-1">
                        <ArrowDown className="h-2.5 w-2.5" />output → next step
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Card className="px-3 py-2 bg-muted/30 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-[11.5px] text-foreground/80 leading-snug">
              Every output is captured in the audit trail. Items needing approval land in <strong className="text-foreground">Today → Needs your approval</strong>.
            </p>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button variant="primary" onClick={launch} disabled={running || !input.trim() || workflow.steps.length === 0}>
            {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Starting…</> : <><Play className="h-3.5 w-3.5" />Start run</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

