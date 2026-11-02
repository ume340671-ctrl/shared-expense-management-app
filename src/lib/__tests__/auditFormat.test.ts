import { describe, expect, it } from "vitest";
import type { Purchase, PurchaseWithBuyer } from "@/types";
import {
  auditPhotoSummary,
  auditSummaries,
  auditUpdateSummary,
  describePurchaseChanges,
  formatAuditValue,
  visibleAuditFields,
} from "@/lib/auditFormat";

function makePurchase(overrides: Partial<Purchase> = {}): PurchaseWithBuyer {
  return {
    id: "p1",
    item_name: "Eau",
    unit_price: 6,
    quantity: 3,
    buyer_id: "h1",
    purchase_date: "2026-03-10",
    notes: null,
    photo_path: null,
    created_at: "2026-03-10T10:00:00Z",
    updated_at: "2026-03-10T10:00:00Z",
    buyer_name: "RACHID FERHAOUI",
    ...overrides,
  };
}

describe("describePurchaseChanges", () => {
  it("décrit le changement de prix", () => {
    const changes = describePurchaseChanges(
      makePurchase(),
      makePurchase({ unit_price: 9 }),
    );
    expect(changes).toEqual(["prix unitaire : 6 DH → 9 DH"]);
  });

  it("décrit plusieurs changements", () => {
    const changes = describePurchaseChanges(
      makePurchase(),
      makePurchase({ unit_price: 9, quantity: 5, item_name: "Eau minérale" }),
    );
    expect(changes).toHaveLength(3);
    expect(changes[0]).toContain("Eau minérale");
    expect(changes[1]).toContain("9 DH");
    expect(changes[2]).toBe("quantité : 3 → 5");
  });

  it("décrit l'ajout, le remplacement et le retrait de photo", () => {
    expect(
      describePurchaseChanges(makePurchase(), makePurchase({ photo_path: "purchases/p1/a.jpg" })),
    ).toEqual(["photo ajoutée"]);
    expect(
      describePurchaseChanges(
        makePurchase({ photo_path: "purchases/p1/a.jpg" }),
        makePurchase({ photo_path: "purchases/p1/b.jpg" }),
      ),
    ).toEqual(["photo remplacée"]);
    expect(
      describePurchaseChanges(makePurchase({ photo_path: "purchases/p1/a.jpg" }), makePurchase()),
    ).toEqual(["photo retirée"]);
  });

  it("ne renvoie rien quand rien n'a changé", () => {
    expect(describePurchaseChanges(makePurchase(), makePurchase())).toEqual([]);
  });

  it("détecte un changement de remarque", () => {
    expect(
      describePurchaseChanges(makePurchase(), makePurchase({ notes: "urgent" })),
    ).toEqual(["remarque modifiée"]);
  });
});

describe("résumés", () => {
  it("formate l'ajout et la suppression", () => {
    const purchase = makePurchase();
    expect(auditSummaries("admin-2026@gmail.com", purchase).created).toBe(
      "admin-2026@gmail.com a ajouté l'achat « Eau » (18 DH)",
    );
    expect(auditSummaries("admin-2026@gmail.com", purchase).deleted).toBe(
      "admin-2026@gmail.com a supprimé l'achat « Eau » (18 DH)",
    );
  });

  it("utilise « un utilisateur » si l'auteur est inconnu", () => {
    expect(auditSummaries(null, makePurchase()).created).toContain("un utilisateur");
  });

  it("formate une modification", () => {
    expect(auditUpdateSummary("a@b.c", makePurchase(), ["prix unitaire : 6 DH → 9 DH"])).toBe(
      "a@b.c a modifié l'achat « Eau » : prix unitaire : 6 DH → 9 DH",
    );
  });

  it("formate les opérations sur photo", () => {
    expect(auditPhotoSummary("a@b.c", "added", "Eau")).toBe(
      "a@b.c a ajouté une photo à l'achat « Eau »",
    );
    expect(auditPhotoSummary("a@b.c", "replaced", "Eau")).toContain("a remplacé la photo");
    expect(auditPhotoSummary("a@b.c", "removed", null)).toContain("d'un achat");
  });
});

describe("affichage des valeurs", () => {
  it("formate les montants et les dates", () => {
    expect(formatAuditValue("unit_price", 6)).toBe("6 DH");
    expect(formatAuditValue("purchase_date", "2026-03-10")).toBe("10 mars 2026");
    expect(formatAuditValue("photo_path", "purchases/p1/a.jpg")).toBe("photo présente");
    expect(formatAuditValue("notes", null)).toBe("—");
    expect(formatAuditValue("item_name", "Eau")).toBe("Eau");
  });

  it("masque les champs techniques", () => {
    const fields = visibleAuditFields({
      id: "p1",
      item_name: "Eau",
      created_at: "2026-03-10T10:00:00Z",
    });
    expect(fields).toEqual(["item_name"]);
    expect(visibleAuditFields(null)).toEqual([]);
  });
});
