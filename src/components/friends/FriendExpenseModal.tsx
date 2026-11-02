import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { centsInput, formatCents, friendsError, parseCents, splitEqualCents } from "@/lib/friends";
import { todayISO } from "@/lib/format";
import type { FriendExpense, FriendExpenseInput, FriendMember } from "@/types/friends";

export const friendFieldClass = "h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
export const friendLabelClass = "mb-2 block text-[12px] font-medium text-ink-secondary";

export function FriendExpenseModal({ members, expense, onClose, onSave }: {
  members: FriendMember[];
  expense: FriendExpense | null;
  onClose: () => void;
  onSave: (input: FriendExpenseInput) => Promise<void>;
}) {
  const [id] = useState(() => expense?.id ?? crypto.randomUUID());
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? centsInput(expense.amount_cents) : "");
  const [payerId, setPayerId] = useState(expense?.payer_id ?? "");
  const [participants, setParticipants] = useState(expense?.participant_ids ?? members.slice(0, 50).map((m) => m.id));
  const [date, setDate] = useState(expense?.incurred_on ?? todayISO());
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amount);
  const shares = useMemo(() => cents && participants.length ? splitEqualCents(cents, participants) : new Map<string, number>(), [cents, participants]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) { setError("Donnez un nom à cette dépense."); return; }
    if (cents === null) { setError("Saisissez un montant positif avec au maximum deux décimales."); return; }
    if (!members.some((m) => m.id === payerId) || participants.length === 0) {
      setError("Sélectionnez le payeur et au moins un participant."); return;
    }
    if (!date || date > todayISO() || date < "1900-01-01") { setError("Choisissez une date valide, au plus tard aujourd'hui."); return; }
    setBusy(true); setError(null);
    try {
      await onSave({ id, description: description.trim(), amount_cents: cents, payer_id: payerId,
        participant_ids: participants, incurred_on: date, notes: notes.trim() || null,
        expected_updated_at: expense?.updated_at ?? null });
      onClose();
    } catch (err) { setError(friendsError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={expense ? "Modifier la dépense entre amis" : "Nouvelle dépense entre amis"}
      description="Cette dépense reste séparée des achats de la maison.">
      <form onSubmit={(event) => { void submit(event); }} className="space-y-5" noValidate>
        <div>
          <label className={friendLabelClass} htmlFor="friend-description">Nom de la dépense</label>
          <input id="friend-description" className={friendFieldClass} value={description} maxLength={200}
            onChange={(e) => setDescription(e.target.value)} placeholder="Taxi, restaurant, week-end..." autoComplete="off" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={friendLabelClass} htmlFor="friend-amount">Montant total (DH)</label>
            <input id="friend-amount" className={friendFieldClass} inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className={friendLabelClass} htmlFor="friend-date">Date de la dépense</label>
            <input id="friend-date" type="date" className={friendFieldClass} value={date} min="1900-01-01" max={todayISO()}
              onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={friendLabelClass} htmlFor="friend-payer">Payé par</label>
          <select id="friend-payer" className={friendFieldClass} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            <option value="">Choisir le payeur</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-secondary">
            <Users className="h-4 w-4" /> Répartir entre {participants.length} personne{participants.length > 1 ? "s" : ""}
          </legend>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">Parts égales, au centime près. Sélectionnez uniquement le payeur pour une dépense personnelle.</p>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-line">
            {members.map((member) => (
              <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-line px-3.5 py-2 last:border-0 hover:bg-surface-2">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={participants.includes(member.id)}
                  disabled={!participants.includes(member.id) && participants.length >= 50}
                  onChange={(e) => setParticipants((ids) => e.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id))} />
                <span className="min-w-0 flex-1 break-words text-[14px]">{member.full_name}</span>
                {shares.has(member.id) && <span className="shrink-0 text-[13px] tabular-nums text-accent-text">{formatCents(shares.get(member.id)!)}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={friendLabelClass} htmlFor="friend-notes">Remarque <span className="text-ink-muted">(facultatif)</span></label>
          <textarea id="friend-notes" rows={2} maxLength={1000} className={`${friendFieldClass} h-auto resize-none py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-[13px] leading-relaxed text-ink">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}><Plus className="h-4 w-4" />{expense ? "Enregistrer les modifications" : "Enregistrer la dépense"}</Button>
        </div>
      </form>
    </Modal>
  );
}