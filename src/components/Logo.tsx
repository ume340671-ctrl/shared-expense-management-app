import { cn } from "@/utils/cn";

/**
 * Logo typographique T9DYA MANAGER.
 * Marque : carré arrondi vert citron avec un « T » stylisé.
 */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent shadow-[0_4px_16px_-6px_var(--accent)]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M5 6h14M12 6v13"
            stroke="var(--accent-contrast)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17.5" r="1.9" fill="var(--accent-contrast)" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-[0.14em] text-ink",
            compact ? "text-[13px]" : "text-[15px]",
          )}
        >
          T9DYA
        </span>
        <span
          className={cn(
            "font-light tracking-[0.34em] text-ink-muted",
            compact ? "text-[8px]" : "text-[9px]",
          )}
        >
          MANAGER
        </span>
      </span>
    </div>
  );
}
