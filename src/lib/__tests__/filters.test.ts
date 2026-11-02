import { describe, expect, it } from "vitest";
import type { PurchaseFilters, PurchaseWithBuyer } from "@/types";
import { activeFilterCount, applyFilters, normalize } from "@/lib/filters";

const purchases: PurchaseWithBuyer[] = [
  {
    id: "1",
    item_name: "Eau minérale",
    unit_price: 6,
    quantity: 3,
    buyer_id: "h1",
    purchase_date: "2026-03-10",
    notes: null,
    photo_path: null,
    created_at: "2026-03-10T09:00:00Z",
    updated_at: "2026-03-10T09:00:00Z",
    buyer_name: "RACHID FERHAOUI",
  },
  {
    id: "2",
    item_name: "Pain",
    unit_price: 2,
    quantity: 5,
    buyer_id: "h2",
    purchase_date: "2026-03-02",
    notes: null,
    photo_path: null,
    created_at: "2026-03-02T09:00:00Z",
    updated_at: "2026-03-02T09:00:00Z",
    buyer_name: "ELHOUSSAINE OUMLAL",
  },
  {
    id: "3",
    item_name: "Café moulu",
    unit_price: 45,
    quantity: 1,
    buyer_id: "h1",
    purchase_date: "2026-02-20",
    notes: null,
    photo_path: null,
    created_at: "2026-02-20T09:00:00Z",
    updated_at: "2026-02-20T09:00:00Z",
    buyer_name: "RACHID FERHAOUI",
  },
];

const baseFilters: PurchaseFilters = {
  search: "",
  buyerId: "all",
  month: "all",
  sort: "date_desc",
};

describe("normalize", () => {
  it("supprime accents et casse", () => {
    expect(normalize("Café Moulu")).toBe("cafe moulu");
  });
});

describe("applyFilters", () => {
  it("recherche par nom d'article, insensible à la casse et aux accents", () => {
    const result = applyFilters(purchases, { ...baseFilters, search: "cafe" });
    expect(result.map((p) => p.id)).toEqual(["3"]);
  });

  it("filtre par personne", () => {
    const result = applyFilters(purchases, { ...baseFilters, buyerId: "h2" });
    expect(result.map((p) => p.id)).toEqual(["2"]);
  });

  it("filtre par mois", () => {
    const result = applyFilters(purchases, { ...baseFilters, month: "2026-03" });
    expect(result.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("trie par date décroissante puis croissante", () => {
    expect(applyFilters(purchases, baseFilters).map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(
      applyFilters(purchases, { ...baseFilters, sort: "date_asc" }).map((p) => p.id),
    ).toEqual(["3", "2", "1"]);
  });

  it("trie par montant décroissant puis croissant", () => {
    expect(
      applyFilters(purchases, { ...baseFilters, sort: "amount_desc" }).map((p) => p.id),
    ).toEqual(["3", "1", "2"]); // 45, 18, 10
    expect(
      applyFilters(purchases, { ...baseFilters, sort: "amount_asc" }).map((p) => p.id),
    ).toEqual(["2", "1", "3"]); // 10, 18, 45
  });

  it("combine recherche, filtre personne et mois", () => {
    const result = applyFilters(purchases, {
      ...baseFilters,
      search: "a",
      buyerId: "h1",
      month: "2026-02",
    });
    expect(result.map((p) => p.id)).toEqual(["3"]);
  });

  it("ne modifie pas la liste source", () => {
    const originalOrder = purchases.map((p) => p.id);
    applyFilters(purchases, { ...baseFilters, sort: "amount_asc" });
    expect(purchases.map((p) => p.id)).toEqual(originalOrder);
  });
});

describe("activeFilterCount", () => {
  it("compte les filtres actifs", () => {
    expect(activeFilterCount(baseFilters)).toBe(0);
    expect(
      activeFilterCount({ ...baseFilters, search: "eau", buyerId: "h1" }),
    ).toBe(2);
  });
});
