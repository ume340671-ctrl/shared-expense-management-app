import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { AuditAction, AuditLog } from "@/types";
import { dataService } from "@/services/dataService";
import { formatAuditTimestamp } from "@/lib/auditFormat";
import { formatMonthKey } from "@/lib/format";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { ActionBadge, AuditDetailModal } from "@/components/AuditDetailModal";
import { EmptyState } from "@/components/EmptyState";
import { PurchaseRowSkeleton } from "@/components/Skeleton";
import { AuditClearDialog } from "@/components/AuditClearDialog";
import { Button } from "@/components/Button";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";

const ACTION_ICONS: Record<AuditAction, typeof Plus> = {
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  UPLOAD: ImagePlus,
};

const ACTION_FILTERS: { value: AuditAction | "all"; label: string }[] = [
  { value: "all", label: "Toutes les actions" },
  { value: "CREATE", label: "Ajouts" },
  { value: "UPDATE", label: "Modifications" },
  { value: "DELETE", label: "Suppressions" },
  { value: "UPLOAD", label: "Photos" },
];

const selectClass =
  "h-11 appearance-none rounded-xl border border-line bg-surface bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-9 pl-3.5 text-[13.5px] text-ink transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const chevronStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

/** Page Audit — journal horodaté de toutes les opérations */
export function AuditPage() {
  const {
    logs,
    total,
    loading,
    error,
    query,
    updateQuery,
    goToPage,
    resetQuery,
    refresh,
    clearHistory,
  } = useAuditLogs();

  const [actors, setActors] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const { showToast } = useToast();

  // Auteurs et mois disponibles (pour les filtres)
  useEffect(() => {
    let active = true;
    Promise.all([dataService.listAuditActors(), dataService.listAuditLogs({
      search: "",
      action: "all",
      actor: "all",
      month: "all",
      page: 1,
      pageSize: 500,
    })]).then(([actorList, allLogs]) => {
      if (!active) return;
      setActors(actorList);
      setHistoryCount(allLogs.total);
      const monthSet = new Set(allLogs.items.map((log) => log.created_at.slice(0, 7)));
      setMonths([...monthSet].sort().reverse());
    }).catch(() => { if (active) setHistoryCount(null); });
    return () => {
      active = false;
    };
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters =
    query.search.trim() !== "" ||
    query.action !== "all" ||
    query.actor !== "all" ||
    query.month !== "all";

  const activeFilterCount = useMemo(
    () =>
      [
        query.search.trim() !== "",
        query.action !== "all",
        query.actor !== "all",
        query.month !== "all",
      ].filter(Boolean).length,
    [query],
  );

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-[26px] font-light tracking-tight text-ink sm:text-[32px]">
          <History className="h-7 w-7 text-accent-text" strokeWidth={1.6} />
          Audit
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Journal horodaté de toutes les opérations : ajouts, modifications, suppressions et
          photos. Les événements sont enregistrés automatiquement par la base de données.
        </p>
        </div>
        <Button variant="outline" className="shrink-0 text-danger" disabled={loading || Boolean(error) || historyCount === null || historyCount === 0} onClick={() => setClearOpen(true)}>
          <Trash2 className="h-4 w-4" />Supprimer l'historique
        </Button>
      </header>

      {/* Filtres */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query.search}
              onChange={(e) => updateQuery({ search: e.target.value })}
              placeholder="Rechercher un utilisateur ou un élément…"
              aria-label="Rechercher dans le journal"
              className="h-11 w-full rounded-xl border border-line bg-bg-elevated pl-10 pr-4 text-[14px] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex">
            <select
              value={query.action}
              onChange={(e) => updateQuery({ action: e.target.value as AuditAction | "all" })}
              aria-label="Filtrer par type d'action"
              className={selectClass}
              style={chevronStyle}
            >
              {ACTION_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <select
              value={query.actor}
              onChange={(e) => updateQuery({ actor: e.target.value })}
              aria-label="Filtrer par utilisateur"
              className={selectClass}
              style={chevronStyle}
            >
              <option value="all">Tous les utilisateurs</option>
              {actors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
            <select
              value={query.month}
              onChange={(e) => updateQuery({ month: e.target.value })}
              aria-label="Filtrer par période"
              className={selectClass}
              style={chevronStyle}
            >
              <option value="all">Toute la période</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(month)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
          <p className="text-[12.5px] text-ink-muted">
            {total} événement{total > 1 ? "s" : ""} enregistré{total > 1 ? "s" : ""}
            {activeFilterCount > 0 && ` · ${activeFilterCount} filtre${activeFilterCount > 1 ? "s" : ""} actif${activeFilterCount > 1 ? "s" : ""}`}
          </p>
          {hasFilters && (
            <button
              onClick={resetQuery}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3.5">
          <p className="text-[13px] text-ink">{error}</p>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-surface-2"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="space-y-3">
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
          <PurchaseRowSkeleton />
        </div>
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" strokeWidth={1.6} />}
          title="Aucun événement enregistré"
          message="Les ajouts, modifications, suppressions et photos apparaîtront ici automatiquement."
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" strokeWidth={1.6} />}
          title="Aucun résultat"
          message="Aucun événement ne correspond à votre recherche ou à vos filtres."
          action={
            <button
              onClick={resetQuery}
              className="rounded-xl border border-line-strong px-4 py-2.5 text-[13px] text-ink transition-colors hover:bg-surface-2"
            >
              Réinitialiser les filtres
            </button>
          }
        />
      ) : (
        <>
          {/* Tableau — ordinateur */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">
                  <th className="px-5 py-3.5 font-medium">Date et heure</th>
                  <th className="px-5 py-3.5 font-medium">Utilisateur</th>
                  <th className="px-5 py-3.5 font-medium">Action</th>
                  <th className="px-5 py-3.5 font-medium">Élément</th>
                  <th className="px-5 py-3.5 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const Icon = ACTION_ICONS[log.action];
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-[12.5px] tabular-nums text-ink-secondary">
                        {formatAuditTimestamp(log.created_at)}
                      </td>
                      <td className="px-5 py-4 text-[13px] text-ink">
                        {log.actor_email ?? "Système"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <ActionBadge action={log.action} />
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-[13px] font-medium text-ink">
                          {log.entity_label ?? "—"}
                        </p>
                        <p className="text-[11.5px] text-ink-muted">{log.entity_type}</p>
                      </td>
                      <td className="max-w-sm px-5 py-4">
                        <p className="truncate text-[13px] text-ink-secondary" title={log.summary}>
                          {log.summary}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes — mobile et tablette */}
          <ul className="stagger space-y-2.5 lg:hidden">
            {logs.map((log) => {
              const Icon = ACTION_ICONS[log.action];
              return (
                <li key={log.id}>
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors active:bg-surface-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">
                          <Icon className="h-4 w-4" />
                        </span>
                        <ActionBadge action={log.action} />
                      </span>
                      <span className="text-[11.5px] tabular-nums text-ink-muted">
                        {formatAuditTimestamp(log.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 text-[14px] font-medium text-ink">
                      {log.entity_label ?? "—"}
                      <span className="ml-2 text-[11.5px] font-normal text-ink-muted">
                        {log.entity_type}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
                      {log.summary}
                    </p>
                    <p className="mt-2 text-[11.5px] text-ink-muted">
                      {log.actor_email ?? "Système"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => goToPage(query.page - 1)}
                disabled={query.page <= 1}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-[13px] text-ink transition-colors",
                  query.page <= 1
                    ? "pointer-events-none opacity-40"
                    : "hover:border-line-strong hover:bg-surface-2",
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <span className="text-[12.5px] tabular-nums text-ink-muted">
                Page {query.page} sur {totalPages}
              </span>
              <button
                onClick={() => goToPage(query.page + 1)}
                disabled={query.page >= totalPages}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-[13px] text-ink transition-colors",
                  query.page >= totalPages
                    ? "pointer-events-none opacity-40"
                    : "hover:border-line-strong hover:bg-surface-2",
                )}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      {clearOpen && <AuditClearDialog onClose={() => setClearOpen(false)} onPrepare={dataService.previewAuditClear} onConfirm={clearHistory}
        onCleared={(count) => {
          setSelectedLog(null);
          setHistoryCount(null);
          showToast(count === 0 ? "Les événements de cette confirmation avaient déjà été supprimés." : `${count} événement${count > 1 ? "s" : ""} d'audit supprimé${count > 1 ? "s" : ""}. Les données de l'application sont conservées.`);
        }} />}
    </div>
  );
}
