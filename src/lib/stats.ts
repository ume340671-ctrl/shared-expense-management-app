import type { GlobalStats, Housemate, PersonStats, PurchaseWithBuyer } from "@/types";
import { currentMonthKey, roundMoney } from "./format";

/** Montant total d'un achat : prix unitaire × quantité */
export function purchaseTotal(purchase: { unit_price: number; quantity: number }): number {
  return roundMoney(purchase.unit_price * purchase.quantity);
}

/** Somme des montants totaux d'une liste d'achats */
export function sumPurchases(purchases: { unit_price: number; quantity: number }[]): number {
  return roundMoney(purchases.reduce((sum, p) => sum + purchaseTotal(p), 0));
}

/**
 * Calcule toutes les statistiques à partir des achats réellement enregistrés.
 * Aucune valeur fictive n'est produite : si la liste est vide, tout est à zéro.
 */
export function computeStats(
  purchases: PurchaseWithBuyer[],
  housemates: Housemate[],
  now: Date = new Date(),
): GlobalStats {
  const monthKey = currentMonthKey(now);

  const totalSpent = sumPurchases(purchases);
  const currentMonthSpent = sumPurchases(
    purchases.filter((p) => p.purchase_date.slice(0, 7) === monthKey),
  );

  const lastPurchase =
    purchases.length === 0
      ? null
      : purchases.reduce((latest, p) =>
          new Date(p.created_at) > new Date(latest.created_at) ? p : latest,
        );

  const perPerson: PersonStats[] = housemates.map((housemate) => {
    const own = purchases.filter((p) => p.buyer_id === housemate.id);
    const totalPaid = sumPurchases(own);
    return {
      housemate,
      purchaseCount: own.length,
      totalPaid,
      percentage: totalSpent > 0 ? roundMoney((totalPaid / totalSpent) * 100) : 0,
    };
  });

  return {
    totalSpent,
    purchaseCount: purchases.length,
    currentMonthSpent,
    lastPurchase,
    perPerson,
  };
}

/** Filtre les achats sur le mois donné (YYYY-MM) */
export function purchasesInMonth(
  purchases: PurchaseWithBuyer[],
  monthKey: string,
): PurchaseWithBuyer[] {
  return purchases.filter((p) => p.purchase_date.slice(0, 7) === monthKey);
}

/** Liste des mois disponibles (YYYY-MM), du plus récent au plus ancien */
export function availableMonths(purchases: PurchaseWithBuyer[]): string[] {
  const months = new Set(purchases.map((p) => p.purchase_date.slice(0, 7)));
  return [...months].sort().reverse();
}
