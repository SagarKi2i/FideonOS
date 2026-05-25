import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { FileSearch, Send, X, Inbox, ShieldCheck, Download, FileText } from "lucide-react";
import type { PodOutputRendererProps } from "../types";

export default function DocumentRetrievalOutput({
  output, confidence, onFileToAms, onSendToReview, onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "document-retrieval") return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Documents retrieved · indexed in AMS
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.account}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            {output.documentsFound} documents · classified + tagged
          </p>
        </div>
        {typeof confidence === "number" && (
          <StatusPill tone={confidence > 0.9 ? "success" : "warning"} dot size="md">
            <ShieldCheck className="h-3 w-3" />{Math.round(confidence * 100)}% confidence
          </StatusPill>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Breakdown by type */}
        <div className="p-5">
          <p className="text-eyebrow text-muted-foreground mb-3">By type</p>
          <ul className="space-y-1.5">
            {output.breakdown.map((b: any) => (
              <li key={b.type} className="flex items-center gap-2 text-[12.5px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-foreground/85 flex-1">{b.type}</span>
                <span className="font-bold tabular-nums text-foreground">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent files */}
        <div className="p-0">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-eyebrow text-muted-foreground">Recently retrieved</p>
          </div>
          <ul className="divide-y divide-border">
            {output.recent.map((doc: any) => (
              <li key={doc.name} className="px-5 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-accent text-primary flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate font-mono">{doc.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {doc.carrier} · {doc.type} · {doc.date}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-3.5 w-3.5" />Discard</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}><Inbox className="h-3.5 w-3.5" />Send to Review</Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}><Send className="h-3.5 w-3.5" />Confirm in AMS</Button>
      </div>
    </Card>
  );
}
