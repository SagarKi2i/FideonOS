import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Scale, X, Inbox, Send, ShieldCheck, Sparkles, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import type { PodOutputRendererProps } from "../types";
import { cn } from "@/lib/utils";

export default function PolicyCompareOutput({
  output, confidence, onFileToAms, onSendToReview, onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "policy-compare") return null;

  const material = output.diffs.filter((d: any) => d.tone === "danger" || d.tone === "warning");

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <Scale className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Policy comparison · ready
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.account} · {output.carrier}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            {output.diffs.length} clauses compared · {material.length} material changes
          </p>
        </div>
        {typeof confidence === "number" && (
          <StatusPill tone={confidence > 0.9 ? "success" : "warning"} dot size="md">
            <ShieldCheck className="h-3 w-3" />{Math.round(confidence * 100)}% confidence
          </StatusPill>
        )}
      </div>

      <div className="px-5 py-4 border-b border-border">
        <p className="text-eyebrow text-muted-foreground mb-1.5">Headline</p>
        <p className="text-[13.5px] text-foreground leading-relaxed">{output.summary}</p>
      </div>

      <div className="divide-y divide-border">
        <div className="grid grid-cols-[1fr_1fr_1fr_120px] gap-3 px-5 py-2 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/20">
          <span>Clause</span>
          <span>Expiring</span>
          <span>Renewal</span>
          <span className="text-right">Δ</span>
        </div>
        {output.diffs.map((d: any) => (
          <div key={d.label} className="grid grid-cols-[1fr_1fr_1fr_120px] gap-3 px-5 py-3 items-center">
            <p className="text-[13px] font-semibold text-foreground truncate">{d.label}</p>
            <p className="text-[12.5px] text-muted-foreground truncate">{d.expiring}</p>
            <p className={cn(
              "text-[12.5px] font-medium truncate",
              d.tone === "danger" && "text-destructive",
              d.tone === "warning" && "text-warning-foreground/85",
              d.tone === "success" && "text-success",
              d.tone === "neutral" && "text-foreground/80",
            )}>{d.renewal}</p>
            <div className="text-right">
              <StatusPill tone={d.tone} size="sm">
                {d.tone === "danger" && <TrendingUp className="h-2.5 w-2.5" />}
                {d.tone === "warning" && <AlertTriangle className="h-2.5 w-2.5" />}
                {d.tone === "success" && <TrendingDown className="h-2.5 w-2.5" />}
                {d.delta}
              </StatusPill>
            </div>
          </div>
        ))}
      </div>

      {material.length > 0 && (
        <div className="border-t border-border px-5 py-3.5 bg-warning/5">
          <p className="text-eyebrow text-warning-foreground/85 mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />Worth surfacing to the client
          </p>
          <p className="text-[12.5px] text-foreground/85 leading-relaxed">
            Material changes detected — recommend a quick client call before the renewal date.
          </p>
        </div>
      )}

      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-3.5 w-3.5" />Discard</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}><Inbox className="h-3.5 w-3.5" />Send to Review</Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}><Send className="h-3.5 w-3.5" />File in AMS</Button>
      </div>
    </Card>
  );
}
