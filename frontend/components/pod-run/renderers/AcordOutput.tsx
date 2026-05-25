import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { FileText, AlertCircle, ShieldCheck, Send, Inbox, X, Sparkles } from "lucide-react";
import type { PodOutputRendererProps } from "../types";
import { cn } from "@/lib/utils";

export default function AcordOutput({
  output, confidence, onFileToAms, onSendToReview, onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "acord-parsed") return null;

  const lowConfidence = output.fields.filter((f: any) => f.confidence < 0.9);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Form parsed · structured fields ready
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.formType} · {output.pages} pages
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            {output.fields.length} fields extracted · {lowConfidence.length} need review
          </p>
        </div>
        {typeof confidence === "number" && (
          <StatusPill tone={confidence > 0.9 ? "success" : "warning"} dot size="md">
            <ShieldCheck className="h-3 w-3" />
            {Math.round(confidence * 100)}% confidence
          </StatusPill>
        )}
      </div>

      <div className="p-5">
        <p className="text-eyebrow text-muted-foreground mb-3">Extracted fields</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
          {output.fields.map((f: any) => (
            <div key={f.key} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{f.key}</p>
                <p className="text-[13px] font-medium text-foreground truncate">{f.value}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {f.flag && (
                  <StatusPill tone="warning" size="sm">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {f.flag}
                  </StatusPill>
                )}
                <span className={cn(
                  "text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded",
                  f.confidence >= 0.95 ? "text-success bg-success/10" :
                  f.confidence >= 0.85 ? "text-primary bg-accent" :
                  "text-warning-foreground/85 bg-warning/10",
                )}>
                  {Math.round(f.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {lowConfidence.length > 0 && (
        <div className="border-t border-border px-5 py-3.5 bg-warning/5">
          <p className="text-eyebrow text-warning-foreground/85 mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />Fideon flagged
          </p>
          <p className="text-[12.5px] text-foreground/85 leading-relaxed">
            {lowConfidence.length} field{lowConfidence.length !== 1 ? "s" : ""} below 90% confidence — usually safer to send to Review Queue rather than file directly.
          </p>
        </div>
      )}

      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-3.5 w-3.5" />Discard</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}><Inbox className="h-3.5 w-3.5" />Send to Review Queue</Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}><Send className="h-3.5 w-3.5" />File in AMS</Button>
      </div>
    </Card>
  );
}
