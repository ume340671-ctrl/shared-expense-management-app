import { useMemo, useState } from "react";
import { Info, Receipt } from "lucide-react";
import type { Housemate, PurchaseWithBuyer } from "@/types";
import { availableMonths, computeStats } from "@/lib/stats";
import { formatMoney, formatMonthKey, formatNumber, formatPercent } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";

const selectClass =
  "h-11 appearance-none rounded-xl border border-line bg-surface bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-9 pl-3.5 text-[13.5px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const chevronStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

/** Page Dépenses par personne — qui a payé quoi (sans calcul de dettes) */
export function PeoplePage({
  purchases,
  housemates,
  loading,
}: {
  purchases: PurchaseWithBuyer[];
  housemates: Housemate[];
  loading: boolean;
}) {
  const [month, setMonth] = useState<string>("all");
  const months = useMemo(() => availableMonths(purchases), [purchases]);

  const filtered = useMemo(
    () => (month === "all" ? purchases : purchases.filter((p) => p.purchase_date.slice(0, 7) === month)),
    [purchases, month],
  );

  const stats = useMemo(() => computeStats(filtered, housemates), [filtered, housemates]);
  const ranked = useMemo(
    () => [...stats.perPerson].sort((a, b) => b.totalPaid - a.totalPaid),
    [stats.perPerson],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête + filtre période */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-light tracking-tight text-ink sm:text-[32px]">
            Dépenses par personne
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Montants réellement payés par chaque colocataire.
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Filtrer par période"
          className={selectClass}
          style={chevronStyle}
        >
          <option value="all">Toute la période</option>
          {months.map((key) => (
            <option key={key} value={key}>
              {formatMonthKey(key)}
            </option>
          ))}
        </select>
      </header>

      {/* Blocs par personne */}
      <div className="grid gap-4 sm:grid-cols-2">
        {ranked.map((person) => (
          <section
            key={person.housemate.id}
            className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong sm:p-6"
          >
            <div className="flex items-center gap-3.5">
              <Avatar name={person.housemate.full_name} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold tracking-wide text-ink">
                  {person.housemate.full_name}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">
                  {formatNumber(person.purchaseCount)} achat{person.purchaseCount > 1 ? "s" : ""}{" "}
                  effectué{person.purchaseCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-ink-muted">
                  Total payé
                </p>
                <p className="mt-1.5 text-[28px] font-light leading-none tracking-tight text-accent-text">
                  {formatMoney(person.totalPaid)}
                </p>
              </div>
              {stats.totalSpent > 0 && (
                <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] font-medium tabular-nums text-ink-secondary">
                  {formatPercent(person.percentage)}
                </span>
              )}
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(person.percentage, person.totalPaid > 0 ? 3 : 0)}%` }}
              />
            </div>
          </section>
        ))}
      </div>

      {/* Récapitulatif + note */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2.5 text-[13px] text-ink-secondary">
            <Receipt className="h-4 w-4 text-ink-muted" />
            Total {month === "all" ? "général" : `de ${formatMonthKey(month)}`}
          </p>
          <p className="text-[17px] font-semibold text-ink">{formatMoney(stats.totalSpent)}</p>
        </div>
        <p className="mt-4 flex items-start gap-2.5 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ces montants indiquent ce que chaque personne a payé pour le groupe. Cette version ne
          calcule pas les dettes ni les remboursements entre colocataires.
        </p>
      </div>
    </div>
  );
}
