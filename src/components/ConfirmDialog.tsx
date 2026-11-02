import { Button } from "./Button";
import { Modal } from "./Modal";

/** Confirmation explicite avant suppression */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Supprimer",
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} className="sm:max-w-md">
      <p className="text-[13.5px] leading-relaxed text-ink-secondary">{message}</p>
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Annuler
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
