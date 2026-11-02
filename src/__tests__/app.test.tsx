// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";

/**
 * Test d'intégration du parcours complet en mode local de secours.
 * Les variables Supabase sont neutralisées AVANT le chargement de
 * l'application pour tester l'implémentation locale (même interface).
 */
vi.stubEnv("VITE_SUPABASE_URL", "");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

const { default: App } = await import("@/App");

beforeAll(() => {
  // happy-dom ne fournit pas toujours SubtleCrypto : on utilise celui de Node
  try {
    if (!globalThis.crypto || !("subtle" in globalThis.crypto)) {
      Object.defineProperty(globalThis, "crypto", {
        value: webcrypto,
        configurable: true,
      });
    }
  } catch {
    /* environnement particulier : on poursuit */
  }
  window.scrollTo = () => {};
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = (() => "blob:apercu") as typeof URL.createObjectURL;
  }
  if (typeof URL.revokeObjectURL !== "function") {
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  }
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function loginFirstTime(password = "Coloc-T9DYA-2026") {
  render(<App />);
  await waitFor(() => expect(screen.getByText("Bienvenue")).toBeTruthy());

  fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
    target: { value: "admin-2026@gmail.com" },
  });
  fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Définir et se connecter" }));

  await waitFor(() => expect(screen.getByText("Bonjour")).toBeTruthy());
}

function getRachidId(): string {
  const housemates = JSON.parse(localStorage.getItem("t9dya.housemates.v1") ?? "[]") as {
    id: string;
    full_name: string;
  }[];
  const rachid = housemates.find((h) => h.full_name === "RACHID FERHAOUI");
  if (!rachid) throw new Error("Colocataire manquant");
  return rachid.id;
}

