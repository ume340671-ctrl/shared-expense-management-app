import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Camera, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { Housemate, PurchaseInput, PurchaseWithBuyer } from "@/types";
import { formatMoney, roundMoney, todayISO } from "@/lib/format";
import { purchaseTotal } from "@/lib/stats";
import {
  parseAmount,
  toPurchaseInput,
  validatePurchaseForm,
  type PurchaseFormErrors,
  type PurchaseFormFields,
} from "@/lib/validation";
import {
  PHOTO_ACCEPT_ATTRIBUTE,
  resolvePhotoUrl,
  validatePhotoFile,
} from "@/lib/photoStorage";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { cn } from "@/utils/cn";

/** Données transmises à la validation du formulaire */
export type PurchaseFormSubmit = {
  input: PurchaseInput;
  /** Nouvelle photo à envoyer (null si inchangée) */
  photo: File | null;
  /** true si l'utilisateur a supprimé la photo existante */
  removePhoto: boolean;
};

const EMPTY_FORM: PurchaseFormFields = {
  item_name: "",
  unit_price: "",
  quantity: "1",
  buyer_id: "",
  purchase_date: todayISO(),
  notes: "",
};

const fieldClass =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const labelClass = "mb-2 block text-[12px] font-medium uppercase tracking-[0.14em] text-ink-muted";

/**
 * Formulaire rapide d'enregistrement / modification d'un achat.
  * New purchases use quantity 1; legacy quantities remain unchanged on edit.
 */
