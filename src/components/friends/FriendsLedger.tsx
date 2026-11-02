import { useState } from "react";
import { ArrowRight, ChevronDown, Pencil, Receipt, Trash2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/lib/format";
import { formatCents, splitEqualCents } from "@/lib/friends";
import type { FriendExpense, FriendMember, FriendsSnapshot, FriendSettlement, SuggestedSettlement } from "@/types/friends";

export function FriendsExpenseList({ expenses, members, readOnly, onEdit, onDelete }: {
  expenses: FriendExpense[]; members: FriendMember[]; readOnly: boolean;
  onEdit: (expense: FriendExpense) => void; onDelete: (expense: FriendExpense) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const name = (id: string) => members.find((m) => m.id === id)?.full_name ?? "Participant";
  return (
    <ul className="stagger divide-y divide-line rounded-2xl border border-line bg-surface px-4 sm:px-5">
      {expenses.map((expense) => (
        <li key={expense.id} className="py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted sm:grid"><Receipt className="h-4.5 w-4.5" /></span>
            <button className="min-w-0 flex-1 text-left" aria-expanded={expanded === expense.id}
              onClick={() => setExpanded((id) => id === expense.id ? null : expense.id)}>
              <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                <span className="break-words [overflow-wrap:anywhere]">{expense.description}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${expanded === expense.id ? "rotate-180" : ""}`} />
              </span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-muted">Payé par {name(expense.payer_id)} · {formatShortDate(expense.incurred_on)}</span>
              <span className="mt-0.5 block text-[12px] text-ink-muted">{expense.participant_ids.length === 1 ? expense.participant_ids[0] === expense.payer_id ? "Dépense personnelle" : `Pour ${name(expense.participant_ids[0])}` : `${expense.participant_ids.length} participants · parts égales`}</span>
            </button>
            <div className="shrink-0 text-right">
              <p className="text-[16px] font-semibold tabular-nums text-ink">{formatCents(expense.amount_cents)}</p>
              {!readOnly && <div className="mt-1 flex justify-end gap-0.5">
                <button onClick={() => onEdit(expense)} aria-label={`Modifier la dépense ${expense.description}`} className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => onDelete(expense)} aria-label={`Supprimer la dépense ${expense.description}`} className="grid h-10 w-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>}
            </div>
          </div>
          {expanded === expense.id && (
            <div className="animate-rise mt-4 border-t border-line pt-4 sm:ml-13">
              {expense.notes && <p className="mb-3 break-words text-[13px] leading-relaxed text-ink-secondary">{expense.notes}</p>}
              <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-ink-muted">Répartition de la dépense</p>
              {Array.from(splitEqualCents(expense.amount_cents, expense.participant_ids)).map(([id, share]) => (
                <div key={id} className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
                  <span className="min-w-0 break-words text-ink-secondary">{name(id)}</span><span className="shrink-0 tabular-nums text-ink">{formatCents(share)}</span>
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FriendsBalanceList({ data, suggestions, readOnly, onRecord, onDeleteSettlement }: {
  data: FriendsSnapshot; suggestions: SuggestedSettlement[]; readOnly: boolean;
  onRecord: (suggestion: SuggestedSettlement | null) => void;
  onDeleteSettlement: (settlement: FriendSettlement) => void;
}) {
  const name = (id: string) => data.members.find((m) => m.id === id)?.full_name ?? "Participant";
  return (
    <div className="space-y-7">
      <section aria-label="Soldes par personne">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium">Qui doit quoi ?</h2>
          {!readOnly && suggestions.length > 0 && <Button size="sm" variant="outline" onClick={() => onRecord(null)}>Enregistrer un remboursement</Button>}
        </div>
        {data.members.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="Aucun solde à afficher" message="Ajoutez des participants et votre première dépense." /> : (
          <ul className="divide-y divide-line border-y border-line">
            {data.members.map((member) => {
              const balance = data.balances.find((b) => b.member_id === member.id);
              const net = balance?.balance_cents ?? 0;
              return <li key={member.id} className="flex items-center gap-3 py-4">
                <Avatar size="sm" name={member.full_name} />
                <div className="min-w-0 flex-1"><p className="break-words text-[14px] text-ink">{member.full_name}</p><p className="mt-0.5 text-[12px] text-ink-muted">A payé {formatCents(balance?.paid_cents ?? 0)}</p></div>
                <div className="shrink-0 text-right"><p className={`text-[17px] font-medium tabular-nums ${net > 0 ? "text-accent-text" : net < 0 ? "text-ink" : "text-ink-muted"}`}>{formatCents(Math.abs(net))}</p><p className="mt-0.5 text-[11.5px] text-ink-muted">{net > 0 ? "À recevoir" : net < 0 ? "À rembourser" : "À jour"}</p></div>
              </li>;
            })}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && <section>
        <h2 className="text-[16px] font-medium">Pour solder la période</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">Propositions calculées à partir des soldes nets. Aucun paiement n'est enregistré automatiquement.</p>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          {suggestions.map((s) => <div key={`${s.from_member_id}-${s.to_member_id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 text-[13.5px]"><p className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="break-words">{name(s.from_member_id)}</span><ArrowRight className="h-3.5 w-3.5 text-ink-muted" /><span className="break-words">{name(s.to_member_id)}</span></p><p className="mt-1 text-[16px] text-accent-text">{formatCents(s.amount_cents)}</p></div>
            {!readOnly && <Button variant="outline" size="sm" onClick={() => onRecord(s)}>Noter le remboursement</Button>}
          </div>)}
        </div>
      </section>}

      <section>
        <h2 className="text-[16px] font-medium">Remboursements enregistrés</h2>
        {data.settlements.length === 0 ? <p className="mt-4 border-t border-line pt-4 text-[13px] text-ink-muted">Aucun remboursement enregistré pour cette période.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {data.settlements.map((s) => <li key={s.id} className="flex items-start gap-3 py-4">
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-accent-text" />
              <div className="min-w-0 flex-1"><p className="break-words text-[13.5px]">{name(s.from_member_id)} <span className="text-ink-muted">a remboursé</span> {name(s.to_member_id)}</p><p className="mt-1 text-[12px] text-ink-muted">{formatShortDate(s.paid_on)}{s.notes ? ` · ${s.notes}` : ""}</p></div>
              <span className="shrink-0 text-[15px] tabular-nums text-accent-text">{formatCents(s.amount_cents)}</span>
              {!readOnly && <button aria-label={`Annuler le remboursement de ${name(s.from_member_id)}`} onClick={() => onDeleteSettlement(s)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
            </li>)}
          </ul>
        )}
      </section>
    </div>
  );
}