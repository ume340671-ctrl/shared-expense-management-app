import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Handshake, History, LockKeyhole, Plus, RefreshCw, RotateCcw, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { FriendExpenseModal } from "@/components/friends/FriendExpenseModal";
import { FriendMembersModal } from "@/components/friends/FriendMembersModal";
import { FriendSettlementModal } from "@/components/friends/FriendSettlementModal";
import { FriendsBalanceList, FriendsExpenseList } from "@/components/friends/FriendsLedger";
import { ResetFriendsPeriodModal } from "@/components/friends/ResetFriendsPeriodModal";
import { useFriends } from "@/hooks/useFriends";
import { useToast } from "@/hooks/useToast";
import { formatLongDate } from "@/lib/format";
import { normalize } from "@/lib/filters";
import { formatCents, friendsError, suggestSettlements } from "@/lib/friends";
import type { FriendExpense, FriendSettlement, SuggestedSettlement } from "@/types/friends";
import { cn } from "@/utils/cn";

type Tab = "expenses" | "balances" | "history";
type Dialog =
  | { kind: "members"; periodId: string }
  | { kind: "expense"; periodId: string; expense: FriendExpense | null }
  | { kind: "settlement"; periodId: string; suggestion: SuggestedSettlement | null }
  | { kind: "reset"; periodId: string }
  | { kind: "deleteExpense"; periodId: string; expense: FriendExpense }
  | { kind: "deleteSettlement"; periodId: string; settlement: FriendSettlement };

