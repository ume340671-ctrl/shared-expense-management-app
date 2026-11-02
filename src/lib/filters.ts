import type { PurchaseFilters, PurchaseWithBuyer } from "@/types";
import { purchaseTotal } from "./stats";

/** Normalise une chaîne pour la recherche (minuscules, sans accents) */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Applique recherche, filtres (personne, mois) et tri à une liste d'achats.
 * Fonction pure : la liste source n'est jamais modifiée.
 */
export function applyFilters(
  purchases: PurchaseWithBuyer[],
  filters: PurchaseFilters,
): PurchaseWithBuyer[] {
  const search = normalize(filters.search);

  const filtered = purchases.filter((p) => {
    if (search && !normalize(p.item_name).includes(search)) return false;
    if (filters.buyerId !== "all" && p.buyer_id !== filters.buyerId) return false;
    if (filters.month !== "all" && p.purchase_date.slice(0, 7) !== filters.month) return false;
    return true;
  });

  const sorted = [...filtered];
  switch (filters.sort) {
    case "date_desc":
      sorted.sort(
        (a, b) =>
          b.purchase_date.localeCompare(a.purchase_date) ||
          b.created_at.localeCompare(a.created_at),
      );
      break;
    case "date_asc":
      sorted.sort(
        (a, b) =>
          a.purchase_date.localeCompare(b.purchase_date) ||
          a.created_at.localeCompare(b.created_at),
      );
      break;
    case "amount_desc":
      sorted.sort((a, b) => purchaseTotal(b) - purchaseTotal(a));
      break;
    case "amount_asc":
      sorted.sort((a, b) => purchaseTotal(a) - purchaseTotal(b));
      break;
  }
  return sorted;
}

/** Nombre de filtres actifs (utile pour l'affichage) */
export function activeFilterCount(filters: PurchaseFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.buyerId !== "all") count += 1;
  if (filters.month !== "all") count += 1;
  return count;
}
