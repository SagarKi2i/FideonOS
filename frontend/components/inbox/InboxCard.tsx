import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { INBOX_TYPE_META, STATUS_META, type InboxItem } from "./inboxTypes";
import { formatDistanceToNow } from "date-fns";

interface Props {
  item: InboxItem;
  onPrimary: () => void;
  onSecondary?: () => void;
  onOpen: () => void;
  onDismiss: () => void;
  isActing?: boolean;
}

export function InboxCard({ item, onPrimary, onSecondary, onOpen, onDismiss, isActing }: Props) {
  const meta = INBOX_TYPE_META[item.type];
  const Icon = meta.icon;
  const statusMeta = STATUS_META[item.status];
  const isDone = item.status === "approved" || item.status === "sent" || item.status === "dismissed";
  const isLive = item.status === "in_progress";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        className={cn(
          "group relative overflow-hidden border border-border bg-card hover:shadow-elevated transition-all",
          isDone && "opacity-70"
        )}
      >
        {/* Left accent rail */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            item.priority === "high" ? "bg-primary" : "bg-primary/30"
          )}
        />
        {isLive && (
          <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] via-transparent to-transparent pointer-events-none" />
        )}

        <div className="p-4 md:p-5 pl-5 md:pl-6">
          <div className="flex items-start gap-4">
            {/* Icon chip */}
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", meta.accent)}>
              <Icon className="h-5 w-5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-border/60 px-1.5 py-0">
                  {meta.label}
                </Badge>
                <Badge className={cn("text-[10px] font-medium border-0", statusMeta.cls)}>
                  {isLive && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
                  {statusMeta.label}
                </Badge>
                <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>

              <button
                onClick={onOpen}
                className="text-left w-full group/title"
              >
                <h3 className="text-[15px] font-semibold text-foreground leading-snug group-hover/title:text-primary transition-colors">
                  {item.title}
                </h3>
              </button>
              {item.subtitle && (
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{item.subtitle}</p>
              )}
              {item.summary && (
                <p className="text-[13px] text-foreground/80 mt-2 leading-relaxed">{item.summary}</p>
              )}

              {item.pod_name && (
                <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  <span>By {item.pod_name}</span>
                </div>
              )}

              {/* Actions */}
              {!isDone && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  {item.primary_action_label && (
                    <Button
                      size="sm"
                      onClick={onPrimary}
                      disabled={isActing || isLive}
                      className="h-8 min-h-[44px] md:min-h-0"
                    >
                      {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      {item.primary_action_label}
                    </Button>
                  )}
                  {item.secondary_action_label && onSecondary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onSecondary}
                      disabled={isActing}
                      className="h-8 min-h-[44px] md:min-h-0"
                    >
                      {item.secondary_action_label}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onOpen}
                    className="h-8 ml-auto text-muted-foreground hover:text-foreground"
                  >
                    Open
                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </Button>
                  {!isLive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onDismiss}
                      className="h-8 text-muted-foreground hover:text-destructive"
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              )}

              {isDone && item.action_taken && (
                <div className="mt-3 text-[12px] text-muted-foreground italic">
                  {item.action_taken}{item.acted_at ? ` · ${formatDistanceToNow(new Date(item.acted_at), { addSuffix: true })}` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
