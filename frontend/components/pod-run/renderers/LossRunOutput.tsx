import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { ShieldCheck, AlertCircle, Send, Inbox, X, FileText, Sparkles } from "lucide-react";
import type { PodOutputRendererProps } from "../types";
import { cn } from "@/lib/utils";

const fmt$ = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function LossRunOutput({
  output,
  confidence,
  onFileToAms,
  onSendToReview,
  onDiscard,
}: PodOutputRendererProps) {
  if (!output || output.kind !== "loss-run-report") return null;

  const trendData = output.yearlyAggregates.map((y: any) => ({
    year: String(y.year),
    "Loss ratio": Math.round(y.lossRatio * 100),
    premium: y.premium,
    losses: y.losses,
  }));

  const latestRatio = output.yearlyAggregates[output.yearlyAggregates.length - 1].lossRatio;
  const overThreshold = latestRatio > 0.7;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-gradient-hero flex items-start gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-glow">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-primary mb-0.5">
            Loss-run report · ready
          </p>
          <h2 className="font-display text-[17px] font-bold text-foreground tracking-tight leading-tight">
            {output.account} · {output.lineOfBusiness}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            {output.carrier} · {output.period}
          </p>
        </div>
        {typeof confidence === "number" && (
          <StatusPill tone={confidence > 0.9 ? "success" : "warning"} dot size="md">
            <ShieldCheck className="h-3 w-3" />
            {Math.round(confidence * 100)}% confidence
          </StatusPill>
        )}
      </div>

      {/* Summary narrative */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-eyebrow text-muted-foreground mb-1.5">Headline</p>
        <p className="text-[13.5px] text-foreground leading-relaxed">{output.summary}</p>
      </div>

      {/* Yearly chart + table */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-5">
          <p className="text-eyebrow text-muted-foreground mb-3">Loss ratio by year</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip
                cursor={{ fill: "hsl(var(--accent) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label={{ value: "70% threshold", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--destructive))" }} />
              <Bar dataKey="Loss ratio" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-5">
          <p className="text-eyebrow text-muted-foreground mb-3">Per-year breakdown</p>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 font-semibold">Year</th>
                <th className="text-right py-1.5 font-semibold">Premium</th>
                <th className="text-right py-1.5 font-semibold">Losses</th>
                <th className="text-right py-1.5 font-semibold">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {output.yearlyAggregates.map((y: any) => (
                <tr key={y.year} className="border-b border-border/60 last:border-0">
                  <td className="py-2 font-semibold tabular-nums">{y.year}</td>
                  <td className="py-2 text-right tabular-nums">{fmt$(y.premium)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt$(y.losses)}</td>
                  <td className={cn(
                    "py-2 text-right font-bold tabular-nums",
                    y.lossRatio > 0.7 ? "text-destructive" : y.lossRatio > 0.6 ? "text-warning-foreground/85" : "text-success",
                  )}>
                    {fmtPct(y.lossRatio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flagged claims */}
      {output.flaggedClaims?.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 py-3 border-b border-border bg-warning/5 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning-foreground/80" />
            <p className="text-[13px] font-semibold text-foreground">
              {output.flaggedClaims.length} high-severity claims (&gt;$50k)
            </p>
            {overThreshold && (
              <StatusPill tone="danger" size="sm" className="ml-auto">Loss ratio over 70%</StatusPill>
            )}
          </div>
          <div className="divide-y divide-border">
            {output.flaggedClaims.map((c: any) => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    {c.type} · <span className="font-mono text-[11.5px] text-muted-foreground">{c.id}</span>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">{c.date} · {c.note}</p>
                </div>
                <span className="text-[13.5px] font-bold tabular-nums text-destructive">{fmt$(c.amount)}</span>
                <StatusPill tone={c.status === "Open" ? "warning" : "neutral"} size="sm">{c.status}</StatusPill>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {output.recommendations?.length > 0 && (
        <div className="border-t border-border px-5 py-4 bg-accent/30">
          <p className="text-eyebrow text-primary mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />Fideon recommends
          </p>
          <ul className="space-y-1.5">
            {output.recommendations.map((r: string) => (
              <li key={r} className="text-[12.5px] text-foreground/85 leading-relaxed flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action footer */}
      <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <X className="h-3.5 w-3.5" />Discard
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onSendToReview}>
          <Inbox className="h-3.5 w-3.5" />Send to Review Queue
        </Button>
        <Button variant="primary" size="sm" onClick={onFileToAms}>
          <Send className="h-3.5 w-3.5" />File in AMS
        </Button>
      </div>
    </Card>
  );
}
