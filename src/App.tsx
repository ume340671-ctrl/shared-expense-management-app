import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { PurchaseWithBuyer } from "@/types";
import { purchaseTotal } from "@/lib/stats";
import { formatMoney } from "@/lib/format";
import { describeDataError } from "@/lib/errors";
import { useAuth } from "@/hooks/useAuth";
import { usePurchases } from "@/hooks/usePurchases";
import { useTheme } from "@/hooks/useTheme";
import { useToast, ToastProvider } from "@/hooks/useToast";
import { deletePurchasePhoto, uploadPurchasePhoto } from "@/lib/photoStorage";
import { AppShell, type View } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Logo } from "@/components/Logo";
import { PurchaseFormModal, type PurchaseFormSubmit } from "@/components/PurchaseFormModal";
import { ToastContainer } from "@/components/ToastContainer";
import { AuditPage } from "@/pages/AuditPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { PeoplePage } from "@/pages/PeoplePage";
import { PurchasesPage } from "@/pages/PurchasesPage";
import { FriendsPage } from "@/pages/FriendsPage";

export default function App() {
  return (
    <ToastProvider>
      <ToastContainer />
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const { status, email, signOut } = useAuth();
  const authenticated = status === "authenticated";

  const {
    housemates,
    purchases,
    loading,
    error,
    refresh,
    createPurchase,
    updatePurchase,
    deletePurchase,
    setPurchasePhoto,
  } = usePurchases(authenticated);

  const { showToast } = useToast();

  const [view, setView] = useState<View>("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseWithBuyer | null>(null);
  const [deleting, setDeleting] = useState<PurchaseWithBuyer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Retour en haut de page à chaque changement de section
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  const describedError = error ? describeDataError(error) : null;

  const openAddForm = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEditForm = useCallback((purchase: PurchaseWithBuyer) => {
    setEditing(purchase);
    setFormOpen(true);
  }, []);

  const handleSubmitPurchase = useCallback(
    async ({ input, photo, removePhoto }: PurchaseFormSubmit) => {
      if (editing) {
        // 1. Mise à jour des informations de l'achat
        await updatePurchase(editing.id, input);

        // 2. Gestion de la photo (remplacement ou suppression)
        const oldPath = editing.photo_path;
        let newPath: string | null = oldPath;
        if (photo) {
          newPath = await uploadPurchasePhoto(editing.id, photo);
        } else if (removePhoto && oldPath) {
          newPath = null;
        }

        if (newPath !== oldPath) {
          await setPurchasePhoto(editing.id, newPath);
          if (oldPath) {
            // L'ancien fichier devient obsolète : on le supprime du stockage
            try {
              await deletePurchasePhoto(oldPath);
            } catch {
              /* suppression best-effort : ne bloque pas la modification */
            }
          }
        }

        if (photo) {
          showToast(`« ${input.item_name} » et sa photo ont été enregistrés.`);
        } else if (removePhoto && oldPath) {
          showToast(`« ${input.item_name} » a été modifié — photo supprimée.`);
        } else {
          showToast(`« ${input.item_name} » a été modifié avec succès.`);
        }
      } else {
        // 3. Création de l'achat, puis envoi éventuel de la photo
        const created = await createPurchase(input);
        if (photo) {
          try {
            const photoPath = await uploadPurchasePhoto(created.id, photo);
            await setPurchasePhoto(created.id, photoPath);
            showToast(
              `« ${input.item_name} » enregistré avec sa photo — ${formatMoney(purchaseTotal(input))}`,
            );
          } catch (photoError) {
            // L'achat est bien enregistré : seule la photo a échoué
            showToast(
              photoError instanceof Error
                ? `L'achat « ${input.item_name} » est enregistré, mais la photo n'a pas pu être envoyée : ${photoError.message}`
                : `L'achat « ${input.item_name} » est enregistré, mais la photo n'a pas pu être envoyée.`,
              "error",
            );
          }
        } else {
          showToast(`« ${input.item_name} » enregistré — ${formatMoney(purchaseTotal(input))}`);
        }
      }
    },
    [editing, updatePurchase, createPurchase, setPurchasePhoto, showToast],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deletePurchase(deleting.id);
      // La photo associée est également supprimée du stockage
      if (deleting.photo_path) {
        try {
          await deletePurchasePhoto(deleting.photo_path);
        } catch {
          /* best-effort : la cohérence reste assurée côté base */
        }
      }
      showToast(
        deleting.photo_path
          ? `« ${deleting.item_name} » et sa photo ont été supprimés.`
          : `« ${deleting.item_name} » a été supprimé.`,
      );
      setDeleting(null);
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error
          ? deleteError.message
          : "La suppression a échoué. Veuillez réessayer.",
        "error",
      );
    } finally {
      setDeleteLoading(false);
    }
  }, [deleting, deletePurchase, showToast]);

  /* --- Écran de chargement initial --- */
  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
        <Logo />
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line"
          style={{ borderTopColor: "var(--accent)" }}
          role="status"
          aria-label="Chargement"
        />
      </div>
    );
  }

  /* --- Page de connexion --- */
  if (!authenticated) {
    return <LoginPage />;
  }

  /* --- Application --- */
  return (
    <AppShell
      view={view}
      onNavigate={setView}
      email={email}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSignOut={() => void signOut()}
      onAddPurchase={openAddForm}
    >
      {/* Bannière d'erreur réseau / base de données */}
      {error && describedError && view !== "friends" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3.5">
          <div>
            <p className="flex items-center gap-2.5 text-[13px] font-medium leading-snug text-ink">
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
              {describedError.message}
            </p>
            {describedError.hint && (
              <p className="mt-1 pl-[26px] text-[12.5px] leading-relaxed text-ink-secondary">
                {describedError.hint}
              </p>
            )}
          </div>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-surface-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Réessayer
          </button>
        </div>
      )}

      {view === "dashboard" && (
        <DashboardPage
          purchases={purchases}
          housemates={housemates}
          loading={loading}
          onNavigate={setView}
          onAddPurchase={openAddForm}
        />
      )}
      {view === "purchases" && (
        <PurchasesPage
          purchases={purchases}
          housemates={housemates}
          loading={loading}
          onEdit={openEditForm}
          onDelete={setDeleting}
          onAddPurchase={openAddForm}
        />
      )}
      {view === "people" && (
        <PeoplePage purchases={purchases} housemates={housemates} loading={loading} />
      )}
      {view === "audit" && <AuditPage />}
      {view === "friends" && <FriendsPage />}

      <PurchaseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        housemates={housemates}
        editingPurchase={editing}
        onSubmit={handleSubmitPurchase}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Supprimer cet achat ?"
        message={
          deleting
            ? `« ${deleting.item_name} » (${formatMoney(purchaseTotal(deleting))}) sera définitivement supprimé de l'historique. Cette action est irréversible.`
            : ""
        }
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleting(null)}
        loading={deleteLoading}
      />
    </AppShell>
  );
}
