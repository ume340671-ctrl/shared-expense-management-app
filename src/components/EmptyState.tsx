import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** État vide élégant avec icône, message et action optionnelle */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-ink-muted">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-muted">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
