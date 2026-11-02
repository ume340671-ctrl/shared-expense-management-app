import { useMemo, useState } from "react";
import { Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { Housemate, PurchaseFilters, PurchaseWithBuyer } from "@/types";
import { applyFilters, activeFilterCount } from "@/lib/filters";
import { availableMonths, purchaseTotal, sumPurchases } from "@/lib/stats";
import {
  formatLongDate,
  formatMoney,
  formatMonthKey,
  formatNumber,
} from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { PhotoThumb } from "@/components/PhotoThumb";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { usePhotoUrls } from "@/hooks/usePhotoUrls";
import { PurchaseRowSkeleton } from "@/components/Skeleton";

const selectClass =
  "h-11 appearance-none rounded-xl border border-line bg-surface bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-9 pl-3.5 text-[13.5px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const SORT_LABELS: Record<PurchaseFilters["sort"], string> = {
  date_desc: "Date (récentes)",
  date_asc: "Date (anciennes)",
  amount_desc: "Montant (décroissant)",
  amount_asc: "Montant (croissant)",
};

/** Page Achats — historique complet avec recherche, filtres et tri */
export function PurchasesPage({
  purchases,
  housemates,
  loading,
  onEdit,
  onDelete,
  onAddPurchase,
}: {
  purchases: PurchaseWithBuyer[];
  housemates: Housemate[];
  loading: boolean;
  onEdit: (purchase: PurchaseWithBuyer) => void;
  onDelete: (purchase: PurchaseWithBuyer) => void;
  onAddPurchase: () => void;
}) {
  const [filters, setFilters] = useState<PurchaseFilters>({
    search: "",
    buyerId: "all",
    month: "all",
    sort: "date_desc",
  });
  const [lightboxPurchase, setLightboxPurchase] = useState<PurchaseWithBuyer | null>(null);
  const photoUrls = usePhotoUrls(purchases);

  const months = useMemo(() => availableMonths(purchases), [purchases]);
  const filtered = useMemo(() => applyFilters(purchases, filters), [purchases, filters]);
  const filteredTotal = useMemo(() => sumPurchases(filtered), [filtered]);
  const activeCount = activeFilterCount(filters);

  const updateFilter = <K extends keyof PurchaseFilters>(key: K, value: PurchaseFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () =>
    setFilters({ search: "", buyerId: "all", month: "all", sort: "date_desc" });

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-light tracking-tight text-ink sm:text-[32px]">Achats</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Historique complet des achats partagés.
          </p>
        </div>
        <Button onClick={onAddPurchase} className="hidden sm:inline-flex">
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Ajouter un achat
        </Button>
      </header>

      {/* Barre de filtres */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Rechercher un article…"
              aria-label="Rechercher un article"
              className="h-11 w-full rounded-xl border border-line bg-bg-elevated pl-10 pr-4 text-[14px] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex">
            <select
              value={filters.buyerId}
              onChange={(e) => updateFilter("buyerId", e.target.value)}
              aria-label="Filtrer par personne"
              className={selectClass}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              }}
            >
              <option value="all">Toutes les personnes</option>
              {housemates.map((housemate) => (
                <option key={housemate.id} value={housemate.id}>
                  {housemate.full_name}
                </option>
              ))}
            </select>
            <select
              value={filters.month}
              onChange={(e) => updateFilter("month", e.target.value)}
              aria-label="Filtrer par mois"
              className={selectClass}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              }}
            >
              <option value="all">Tous les mois</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(month)}
                </option>
              ))}
            </select>
            <select
              value={filters.sort}
              onChange={(e) => updateFilter("sort", e.target.value as PurchaseFilters["sort"])}
              aria-label="Trier"
              className={selectClass}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              }}
            >
              {(Object.keys(SORT_LABELS) as PurchaseFilters["sort"][]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Résumé */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
          <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {formatNumber(filtered.length)} résultat{filtered.length > 1 ? "s" : ""}
            {activeCount > 0 && ` · filtré${activeCount > 1 ? "s" : ""}`} · Total{" "}
            <span className="font-semibold text-ink">{formatMoney(filteredTotal)}</span>
          </p>
          {activeCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="space-y-3">
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
        </div>
      ) : purchases.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-6 w-6" strokeWidth={1.6} />}
          title="Aucun achat pour le moment."
          message="Ajoutez votre premier achat pour commencer. Il apparaîtra ici immédiatement."
          action={
            <Button onClick={onAddPurchase} size="lg">
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Ajouter un achat
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" strokeWidth={1.6} />}
          title="Aucun résultat"
          message="Aucun achat ne correspond à votre recherche ou à vos filtres."
          action={
            <Button variant="outline" onClick={resetFilters}>
              Réinitialiser les filtres
            </Button>
          }
        />
      ) : (
        <>
          {/* Tableau — ordinateur */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">
                  <th className="px-5 py-3.5 font-medium">Article</th>
                  <th className="px-5 py-3.5 text-right font-medium">Montant total</th>
                  <th className="px-5 py-3.5 font-medium">Prix unit. × Qté</th>
                  <th className="px-5 py-3.5 font-medium">Acheté par</th>
                  <th className="px-5 py-3.5 font-medium">Date</th>
                  <th className="px-5 py-3.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <PhotoThumb
                          url={purchase.photo_path ? photoUrls[purchase.photo_path] : undefined}
                          loading={Boolean(purchase.photo_path) && !photoUrls[purchase.photo_path ?? ""]}
                          alt={purchase.item_name}
                          onOpen={() => setLightboxPurchase(purchase)}
                        />
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-ink">{purchase.item_name}</p>
                          {purchase.notes && (
                            <p className="mt-0.5 max-w-xs truncate text-[12px] text-ink-muted">
                              {purchase.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-[14.5px] font-semibold text-ink">
                      {formatMoney(purchaseTotal(purchase))}
                    </td>
                    <td className="px-5 py-4 text-[13px] text-ink-secondary">
                      {formatMoney(purchase.unit_price)} × {purchase.quantity}
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={purchase.buyer_name} size="sm" />
                        <span className="text-[13px] text-ink">{purchase.buyer_name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-ink-secondary">
                      {formatLongDate(purchase.purchase_date)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(purchase)}
                          aria-label={`Modifier ${purchase.item_name}`}
                          className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onDelete(purchase)}
                          aria-label={`Supprimer ${purchase.item_name}`}
                          className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes — mobile et tablette */}
          <ul className="stagger space-y-2.5 lg:hidden">
            {filtered.map((purchase) => (
              <li
                key={purchase.id}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start gap-3.5">
                  <PhotoThumb
                    url={purchase.photo_path ? photoUrls[purchase.photo_path] : undefined}
                    loading={Boolean(purchase.photo_path) && !photoUrls[purchase.photo_path ?? ""]}
                    alt={purchase.item_name}
                    onOpen={() => setLightboxPurchase(purchase)}
                  />
                  <Avatar name={purchase.buyer_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {purchase.item_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                      {purchase.buyer_name}
                    </p>
                  </div>
                  <p className="shrink-0 text-[16px] font-semibold text-ink">
                    {formatMoney(purchaseTotal(purchase))}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
                  <p className="text-[12px] text-ink-muted">
                    {formatMoney(purchase.unit_price)} × {purchase.quantity} ·{" "}
                    {formatLongDate(purchase.purchase_date)}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(purchase)}
                      aria-label={`Modifier ${purchase.item_name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors active:bg-surface-2 active:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(purchase)}
                      aria-label={`Supprimer ${purchase.item_name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-colors active:bg-danger-soft active:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {purchase.notes && (
                  <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-secondary">
                    {purchase.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <PhotoLightbox
        url={
          lightboxPurchase?.photo_path
            ? photoUrls[lightboxPurchase.photo_path] ?? null
            : null
        }
        caption={
          lightboxPurchase
            ? `${lightboxPurchase.item_name} — ${formatMoney(purchaseTotal(lightboxPurchase))}`
            : ""
        }
        onClose={() => setLightboxPurchase(null)}
      />
    </div>
  );
}
