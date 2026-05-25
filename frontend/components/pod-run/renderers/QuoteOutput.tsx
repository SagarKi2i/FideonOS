import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Send, X, Inbox, ShieldCheck, Sparkles, Building2 } from "lucide-react";
import type { PodOutputRendererProps } from "../types";
import { cn } from "@/lib/utils";

const fmt$ = (n: number | null) => n == null ? "—" : `$${n.toLocaleString()}`;

export default function QuoteOutput({
  output, confidence, onFileToAms, onSendToReview, onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "quote") return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Quote comparison · ready
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.account} · {output.lineOfBusiness}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">{output.quotes.length} carriers compared</p>
        </div>
        {typeof confidence === "number" && (
          <StatusPill tone={confidence > 0.9 ? "success" : "warning"} dot size="md">
            <ShieldCheck className="h-3 w-3" />{Math.round(confidence * 100)}% confidence
          </StatusPill>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {output.quotes.map((q: any) => (
          <div key={q.carrier} className={cn("p-5 flex flex-col gap-2", q.tone === "success" && "bg-success/5")}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[15px] font-bold tracking-tight text-foreground">{q.carrier}</h3>
              <StatusPill tone={q.tone} size="sm">{q.recommendation}</StatusPill>
            </div>
            <p className="font-display text-[24px] font-bold tabular-nums text-foreground tracking-tight">{fmt$(q.premium)}</p>
            <p className="text-[11.5px] text-muted-foreground">{q.change} vs. prior</p>
            <dl className="text-[11.5px] text-muted-foreground space-y-0.5 mt-1">
              <div className="flex justify-between"><dt>Limits</dt><dd className="text-foreground font-medium">{q.limits}</dd></div>
              <div className="flex justify-between"><dt>Deductible</dt><dd className="text-foreground font-medium">{q.deductible}</dd></div>
            </dl>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-4 bg-accent/30">
        <p className="text-eyebrow text-primary mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />Fideon's read
        </p>
        <p className="text-[13px] text-foreground/85 leading-relaxed">{output.summary}</p>
      </div>

      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-3.5 w-3.5" />Discard</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}><Inbox className="h-3.5 w-3.5" />Send to Review</Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}><Send className="h-3.5 w-3.5" />File in AMS</Button>
      </div>
    </Card>
  );
}
