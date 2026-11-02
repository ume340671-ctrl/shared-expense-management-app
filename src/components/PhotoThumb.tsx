import { ImageOff } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * Miniature cliquable de la photo d'un achat.
 * - aucune photo : rien n'est affiché (l'achat reste identique)
 * - photo en cours de résolution : petit carré squelette
 */
export function PhotoThumb({
  url,
  loading = false,
  alt,
  onOpen,
  size = "md",
  className,
}: {
  url?: string;
  loading?: boolean;
  alt: string;
  onOpen: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const dimensions = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  if (!url) {
    if (!loading) return null;
    return (
      <span
        className={cn("skeleton shrink-0 rounded-lg border border-line", dimensions, className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Voir la photo de ${alt} en grand`}
      title="Voir la photo en grand"
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-lg border border-line transition-all duration-200 hover:border-accent/60 active:scale-95",
        dimensions,
        className,
      )}
    >
      <img
        src={url}
        alt={`Photo de ${alt}`}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </button>
  );
}

/** Variante « photo manquante » (utilisée si le fichier n'est plus accessible) */
export function PhotoMissingIcon({ className }: { className?: string }) {
  return <ImageOff className={cn("h-4 w-4 text-ink-muted", className)} aria-hidden="true" />;
}
