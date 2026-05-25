import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { RefreshCw, Mail, Send, X, Inbox, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import type { PodOutputRendererProps } from "../types";
import { cn } from "@/lib/utils";

export default function RenewalOutput({
  output, confidence, onFileToAms, onSendToReview, onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "renewal-package") return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Renewal package · ready
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.account}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            Expires {output.expiry} · {output.daysOut} days out
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
        <p className="text-[13.5px] text-foreground leading-relaxed">{output.headline}</p>
      </div>

      <div className="divide-y divide-border">
        <div className="grid grid-cols-[1fr_1fr_1fr_120px] gap-3 px-5 py-2 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/20">
          <span>Change</span>
          <span>Before</span>
          <span>After</span>
          <span className="text-right">Δ</span>
        </div>
        {output.changes.map((c: any) => (
          <div key={c.label} className="grid grid-cols-[1fr_1fr_1fr_120px] gap-3 px-5 py-3 items-center">
            <p className="text-[13px] font-semibold text-foreground truncate">{c.label}</p>
            <p className="text-[12.5px] text-muted-foreground truncate">{c.before}</p>
            <p className={cn(
              "text-[12.5px] font-medium truncate",
              c.tone === "danger"  && "text-destructive",
              c.tone === "warning" && "text-warning-foreground/85",
              c.tone === "success" && "text-success",
              c.tone === "neutral" && "text-foreground/80",
            )}>{c.after}</p>
            <div className="text-right">
              <StatusPill tone={c.tone} size="sm">{c.delta}</StatusPill>
            </div>
          </div>
        ))}
      </div>

      {/* Drafted email */}
      {output.clientEmailDraft && (
        <div className="border-t border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-eyebrow text-primary flex items-center gap-1.5">
              <Mail className="h-3 w-3" />Drafted client email
            </p>
            <Button variant="ghost" size="xs" className="text-primary">
              Edit <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[12.5px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {output.clientEmailDraft}
            </p>
          </div>
        </div>
      )}

      <div className="border-t border-border px-5 py-3.5 bg-accent/30">
        <p className="text-eyebrow text-primary mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />Fideon prepared
        </p>
        <p className="text-[12.5px] text-foreground/85 leading-relaxed">
          Loss-runs pulled, policy compared, client email drafted, package ready to file. Approve to ship.
        </p>
      </div>

      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-3.5 w-3.5" />Discard</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}><Inbox className="h-3.5 w-3.5" />Send to Review</Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}><Send className="h-3.5 w-3.5" />File + send email</Button>
      </div>
    </Card>
  );
}
