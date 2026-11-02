import { initials } from "@/lib/format";
import { cn } from "@/utils/cn";

/** Avatar avec initiales du colocataire */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[11px] rounded-lg",
    md: "h-10 w-10 text-[13px] rounded-xl",
    lg: "h-14 w-14 text-lg rounded-2xl",
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center bg-accent-soft font-semibold tracking-wide text-accent-text ring-1 ring-accent/25",
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
