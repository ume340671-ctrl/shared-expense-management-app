import { cn } from "@/utils/cn";

/** Bloc de chargement shimmer */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** Squelette de carte de statistique */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-32" />
    </div>
  );
}

/** Squelette de ligne d'achat */
export function PurchaseRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  );
}
