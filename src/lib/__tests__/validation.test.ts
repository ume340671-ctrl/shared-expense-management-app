import { describe, expect, it } from "vitest";
import {
  parseAmount,
  toPurchaseInput,
  validatePurchaseForm,
  type PurchaseFormFields,
} from "@/lib/validation";

const validForm: PurchaseFormFields = {
  item_name: "Eau",
  unit_price: "6",
  quantity: "3",
  buyer_id: "h1",
  purchase_date: "2026-03-10",
  notes: "",
};

describe("parseAmount", () => {
  it("accepte la virgule décimale", () => {
    expect(parseAmount("6,5")).toBe(6.5);
    expect(parseAmount("12.75")).toBe(12.75);
  });

  it("renvoie null pour une saisie invalide ou vide", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("validatePurchaseForm", () => {
  it("accepte un formulaire valide", () => {
    expect(validatePurchaseForm(validForm)).toEqual({});
  });

  it("refuse un nom d'article vide", () => {
    const errors = validatePurchaseForm({ ...validForm, item_name: "   " });
    expect(errors.item_name).toBeDefined();
  });

  it("refuse un prix négatif", () => {
    const errors = validatePurchaseForm({ ...validForm, unit_price: "-5" });
    expect(errors.unit_price).toBe("Le prix ne peut pas être négatif.");
  });

  it("refuse un prix manquant", () => {
    const errors = validatePurchaseForm({ ...validForm, unit_price: "" });
    expect(errors.unit_price).toBe("Le prix est obligatoire.");
  });

  it("refuse une quantité nulle, négative ou décimale", () => {
    expect(validatePurchaseForm({ ...validForm, quantity: "0" }).quantity).toBeDefined();
    expect(validatePurchaseForm({ ...validForm, quantity: "-2" }).quantity).toBeDefined();
    expect(validatePurchaseForm({ ...validForm, quantity: "1.5" }).quantity).toBeDefined();
    expect(validatePurchaseForm({ ...validForm, quantity: "abc" }).quantity).toBeDefined();
  });

  it("refuse une personne absente de la liste", () => {
    expect(validatePurchaseForm({ ...validForm, buyer_id: "" }).buyer_id).toBeDefined();
  });

  it("refuse une date manquante", () => {
    expect(validatePurchaseForm({ ...validForm, purchase_date: "" }).purchase_date).toBeDefined();
  });
});

describe("toPurchaseInput", () => {
  it("convertit les champs en entrée normalisée", () => {
    const input = toPurchaseInput({
      ...validForm,
      item_name: "  Eau  ",
      unit_price: "6,5",
      notes: "  pack familial ",
    });
    expect(input).toEqual({
      item_name: "Eau",
      unit_price: 6.5,
      quantity: 3,
      buyer_id: "h1",
      purchase_date: "2026-03-10",
      notes: "pack familial",
    });
  });

  it("met les remarques vides à null", () => {
    expect(toPurchaseInput(validForm).notes).toBeNull();
  });
});