export function FriendsPage() {
  const { snapshot: data, loading, error, connection, selectedPeriodId, selectPeriod, refresh, mutate } = useFriends();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("expenses");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const suggestions = useMemo(() => suggestSettlements(data?.balances ?? []), [data]);
  const filtered = useMemo(() => data?.expenses.filter((e) => normalize(`${e.description} ${data.members.find((m) => m.id === e.payer_id)?.full_name ?? ""}`).includes(normalize(search))) ?? [], [data, search]);

  const close = () => setDialog(null);
  const choosePeriod = (id: string | null) => {
    selectPeriod(id); setPage(1); setSearch(""); setTab("expenses"); setDialog(null);
  };

  const deleteRecord = async () => {
    if (!dialog || (dialog.kind !== "deleteExpense" && dialog.kind !== "deleteSettlement")) return;
    setDeleting(true);
    try {
      if (dialog.kind === "deleteExpense") {
        await mutate("expense.delete", { id: dialog.expense.id, expected_updated_at: dialog.expense.updated_at }, dialog.periodId);
        showToast("Dépense entre amis supprimée. Les soldes ont été recalculés.");
      } else {
        await mutate("settlement.delete", { id: dialog.settlement.id }, dialog.periodId);
        showToast("Remboursement annulé dans le registre. Les soldes ont été recalculés.");
      }
      close();
    } catch (err) { showToast(friendsError(err), "error"); }
    finally { setDeleting(false); }
  };

  const heading = (
    <header>
      <p className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.18em] text-accent-text"><Handshake className="h-3.5 w-3.5" />Un espace à part</p>
      <h1 className="text-[26px] font-light tracking-tight text-ink sm:text-[32px]">Dépenses entre amis</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">Les moments se partagent. Les comptes restent simples.</p>
    </header>
  );

  if (loading && !data) return <div className="space-y-7">{heading}<Skeleton className="h-32 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="space-y-7">{heading}<div role="alert" className="rounded-2xl border border-line bg-surface p-5"><h2 className="text-[16px] font-medium">Connecter cet espace à Supabase</h2><p className="mt-2 break-words text-[13px] leading-relaxed text-ink-secondary">{error ?? "Les données ne sont pas disponibles."}</p><Button variant="outline" className="mt-5" onClick={() => { void refresh(); }}><RefreshCw className="h-4 w-4" />Réessayer</Button></div></div>;

  const readOnly = Boolean(data.period.closed_at);
  const periodId = data.period.id;
  const remaining = data.balances.reduce((sum, b) => sum + Math.max(0, b.balance_cents), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="animate-rise space-y-7">
      {heading}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-[13px]"><p className="min-w-0 break-words">{error}</p><Button size="sm" variant="outline" onClick={() => { void refresh(); }}>Actualiser</Button></div>}
      {!error && connection === "offline" && <p role="status" className="text-[12.5px] text-ink-muted">La synchronisation en direct est interrompue. <button className="text-accent-text underline underline-offset-4" onClick={() => { void refresh(); }}>Actualiser les données</button></p>}

      <section className="flex flex-col gap-5 border-y border-line py-6 sm:flex-row sm:items-end sm:justify-between" aria-label="Résumé de la période entre amis">
        <div>
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-ink-muted">Total de la période {data.period.number}</p>
          <p className="mt-3 text-[40px] font-extralight leading-none tracking-tight text-accent-text sm:text-[48px]">{formatCents(data.period.total_cents)}</p>
          <p className="mt-3 text-[12.5px] text-ink-muted">{data.period.expense_count} dépense{data.period.expense_count > 1 ? "s" : ""} · Depuis le {formatLongDate(data.period.started_at.slice(0, 10))}</p>
        </div>
        <div className="flex items-end justify-between gap-5 sm:flex-col sm:items-end">
          <div className="sm:text-right"><p className="text-[11px] text-ink-muted">Reste à rembourser</p><p className="mt-1 text-[22px] font-light tabular-nums text-ink">{formatCents(remaining)}</p></div>
          {!readOnly && <Button onClick={() => setDialog({ kind: "expense", periodId, expense: null })} disabled={data.members.length === 0}><Plus className="h-4 w-4" />Nouvelle dépense</Button>}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
          <History className="hidden h-4 w-4 shrink-0 sm:block" />
          <select aria-label="Choisir la période entre amis" value={selectedPeriodId ?? "current"} onChange={(e) => choosePeriod(e.target.value === "current" ? null : e.target.value)}
            className="h-10 min-w-0 max-w-[260px] rounded-lg border border-line bg-surface px-3 text-[13px] text-ink focus:border-accent focus:outline-none">
            <option value="current">Période actuelle</option>
            {data.periods.filter((p) => p.closed_at).map((p) => <option key={p.id} value={p.id}>Période {p.number} · archivée</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          {!readOnly && <button aria-label="Gérer les participants entre amis" onClick={() => setDialog({ kind: "members", periodId })} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-[12.5px] text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"><Users className="h-4 w-4" />{data.members.length}<span className="hidden sm:inline">participant{data.members.length > 1 ? "s" : ""}</span><Plus className="h-3.5 w-3.5" /></button>}
          <button onClick={() => { void refresh(); }} aria-label="Actualiser les dépenses entre amis" title="Actualiser" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {readOnly && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"><p className="flex items-center gap-2 text-[13px] text-ink-secondary"><LockKeyhole className="h-4 w-4 shrink-0" />Période archivée le {formatLongDate(data.period.closed_at!.slice(0, 10))}. Consultation uniquement.</p><button className="text-[13px] text-accent-text hover:underline" onClick={() => choosePeriod(null)}>Revenir à la période actuelle</button></div>}

      <div className="flex gap-5 border-b border-line sm:gap-7" role="tablist" aria-label="Rubriques entre amis">
        {([{ id: "expenses", label: "Dépenses" }, { id: "balances", label: "Soldes & remboursements" }, { id: "history", label: "Historique" }] as const).map((item) => (
          <button key={item.id} id={`friends-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`friends-panel-${item.id}`} onClick={() => setTab(item.id)}
            style={{ borderColor: tab === item.id ? "var(--accent)" : "transparent" }}
            className={cn("min-h-12 border-b-2 pb-3 pt-2 text-left text-[12.5px] transition-colors sm:text-[14px]", tab === item.id ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{item.label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`friends-panel-${tab}`} aria-labelledby={`friends-tab-${tab}`}>
        {tab === "expenses" && <div className="space-y-4">
          {data.expenses.length > 0 && <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input type="search" value={search} aria-label="Rechercher une dépense entre amis" onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher une dépense ou un payeur..." className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-[14px] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none" /></div>}
          {data.expenses.length === 0 ? <EmptyState icon={<Handshake className="h-6 w-6" strokeWidth={1.6} />} title={readOnly ? "Aucune dépense pour cette période" : "La prochaine sortie commence ici"}
            message={readOnly ? "Cette période ne contient aucune dépense." : data.members.length === 0 ? "Ajoutez-vous et vos amis, puis partagez votre première dépense. Rien ne sera ajouté aux achats de la maison." : "Taxi, restaurant ou voyage : ajoutez une dépense et choisissez les personnes concernées."}
            action={!readOnly && (data.members.length === 0 ? <Button onClick={() => setDialog({ kind: "members", periodId })}><UserPlus className="h-4 w-4" />Ajouter un ami</Button> : <Button onClick={() => setDialog({ kind: "expense", periodId, expense: null })}><Plus className="h-4 w-4" />Ajouter une dépense</Button>)} />
            : filtered.length === 0 ? <EmptyState icon={<Search className="h-6 w-6" />} title="Aucune dépense trouvée" message="Essayez un autre nom ou effacez votre recherche." />
            : <FriendsExpenseList expenses={filtered.slice((currentPage - 1) * 12, currentPage * 12)} members={data.members} readOnly={readOnly}
              onEdit={(expense) => setDialog({ kind: "expense", periodId, expense })} onDelete={(expense) => setDialog({ kind: "deleteExpense", periodId, expense })} />}
          {totalPages > 1 && <div className="flex items-center justify-between gap-3"><Button size="sm" variant="outline" aria-label="Dépenses précédentes" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-[12px] text-ink-muted">Page {currentPage} sur {totalPages}</span><Button size="sm" variant="outline" aria-label="Dépenses suivantes" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}
        </div>}

        {tab === "balances" && <FriendsBalanceList data={data} suggestions={suggestions} readOnly={readOnly}
          onRecord={(suggestion) => setDialog({ kind: "settlement", periodId, suggestion })} onDeleteSettlement={(settlement) => setDialog({ kind: "deleteSettlement", periodId, settlement })} />}

        {tab === "history" && <section>
          <h2 className="text-[16px] font-medium">Les comptes se clôturent, les souvenirs restent.</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">Chaque période conserve ses dépenses et ses remboursements. Les archives sont en lecture seule.</p>
          {data.periods.filter((p) => p.closed_at).length === 0 ? <EmptyState className="mt-5" icon={<History className="h-6 w-6" />} title="Pas encore de période archivée" message="Après le règlement des soldes, réinitialisez les dépenses pour commencer une nouvelle période." /> : (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {data.periods.filter((p) => p.closed_at).map((p) => <li key={p.id}><button onClick={() => choosePeriod(p.id)} className="flex w-full items-center gap-4 py-5 text-left transition-colors hover:bg-surface/60"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted"><History className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">Période {p.number}</span><span className="mt-1 block text-[12px] text-ink-muted">Clôturée le {formatLongDate(p.closed_at!.slice(0, 10))} · {p.expense_count} dépense{p.expense_count > 1 ? "s" : ""}</span><span className="mt-1 block text-[11.5px] text-ink-muted">{p.settlement_count} remboursement{p.settlement_count > 1 ? "s" : ""} · {formatCents(p.repaid_cents)} réglés</span></span><span className="shrink-0 text-[16px] text-ink">{formatCents(p.total_cents)}</span><ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" /></button></li>)}
            </ul>
          )}
        </section>}
      </div>

      {!readOnly && <section className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-sm"><h2 className="flex items-center gap-2 text-[14px] font-medium"><CheckCircle2 className="h-4 w-4 text-ink-muted" />Une nouvelle période, l'esprit tranquille.</h2><p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">Une fois les soldes réglés, repartez à zéro. L'historique reste intact et les dépenses de la maison ne changent pas.</p></div>
        <Button variant="outline" onClick={() => setDialog({ kind: "reset", periodId })}><RotateCcw className="h-4 w-4" />Réinitialiser les dépenses</Button>
      </section>}

      {dialog?.kind === "members" && <FriendMembersModal members={data.members} onClose={close} onAdd={async (id, fullName) => { await mutate("member.add", { id, full_name: fullName }, dialog.periodId); showToast("Participant ajouté à l'espace entre amis."); }} />}
      {dialog?.kind === "expense" && <FriendExpenseModal members={data.members} expense={dialog.expense} onClose={close} onSave={async (input) => { await mutate("expense.save", input, dialog.periodId); showToast(dialog.expense ? "Dépense entre amis modifiée." : "Dépense entre amis enregistrée."); }} />}
      {dialog?.kind === "settlement" && <FriendSettlementModal members={data.members} balances={data.balances} suggestion={dialog.suggestion} onClose={close} onSave={async (input) => { await mutate("settlement.add", input, dialog.periodId); showToast("Remboursement enregistré. Les soldes ont été actualisés."); }} />}
      {dialog?.kind === "reset" && <ResetFriendsPeriodModal data={data} expectedPeriodId={dialog.periodId} onClose={close} onReset={async () => { await mutate("period.reset", {}, dialog.periodId); showToast("Période archivée. Une nouvelle période entre amis commence à zéro."); setTab("expenses"); setSearch(""); setPage(1); }} />}
      <ConfirmDialog open={dialog?.kind === "deleteExpense" || dialog?.kind === "deleteSettlement"}
        title={dialog?.kind === "deleteExpense" ? "Supprimer cette dépense entre amis ?" : "Annuler ce remboursement enregistré ?"}
        message={dialog?.kind === "deleteExpense" ? `La dépense « ${dialog.expense.description} » sera supprimée de cette période et les soldes seront recalculés. Les achats de la maison ne seront pas touchés.` : "Cette correction retirera le remboursement du registre entre amis et recalculera les soldes. Elle ne renvoie pas d'argent et ne modifie aucun achat de la maison."}
        confirmLabel={dialog?.kind === "deleteSettlement" ? "Annuler le remboursement" : "Supprimer la dépense"}
        onCancel={() => { if (!deleting) close(); }} onConfirm={() => { void deleteRecord(); }} loading={deleting} />
    </div>
  );
}