describe("Parcours complet T9DYA MANAGER", () => {
  it("affiche un état vide élégant au premier lancement", async () => {
    await loginFirstTime();
    expect(screen.getByText("Aucun achat pour le moment.")).toBeTruthy();
    expect(screen.queryByText("Total des dépenses")).toBeNull();
  });

  it("enregistre le prix saisi sans champ quantité et met à jour les statistiques", async () => {
    await loginFirstTime();

    fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
    await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nom de l'article"), {
      target: { value: "Eau" },
    });
    fireEvent.change(screen.getByLabelText("Prix (DH)"), {
      target: { value: "18" },
    });
    expect(screen.queryByLabelText("Quantité")).toBeNull();
    fireEvent.change(screen.getByLabelText("Achat effectué par"), {
      target: { value: getRachidId() },
    });

    // Le total est calculé en direct
    expect(screen.getByText("18 DH")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));

    // Confirmation + tableau de bord à jour
    await waitFor(() =>
      expect(screen.getByText("« Eau » enregistré — 18 DH")).toBeTruthy(),
    );
    expect(screen.getByText("Total des dépenses")).toBeTruthy();
    expect(screen.getAllByText("18 DH").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 achat enregistré/)).toBeTruthy();
    expect(screen.getByText(/Eau · RACHID FERHAOUI/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("t9dya.purchases.v1") ?? "[]")[0].quantity).toBe(1);
  });

  it("refuse un formulaire vide avec des messages clairs", async () => {
    await loginFirstTime();
    fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
    await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));

    expect(screen.getByText("Le nom de l'article est obligatoire.")).toBeTruthy();
    expect(screen.getByText("Le prix est obligatoire.")).toBeTruthy();
    expect(
      screen.getByText("Sélectionnez la personne qui a effectué l'achat."),
    ).toBeTruthy();
    // Le formulaire reste ouvert, aucune donnée enregistrée
    expect(screen.getByText("Nouvel achat")).toBeTruthy();
  });

  it("refuse un prix négatif sans réintroduire le champ quantité", async () => {
    await loginFirstTime();
    fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
    await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nom de l'article"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText("Prix (DH)"), {
      target: { value: "-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));

    expect(screen.getByText("Le prix ne peut pas être négatif.")).toBeTruthy();
    expect(screen.queryByLabelText("Quantité")).toBeNull();
  });

  it("préserve les quantités et montants historiques lors de la modification", async () => {
    await loginFirstTime();
    const { dataService } = await import("@/services/dataService");
    await dataService.createPurchase({ item_name: "Ancien achat", unit_price: 6, quantity: 3,
      buyer_id: getRachidId(), purchase_date: "2026-01-01", notes: null });
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Achats" })[0]);
    fireEvent.click(screen.getAllByLabelText("Modifier Ancien achat")[0]);
    await waitFor(() => expect(screen.getByText("Modifier l'achat")).toBeTruthy());
    expect(screen.queryByLabelText("Quantité")).toBeNull();
    expect((screen.getByLabelText("Prix unitaire (DH)") as HTMLInputElement).value).toBe("6");
    expect(screen.getByText(/3 unités conservées/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nom de l'article"), { target: { value: "Ancien achat corrigé" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(screen.queryByText("Modifier l'achat")).toBeNull());
    const saved = JSON.parse(localStorage.getItem("t9dya.purchases.v1") ?? "[]")[0];
    expect(saved.quantity).toBe(3);
    expect(saved.unit_price * saved.quantity).toBe(18);
  });

  it("supprime un achat uniquement après confirmation explicite", async () => {
    await loginFirstTime();

    // Ajout
    fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
    await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nom de l'article"), {
      target: { value: "Pain" },
    });
    fireEvent.change(screen.getByLabelText("Prix (DH)"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Achat effectué par"), {
      target: { value: getRachidId() },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());

    // Navigation vers l'historique (sidebar + barre mobile : même destination)
    fireEvent.click(screen.getAllByRole("button", { name: "Achats" })[0]);
    await waitFor(() => expect(screen.getAllByText("Pain").length).toBeGreaterThan(0));

    // Suppression → confirmation
    fireEvent.click(screen.getAllByLabelText("Supprimer Pain")[0]);
    await waitFor(() =>
      expect(screen.getByText("Supprimer cet achat ?")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(screen.getByText("Aucun achat pour le moment.")).toBeTruthy(),
    );
  });

  it("conserve les achats après reconnexion (persistance)", async () => {
    await loginFirstTime();

    // Ajout d'un achat
    fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
    await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nom de l'article"), {
      target: { value: "Café" },
    });
    fireEvent.change(screen.getByLabelText("Prix (DH)"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByLabelText("Achat effectué par"), {
      target: { value: getRachidId() },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());

    // Déconnexion puis reconnexion
    fireEvent.click(screen.getByLabelText("Se déconnecter"));
    await waitFor(() => expect(screen.getByText("Connexion")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Coloc-T9DYA-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    // Les données sont toujours là
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());
    expect(screen.getAllByText("45 DH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Café").length).toBeGreaterThan(0);
  });

  it("refuse une connexion avec un mot de passe incorrect", async () => {
    await loginFirstTime();
    fireEvent.click(screen.getByLabelText("Se déconnecter"));
    await waitFor(() => expect(screen.getByText("Connexion")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "mauvais-mot-de-passe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() =>
      expect(screen.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeTruthy(),
    );
  });
});

function selectPhotoFile(name = "eau.jpg", type = "image/jpeg", sizeBytes?: number) {
  const file = new File(["contenu-image"], name, { type });
  if (sizeBytes !== undefined) {
    Object.defineProperty(file, "size", { value: sizeBytes });
  }
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("Champ fichier introuvable");
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

async function addPurchaseWithPhoto(
  itemName: string,
  price: string,
  photo: { name: string; type: string; sizeBytes?: number } = { name: "eau.jpg", type: "image/jpeg" },
) {
  fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
  await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Nom de l'article"), {
    target: { value: itemName },
  });
  fireEvent.change(screen.getByLabelText("Prix (DH)"), {
    target: { value: price },
  });
  fireEvent.change(screen.getByLabelText("Achat effectué par"), {
    target: { value: getRachidId() },
  });
  selectPhotoFile(photo.name, photo.type, photo.sizeBytes);
}

describe("Photos des achats", () => {
  it("enregistre un achat avec sa photo et affiche la miniature", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Eau", "6");

    // Aperçu avant enregistrement
    await waitFor(() =>
      expect(screen.getByAltText("Aperçu de la photo de l'article")).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));

    // Confirmation + miniature dans la liste
    await waitFor(() =>
      expect(screen.getByText(/enregistré avec sa photo/)).toBeTruthy(),
    );
    expect(screen.getByText("Total des dépenses")).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText("Photo de Eau")).toBeTruthy());
  });

  it("refuse un fichier trop volumineux ou non pris en charge", async () => {
    await loginFirstTime();

    // Fichier non image
    await addPurchaseWithPhoto("Document", "10", { name: "notes.txt", type: "text/plain" });
    await waitFor(() =>
      expect(screen.getByText(/Format non pris en charge/)).toBeTruthy(),
    );
    expect(screen.queryByAltText("Aperçu de la photo de l'article")).toBeNull();

    // Fichier de plus de 5 Mo
    await addPurchaseWithPhoto("Grosse image", "10", {
      name: "photo.jpg",
      type: "image/jpeg",
      sizeBytes: 6 * 1024 * 1024,
    });
    await waitFor(() =>
      expect(screen.getByText(/trop volumineuse/)).toBeTruthy(),
    );
    expect(screen.queryByAltText("Aperçu de la photo de l'article")).toBeNull();
  });

  it("permet de retirer la photo sélectionnée avant validation", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Pain", "2");

    await waitFor(() =>
      expect(screen.getByAltText("Aperçu de la photo de l'article")).toBeTruthy(),
    );

    fireEvent.click(screen.getByLabelText("Supprimer la photo"));

    // Retour au bouton d'ajout, pas d'aperçu
    expect(screen.queryByAltText("Aperçu de la photo de l'article")).toBeNull();
    expect(screen.getByText("Ajouter une photo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());
    // Achat enregistré sans photo
    expect(screen.queryByAltText("Photo de Pain")).toBeNull();
  });

  it("remplace la photo d'un achat existant", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Café", "45");
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());

    // Modification
    fireEvent.click(screen.getAllByRole("button", { name: "Achats" })[0]);
    await waitFor(() => expect(screen.getAllByText("Café").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText("Modifier Café")[0]);

    await waitFor(() => expect(screen.getByText("Modifier l'achat")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Remplacer la photo"));
    selectPhotoFile("cafe-nouveau.png", "image/png");

    await waitFor(() => expect(screen.getByText("Nouvelle photo")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() => expect(screen.getByText(/et sa photo ont été enregistrés/)).toBeTruthy());
    // La photo est toujours associée à l'achat
    await waitFor(() => expect(screen.getAllByAltText("Photo de Café").length).toBeGreaterThan(0));
  });

  it("supprime uniquement la photo, sans supprimer l'achat", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Thé", "20");
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());
    await waitFor(() => expect(screen.getByAltText("Photo de Thé")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Achats" })[0]);
    await waitFor(() => expect(screen.getAllByText("Thé").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText("Modifier Thé")[0]);
    await waitFor(() => expect(screen.getByText("Modifier l'achat")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Supprimer la photo"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() => expect(screen.getByText(/photo supprimée/)).toBeTruthy());
    // L'achat existe toujours, sans photo
    expect(screen.getAllByText("Thé").length).toBeGreaterThan(0);
    expect(screen.queryByAltText("Photo de Thé")).toBeNull();
  });

  it("conserve la photo après reconnexion (persistance)", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Lait", "7");
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByAltText("Photo de Lait")).toBeTruthy());

    // Déconnexion / reconnexion
    fireEvent.click(screen.getByLabelText("Se déconnecter"));
    await waitFor(() => expect(screen.getByText("Connexion")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Coloc-T9DYA-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(screen.getByAltText("Photo de Lait")).toBeTruthy());
  });
});

async function addSimplePurchase(itemName: string, price: string) {
  fireEvent.click(screen.getAllByText("Ajouter un achat")[0]);
  await waitFor(() => expect(screen.getByText("Nouvel achat")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Nom de l'article"), {
    target: { value: itemName },
  });
  fireEvent.change(screen.getByLabelText("Prix (DH)"), {
    target: { value: price },
  });
  fireEvent.change(screen.getByLabelText("Achat effectué par"), {
    target: { value: getRachidId() },
  });
  fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
  await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());
}

async function goToAudit() {
  fireEvent.click(screen.getAllByRole("button", { name: "Audit" })[0]);
  await waitFor(() => expect(screen.getByText(/Journal horodaté/)).toBeTruthy());
}

describe("Module Audit", () => {
  it("affiche un état vide lorsque aucune opération n'a été réalisée", async () => {
    await loginFirstTime();
    await goToAudit();
    expect(screen.getByText("Aucun événement enregistré")).toBeTruthy();
  });

  it("journalise l'ajout, la modification et la suppression d'un achat", async () => {
    await loginFirstTime();

    // Ajout
    await addSimplePurchase("Eau", "6");

    // Modification du prix
    fireEvent.click(screen.getAllByRole("button", { name: "Achats" })[0]);
    await waitFor(() => expect(screen.getAllByText("Eau").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText("Modifier Eau")[0]);
    await waitFor(() => expect(screen.getByText("Modifier l'achat")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Prix (DH)"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(screen.getByText(/a été modifié avec succès/)).toBeTruthy());

    // Suppression
    fireEvent.click(screen.getAllByLabelText("Supprimer Eau")[0]);
    await waitFor(() => expect(screen.getByText("Supprimer cet achat ?")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(screen.getByText("Aucun achat pour le moment.")).toBeTruthy());

    // Journal d'audit
    await goToAudit();
    await waitFor(() =>
      expect(screen.getAllByText(/a ajouté l'achat « Eau » \(6 DH\)/).length).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByText(/a modifié l'achat « Eau » : prix unitaire : 6 DH → 9 DH/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/a supprimé l'achat « Eau » \(9 DH\)/).length).toBeGreaterThan(0);
    // L'auteur est bien renseigné (e-mail du compte partagé)
    expect(screen.getAllByText("admin-2026@gmail.com").length).toBeGreaterThan(0);
  });

  it("journalise l'ajout d'une photo", async () => {
    await loginFirstTime();
    await addPurchaseWithPhoto("Café", "45");
    fireEvent.click(screen.getByRole("button", { name: "+ Enregistrer l'achat" }));
    await waitFor(() => expect(screen.getByText("Total des dépenses")).toBeTruthy());

    await goToAudit();
    await waitFor(() =>
      expect(screen.getAllByText(/a ajouté une photo à l'achat « Café »/).length).toBeGreaterThan(0),
    );
  });

  it("filtre par type d'action et recherche par élément", async () => {
    await loginFirstTime();
    await addSimplePurchase("Pain", "2");
    await addSimplePurchase("Lait", "7");
    await goToAudit();

    // Filtre : suppressions uniquement (aucune pour le moment)
    fireEvent.change(screen.getByLabelText("Filtrer par type d'action"), {
      target: { value: "DELETE" },
    });
    await waitFor(() => expect(screen.getByText("Aucun résultat")).toBeTruthy());

    // Filtre : ajouts
    fireEvent.change(screen.getByLabelText("Filtrer par type d'action"), {
      target: { value: "CREATE" },
    });
    await waitFor(() => expect(screen.getAllByText(/a ajouté l'achat/).length).toBeGreaterThan(0));

    // Recherche par élément
    fireEvent.change(screen.getByLabelText("Rechercher dans le journal"), {
      target: { value: "Lait" },
    });
    await waitFor(() => expect(screen.getAllByText(/a ajouté l'achat « Lait »/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/a ajouté l'achat « Pain »/)).toBeNull();

    // Recherche par utilisateur
    fireEvent.change(screen.getByLabelText("Rechercher dans le journal"), {
      target: { value: "admin-2026" },
    });
    await waitFor(() => expect(screen.getAllByText(/a ajouté l'achat/).length).toBeGreaterThan(0));
  });

  it("affiche le détail d'un événement avec les anciennes et nouvelles valeurs", async () => {
    await loginFirstTime();
    await addSimplePurchase("Thé", "20");
    await goToAudit();

    // Ouverture du détail
    fireEvent.click(screen.getAllByText(/a ajouté l'achat « Thé »/)[0]);
    await waitFor(() => expect(screen.getByText("Détail de l'opération")).toBeTruthy());

    // Les valeurs journalisées sont affichées
    expect(screen.getByText("Prix unitaire")).toBeTruthy();
    expect(screen.getByText("Quantité")).toBeTruthy();
    expect(screen.getByText("Article")).toBeTruthy();
    expect(screen.getByText("20 DH")).toBeTruthy();
  });

  it("supprime l'historique après confirmation, y compris les événements filtrés, sans supprimer les achats", async () => {
    await loginFirstTime();
    await addSimplePurchase("Pain", "2");
    await addSimplePurchase("Lait", "7");
    await goToAudit();
    fireEvent.change(screen.getByLabelText("Filtrer par type d'action"), { target: { value: "DELETE" } });
    await waitFor(() => expect(screen.getByText("Aucun résultat")).toBeTruthy());
    const clearButton = screen.getByRole("button", { name: "Supprimer l'historique" });
    await waitFor(() => expect((clearButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(clearButton);
    await waitFor(() => expect(screen.getByText("2 événements à supprimer.")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Supprimer définitivement" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Saisissez SUPPRIMER/), { target: { value: "supprimer" } });
    expect((screen.getByRole("button", { name: "Supprimer définitivement" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(JSON.parse(localStorage.getItem("t9dya.audit.v1") ?? "[]")).toHaveLength(2);
    fireEvent.click(clearButton);
    await waitFor(() => expect(screen.getByText("2 événements à supprimer.")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Saisissez SUPPRIMER/), { target: { value: "SUPPRIMER" } });
    fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
    await waitFor(() => expect(screen.getByText("Aucun événement enregistré")).toBeTruthy());
    expect((screen.getByLabelText("Filtrer par type d'action") as HTMLSelectElement).value).toBe("all");
    expect(JSON.parse(localStorage.getItem("t9dya.audit.v1") ?? "[]")).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("t9dya.purchases.v1") ?? "[]")).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("t9dya.audit-purges.v1") ?? "[]")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Accueil" })[0]);
    await addSimplePurchase("Café", "20");
    await goToAudit();
    await waitFor(() => expect(screen.getAllByText(/a ajouté l'achat « Café »/).length).toBeGreaterThan(0));
  });

  it("ne montre aucun succès et conserve l'historique si la suppression échoue", async () => {
    await loginFirstTime(); await addSimplePurchase("Pain", "2"); await goToAudit();
    const button = screen.getByRole("button", { name: "Supprimer l'historique" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("1 événement à supprimer.")).toBeTruthy());
    const { localDataService } = await import("@/services/localData");
    const failure = vi.spyOn(localDataService, "clearAuditHistory").mockRejectedValueOnce(new Error("Failed to fetch"));
    try {
      fireEvent.change(screen.getByLabelText(/Saisissez SUPPRIMER/), { target: { value: "SUPPRIMER" } });
      fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("n'a pas pu être confirmée"));
      expect(JSON.parse(localStorage.getItem("t9dya.audit.v1") ?? "[]")).toHaveLength(1);
      expect(screen.queryByText(/d'audit supprimé/)).toBeNull();
      expect(screen.getByRole("dialog")).toBeTruthy();
    } finally { failure.mockRestore(); }
  });
});


