import { useState } from "react";
import { ArrowRight, CalendarDays, Plus, Receipt, ShoppingBag, Wallet } from "lucide-react";
import type { Housemate, PurchaseWithBuyer } from "@/types";
import { computeStats } from "@/lib/stats";
import {
  formatLongDate,
  formatMoney,
  formatMonthKey,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { purchaseTotal } from "@/lib/stats";
import { Avatar } from "@/components/Avatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { PhotoThumb } from "@/components/PhotoThumb";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { PurchaseRowSkeleton, Skeleton, StatCardSkeleton } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { usePhotoUrls } from "@/hooks/usePhotoUrls";
import type { View } from "@/components/AppShell";

/** Page d'accueil — tableau de bord premium */
export function DashboardPage({
  purchases,
  housemates,
  loading,
  onNavigate,
  onAddPurchase,
}: {
  purchases: PurchaseWithBuyer[];
  housemates: Housemate[];
  loading: boolean;
  onNavigate: (view: View) => void;
  onAddPurchase: () => void;
}) {
  const stats = computeStats(purchases, housemates);
  const recent = [...purchases]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const monthKey = new Date().toISOString().slice(0, 7);
  const photoUrls = usePhotoUrls(purchases);
  const [lightboxPurchase, setLightboxPurchase] = useState<PurchaseWithBuyer | null>(null);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-52 rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="space-y-3">
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-light tracking-tight text-ink sm:text-[32px]">
            Bonjour <span className="text-accent-text">👋</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Voici l'activité des achats partagés en un coup d'œil.
          </p>
        </div>
        <Button onClick={onAddPurchase} className="hidden sm:inline-flex">
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Ajouter un achat
        </Button>
      </header>

      {purchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" strokeWidth={1.6} />}
          title="Aucun achat pour le moment."
          message="Ajoutez votre premier achat pour commencer. Il sera visible immédiatement par tous les colocataires."
          action={
            <Button onClick={onAddPurchase} size="lg">
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Ajouter un achat
            </Button>
          }
        />
      ) : (
        <>
          {/* Carte principale — total des dépenses */}
          <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-[0.09] blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
            />
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-ink-muted">
              Total des dépenses
            </p>
            <p className="mt-4 text-[44px] font-extralight leading-none tracking-tight text-accent-text sm:text-6xl">
              {formatMoney(stats.totalSpent)}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-secondary">
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-ink-muted" />
                {formatNumber(stats.purchaseCount)} achat{stats.purchaseCount > 1 ? "s" : ""} enregistré
                {stats.purchaseCount > 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-ink-muted" />
                {formatMoney(stats.currentMonthSpent)} ce mois
              </span>
            </div>
          </section>

          {/* Statistiques secondaires */}
          <section className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Achats au total"
              value={formatNumber(stats.purchaseCount)}
              hint="Nombre d'achats enregistrés"
              icon={<ShoppingBag className="h-4 w-4" />}
            />
            <StatCard
              label={`Dépenses — ${formatMonthKey(monthKey)}`}
              value={formatMoney(stats.currentMonthSpent)}
              hint="Mois en cours"
              icon={<CalendarDays className="h-4 w-4" />}
            />
            <StatCard
              label="Dernier achat"
              value={
                stats.lastPurchase ? formatMoney(purchaseTotal(stats.lastPurchase)) : "—"
              }
              hint={
                stats.lastPurchase
                  ? `${stats.lastPurchase.item_name} · ${stats.lastPurchase.buyer_name} · ${formatLongDate(stats.lastPurchase.purchase_date)}`
                  : "Aucun achat enregistré"
              }
              icon={<Receipt className="h-4 w-4" />}
            />
          </section>

          {/* Payé par colocataire */}
          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Total payé par colocataire
            </h2>
            <div className="mt-5 space-y-4">
              {stats.perPerson.map((person) => (
                <div key={person.housemate.id} className="flex items-center gap-3.5">
                  <Avatar name={person.housemate.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13.5px] text-ink">
                        {person.housemate.full_name}
                      </p>
                      <p className="shrink-0 text-[13.5px] font-semibold text-ink">
                        {formatMoney(person.totalPaid)}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max(person.percentage, person.totalPaid > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">
                    {formatPercent(person.percentage)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Derniers achats */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-muted">
                Derniers achats
              </h2>
              <button
                onClick={() => onNavigate("purchases")}
                className="flex items-center gap-1.5 text-[13px] font-medium text-accent-text transition-opacity hover:opacity-80"
              >
                Voir tout
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="stagger space-y-2.5">
              {recent.map((purchase) => (
                <li
                  key={purchase.id}
                  className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                >
                  <PhotoThumb
                    size="sm"
                    url={purchase.photo_path ? photoUrls[purchase.photo_path] : undefined}
                    loading={Boolean(purchase.photo_path) && !photoUrls[purchase.photo_path ?? ""]}
                    alt={purchase.item_name}
                    onOpen={() => setLightboxPurchase(purchase)}
                  />
                  <Avatar name={purchase.buyer_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium text-ink">
                      {purchase.item_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
                      {purchase.buyer_name} · {formatLongDate(purchase.purchase_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-semibold text-ink">
                      {formatMoney(purchaseTotal(purchase))}
                    </p>
                    {purchase.quantity > 1 && (
                      <p className="text-[11.5px] text-ink-muted">
                        {formatMoney(purchase.unit_price)} × {purchase.quantity}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

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
        </>
      )}
    </div>
  );
}