export function PurchaseFormModal({
  open,
  onClose,
  housemates,
  editingPurchase,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  housemates: Housemate[];
  editingPurchase: PurchaseWithBuyer | null;
  onSubmit: (data: PurchaseFormSubmit) => Promise<void>;
}) {
  const [form, setForm] = useState<PurchaseFormFields>(EMPTY_FORM);
  const [errors, setErrors] = useState<PurchaseFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Réinitialisation à l'ouverture / en mode édition
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setPhotoError(null);
    setPhotoFile(null);
    setPhotoRemoved(false);
    setExistingPhotoUrl(null);

    if (editingPurchase) {
      setForm({
        item_name: editingPurchase.item_name,
        unit_price: String(editingPurchase.unit_price),
        quantity: String(editingPurchase.quantity),
        buyer_id: editingPurchase.buyer_id,
        purchase_date: editingPurchase.purchase_date,
        notes: editingPurchase.notes ?? "",
      });
      // Aperçu de la photo déjà enregistrée
      if (editingPurchase.photo_path) {
        void resolvePhotoUrl(editingPurchase.photo_path).then(setExistingPhotoUrl);
      }
    } else {
      setForm({ ...EMPTY_FORM, purchase_date: todayISO() });
    }
  }, [open, editingPurchase]);

  // Aperçu local de la nouvelle photo sélectionnée
  const previewUrl = useMemo(() => {
    if (!photoFile) return null;
    return URL.createObjectURL(photoFile);
  }, [photoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const total = useMemo(() => {
    const price = parseAmount(form.unit_price);
    const quantity = Number(form.quantity);
    if (price === null || !Number.isFinite(quantity) || quantity < 1) return null;
    return purchaseTotal({ unit_price: price, quantity });
  }, [form.unit_price, form.quantity]);

  const update = <K extends keyof PurchaseFormFields>(key: K, value: PurchaseFormFields[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handlePhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // permet de re-sélectionner le même fichier
    if (!file) return;
    const validationError = validatePhotoFile(file);
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setPhotoRemoved(false);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setExistingPhotoUrl(null);
    setPhotoRemoved(true);
    setPhotoError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors = validatePurchaseForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const input = toPurchaseInput(form);
      input.unit_price = roundMoney(input.unit_price);
      await onSubmit({ input, photo: photoFile, removePhoto: photoRemoved });
      onClose();
    } catch (error) {
      // Les données saisies sont conservées en cas d'erreur
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Une erreur est survenue. Les données saisies ont été conservées.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hasExistingPhoto = Boolean(editingPurchase?.photo_path) && !photoRemoved;
  const showPreview = Boolean(previewUrl) || Boolean(existingPhotoUrl && hasExistingPhoto);
  const previewSource = previewUrl ?? existingPhotoUrl;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingPurchase ? "Modifier l'achat" : "Nouvel achat"}
      description={
        editingPurchase
          ? "Modifiez les informations puis enregistrez."
          : "Article, prix et personne : quelques secondes suffisent."
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Nom de l'article */}
        <div>
          <label htmlFor="item_name" className={labelClass}>
            Nom de l'article
          </label>
          <input
            id="item_name"
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Ex : Eau, pain, gaz…"
            value={form.item_name}
            onChange={(e) => update("item_name", e.target.value)}
            className={cn(fieldClass, errors.item_name && "border-danger")}
            aria-invalid={Boolean(errors.item_name)}
          />
          {errors.item_name && (
            <p className="mt-1.5 text-[12px] text-danger">{errors.item_name}</p>
          )}
        </div>

        <div>
          <label htmlFor="unit_price" className={labelClass}>
            {editingPurchase && editingPurchase.quantity > 1 ? "Prix unitaire (DH)" : "Prix (DH)"}
          </label>
          <input
            id="unit_price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={form.unit_price}
            onChange={(e) => update("unit_price", e.target.value)}
            className={cn(fieldClass, errors.unit_price && "border-danger")}
            aria-invalid={Boolean(errors.unit_price)}
          />
          {editingPurchase && editingPurchase.quantity > 1 && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              Ancien achat : {editingPurchase.quantity} unités conservées. Le total reste calculé à partir de ce prix unitaire.
            </p>
          )}
          {errors.unit_price && <p className="mt-1.5 text-[12px] text-danger">{errors.unit_price}</p>}
        </div>

        {/* Personne */}
        <div>
          <label htmlFor="buyer_id" className={labelClass}>
            Achat effectué par
          </label>
          <select
            id="buyer_id"
            value={form.buyer_id}
            onChange={(e) => update("buyer_id", e.target.value)}
            className={cn(fieldClass, "appearance-none pr-10", errors.buyer_id && "border-danger")}
            aria-invalid={Boolean(errors.buyer_id)}
          >
            <option value="">Sélectionner un colocataire</option>
            {housemates.map((housemate) => (
              <option key={housemate.id} value={housemate.id}>
                {housemate.full_name}
              </option>
            ))}
          </select>
          {errors.buyer_id && (
            <p className="mt-1.5 text-[12px] text-danger">{errors.buyer_id}</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label htmlFor="purchase_date" className={labelClass}>
            Date de l'achat
          </label>
          <input
            id="purchase_date"
            type="date"
            value={form.purchase_date}
            max={todayISO()}
            onChange={(e) => update("purchase_date", e.target.value)}
            className={cn(fieldClass, errors.purchase_date && "border-danger")}
          />
        </div>

        {/* Remarque */}
        <div>
          <label htmlFor="notes" className={labelClass}>
            Remarque{" "}
            <span className="normal-case tracking-normal text-ink-muted/70">(facultatif)</span>
          </label>
          <textarea
            id="notes"
            rows={2}
            placeholder="Précision utile pour le groupe…"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Photo de l'article */}
        <div>
          <span className={labelClass}>
            Photo de l'article{" "}
            <span className="normal-case tracking-normal text-ink-muted/70">(facultatif)</span>
          </span>

          {showPreview && previewSource ? (
            <div className="relative overflow-hidden rounded-xl border border-line bg-surface-2">
              <img
                src={previewSource}
                alt="Aperçu de la photo de l'article"
                className="h-44 w-full object-cover"
              />
              <div className="absolute right-2 top-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Remplacer la photo"
                  title="Remplacer la photo"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-bg-elevated/90 text-ink-secondary backdrop-blur transition-colors hover:text-ink"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={removePhoto}
                  aria-label="Supprimer la photo"
                  title="Supprimer la photo"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-bg-elevated/90 text-danger backdrop-blur transition-colors hover:bg-danger-soft"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {photoFile && (
                <span className="absolute bottom-2 left-2 rounded-lg bg-bg-elevated/90 px-2.5 py-1 text-[11px] text-ink-secondary backdrop-blur">
                  Nouvelle photo
                </span>
              )}
            </div>
          ) : (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex h-20 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-ink-muted transition-colors hover:border-accent/60 hover:text-accent-text"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[12.5px] font-medium">Ajouter une photo</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Prendre une photo"
                title="Prendre une photo"
                className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-line-strong text-ink-muted transition-colors hover:border-accent/60 hover:text-accent-text"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Galerie / fichiers */}
          <input
            ref={galleryInputRef}
            type="file"
            accept={PHOTO_ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={handlePhotoSelected}
            aria-hidden="true"
            tabIndex={-1}
          />
          {/* Appareil photo (mobile) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept={PHOTO_ACCEPT_ATTRIBUTE}
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelected}
            aria-hidden="true"
            tabIndex={-1}
          />

          <p className="mt-2 text-[11.5px] text-ink-muted">
            JPG, JPEG, PNG ou WEBP — 5 Mo maximum.
          </p>
          {photoError && <p className="mt-1.5 text-[12px] text-danger">{photoError}</p>}
        </div>

        {/* Total calculé */}
        <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5">
          <span className="flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.12em] text-ink-secondary">
            <Calculator className="h-4 w-4 text-accent-text" />
            Montant total
          </span>
          <span className="text-2xl font-light text-accent-text">
            {total === null ? "— DH" : formatMoney(total)}
          </span>
        </div>

        {submitError && (
          <p className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-ink">
            {submitError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" size="lg" loading={submitting} className="sm:min-w-56">
            {submitting
              ? photoFile
                ? "Envoi de la photo…"
                : "Enregistrement…"
              : editingPurchase
                ? "Enregistrer les modifications"
                : "+ Enregistrer l'achat"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
