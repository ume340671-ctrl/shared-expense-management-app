import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMonthKey,
  formatNumber,
  formatPercent,
  initials,
  roundMoney,
  toISODate,
} from "@/lib/format";

/** Normalise les espaces insécables utilisés par Intl */
const normalizeSpaces = (value: string) => value.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("affiche les entiers sans décimales", () => {
    expect(formatMoney(18)).toBe("18 DH");
  });

  it("affiche les décimales uniquement si nécessaires", () => {
    expect(normalizeSpaces(formatMoney(18.5))).toBe("18,5 DH");
    expect(normalizeSpaces(formatMoney(18.5))).not.toBe("18,50 DH");
    expect(normalizeSpaces(formatMoney(1234.56))).toBe("1 234,56 DH");
  });

  it("protège contre les valeurs invalides", () => {
    expect(formatMoney(Number.NaN)).toBe("0 DH");
  });
});

describe("formatPercent / formatNumber", () => {
  it("formate les pourcentages", () => {
    expect(normalizeSpaces(formatPercent(44.44))).toBe("44,4 %");
  });

  it("formate les nombres", () => {
    expect(normalizeSpaces(formatNumber(1500))).toBe("1 500");
  });
});

describe("roundMoney", () => {
  it("arrondit à deux décimales", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(19.995)).toBe(20);
  });
});

describe("dates", () => {
  it("formate une clé mois en libellé français", () => {
    expect(formatMonthKey("2026-03")).toBe("mars 2026");
  });

  it("convertit une date locale en ISO", () => {
    expect(toISODate(new Date(2026, 2, 9))).toBe("2026-03-09");
  });
});

describe("initials", () => {
  it("génère les initiales des colocataires", () => {
    expect(initials("RACHID FERHAOUI")).toBe("RF");
    expect(initials("TARIK MERRAS")).toBe("TM");
  });
});
