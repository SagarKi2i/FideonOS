import { Button } from "@/components/ui/button";
import { Plus, Zap, FileSearch, Scale, Receipt, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface WorkflowEmptyStateProps {
  onCreateNew: () => void;
}

const EXAMPLE_FLOWS = [
  {
    title: "Renewal processing",
    desc: "Pull policy → diff coverage → quote",
    steps: ["Document Retrieval", "Policy Comparison", "Quote Generation"],
    icon: FileSearch,
  },
  {
    title: "Claims pipeline",
    desc: "FNOL intake → adjudicate → flag fraud",
    steps: ["Claims FNOL", "Claims Adjudication", "Fraud Detection"],
    icon: Scale,
  },
  {
    title: "Submission triage",
    desc: "Parse ACORD → triage → send quote",
    steps: ["ACORD Parser", "Submission Intake", "Quote Generation"],
    icon: Receipt,
  },
];

export default function WorkflowEmptyState({ onCreateNew }: WorkflowEmptyStateProps) {
  return (
    <div>
      <EmptyState
        icon={Zap}
        title="Build your first pipeline"
        description="Chain AI agents together to automate complex insurance workflows. Each agent processes data and passes results to the next."
        action={
          <Button variant="primary" size="lg" onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            Create first pipeline
          </Button>
        }
      />

      <div className="mt-8">
        <p className="text-eyebrow text-muted-foreground text-center mb-4">Or start from a template</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
          {EXAMPLE_FLOWS.map((flow) => (
            <Card
              key={flow.title}
              className="group p-5 cursor-pointer hover:shadow-elevated hover:border-border-strong hover:-translate-y-0.5 transition-all"
              onClick={onCreateNew}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-9 w-9 rounded-lg bg-accent text-primary flex items-center justify-center">
                  <flow.icon className="h-[18px] w-[18px]" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h4 className="text-[14px] font-semibold text-foreground mb-1">{flow.title}</h4>
              <p className="text-[12px] text-muted-foreground mb-3">{flow.desc}</p>
              <div className="space-y-1">
                {flow.steps.map((step, si) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      {si < flow.steps.length - 1 && <div className="w-px h-2.5 bg-border" />}
                    </div>
                    <span className="text-[11.5px] text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
