import type { PurchaseInput } from "@/types";

/** Champs bruts du formulaire d'achat (tous des chaînes) */
export type PurchaseFormFields = {
  item_name: string;
  unit_price: string;
  quantity: string;
  buyer_id: string;
  purchase_date: string;
  notes: string;
};

export type PurchaseFormErrors = Partial<Record<keyof PurchaseFormFields, string>>;

/** Convertit une saisie en nombre (accepte la virgule décimale) */
export function parseAmount(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valide les champs du formulaire.
 * Règles : nom obligatoire, prix obligatoire et non négatif,
 * quantité entière >= 1, colocataire obligatoire, date obligatoire.
 */
export function validatePurchaseForm(form: PurchaseFormFields): PurchaseFormErrors {
  const errors: PurchaseFormErrors = {};

  if (!form.item_name.trim()) {
    errors.item_name = "Le nom de l'article est obligatoire.";
  }

  const price = parseAmount(form.unit_price);
  if (price === null) {
    errors.unit_price = "Le prix est obligatoire.";
  } else if (price < 0) {
    errors.unit_price = "Le prix ne peut pas être négatif.";
  }

  const quantity = Number(form.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = "La quantité doit être un entier supérieur ou égal à 1.";
  }

  if (!form.buyer_id) {
    errors.buyer_id = "Sélectionnez la personne qui a effectué l'achat.";
  }

  if (!form.purchase_date) {
    errors.purchase_date = "La date est obligatoire.";
  }

  return errors;
}

/** Convertit des champs valides en PurchaseInput */
export function toPurchaseInput(form: PurchaseFormFields): PurchaseInput {
  return {
    item_name: form.item_name.trim(),
    unit_price: parseAmount(form.unit_price) ?? 0,
    quantity: Number(form.quantity),
    buyer_id: form.buyer_id,
    purchase_date: form.purchase_date,
    notes: form.notes.trim() ? form.notes.trim() : null,
  };
}
