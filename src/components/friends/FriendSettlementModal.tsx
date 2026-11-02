import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { centsInput, formatCents, friendsError, parseCents } from "@/lib/friends";
import { todayISO } from "@/lib/format";
import type { FriendBalance, FriendMember, FriendSettlementInput, SuggestedSettlement } from "@/types/friends";
import { friendFieldClass, friendLabelClass } from "./FriendExpenseModal";

export function FriendSettlementModal({ members, balances, suggestion, onClose, onSave }: {
  members: FriendMember[]; balances: FriendBalance[]; suggestion: SuggestedSettlement | null;
  onClose: () => void; onSave: (input: FriendSettlementInput) => Promise<void>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [from, setFrom] = useState(suggestion?.from_member_id ?? "");
  const [to, setTo] = useState(suggestion?.to_member_id ?? "");
  const [amount, setAmount] = useState(suggestion ? centsInput(suggestion.amount_cents) : "");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const balanceOf = (id: string) => balances.find((b) => b.member_id === id)?.balance_cents ?? 0;
  const maximum = Math.max(0, Math.min(-balanceOf(from), balanceOf(to)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseCents(amount);
    if (!from || !to || from === to || cents === null || cents > maximum || maximum === 0) {
      setError("Choisissez deux personnes et un montant qui ne dépasse pas leurs soldes actuels."); return;
    }
    if (!date || date > todayISO() || date < "1900-01-01") { setError("Choisissez une date valide."); return; }
    if (!confirmed) { setError("Confirmez que le remboursement a réellement été effectué."); return; }
    setBusy(true); setError(null);
    try {
      await onSave({ id, from_member_id: from, to_member_id: to, amount_cents: cents, paid_on: date, notes: notes.trim() || null });
      onClose();
    } catch (err) { setError(friendsError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Enregistrer un remboursement"
      description="Notez un paiement déjà effectué. L'application ne transfère pas d'argent.">
      <form onSubmit={(event) => { void submit(event); }} noValidate className="space-y-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label htmlFor="settlement-from" className={friendLabelClass}>Remboursé par</label>
            <select id="settlement-from" value={from} onChange={(e) => setFrom(e.target.value)} className={friendFieldClass}>
              <option value="">Choisir une personne</option>
              {members.filter((m) => balanceOf(m.id) < 0).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <ArrowRight className="mb-4 hidden h-4 w-4 text-ink-muted sm:block" />
          <div>
            <label htmlFor="settlement-to" className={friendLabelClass}>Remboursé à</label>
            <select id="settlement-to" value={to} onChange={(e) => setTo(e.target.value)} className={friendFieldClass}>
              <option value="">Choisir une personne</option>
              {members.filter((m) => balanceOf(m.id) > 0).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="settlement-amount" className={friendLabelClass}>Montant remboursé (DH)</label>
            <input id="settlement-amount" inputMode="decimal" className={friendFieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            {maximum > 0 && <p className="mt-2 text-[12px] text-ink-muted">Maximum : {formatCents(maximum)}</p>}
          </div>
          <div>
            <label htmlFor="settlement-date" className={friendLabelClass}>Date du paiement</label>
            <input id="settlement-date" type="date" min="1900-01-01" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={friendFieldClass} />
          </div>
        </div>
        <div>
          <label htmlFor="settlement-notes" className={friendLabelClass}>Remarque <span className="text-ink-muted">(facultatif)</span></label>
          <input id="settlement-notes" className={friendFieldClass} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="Virement, espèces..." />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink-secondary">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
          Je confirme que ce remboursement a été effectué.
        </label>
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-[13px] leading-relaxed">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" loading={busy} disabled={!confirmed}>Enregistrer le remboursement</Button>
        </div>
      </form>
    </Modal>
  );
}