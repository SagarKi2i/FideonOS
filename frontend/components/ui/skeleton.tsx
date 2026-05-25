import { cn } from "@/lib/utils";

/** Shimmering placeholder rectangle. Use for loading states. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%] animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

/** Pre-baked skeleton row: 1 line of varying width. */
function SkeletonLine({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-3 w-full rounded", className)} {...props} />;
}

/** Pre-baked card skeleton (use for KPI grid loading). */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 space-y-3", className)}>
      <SkeletonLine className="w-1/3 h-2.5" />
      <Skeleton className="h-7 w-1/2" />
      <SkeletonLine className="w-2/3" />
    </div>
  );
}

export { Skeleton, SkeletonLine, SkeletonCard };
