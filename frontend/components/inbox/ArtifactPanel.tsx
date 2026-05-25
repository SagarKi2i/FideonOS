'use client';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { INBOX_TYPE_META, type InboxItem } from "./inboxTypes";
import { cn } from "@/lib/utils";

interface Props {
  item: InboxItem | null;
  onClose: () => void;
}

export function ArtifactPanel({ item, onClose }: Props) {
  const router = useRouter();
  const meta = item ? INBOX_TYPE_META[item.type] : null;
  const Icon = meta?.icon;

  const openInPlayground = () => {
    if (!meta?.podId) return;
    onClose();
    router.push(`/pod/${meta.podId}?tab=run`);
  };

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {item && meta && Icon && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-b from-accent/40 to-transparent">
              <div className="flex items-start gap-4">
                <div className={cn("h-11 w-11 rounded-lg flex items-center justify-center shrink-0", meta.accent)}>
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider mb-2">
                    {meta.label}
                  </Badge>
                  <SheetTitle className="text-xl leading-tight text-left">{item.title}</SheetTitle>
                  {item.subtitle && (
                    <SheetDescription className="text-left mt-1">{item.subtitle}</SheetDescription>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {item.summary && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    What the agent did
                  </h4>
                  <p className="text-sm text-foreground/90 leading-relaxed">{item.summary}</p>
                </section>
              )}

              {/* Payload as KPI grid */}
              {item.payload && Object.keys(item.payload).length > 0 && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Key details
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    {Object.entries(item.payload).map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border bg-card px-3 py-2.5">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium">
                          {k.replace(/_/g, " ")}
                        </div>
                        <div className="text-[13px] font-semibold text-foreground mt-0.5 truncate">
                          {Array.isArray(v) ? v.join(", ") : typeof v === "number" ? v.toLocaleString() : String(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {item.pod_name && (
                <section>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-accent/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Powered by</span>
                      <span className="font-medium text-foreground">{item.pod_name}</span>
                    </div>
                    {meta.podId && (
                      <Button size="sm" variant="ghost" onClick={openInPlayground}>
                        Open agent
                        <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
