import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToast, type ToastKind } from "@/hooks/useToast";
import { cn } from "@/utils/cn";

const icons: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const styles: Record<ToastKind, string> = {
  success: "border-accent/40 text-ink",
  error: "border-danger/50 text-ink",
  info: "border-line-strong text-ink",
};

const iconStyles: Record<ToastKind, string> = {
  success: "text-accent-text",
  error: "text-danger",
  info: "text-ink-muted",
};

/** Conteneur de notifications élégantes */
export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:top-6 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.kind];
        return (
          <div
            key={toast.id}
            className={cn(
              "animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border bg-bg-elevated/95 px-4 py-3 shadow-float backdrop-blur-md",
              styles[toast.kind],
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", iconStyles[toast.kind])} />
            <p className="flex-1 text-[13.5px] leading-snug text-ink">{toast.message}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Fermer la notification"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
