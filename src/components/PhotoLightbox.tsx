import { X } from "lucide-react";
import { Modal } from "./Modal";

/** Visionneuse d'image simple et moderne (mobile + ordinateur) */
export function PhotoLightbox({
  url,
  caption,
  onClose,
}: {
  url: string | null;
  caption: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(url)}
      onClose={onClose}
      title={caption}
      className="sm:max-w-2xl"
    >
      <div className="flex flex-col items-center">
        {url && (
          <img
            src={url}
            alt={caption}
            className="max-h-[70dvh] w-full rounded-2xl border border-line object-contain"
          />
        )}
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-muted">
          <X className="h-3.5 w-3.5" />
          Cliquez en dehors de l'image ou appuyez sur Échap pour fermer
        </p>
      </div>
    </Modal>
  );
}
