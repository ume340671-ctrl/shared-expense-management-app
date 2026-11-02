import { describe, expect, it } from "vitest";
import { describeDataError } from "@/lib/errors";

describe("describeDataError", () => {
  it("détecte une base non initialisée (table absente)", () => {
    const result = describeDataError(
      new Error("Could not find the table 'public.purchases' in the schema cache"),
    );
    expect(result.message).toContain("pas encore initialisée");
    expect(result.hint).toContain("migrations");
  });

  it("détecte un accès refusé (RLS / session)", () => {
    const result = describeDataError(new Error("new row violates row-level security policy"));
    expect(result.message).toContain("refusé");
  });

  it("détecte une erreur réseau", () => {
    const result = describeDataError(new Error("Failed to fetch"));
    expect(result.message).toContain("Connexion au serveur impossible");
  });

  it("conserve les autres messages", () => {
    const result = describeDataError(new Error("Erreur inconnue"));
    expect(result.message).toBe("Erreur inconnue");
  });
});
