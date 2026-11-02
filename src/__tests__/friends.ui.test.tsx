// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PGlite } from "@electric-sql/pglite";
import type { FriendsAction, FriendsSnapshot } from "@/types/friends";
import { createFriendsTestDatabase, friendsTestQuery } from "@/test/friendsDatabase";

const service = vi.hoisted(() => ({ load: vi.fn(), mutate: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/services/friendsService", () => ({ friendsService: service }));
import { FriendsPage } from "@/pages/FriendsPage";
import { ToastProvider } from "@/hooks/useToast";

let db: PGlite;
beforeAll(async () => { db = await createFriendsTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("truncate public.friend_expenses, public.friend_settlements, public.friend_periods, public.friend_members cascade; truncate public.audit_logs; insert into public.friend_periods(number) values (1);");
  service.load.mockReset(); service.mutate.mockReset(); service.subscribe.mockReset();
  service.load.mockImplementation(async (periodId: string | null) => {
    const result = await friendsTestQuery<{ data: FriendsSnapshot }>(db, "select public.friends_snapshot($1::uuid) as data", [periodId]);
    return result.rows[0].data;
  });
  service.mutate.mockImplementation(async (periodId: string, action: FriendsAction, payload: Record<string, unknown>) => {
    const result = await friendsTestQuery<{ id: string }>(db, "select public.friends_mutate($1::uuid,$2,$3::jsonb) as id", [periodId, action, JSON.stringify(payload)]);
    return result.rows[0].id;
  });
  service.subscribe.mockImplementation(() => () => {});
});
afterEach(() => cleanup());

function mount() { return render(<ToastProvider><FriendsPage /></ToastProvider>); }
async function waitLoaded() { await waitFor(() => expect(screen.getByRole("button", { name: "Réinitialiser les dépenses" })).toBeTruthy()); }

async function addFriends() {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un ami" }));
  for (const name of ["Alice", "Bob"]) {
    fireEvent.change(screen.getByLabelText("Nom du participant"), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByText(name)).toBeTruthy());
    await waitFor(() => expect((screen.getByLabelText("Nom du participant") as HTMLInputElement).value).toBe(""));
  }
  fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
}

async function addExpense() {
  fireEvent.click(screen.getByRole("button", { name: "Nouvelle dépense" }));
  fireEvent.change(screen.getByLabelText("Nom de la dépense"), { target: { value: "Restaurant" } });
  fireEvent.change(screen.getByLabelText("Montant total (DH)"), { target: { value: "100" } });
  const payer = screen.getByLabelText("Payé par") as HTMLSelectElement;
  const alice = [...payer.options].find((o) => o.text === "Alice")!;
  fireEvent.change(payer, { target: { value: alice.value } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer la dépense" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Restaurant")).toBeTruthy();
}

describe("Friends UI backed by real local PostgreSQL", () => {
  it("adds participants and an expense, then blocks reset until reimbursement", async () => {
    mount(); await waitLoaded(); await addFriends(); await addExpense();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les dépenses" }));
    expect(screen.getByText("Des remboursements restent à effectuer")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Archiver et recommencer" }) as HTMLButtonElement).disabled).toBe(true);
    expect(service.mutate.mock.calls.filter((call) => call[1] === "period.reset")).toHaveLength(0);
  });

  it("records an actual reimbursement, archives on confirmation, and displays immutable history", async () => {
    mount(); await waitLoaded(); await addFriends(); await addExpense();
    fireEvent.click(screen.getByRole("tab", { name: "Soldes & remboursements" }));
    fireEvent.click(screen.getByRole("button", { name: "Noter le remboursement" }));
    const dialog = within(screen.getByRole("dialog"));
    expect((dialog.getByLabelText("Montant remboursé (DH)") as HTMLInputElement).value).toBe("50.00");
    expect((dialog.getByRole("button", { name: "Enregistrer le remboursement" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialog.getByRole("checkbox"));
    fireEvent.click(dialog.getByRole("button", { name: "Enregistrer le remboursement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les dépenses" }));
    expect(screen.getByText("Tous les soldes sont à zéro.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Archiver et recommencer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Archiver et recommencer" }));
    await waitFor(() => expect(screen.getByText("Total de la période 2")).toBeTruthy());
    expect(screen.queryByText("Restaurant")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Historique" }));
    fireEvent.click(screen.getByRole("button", { name: /Période 1/ }));
    await waitFor(() => expect(screen.getByText("Restaurant")).toBeTruthy());
    expect(screen.getByText(/Consultation uniquement/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Réinitialiser les dépenses" })).toBeNull();
    expect(screen.queryByLabelText("Modifier la dépense Restaurant")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Soldes & remboursements" }));
    expect(screen.getByText(/a remboursé/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la période actuelle" }));
    await waitFor(() => expect(screen.getByText("Total de la période 2")).toBeTruthy());
  });

  it("persists expenses on remount and edits them with an optimistic version", async () => {
    const view = mount(); await waitLoaded(); await addFriends(); await addExpense(); view.unmount();
    mount(); await waitFor(() => expect(screen.getByText("Restaurant")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Modifier la dépense Restaurant"));
    fireEvent.change(screen.getByLabelText("Montant total (DH)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect([...service.mutate.mock.calls].reverse().find((call) => call[1] === "expense.save")?.[2].expected_updated_at).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Supprimer la dépense Restaurant"));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("Restaurant")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Supprimer la dépense Restaurant"));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer la dépense" }));
    await waitFor(() => expect(screen.queryByText("Restaurant")).toBeNull());
  });

  it("preserves the form on failed save and displays a clear migration error", async () => {
    const view = mount(); await waitLoaded(); await addFriends();
    service.mutate.mockRejectedValueOnce(new Error("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle dépense" }));
    fireEvent.change(screen.getByLabelText("Nom de la dépense"), { target: { value: "Taxi" } });
    fireEvent.change(screen.getByLabelText("Montant total (DH)"), { target: { value: "40" } });
    const payer = screen.getByLabelText("Payé par") as HTMLSelectElement;
    fireEvent.change(payer, { target: { value: payer.options[1].value } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la dépense" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Vos saisies sont conservées"));
    expect((screen.getByLabelText("Nom de la dépense") as HTMLInputElement).value).toBe("Taxi");
    view.unmount(); service.load.mockRejectedValue(new Error("PGRST202 schema cache")); mount();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("20260601000000_friends_expenses.sql"));
  });

  it("shows the empty reset state and requires no unnecessary new period", async () => {
    mount(); await waitLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les dépenses" }));
    expect(screen.getByText(/La période est déjà vide/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Archiver et recommencer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the server blocks a reset if another device adds a debt after confirmation opens", async () => {
    mount(); await waitLoaded(); await addFriends(); await addExpense();
    fireEvent.click(screen.getByRole("tab", { name: "Soldes & remboursements" }));
    fireEvent.click(screen.getByRole("button", { name: "Noter le remboursement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le remboursement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les dépenses" }));
    expect(screen.getByText("Tous les soldes sont à zéro.")).toBeTruthy();

    const current = await service.load(null) as FriendsSnapshot;
    await service.mutate(current.period.id, "expense.save", {
      id: "90000000-0000-4000-8000-000000000001", description: "Autre appareil (test)",
      amount_cents: 2000, payer_id: current.members[0].id, participant_ids: current.members.map((m) => m.id),
      incurred_on: "2026-01-01", notes: null, expected_updated_at: null,
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Archiver et recommencer" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("remboursements restent"));
    expect((await service.load(null) as FriendsSnapshot).period.id).toBe(current.period.id);
  });
});