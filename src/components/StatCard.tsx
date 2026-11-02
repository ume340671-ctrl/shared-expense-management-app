import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Carte de statistique secondaire */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-line-strong",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {label}
        </p>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <p className="mt-3 text-2xl font-light tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
