import { describe, expect, it } from "vitest";
import type { Housemate, PurchaseWithBuyer } from "@/types";
import {
  availableMonths,
  computeStats,
  purchaseTotal,
  purchasesInMonth,
  sumPurchases,
} from "@/lib/stats";

const housemates: Housemate[] = [
  { id: "h1", full_name: "RACHID FERHAOUI", created_at: "2026-01-01T00:00:00Z" },
  { id: "h2", full_name: "ELHOUSSAINE OUMLAL", created_at: "2026-01-01T00:00:00Z" },
  { id: "h3", full_name: "TARIK MERRAS", created_at: "2026-01-01T00:00:00Z" },
  { id: "h4", full_name: "ABDESAMAD HAMI", created_at: "2026-01-01T00:00:00Z" },
];

function makePurchase(
  id: string,
  buyerId: string,
  unitPrice: number,
  quantity: number,
  date: string,
  createdAt: string,
): PurchaseWithBuyer {
  return {
    id,
    item_name: `Article ${id}`,
    unit_price: unitPrice,
    quantity,
    buyer_id: buyerId,
    purchase_date: date,
    notes: null,
    photo_path: null,
    created_at: createdAt,
    updated_at: createdAt,
    buyer_name: housemates.find((h) => h.id === buyerId)!.full_name,
  };
}

describe("purchaseTotal — prix unitaire × quantité", () => {
  it("calcule le montant total (exemple : 6 DH × 3 = 18 DH)", () => {
    expect(purchaseTotal({ unit_price: 6, quantity: 3 })).toBe(18);
  });

  it("évite les erreurs d'arrondi flottant", () => {
    expect(purchaseTotal({ unit_price: 0.1, quantity: 3 })).toBe(0.3);
    expect(purchaseTotal({ unit_price: 19.99, quantity: 3 })).toBe(59.97);
  });
});

describe("sumPurchases", () => {
  it("additionne les montants totaux", () => {
    const purchases = [
      makePurchase("1", "h1", 6, 3, "2026-03-01", "2026-03-01T10:00:00Z"),
      makePurchase("2", "h2", 10, 2, "2026-03-02", "2026-03-02T10:00:00Z"),
    ];
    expect(sumPurchases(purchases)).toBe(38);
  });
});

describe("computeStats", () => {
  const now = new Date(2026, 2, 15); // 15 mars 2026

  const purchases = [
    makePurchase("1", "h1", 6, 3, "2026-03-01", "2026-03-01T10:00:00Z"), // 18 DH Rachid
    makePurchase("2", "h1", 10, 1, "2026-02-10", "2026-02-10T10:00:00Z"), // 10 DH Rachid (février)
    makePurchase("3", "h2", 5, 4, "2026-03-05", "2026-03-05T10:00:00Z"), // 20 DH Elhousaine
    makePurchase("4", "h3", 7.5, 2, "2026-01-20", "2026-01-20T10:00:00Z"), // 15 DH Tarik
  ];

  it("ne produit aucune donnée fictive quand la liste est vide", () => {
    const stats = computeStats([], housemates, now);
    expect(stats.totalSpent).toBe(0);
    expect(stats.purchaseCount).toBe(0);
    expect(stats.currentMonthSpent).toBe(0);
    expect(stats.lastPurchase).toBeNull();
    expect(stats.perPerson.every((p) => p.totalPaid === 0 && p.percentage === 0)).toBe(true);
  });

  it("calcule le total général, le mois courant et le dernier achat", () => {
    const stats = computeStats(purchases, housemates, now);
    expect(stats.totalSpent).toBe(63);
    expect(stats.purchaseCount).toBe(4);
    expect(stats.currentMonthSpent).toBe(38); // mars uniquement
    expect(stats.lastPurchase?.id).toBe("3"); // created_at le plus récent (05/03)
  });

  it("calcule les dépenses par personne et les pourcentages", () => {
    const stats = computeStats(purchases, housemates, now);
    const rachid = stats.perPerson.find((p) => p.housemate.id === "h1")!;
    expect(rachid.purchaseCount).toBe(2);
    expect(rachid.totalPaid).toBe(28);
    expect(rachid.percentage).toBeCloseTo(44.44, 1);

    const samad = stats.perPerson.find((p) => p.housemate.id === "h4")!;
    expect(samad.purchaseCount).toBe(0);
    expect(samad.totalPaid).toBe(0);
    expect(samad.percentage).toBe(0);

    const sumPercent = stats.perPerson.reduce((sum, p) => sum + p.percentage, 0);
    expect(sumPercent).toBeCloseTo(100, 1);
  });
});

describe("purchasesInMonth / availableMonths", () => {
  const purchases = [
    makePurchase("1", "h1", 6, 3, "2026-03-01", "2026-03-01T10:00:00Z"),
    makePurchase("2", "h2", 10, 1, "2026-02-10", "2026-02-10T10:00:00Z"),
    makePurchase("3", "h2", 5, 4, "2026-03-20", "2026-03-20T10:00:00Z"),
  ];

  it("filtre par mois", () => {
    expect(purchasesInMonth(purchases, "2026-03")).toHaveLength(2);
    expect(purchasesInMonth(purchases, "2026-02")).toHaveLength(1);
    expect(purchasesInMonth(purchases, "2026-04")).toHaveLength(0);
  });

  it("liste les mois disponibles du plus récent au plus ancien", () => {
    expect(availableMonths(purchases)).toEqual(["2026-03", "2026-02"]);
  });
});
